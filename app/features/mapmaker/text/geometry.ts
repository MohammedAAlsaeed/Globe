/**
 * A text's outlines, in em: the shaped glyphs (./shape) placed straight,
 * on an arc, or along a path.
 *
 * Curves map the straight layout through a function F(x, y) → (X, Y): x runs
 * along the curve, y away from it. Glyphs follow it in one of three ways:
 *
 *   warp     every point of every outline goes through F (long segments are
 *            split first), so the whole line bends as one shape. Joined
 *            Arabic stays joined: the ends of neighbouring letters land on
 *            the same mapped points — the report's "Smooth Baseline Warp";
 *   letters  each glyph cluster (a letter with its marks) is placed whole,
 *            turned to the curve's direction at its centre — the classic
 *            look for Latin;
 *   words    each word is placed whole — "Rigid Word Placement".
 *
 * "auto" warps joined scripts (Arabic, Devanagari) and places the others by
 * letter. Path guides are smoothed under the letters (a moving average a
 * little wider than the text is tall), so sharp bends never pile letters up.
 *
 * Everything is plain numbers (no canvas): ./render turns the result into a
 * Path2D, and exports into SVG paths.
 */
import type { MMText } from "../types";
import { flatten, reverseNodes } from "../lines/geometry";
import { hbFontAt } from "./fontStore";
import { CAP, shapeText, type HbGlyphRef, type PlacedGlyph, type ShapedText } from "./shape";
import { CURSIVE } from "./scripts";

/** Outline commands: [op, …coords]: 0 M x y · 1 L x y · 2 Q cx cy x y · 3 C c1x c1y c2x c2y x y · 4 Z. */
export type Ops = number[];

export interface WebGlyph {
  text: string;
  /** CSS font at 100px. */
  css: string;
  /** Affine transform (a b c d e f) from the 100px glyph's origin to em space. */
  m: [number, number, number, number, number, number];
}

export interface TextGeometry {
  ops: Ops;
  web: WebGlyph[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  ready: boolean;
  shaped: ShapedText;
  /** The path under a path text (em), for showing it while editing. */
  guide: number[] | null;
}

// ---- glyph outlines --------------------------------------------------------------------------
const outlineCache = new Map<string, Ops>();
/** A glyph's outline in font units, y up (cached). */
function glyphOps(ref: HbGlyphRef): Ops {
  const key = `${ref.face.path}|${ref.face.wghtAxis ? Math.round(ref.weight) : 0}|${ref.gid}`;
  let ops = outlineCache.get(key);
  if (!ops) {
    ops = [];
    for (const c of hbFontAt(ref.face, ref.weight).glyphToJson(ref.gid)) {
      const v = c.values;
      if (c.type === "M") ops.push(0, v[0], v[1]);
      else if (c.type === "L") ops.push(1, v[0], v[1]);
      else if (c.type === "Q") ops.push(2, v[0], v[1], v[2], v[3]);
      else if (c.type === "C") ops.push(3, v[0], v[1], v[2], v[3], v[4], v[5]);
      else if (c.type === "Z") ops.push(4);
    }
    if (outlineCache.size > 20000) outlineCache.clear();
    outlineCache.set(key, ops);
  }
  return ops;
}

/** Walks ops, handing each point to `pt` (in place). */
function eachPoint(ops: Ops, pt: (x: number, y: number) => [number, number], out: Ops) {
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    const n = op === 0 || op === 1 ? 1 : op === 2 ? 2 : op === 3 ? 3 : 0;
    out.push(op);
    for (let p = 0; p < n; p++) {
      const [x, y] = pt(ops[i + 1 + p * 2], ops[i + 2 + p * 2]);
      out.push(x, y);
    }
    i += 1 + n * 2;
  }
}

