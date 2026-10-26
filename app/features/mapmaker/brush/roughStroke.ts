/**
 * The Land tool's free brush: a stroke whose edge is rough *in proportion to
 * the brush* — a small brush makes small coves, a big one big bays — and is
 * fixed the moment it is drawn. What you see while drawing is exactly what
 * the map keeps (no coastline noise is added afterwards).
 *
 * Geometry. The pointer trail is resampled into a polyline whose vertices
 * are a fixed fraction of the radius apart (incremental and prefix-stable,
 * so the live stroke and the committed one are the same shape). A pixel is
 * land when its distance to that polyline is below the radius at that
 * place:
 *
 *     R(p) = R · (1 + A · roughness · N(p / (WAVE · R)))
 *
 * N is fractal gradient noise sampled at the *map position*, so it never
 * flickers while drawing, overlapping strokes of one size line up, and the
 * result is identical at every resolution. Roughness changes the size of the
 * bumps, not how many there are (as in Inkarnate).
 *
 * The same formula runs on the GPU (./gl/shaders.ts); this file is the
 * reference and the fallback when WebGL2 is unavailable. Pure math plus one
 * canvas helper — the math is unit-tested under Node.
 */
import { gradientNoise } from "./noise";
import type { NaturalEdge, PaintPoint } from "../types";

/** Largest edge movement, as a fraction of the radius (at roughness 1). */
export const ROUGH_AMP = 0.42;
/** Noise wavelength, in brush radii. */
export const ROUGH_WAVE = 1.3;
/** Amplitude kept per finer octave. */
export const ROUGH_PERSIST = 0.6;
/** Polyline vertex spacing, in brush radii. */
export const STROKE_STEP = 0.12;
/** Seed offsets per octave (shared with the shader). */
export const OCTAVE_SEED = 1013;

export type Vec = { x: number; y: number };

/** Octaves of edge noise for a detail value (0..1). */
export function roughOctaves(detail: number) {
  return 1 + Math.round(Math.max(0, Math.min(1, detail)) * 4);
}

/** Fractal edge noise at a map position, roughly in [-1, 1]. */
export function edgeNoise(
  mx: number,
  my: number,
  radius: number,
  octaves: number,
  seed: number,
) {
  const f0 = 1 / (ROUGH_WAVE * Math.max(radius, 1e-5));
  let sum = 0,
    amp = 1,
    norm = 0,
    freq = f0;
  for (let o = 0; o < octaves; o++) {
    sum +=
      amp * gradientNoise(mx * freq, my * freq, (seed + o * OCTAVE_SEED) | 0);
    norm += amp;
    amp *= ROUGH_PERSIST;
    freq *= 2.1;
  }
  return sum / norm;
}

/**
 * Resamples a pointer trail (map units) into the stroke's polyline. Emits a
 * vertex every STROKE_STEP·R of travel; the trail's last point is always the
 * last vertex. Feeding samples one by one gives the same vertices as
 * feeding them all at once (see StrokeBuilder).
 */
export class StrokeBuilder {
  private verts: Vec[] = [];
  private last: Vec | null = null;
  /** Distance travelled since the last fixed vertex. */
  private dist = 0;
  /** The current trail end (not yet a fixed vertex). */
  private tip: Vec | null = null;
  constructor(private step: number) {}
  feed(p: Vec) {
    if (!this.last) {
      this.verts.push(p);
      this.last = p;
      return;
    }
    const a = this.last,
      dx = p.x - a.x,
      dy = p.y - a.y,
      len = Math.hypot(dx, dy);
    let t = this.step - this.dist,
      lastAt = -1;
    while (t <= len) {
      const k = len > 0 ? t / len : 0;
      this.verts.push({ x: a.x + dx * k, y: a.y + dy * k });
      lastAt = t;
      t += this.step;
    }
    this.dist = lastAt < 0 ? this.dist + len : len - lastAt;
    this.last = p;
    this.tip = p;
  }
  /** Fixed vertices, plus the trail's current end. */
  polyline(): Vec[] {
    const v = this.verts,
      tip = this.tip;
    if (!tip) return v.slice();
    const end = v[v.length - 1];
    return end && Math.hypot(tip.x - end.x, tip.y - end.y) < 1e-9
      ? v.slice()
      : [...v, tip];
  }
  /** Number of fixed vertices so far (they never change). */
  get fixedCount() {
    return this.verts.length;
  }
}

