/**
 * Natural-edge geometry for Edge Shape (and rough-edged Rect/Ellipse/Polygon).
 *
 * Turns a hand-drawn outline into a believable coastline in three stages:
 *
 *  1. **Clean-up** — Chaikin corner-cutting removes hand jitter, then the
 *     outline is resampled to an even spacing.
 *  2. **Large-scale warp** — every point is pushed along its normal by two
 *     octaves of *spatial* gradient noise, carving bays, headlands and
 *     peninsulas. The amplitude scales with the shape's size so a small
 *     island isn't torn apart by a continent-sized wobble.
 *  3. **Fractal detail** — recursive midpoint displacement adds ever-finer
 *     jaggedness (the classic fractal-coastline construction), each level
 *     halving the segment length and therefore the displacement.
 *
 * All randomness is *position-hashed* rather than drawn from a sequential
 * PRNG, so the parts of a coastline that are already drawn stay put while
 * the user is still dragging the lasso (no flicker), and the result is fully
 * deterministic for a given seed. Coordinates are "map units": both axes in
 * fractions of the map width, so geometry is resolution-independent.
 *
 * Pure math, no DOM — unit-tested in tests/brush.test.mjs.
 */
import { gradientNoise, hash2 } from "./noise";

export type Vec = { x: number; y: number };

export interface CoastOptions {
  /** 0..1 — how far the edge wanders (both the warp and the jaggedness). */
  roughness: number;
  /** 0..1 — how many levels of fine fractal detail are added. */
  detail: number;
  seed: number;
  /** Cap on fractal levels (live previews use fewer; the shape is the same,
   * only the finest jaggedness is omitted). */
  maxLevels?: number;
}

/** Base spacing of the cleaned-up outline, in map units (~12 px at 1K). */
const BASE_STEP = 0.012;

export function polygonArea(pts: Vec[]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(a) / 2;
}

/** Drops points closer than `eps` to their predecessor (and a closing dup). */
export function dedupe(pts: Vec[], eps = 1e-6) {
  const out: Vec[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > eps) out.push(p);
  }
  while (
    out.length > 2 &&
    Math.hypot(
      out[0].x - out[out.length - 1].x,
      out[0].y - out[out.length - 1].y,
    ) <= eps
  )
    out.pop();
  return out;
}

/** Chaikin corner-cutting on a closed polygon. */
export function chaikinClosed(pts: Vec[], iterations = 1) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Vec[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i],
        b = cur[(i + 1) % cur.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

/** Resamples a closed polygon at a fixed `step`, walking from its first
 * point. Fixed-step (rather than perimeter/n) matters: when a lasso grows,
 * every point already placed stays exactly where it was, so the coastline
 * built on top of it doesn't shimmer while the user is still drawing. */
export function resampleClosed(pts: Vec[], step: number) {
  if (pts.length < 2 || step <= 0) return pts.slice();
  const out: Vec[] = [pts[0]];
  let need = step;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      len = Math.hypot(b.x - a.x, b.y - a.y);
    let t = 0;
    while (len - t >= need) {
      t += need;
      out.push({
        x: a.x + ((b.x - a.x) * t) / len,
        y: a.y + ((b.y - a.y) * t) / len,
      });
      need = step;
    }
    need -= len - t;
  }
  // Drop a final point that would sit right on top of the first one.
  const first = out[0],
    last = out[out.length - 1];
  if (
    out.length > 3 &&
    Math.hypot(last.x - first.x, last.y - first.y) < step * 0.5
  )
    out.pop();
  return out;
}

/** Unit normal of a closed polygon at vertex i (from its two neighbours). */
function normalAt(pts: Vec[], i: number): Vec {
  const p = pts[(i - 1 + pts.length) % pts.length],
    n = pts[(i + 1) % pts.length],
    dx = n.x - p.x,
    dy = n.y - p.y,
    len = Math.hypot(dx, dy) || 1;
  return { x: dy / len, y: -dx / len };
}

const Q = 1e5; // quantization for position hashing
const posHash = (p: Vec, salt: number, seed: number) =>
  hash2(Math.round(p.x * Q) ^ (salt * 7919), Math.round(p.y * Q), seed);

/**
 * Builds the natural coastline for a closed outline (map units). Returns a
 * dense closed polygon; returns the input unchanged if it's degenerate.
 */