/** Splits segments longer than `max` so a non-linear map bends them smoothly. */
function subdivide(ops: Ops, max: number): Ops {
  const out: Ops = [];
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    if (op === 0) {
      cx = sx = ops[i + 1];
      cy = sy = ops[i + 2];
      out.push(0, cx, cy);
      i += 3;
    } else if (op === 1 || op === 4) {
      const x = op === 1 ? ops[i + 1] : sx,
        y = op === 1 ? ops[i + 2] : sy;
      const n = Math.min(64, Math.ceil(Math.hypot(x - cx, y - cy) / max));
      for (let k = 1; k <= n; k++) out.push(1, lerp(cx, x, k / n), lerp(cy, y, k / n));
      if (op === 4) out.push(4);
      cx = x;
      cy = y;
      i += op === 1 ? 3 : 1;
    } else if (op === 2) {
      const [qx, qy, x, y] = [ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4]];
      const n = Math.min(32, Math.max(1, Math.ceil((Math.hypot(qx - cx, qy - cy) + Math.hypot(x - qx, y - qy)) / max)));
      // Split the quadratic into n equal-parameter pieces.
      let px = cx,
        py = cy;
      for (let k = 1; k <= n; k++) {
        const t0 = (k - 1) / n,
          t1 = k / n,
          tm = (t0 + t1) / 2;
        const at = (t: number) => [lerp(lerp(cx, qx, t), lerp(qx, x, t), t), lerp(lerp(cy, qy, t), lerp(qy, y, t), t)];
        const [ex, ey] = at(t1),
          [mx, my] = at(tm);
        // Control point of the sub-curve through its midpoint.
        out.push(2, 2 * mx - (px + ex) / 2, 2 * my - (py + ey) / 2, ex, ey);
        px = ex;
        py = ey;
      }
      cx = x;
      cy = y;
      i += 5;
    } else {
      const [ax, ay, bx, by, x, y] = [ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6]];
      const len = Math.hypot(ax - cx, ay - cy) + Math.hypot(bx - ax, by - ay) + Math.hypot(x - bx, y - by);
      const n = Math.min(32, Math.max(1, Math.ceil(len / max)));
      let p0 = [cx, cy],
        p1 = [ax, ay],
        p2 = [bx, by];
      const p3 = [x, y];
      for (let k = n; k >= 1; k--) {
        if (k === 1) {
          out.push(3, p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
          break;
        }
        // Split off the first 1/k of the remaining curve (de Casteljau).
        const t = 1 / k;
        const m01 = [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t)],
          m12 = [lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t)],
          m23 = [lerp(p2[0], p3[0], t), lerp(p2[1], p3[1], t)],
          a = [lerp(m01[0], m12[0], t), lerp(m01[1], m12[1], t)],
          b = [lerp(m12[0], m23[0], t), lerp(m12[1], m23[1], t)],
          mid = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
        out.push(3, m01[0], m01[1], a[0], a[1], mid[0], mid[1]);
        p0 = mid;
        p1 = b;
        p2 = m23;
      }
      cx = x;
      cy = y;
      i += 7;
    }
  }
  return out;
}

// ---- curves ---------------------------------------------------------------------------------
export interface Curve {
  map(x: number, y: number): [number, number];
  /** Direction of the curve at x (radians). */
  angle(x: number): number;
}

/** A circular arc through the anchor. `amount` -100..100; the text's widest line sets the radius. */
export function arcCurve(amount: number, shaped: ShapedText): Curve | null {
  if (!amount) return null;
  const width = Math.max(0.5, shaped.width);
  const total = (amount / 100) * Math.PI * 2 * 0.9;
  const R = width / total;
  const xc = shaped.left + shaped.width / 2;
  const raw = (x: number, y: number): [number, number] => {
    const phi = (x - xc) / R,
      r = R - y;
    return [xc + r * Math.sin(phi), R - r * Math.cos(phi)];
  };
  // Keep the anchor where it is, whatever the bend.
  const [ox, oy] = raw(0, 0);
  return {
    map: (x, y) => {
      const [X, Y] = raw(x, y);
      return [X - ox, Y - oy];
    },
    angle: (x) => (x - xc) / R,
  };
}

/** A polyline with arc lengths (em). */
interface Guide {
  xy: number[];
  cum: number[];
  length: number;
  closed: boolean;
}
function guideFrom(points: number[], closed: boolean): Guide {
  const cum = [0];
  for (let i = 2; i < points.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]));
  return { xy: points, cum, length: cum[cum.length - 1] ?? 0, closed };
}
/** Resamples evenly and averages over `window` em (ends kept), rounding off sharp bends. */
function smoothGuide(g: Guide, window: number): Guide {
  if (g.length < 1e-6) return g;
  const step = Math.max(0.02, Math.min(0.1, g.length / 400));
  const n = Math.max(2, Math.ceil(g.length / step) + 1);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = guidePoint(g, (g.length * i) / (n - 1));
    pts.push(p[0], p[1]);
  }
  const half = Math.max(1, Math.round(window / step / 2));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = g.closed ? half : Math.min(half, i, n - 1 - i);
    let sx = 0,
      sy = 0,
      c = 0;
    for (let k = -h; k <= h; k++) {
      let j = i + k;
      if (g.closed) j = ((j % (n - 1)) + (n - 1)) % (n - 1);
      sx += pts[j * 2];
      sy += pts[j * 2 + 1];
      c++;
    }
    out.push(sx / c, sy / c);
  }
  return guideFrom(out, g.closed);
}
function guidePoint(g: Guide, s: number): [number, number] {
  const { xy, cum } = g,
    n = cum.length;
  if (n < 2) return [xy[0] ?? 0, xy[1] ?? 0];
  if (g.closed) s = ((s % g.length) + g.length) % g.length;
  if (s <= 0 || s >= g.length) {
    // Past the ends: carry on straight, along the end's direction.
    const [i0, i1] = s <= 0 ? [0, 1] : [n - 2, n - 1];
    const dx = xy[i1 * 2] - xy[i0 * 2],
      dy = xy[i1 * 2 + 1] - xy[i0 * 2 + 1],
      d = Math.hypot(dx, dy) || 1;
    const base = s <= 0 ? 0 : n - 1,
      over = s <= 0 ? s : s - g.length;
    return [xy[base * 2] + (dx / d) * over, xy[base * 2 + 1] + (dy / d) * over];
  }
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [xy[lo * 2] + (xy[hi * 2] - xy[lo * 2]) * t, xy[lo * 2 + 1] + (xy[hi * 2 + 1] - xy[lo * 2 + 1]) * t];
}