/** The polyline of a land stroke, in map units (both axes ÷ map width). */
export function strokePolyline(
  points: PaintPoint[],
  radius: number,
  aspect: number,
): Vec[] {
  const b = new StrokeBuilder(Math.max(1e-5, radius * STROKE_STEP));
  for (const p of points) b.feed({ x: p.x, y: p.y * aspect });
  return b.polyline();
}

export interface RoughStroke {
  /** Polyline, map units. */
  line: Vec[];
  /** Radius, map units. */
  radius: number;
  roughness: number;
  octaves: number;
  seed: number;
}

export function roughStroke(
  points: PaintPoint[],
  size: number,
  edge: NaturalEdge | undefined,
  seed: number,
  aspect: number,
): RoughStroke {
  const radius = size / 2;
  return {
    line: strokePolyline(points, radius, aspect),
    radius,
    roughness: Math.max(0, Math.min(1, edge?.roughness ?? 0)),
    octaves: roughOctaves(edge?.detail ?? 0),
    seed,
  };
}

/** How far the edge can reach from the polyline (map units). */
export function strokeReach(s: RoughStroke) {
  return s.radius * (1 + ROUGH_AMP * s.roughness);
}

/** Local radius at a map position. */
export function radiusAt(s: RoughStroke, mx: number, my: number) {
  return s.roughness > 0
    ? s.radius *
        (1 +
          ROUGH_AMP *
            s.roughness *
            edgeNoise(mx, my, s.radius, s.octaves, s.seed))
    : s.radius;
}

function segDist(px: number, py: number, a: Vec, b: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = a.x + dx * t - px,
    ey = a.y + dy * t - py;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Coverage (0..1) of a stroke over pixels [x0, x0+w) × [y0, y0+h) at W px
 * per map unit. Distances are taken at pixel centres; the edge is
 * anti-aliased over one pixel.
 */
export function strokeCoverage(
  s: RoughStroke,
  W: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Float32Array {
  const minD = new Float32Array(w * h).fill(Infinity),
    reach = strokeReach(s) + 1.5 / W,
    line = s.line.length === 1 ? [s.line[0], s.line[0]] : s.line;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i],
      b = line[i + 1],
      bx0 = Math.max(x0, Math.floor((Math.min(a.x, b.x) - reach) * W)),
      by0 = Math.max(y0, Math.floor((Math.min(a.y, b.y) - reach) * W)),
      bx1 = Math.min(x0 + w, Math.ceil((Math.max(a.x, b.x) + reach) * W)),
      by1 = Math.min(y0 + h, Math.ceil((Math.max(a.y, b.y) + reach) * W));
    for (let y = by0; y < by1; y++) {
      const my = (y + 0.5) / W,
        row = (y - y0) * w - x0;
      for (let x = bx0; x < bx1; x++) {
        const d = segDist((x + 0.5) / W, my, a, b);
        if (d < minD[row + x]) minD[row + x] = d;
      }
    }
  }
  const cov = new Float32Array(w * h),
    inner = s.radius * (1 - ROUGH_AMP * s.roughness) - 1 / W;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        d = minD[i];
      if (d === Infinity) continue;
      if (d < inner) {
        cov[i] = 1;
        continue;
      }
      const r = radiusAt(s, (x0 + x + 0.5) / W, (y0 + y + 0.5) / W),
        c = 0.5 + (r - d) * W;
      cov[i] = c <= 0 ? 0 : c >= 1 ? 1 : c;
    }
  return cov;
}

/** Pixel bounds of a stroke at W px per map unit. */
export function strokeBounds(s: RoughStroke, W: number) {
  const reach = strokeReach(s) + 2 / W;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of s.line) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const ox = Math.floor((x0 - reach) * W),
    oy = Math.floor((y0 - reach) * W);
  return {
    x: ox,
    y: oy,
    w: Math.ceil((x1 + reach) * W) - ox,
    h: Math.ceil((y1 + reach) * W) - oy,
  };
}