export function coastline(
  outline: Vec[],
  { roughness, detail, seed, maxLevels = 6 }: CoastOptions,
): Vec[] {
  let pts = dedupe(outline);
  if (pts.length < 3) return pts;
  const r = Math.max(0, Math.min(1, roughness)),
    det = Math.max(0, Math.min(1, detail));

  // 1. clean-up: kill hand jitter, then even spacing.
  pts = resampleClosed(
    chaikinClosed(resampleClosed(pts, BASE_STEP * 0.5), 2),
    BASE_STEP,
  );
  if (r === 0 && det === 0) return pts;

  // 2. large-scale warp along the normals (spatial noise ⇒ stable while drawing).
  const size = Math.sqrt(polygonArea(pts)),
    sizeK = Math.min(1, size / 0.2) * 0.7 + 0.3,
    amp = r * sizeK;
  const warped = pts.map((p, i) => {
    const n = normalAt(pts, i),
      d =
        amp *
        (0.07 * gradientNoise(p.x / 0.12, p.y / 0.12, seed) + // headlands & bays
          0.03 * gradientNoise(p.x / 0.045, p.y / 0.045, seed + 101) + // coves
          0.011 * gradientNoise(p.x / 0.016, p.y / 0.016, seed + 202)); // inlets
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });
  // A light smoothing pass keeps the warp organic instead of kinked.
  pts = chaikinClosed(warped, 1);

  // 3. fractal midpoint displacement: finer and finer jaggedness.
  const levels = Math.min(maxLevels, 1 + Math.round(det * 5)),
    jag = 0.07 + 0.33 * r;
  for (let level = 0; level < levels; level++) {
    const next: Vec[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length],
        dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy);
      next.push(a);
      if (len < 1e-5) continue;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        h = posHash(mid, level + 1, seed) * 2 - 1,
        // Slightly skewed distribution: mostly small nudges, occasional bigger notches.
        off = Math.sign(h) * Math.pow(Math.abs(h), 1.35) * len * jag;
      next.push({ x: mid.x + (-dy / len) * off, y: mid.y + (dx / len) * off });
    }
    pts = next;
  }
  return pts;
}

/**
 * Small islets scattered just off a coastline: picked at position-hashed
 * spots along the shore, pushed outward, each one a tiny rough coastline of
 * its own. `amount` 0..1 controls how many appear.
 */
export function islets(
  coast: Vec[],
  amount: number,
  { roughness, seed }: CoastOptions,
): Vec[][] {
  if (amount <= 0 || coast.length < 8) return [];
  // Sample the shore at an even spacing so density doesn't depend on detail level.
  const shore = resampleClosed(coast, 0.02),
    out: Vec[][] = [];
  for (let i = 0; i < shore.length; i++) {
    const p = shore[i];
    if (posHash(p, 91, seed) > amount * 0.35) continue;
    const n = normalAt(shore, i),
      // the outward side: test which side is outside the polygon
      outward = pointInPolygon(
        { x: p.x + n.x * 0.004, y: p.y + n.y * 0.004 },
        coast,
      )
        ? -1
        : 1,
      dist = 0.008 + posHash(p, 92, seed) * 0.022,
      rad = 0.0025 + Math.pow(posHash(p, 93, seed), 2) * 0.009,
      cx = p.x + n.x * outward * (dist + rad),
      cy = p.y + n.y * outward * (dist + rad);
    // Skip spots that would land back on the mainland (tight bays).
    if (pointInPolygon({ x: cx, y: cy }, coast)) continue;
    const blob = ellipsePolygon(
      cx,
      cy,
      rad * (0.8 + posHash(p, 94, seed) * 0.5),
      rad * (0.7 + posHash(p, 95, seed) * 0.5),
    );
    out.push(
      coastline(blob, {
        roughness: Math.min(1, roughness + 0.2),
        detail: 0.55,
        seed: seed + i * 7,
      }),
    );
  }
  return out;
}

export function pointInPolygon(pt: Vec, poly: Vec[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Ellipse (center + radii, map units) as a polygon dense enough for any size. */
export function ellipsePolygon(cx: number, cy: number, rx: number, ry: number) {
  const n = Math.max(
      48,
      Math.min(360, Math.round((Math.PI * (rx + ry)) / 0.004)),
    ),
    out: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

// ---- hexagonal grid (pointy-top, axial coordinates) -----------------------------
/** Cell (col,row in "odd-r" offset coords) under a point, for hex width `w`. */
export function hexCellAt(x: number, y: number, w: number): [number, number] {
  const size = w / Math.sqrt(3),
    q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size,
    r = ((2 / 3) * y) / size;
  // cube rounding
  let rx = Math.round(q),
    rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q),
    dy = Math.abs(ry - (-q - r)),
    dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  const col = rx + (rz - (rz & 1)) / 2;
  return [col, rz];
}
/** Corner points of an odd-r hex cell. */
export function hexCorners(col: number, row: number, w: number): Vec[] {
  const size = w / Math.sqrt(3),
    cx = w * (col + 0.5 * (row & 1)),
    cy = size * 1.5 * row,
    out: Vec[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    out.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
  }
  return out;
}