/**
 * A path text's curve. `aspect` is the map's height / width (path nodes are
 * map fractions; em = map-width fraction / size).
 */
export function pathCurve(o: MMText, shaped: ShapedText, aspect: number): { curve: Curve; guide: number[] } | null {
  const p = o.path;
  if (!p || p.nodes.length < 2 || o.size <= 0) return null;
  const nodes = p.reverse ? reverseNodes(p.nodes) : p.nodes;
  const poly = flatten(nodes, false, 1 / o.size, aspect / o.size, 0.01);
  let g = guideFrom(Array.from(poly.xy), false);
  const raw = g;
  if (p.smooth) g = smoothGuide(g, 0.9);
  const L = g.length;
  const xmin = shaped.left,
    xmax = shaped.left + shaped.width;
  const s0 = p.align === "start" ? -xmin : p.align === "end" ? L - xmax : L / 2 - (xmin + xmax) / 2;
  const shift = s0 + p.offset * L;
  const first = shaped.lines[0],
    last = shaped.lines[shaped.lines.length - 1];
  const yRef = p.side === "above" ? (last?.baseline ?? 0) : p.side === "below" ? (first?.baseline ?? 0) - CAP : 0;
  const lift = p.side === "below" ? -p.baseline : p.baseline;
  const eps = 0.08;
  const angle = (x: number) => {
    const a = guidePoint(g, x + shift - eps),
      b = guidePoint(g, x + shift + eps);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  return {
    guide: raw.xy,
    curve: {
      angle,
      map: (x, y) => {
        const [px, py] = guidePoint(g, x + shift);
        const th = angle(x);
        const d = y - yRef - lift;
        return [px - Math.sin(th) * d, py + Math.cos(th) * d];
      },
    },
  };
}

// ---- assembling -------------------------------------------------------------------------------
type Mode = "warp" | "letters" | "words";
function modeOf(o: MMText, g: PlacedGlyph): Mode {
  if (o.letters === "warp" || o.letters === "letters" || o.letters === "words") return o.letters;
  return CURSIVE.has(g.script) ? "warp" : "letters";
}

/** Glyph units placed whole on a curve: clusters (letters) or words. */
function units(glyphs: PlacedGlyph[], mode: "letters" | "words"): PlacedGlyph[][] {
  const map = new Map<string, PlacedGlyph[]>();
  for (const g of glyphs) {
    const key = mode === "words" ? `${g.line}:w${g.word}` : `${g.line}:c${g.cluster}`;
    const list = map.get(key);
    if (list) list.push(g);
    else map.set(key, [g]);
  }
  return [...map.values()];
}

const geoCache = new WeakMap<MMText, { key: string; geo: TextGeometry }>();

/** The outlines of a text (em; path texts in map em — see pathCurve). */
export function textGeometry(o: MMText, aspect: number): TextGeometry {
  const boxEm = o.boxWidth ? o.boxWidth / o.size : null;
  const shaped = shapeText(o.text, o, boxEm);
  const key = `${shaped.ready}|${aspect}`;
  const hit = geoCache.get(o);
  if (hit && hit.key === key && hit.geo.shaped === shaped) return hit.geo;

  const ops: Ops = [],
    web: WebGlyph[] = [];
  let guide: number[] | null = null;
  let curve: Curve | null = null;
  if (o.curveMode === "arc") curve = arcCurve(o.curve, shaped);
  else if (o.curveMode === "path") {
    const pc = pathCurve(o, shaped, aspect);
    if (pc) {
      curve = pc.curve;
      guide = pc.guide;
    }
  }
  const all = shaped.lines.flatMap((l) => l.glyphs);
  // A glyph's outline in em at its straight place.
  const straight = (g: PlacedGlyph, out: Ops) => {
    if (g.ref.kind !== "hb") return;
    const k = g.ref.k;
    eachPoint(glyphOps(g.ref), (x, y) => [g.x + x * k, g.y - y * k], out);
  };
  const placeWeb = (g: PlacedGlyph, m: [number, number, number, number, number, number]) => {
    if (g.ref.kind === "web") web.push({ text: g.ref.text, css: g.ref.css, m });
  };

  if (!curve) {
    for (const g of all) {
      straight(g, ops);
      placeWeb(g, [0.01, 0, 0, 0.01, g.x, g.y]);
    }
  } else {
    const c = curve;
    const warp = all.filter((g) => g.ref.kind === "hb" && modeOf(o, g) === "warp");
    for (const g of warp) {
      const local: Ops = [];
      straight(g, local);
      eachPoint(subdivide(local, 0.05), (x, y) => c.map(x, y), ops);
    }
    for (const mode of ["letters", "words"] as const) {
      const rigid = all.filter((g) => (g.ref.kind === "web" || modeOf(o, g) !== "warp") && (g.ref.kind === "web" ? mode === "letters" : modeOf(o, g) === mode));
      for (const unit of units(rigid, mode)) {
        const x0 = Math.min(...unit.map((g) => g.x)),
          x1 = Math.max(...unit.map((g) => g.x + g.adv));
        const cx = (x0 + x1) / 2,
          base = unit[0].y;
        const [px, py] = c.map(cx, base);
        const th = c.angle(cx),
          cos = Math.cos(th),
          sin = Math.sin(th);
        const tf = (x: number, y: number): [number, number] => {
          const dx = x - cx,
            dy = y - base;
          return [px + dx * cos - dy * sin, py + dx * sin + dy * cos];
        };
        for (const g of unit) {
          if (g.ref.kind === "hb") {
            const local: Ops = [];
            straight(g, local);
            eachPoint(local, tf, ops);
          } else {
            const [ex, ey] = tf(g.x, g.y);
            placeWeb(g, [0.01 * cos, 0.01 * sin, -0.01 * sin, 0.01 * cos, ex, ey]);
          }
        }
      }
    }
  }

  // Bounds of every point (curves' control points included: a safe box).
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    const n = op === 0 || op === 1 ? 1 : op === 2 ? 2 : op === 3 ? 3 : 0;
    for (let p = 0; p < n; p++) {
      const x = ops[i + 1 + p * 2],
        y = ops[i + 2 + p * 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    i += 1 + n * 2;
  }
  for (const w of web) {
    const [, , , , e, f] = w.m;
    x0 = Math.min(x0, e - 0.1);
    x1 = Math.max(x1, e + 1.1);
    y0 = Math.min(y0, f - 1);
    y1 = Math.max(y1, f + 0.3);
  }
  if (!Number.isFinite(x0)) {
    // Nothing drawn yet (fonts loading, or only spaces): the block's box.
    x0 = shaped.left;
    x1 = shaped.left + Math.max(shaped.width, 0.5);
    y0 = shaped.top;
    y1 = shaped.bottom;
  }
  const geo: TextGeometry = { ops, web, bounds: { x0, y0, x1, y1 }, ready: shaped.ready, shaped, guide };
  geoCache.set(o, { key, geo });
  return geo;
}

/** Ops as an SVG path (scaled by `k`, moved by dx/dy), for exports. */
export function opsToSvg(ops: Ops, k = 1, dx = 0, dy = 0, digits = 2): string {
  const f = (v: number, d: number) => +(v * k + d).toFixed(digits);
  const parts: string[] = [];
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    if (op === 0) {
      parts.push(`M${f(ops[i + 1], dx)} ${f(ops[i + 2], dy)}`);
      i += 3;
    } else if (op === 1) {
      parts.push(`L${f(ops[i + 1], dx)} ${f(ops[i + 2], dy)}`);
      i += 3;
    } else if (op === 2) {
      parts.push(`Q${f(ops[i + 1], dx)} ${f(ops[i + 2], dy)} ${f(ops[i + 3], dx)} ${f(ops[i + 4], dy)}`);
      i += 5;
    } else if (op === 3) {
      parts.push(`C${f(ops[i + 1], dx)} ${f(ops[i + 2], dy)} ${f(ops[i + 3], dx)} ${f(ops[i + 4], dy)} ${f(ops[i + 5], dx)} ${f(ops[i + 6], dy)}`);
      i += 7;
    } else {
      parts.push("Z");
      i += 1;
    }
  }
  return parts.join("");
}
