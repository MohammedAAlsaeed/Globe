/**
 * Shape Tool geometry: from a shape's parts to the outline that is drawn.
 *
 *   primitives   rectangles (with round corners), ellipses, regular polygons
 *                and stars as exact Bézier nodes, built from a drag
 *   outline      every part flattened (within a fraction of a pixel) and
 *                combined in order — add, subtract, intersect, exclude —
 *                with Clipper2, so overlaps, holes and islands always come
 *                out right; one plain part skips all that and keeps its
 *                true curves
 *   stroke runs  the outline as loops to stroke, with the side the shape's
 *                material is on (for inside / outside strokes and walls)
 *                and openings (portals) cut out of them
 *   editing      moving, turning and resizing a shape (primitives and the
 *                texture frame follow), keeping portals on their walls when
 *                nodes change, combining shapes, releasing and flattening
 *                parts
 *
 * Pure math (no canvas, no React), shared by the renderer, the editor and
 * the unit tests (tests/shapes.test.mjs). Pixels of a w × h map throughout,
 * except where map fractions are stored.
 */
import {
  ClipType,
  Clipper,
  FillRule,
  PolyTreeD,
  type PathD,
  type PathsD,
  type PolyPathD,
} from "clipper2-ts";
import {
  cubicPoint,
  cubics,
  dist,
  flatten,
  nearest,
  sharpNodes,
  simplify,
  smoothHandles,
  transformNodes,
  type LineNode,
  type Polyline,
  type Vec,
} from "../lines/geometry";
import type {
  MMShape,
  ShapeFrame,
  ShapeGroup,
  ShapeOp,
  ShapePart,
  ShapePath,
  ShapePortal,
  ShapePrim,
  ShapePrimKind,
} from "../types";

export const SHAPE_LIMITS = {
  /** Paths in one shape (all groups). */
  maxPaths: 64,
  /** Groups inside groups. */
  maxDepth: 4,
  /** Nodes per path, and in the whole shape. */
  maxNodes: 2000,
  maxTotalNodes: 8000,
  maxPortals: 64,
} as const;

/** Bézier handle length that makes a quarter circle (4/3·(√2−1)). */
export const KAPPA = 0.5522847498307936;
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export const isGroup = (p: ShapePart): p is ShapeGroup =>
  Array.isArray((p as ShapeGroup).parts);

/** Every path of a shape, depth first (the order they combine in). */
export function paths(parts: readonly ShapePart[]): ShapePath[] {
  const out: ShapePath[] = [];
  const walk = (list: readonly ShapePart[]) => {
    for (const p of list) {
      if (isGroup(p)) walk(p.parts);
      else out.push(p);
    }
  };
  walk(parts);
  return out;
}
export function findPath(
  parts: readonly ShapePart[],
  id: string,
): ShapePath | null {
  return paths(parts).find((p) => p.id === id) ?? null;
}
/** The parts with every path passed through `fn` (structure kept). */
export function mapPaths(
  parts: readonly ShapePart[],
  fn: (p: ShapePath) => ShapePath,
): ShapePart[] {
  return parts.map((p) =>
    isGroup(p) ? { ...p, parts: mapPaths(p.parts, fn) } : fn(p),
  );
}
/** Replaces one part (path or group) by id; `null` removes it. Groups left
 * with a single part are unwrapped (the part takes the group's op). */
export function replacePart(
  parts: readonly ShapePart[],
  id: string,
  next: ShapePart | null,
): ShapePart[] {
  const out: ShapePart[] = [];
  for (const p of parts) {
    if (p.id === id) {
      if (next) out.push(next);
      continue;
    }
    if (isGroup(p)) {
      const inner = replacePart(p.parts, id, next);
      if (inner.length === 0) continue;
      if (inner.length === 1) out.push({ ...inner[0], op: p.op });
      else out.push(inner === p.parts ? p : { ...p, parts: inner });
    } else out.push(p);
  }
  return out;
}
/** Where a part sits: its parent list's owner (null = top level) and index. */
export function locatePart(
  parts: readonly ShapePart[],
  id: string,
  parent: ShapeGroup | null = null,
): { parent: ShapeGroup | null; index: number; part: ShapePart } | null {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.id === id) return { parent, index: i, part: p };
    if (isGroup(p)) {
      const hit = locatePart(p.parts, id, p);
      if (hit) return hit;
    }
  }
  return null;
}
/** Moves a part one place up or down within its own list. */
export function movePart(
  parts: readonly ShapePart[],
  id: string,
  by: -1 | 1,
): ShapePart[] {
  const at = parts.findIndex((p) => p.id === id);
  if (at >= 0) {
    const to = at + by;
    if (to < 0 || to >= parts.length) return parts.slice();
    const out = parts.slice();
    [out[at], out[to]] = [out[to], out[at]];
    return out;
  }
  return parts.map((p) =>
    isGroup(p) ? { ...p, parts: movePart(p.parts, id, by) } : p,
  );
}
export function depth(parts: readonly ShapePart[]): number {
  let d = 0;
  for (const p of parts) if (isGroup(p)) d = Math.max(d, 1 + depth(p.parts));
  return d;
}
export function countNodes(parts: readonly ShapePart[]) {
  return paths(parts).reduce((n, p) => n + p.nodes.length, 0);
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const rot = (v: Vec, a: number): Vec => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});

/** Local node (pixels about the centre, unturned) before placing it. */
interface LocalNode {
  p: Vec;
  hi?: Vec;
  ho?: Vec;
  smooth?: boolean;
}

/** A primitive's nodes (map fractions), clockwise on screen from the top. */
export function primNodes(prim: ShapePrim, w: number, h: number): LineNode[] {
  const a = Math.max(EPS, (prim.w * w) / 2),
    b = Math.max(EPS, (prim.h * w) / 2),
    local: LocalNode[] = [];
  if (prim.kind === "rect") {
    const r = Math.min(
      a,
      b,
      Math.max(0, prim.radius ?? 0) * 2 * Math.min(a, b),
    );
    if (r < 0.01) {
      local.push(
        { p: { x: -a, y: -b } },
        { p: { x: a, y: -b } },
        { p: { x: a, y: b } },
        { p: { x: -a, y: b } },
      );
    } else {
      const k = KAPPA * r;
      // Two nodes per corner, at the ends of its quarter circle.
      local.push(
        { p: { x: -a + r, y: -b }, hi: { x: -k, y: 0 } },
        { p: { x: a - r, y: -b }, ho: { x: k, y: 0 } },
        { p: { x: a, y: -b + r }, hi: { x: 0, y: -k } },
        { p: { x: a, y: b - r }, ho: { x: 0, y: k } },
        { p: { x: a - r, y: b }, hi: { x: k, y: 0 } },
        { p: { x: -a + r, y: b }, ho: { x: -k, y: 0 } },
        { p: { x: -a, y: b - r }, hi: { x: 0, y: k } },
        { p: { x: -a, y: -b + r }, ho: { x: 0, y: -k } },
      );
    }
  } else if (prim.kind === "ellipse") {
    const ka = KAPPA * a,
      kb = KAPPA * b;
    local.push(
      {
        p: { x: 0, y: -b },
        hi: { x: -ka, y: 0 },
        ho: { x: ka, y: 0 },
        smooth: true,
      },
      {
        p: { x: a, y: 0 },
        hi: { x: 0, y: -kb },
        ho: { x: 0, y: kb },
        smooth: true,
      },
      {
        p: { x: 0, y: b },
        hi: { x: ka, y: 0 },
        ho: { x: -ka, y: 0 },
        smooth: true,
      },
      {
        p: { x: -a, y: 0 },
        hi: { x: 0, y: kb },
        ho: { x: 0, y: -kb },
        smooth: true,
      },
    );
  } else {
    const n = Math.max(3, Math.min(64, Math.round(prim.sides ?? 6))),
      star = prim.kind === "star",
      inner = Math.max(0.05, Math.min(0.95, prim.inner ?? 0.5)),
      count = star ? n * 2 : n;
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / count,
        f = star && i % 2 === 1 ? inner : 1;
      local.push({ p: { x: Math.cos(ang) * a * f, y: Math.sin(ang) * b * f } });
    }
  }
  // Merge nodes that landed on each other (a fully round rectangle side).
  const merged: LocalNode[] = [];
  for (const nd of local) {
    const last = merged[merged.length - 1];
    if (last && dist(last.p, nd.p) < 1e-6) {
      last.ho = nd.ho;
      last.smooth = true;
    } else merged.push({ ...nd });
  }
  if (
    merged.length > 1 &&
    dist(merged[0].p, merged[merged.length - 1].p) < 1e-6
  ) {
    const last = merged.pop()!;
    merged[0].hi = last.hi;
    merged[0].smooth = true;
  }
  const r = (prim.rot * Math.PI) / 180,
    cx = prim.cx * w,
    cy = prim.cy * h;
  return merged.map((nd) => {
    const p = rot(nd.p, r),
      out: LineNode = { x: (cx + p.x) / w, y: (cy + p.y) / h };
    if (nd.smooth) out.t = "smooth";
    if (nd.hi) {
      const v = rot(nd.hi, r);
      out.hi = { x: v.x / w, y: v.y / h };
    }
    if (nd.ho) {
      const v = rot(nd.ho, r);
      out.ho = { x: v.x / w, y: v.y / h };
    }
    return out;
  });
}

export interface DragOptions {
  /** Square / circle / regular proportions. */
  constrain: boolean;
  /** The drag starts at the centre instead of a corner. */
  fromCenter: boolean;
  sides?: number;
  inner?: number;
  radius?: number;
  /** Turn of polygons and stars (degrees; their drag sets the size only). */
  rot?: number;
}
/**
 * The primitive a drag from `a` to `b` (pixels) describes. Rectangles and
 * ellipses fill the box between the two points (or about `a` with
 * fromCenter); polygons and stars always grow from their centre and turn
 * to follow the pointer, in 15° steps when constrained.
 */
export function primFromDrag(
  kind: ShapePrimKind,
  a: Vec,
  b: Vec,
  o: DragOptions,
  w: number,
  h: number,
): ShapePrim {
  if (kind === "polygon" || kind === "star") {
    const r = dist(a, b);
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    if (o.constrain) ang = Math.round(ang / 15) * 15;
    return {
      kind,
      cx: a.x / w,
      cy: a.y / h,
      w: (2 * r) / w,
      h: (2 * r) / w,
      rot: o.rot ?? (r > 0 ? normalizeDeg(ang) : 0),
      sides: o.sides ?? (kind === "star" ? 5 : 6),
      ...(kind === "star" ? { inner: o.inner ?? 0.5 } : {}),
    };
  }
  let dx = b.x - a.x,
    dy = b.y - a.y;
  if (o.constrain) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  const cx = o.fromCenter ? a.x : a.x + dx / 2,
    cy = o.fromCenter ? a.y : a.y + dy / 2,
    bw = Math.abs(dx) * (o.fromCenter ? 2 : 1),
    bh = Math.abs(dy) * (o.fromCenter ? 2 : 1);
  return {
    kind,
    cx: cx / w,
    cy: cy / h,
    w: bw / w,
    h: bh / w,
    rot: 0,
    ...(kind === "rect" ? { radius: o.radius ?? 0 } : {}),
  };
}
export const normalizeDeg = (d: number) => {
  const r = ((((d + 180) % 360) + 360) % 360) - 180;
  return Math.abs(r) < 1e-9 ? 0 : r;
};

/** A primitive's box size in pixels (for the live dimensions). */
export function primSizePx(prim: ShapePrim, w: number) {
  return { width: prim.w * w, height: prim.h * w };
}

/** Moves / turns / resizes a primitive with an affine map (pixels). Returns
 * null when the map skews it (it then stays a free path). */
export function transformPrim(
  prim: ShapePrim,
  w: number,
  h: number,
  map: (p: Vec) => Vec,
): ShapePrim | null {
  const r = (prim.rot * Math.PI) / 180,
    c = { x: prim.cx * w, y: prim.cy * h },
    ua = rot({ x: (prim.w * w) / 2, y: 0 }, r),
    vb = rot({ x: 0, y: (prim.h * w) / 2 }, r),
    c2 = map(c),
    u0 = map({ x: c.x + ua.x, y: c.y + ua.y }),
    v0 = map({ x: c.x + vb.x, y: c.y + vb.y });
  const u = { x: u0.x - c2.x, y: u0.y - c2.y },
    v = { x: v0.x - c2.x, y: v0.y - c2.y },
    lu = Math.hypot(u.x, u.y),
    lv = Math.hypot(v.x, v.y);
  if (lu < EPS || lv < EPS) return null;
  // Still a right angle between the axes (no skew)? Mirrors are fine: all
  // primitives are symmetric.
  if (Math.abs(u.x * v.x + u.y * v.y) > 1e-4 * lu * lv) return null;
  // A circle-like primitive keeps square proportions only if both axes grew alike.
  return {
    ...prim,
    cx: c2.x / w,
    cy: c2.y / h,
    w: (2 * lu) / w,
    h: (2 * lv) / w,
    rot: normalizeDeg((Math.atan2(u.y, u.x) * 180) / Math.PI),
  };
}

// ---------------------------------------------------------------------------
// The outline
// ---------------------------------------------------------------------------

/** One closed loop of the outline, in pixels. */
export interface Contour {
  /** x0, y0, x1, y1… (not repeating the first point). */
  xy: Float64Array;
  /** Shoelace area (pixels², > 0 = clockwise on screen). */
  area: number;
  /** A hole (its winding is opposite the outer loops'). */
  hole: boolean;
}
export interface ShapeOutline {
  contours: Contour[];
  /** One plain path: drawn with its true curves (`path`). */
  direct: ShapePath | null;
  bounds: { x: number; y: number; width: number; height: number };
}

const toPathD = (xy: ArrayLike<number>, n = xy.length / 2): PathD => {
  const out: PathD = [];
  for (let i = 0; i < n; i++) out.push({ x: xy[i * 2], y: xy[i * 2 + 1] });
  return out;
};
export function signedArea(xy: ArrayLike<number>, n = xy.length / 2) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  return s / 2;
}
/** A path's outline points (pixels), without the repeated closing point. */
function pathPoints(p: ShapePath, w: number, h: number, tol: number) {
  const poly = flatten(p.nodes, true, w, h, tol),
    n = poly.xy.length / 2;
  // flatten() repeats the first point at the end of a closed path.
  const k =
    n > 1 &&
    Math.abs(poly.xy[0] - poly.xy[(n - 1) * 2]) < 1e-9 &&
    Math.abs(poly.xy[1] - poly.xy[(n - 1) * 2 + 1]) < 1e-9
      ? n - 1
      : n;
  return poly.xy.subarray(0, k * 2);
}

const CLIP: Record<Exclude<ShapeOp, "add">, ClipType> = {
  subtract: ClipType.Difference,
  intersect: ClipType.Intersection,
  exclude: ClipType.Xor,
};
/** Clipper precision: hundredths of a pixel. */
const PRECISION = 2;

function evaluate(
  parts: readonly ShapePart[],
  w: number,
  h: number,
  tol: number,
): PathsD {
  let acc: PathsD | null = null;
  for (const part of parts) {
    let shape: PathsD;
    if (isGroup(part)) shape = evaluate(part.parts, w, h, tol);
    else {
      const pts = pathPoints(part, w, h, tol);
      shape = pts.length >= 6 ? [toPathD(pts)] : [];
    }
    if (acc === null) {
      // The base: self-crossings resolved (non-zero, as it is filled).
      acc = Clipper.unionD(shape, FillRule.NonZero);
      continue;
    }
    if (part.op === "add")
      acc = Clipper.unionD(acc, shape, FillRule.NonZero, PRECISION);
    else
      acc = Clipper.booleanOpD(
        CLIP[part.op],
        acc,
        shape,
        FillRule.NonZero,
        PRECISION,
      );
  }
  return acc ?? [];
}

function boundsOf(contours: Contour[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const c of contours)
    for (let i = 0; i < c.xy.length; i += 2) {
      x0 = Math.min(x0, c.xy[i]);
      x1 = Math.max(x1, c.xy[i]);
      y0 = Math.min(y0, c.xy[i + 1]);
      y1 = Math.max(y1, c.xy[i + 1]);
    }
  return Number.isFinite(x0)
    ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    : { x: 0, y: 0, width: 0, height: 0 };
}

/** The outline of a set of parts at this size (no cache; see `outline`). */
export function computeOutline(
  parts: readonly ShapePart[],
  w: number,
  h: number,
  tol = 0.35,
): ShapeOutline {
  if (parts.length === 1 && !isGroup(parts[0])) {
    const p = parts[0],
      xy = Float64Array.from(pathPoints(p, w, h, tol)),
      area = signedArea(xy);
    const contours = xy.length >= 6 ? [{ xy, area, hole: false }] : [];
    return { contours, direct: p, bounds: boundsOf(contours) };
  }
  const result = evaluate(parts, w, h, tol);
  // Outer loops wind one way and holes the other; the bigger outer loop's
  // sign tells which is which.
  let outerSign = 1,
    biggest = 0;
  const contours: Contour[] = [];
  for (const path of result) {
    if (path.length < 3) continue;
    const xy = new Float64Array(path.length * 2);
    path.forEach((pt, i) => {
      xy[i * 2] = pt.x;
      xy[i * 2 + 1] = pt.y;
    });
    const area = signedArea(xy);
    if (Math.abs(area) < 1e-6) continue;
    if (Math.abs(area) > biggest) {
      biggest = Math.abs(area);
      outerSign = Math.sign(area);
    }
    contours.push({ xy, area, hole: false });
  }
  // Clipper winds every outer loop one way and every hole the other; the
  // biggest loop is always an outer one.
  for (const c of contours) c.hole = Math.sign(c.area) !== outerSign;
  return { contours, direct: null, bounds: boundsOf(contours) };
}

/** Outlines per parts list, a few sizes each (screen, hit testing, print). */
const outlines = new WeakMap<readonly ShapePart[], Map<string, ShapeOutline>>();
/** The outline of a shape's parts, cached per parts list and size. */
export function outline(
  parts: readonly ShapePart[],
  w: number,
  h: number,
  tol = 0.35,
): ShapeOutline {
  let sizes = outlines.get(parts);
  if (!sizes) outlines.set(parts, (sizes = new Map()));
  const key = `${w}|${h}|${tol}`,
    hit = sizes.get(key);
  if (hit) return hit;
  const out = computeOutline(parts, w, h, tol);
  if (sizes.size >= 6) sizes.delete(sizes.keys().next().value!);
  sizes.set(key, out);
  return out;
}

/** Area and perimeter of an outline, pixels (holes count against the area). */
export function measure(o: ShapeOutline) {
  let area = 0,
    perimeter = 0;
  for (const c of o.contours) {
    area += c.hole ? -Math.abs(c.area) : Math.abs(c.area);
    const n = c.xy.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      perimeter += Math.hypot(
        c.xy[j * 2] - c.xy[i * 2],
        c.xy[j * 2 + 1] - c.xy[i * 2 + 1],
      );
    }
  }
  return { area: Math.max(0, area), perimeter };
}

/** Whether a pixel point is inside the outline (non-zero rule). */
export function containsPoint(o: ShapeOutline, p: Vec): boolean {
  let winding = 0;
  for (const c of o.contours) {
    const n = c.xy.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        ax = c.xy[i * 2],
        ay = c.xy[i * 2 + 1],
        bx = c.xy[j * 2],
        by = c.xy[j * 2 + 1];
      if (ay <= p.y) {
        if (by > p.y && (bx - ax) * (p.y - ay) - (p.x - ax) * (by - ay) > 0)
          winding++;
      } else if (
        by <= p.y &&
        (bx - ax) * (p.y - ay) - (p.x - ax) * (by - ay) < 0
      )
        winding--;
    }
  }
  return winding !== 0;
}

// ---------------------------------------------------------------------------
// Stroke runs and portals
// ---------------------------------------------------------------------------

/** A closed or open polyline to stroke. Every run travels with the shape's
 * material on its right, so "inside" is always the same side — for inside /
 * outside strokes and for which way wall pieces face. */
export interface StrokeRun {
  poly: Polyline;
  /** Point indices of sharp corners (for wall corner pieces). */
  corners: number[];
}
function reversed(xy: Float64Array) {
  const n = xy.length / 2,
    out = new Float64Array(xy.length);
  for (let i = 0; i < n; i++) {
    out[i * 2] = xy[(n - 1 - i) * 2];
    out[i * 2 + 1] = xy[(n - 1 - i) * 2 + 1];
  }
  return out;
}

function polylineOf(xy: ArrayLike<number>, closed: boolean): Polyline {
  const n = xy.length / 2,
    m = closed ? n + 1 : n,
    out = new Float64Array(m * 2),
    cum = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    out[i * 2] = xy[i * 2];
    out[i * 2 + 1] = xy[i * 2 + 1];
  }
  if (closed && n) {
    out[n * 2] = xy[0];
    out[n * 2 + 1] = xy[1];
  }
  for (let i = 1; i < m; i++)
    cum[i] =
      cum[i - 1] +
      Math.hypot(out[i * 2] - out[i * 2 - 2], out[i * 2 + 1] - out[i * 2 - 1]);
  return {
    xy: out,
    cum,
    nodeAt: [],
    length: m ? cum[m - 1] : 0,
    closed,
  };
}

/** Indices of polyline points where the path turns by `minTurnDeg` or more. */
export function polyCorners(poly: Polyline, minTurnDeg = 35): number[] {
  const n = poly.xy.length / 2,
    out: number[] = [],
    last = poly.closed ? n - 1 : n,
    limit = (minTurnDeg * Math.PI) / 180;
  const at = (i: number) => {
    // Closed polylines repeat their first point at the end.
    const k = poly.closed ? ((i % (n - 1)) + (n - 1)) % (n - 1) : i;
    return { x: poly.xy[k * 2], y: poly.xy[k * 2 + 1] };
  };
  for (let i = poly.closed ? 0 : 1; i < (poly.closed ? last : n - 1); i++) {
    const p = at(i - 1),
      c = at(i),
      q = at(i + 1);
    const a = Math.atan2(c.y - p.y, c.x - p.x),
      b = Math.atan2(q.y - c.y, q.x - c.x);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d >= limit) out.push(i);
  }
  return out;
}

/** Where a portal is (pixels), and the direction of its wall. */
export function portalPoint(
  parts: readonly ShapePart[],
  portal: ShapePortal,
  w: number,
  h: number,
): { x: number; y: number; angle: number } | null {
  const path = findPath(parts, portal.part);
  if (!path) return null;
  const segs = cubics(path.nodes, true, w, h),
    c = segs[portal.seg];
  if (!c) return null;
  const t = Math.max(0, Math.min(1, portal.t)),
    p = cubicPoint(c, t),
    q = cubicPoint(c, Math.min(1, t + 1e-3)),
    r = cubicPoint(c, Math.max(0, t - 1e-3));
  return { ...p, angle: Math.atan2(q.y - r.y, q.x - r.x) };
}

/** The nearest point of any contour to `p`: contour, distance along it, gap. */
function nearestOnContours(contours: Contour[], p: Vec) {
  let best: { c: number; d: number; gap: number } | null = null;
  contours.forEach((c, ci) => {
    const n = c.xy.length / 2;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        ax = c.xy[i * 2],
        ay = c.xy[i * 2 + 1],
        dx = c.xy[j * 2] - ax,
        dy = c.xy[j * 2 + 1] - ay,
        l2 = dx * dx + dy * dy,
        len = Math.sqrt(l2),
        t = l2
          ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2))
          : 0,
        gap = Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y);
      if (!best || gap < best.gap) best = { c: ci, d: along + len * t, gap };
      along += len;
    }
  });
  return best as { c: number; d: number; gap: number } | null;
}

/** The part of a closed polyline from distance `a` to `b` (b may pass the
 * end and wrap round), as an open polyline. */
function slice(poly: Polyline, a: number, b: number): Polyline {
  const L = poly.length,
    n = poly.cum.length,
    pts: number[] = [];
  const at = (d: number) => {
    const dd = Math.min(L, Math.max(0, ((d % L) + L) % L));
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (poly.cum[mid] <= dd) lo = mid;
      else hi = mid;
    }
    const seg = poly.cum[hi] - poly.cum[lo] || 1,
      t = (dd - poly.cum[lo]) / seg;
    return [
      poly.xy[lo * 2] + (poly.xy[hi * 2] - poly.xy[lo * 2]) * t,
      poly.xy[lo * 2 + 1] + (poly.xy[hi * 2 + 1] - poly.xy[lo * 2 + 1]) * t,
    ];
  };
  pts.push(...at(a));
  // The polyline's own points between a and b, over (at most) two laps; its
  // last point repeats the first, so a lap is n − 1 points.
  for (let lap = 0; lap < 2; lap++)
    for (let i = 0; i < n - 1; i++) {
      const d = poly.cum[i] + lap * L;
      if (d > a + 1e-6 && d < b - 1e-6)
        pts.push(poly.xy[i * 2], poly.xy[i * 2 + 1]);
    }
  pts.push(...at(b));
  return polylineOf(pts, false);
}

/** How close (px) a portal must be to the outline to cut it. */
const PORTAL_SNAP_PX = 3;

/** Where each portal cuts the outline: contour index and distance range. */
export function portalCuts(
  parts: readonly ShapePart[],
  portals: readonly ShapePortal[],
  o: ShapeOutline,
  w: number,
  h: number,
): { portal: ShapePortal; c: number; from: number; to: number }[] {
  const out: { portal: ShapePortal; c: number; from: number; to: number }[] =
    [];
  for (const portal of portals) {
    const at = portalPoint(parts, portal, w, h);
    if (!at) continue;
    const hit = nearestOnContours(o.contours, at);
    if (!hit || hit.gap > PORTAL_SNAP_PX) continue;
    const half = (portal.width * w) / 2;
    out.push({ portal, c: hit.c, from: hit.d - half, to: hit.d + half });
  }
  return out;
}

/** The loops to stroke (pixels), split where portals cut them. */
export function strokeRuns(
  shape: Pick<MMShape, "parts" | "portals">,
  o: ShapeOutline,
  w: number,
  h: number,
): StrokeRun[] {
  const cuts = shape.portals.length
    ? portalCuts(shape.parts, shape.portals, o, w, h)
    : [];
  const out: StrokeRun[] = [];
  o.contours.forEach((c, ci) => {
    // Material is inside an outer loop and outside a hole; with y down, a
    // positive area loop has its inside on the right.
    const inside = c.area > 0 ? 1 : -1,
      side = c.hole ? -inside : inside;
    const poly = polylineOf(side > 0 ? c.xy : reversed(c.xy), true),
      L = poly.length;
    const corners =
      o.direct && ci === 0
        ? cornersFromNodes(o.direct.nodes, poly, w, h)
        : polyCorners(poly);
    let mine = cuts
      .filter((k) => k.c === ci)
      .map((k) => ({ from: k.from, to: k.to }))
      .filter((k) => k.to - k.from > 0.5);
    if (!mine.length) {
      out.push({ poly, corners });
      return;
    }
    // Normalize into [0, L) and merge overlapping openings.
    mine = mine
      .map((k) => {
        const from = ((k.from % L) + L) % L;
        return { from, to: from + Math.min(L, k.to - k.from) };
      })
      .sort((a, b) => a.from - b.from);
    const merged: { from: number; to: number }[] = [];
    for (const k of mine) {
      const last = merged[merged.length - 1];
      if (last && k.from <= last.to) last.to = Math.max(last.to, k.to);
      else merged.push({ ...k });
    }
    // Wrapping overlap between the last opening and the first.
    if (merged.length > 1) {
      const last = merged[merged.length - 1];
      if (last.to - L >= merged[0].from) {
        merged[0].from = last.from - L;
        merged[0].to = Math.max(merged[0].to, last.to - L);
        merged.pop();
      }
    }
    if (merged.length === 1 && merged[0].to - merged[0].from >= L - 0.5) return;
    for (let i = 0; i < merged.length; i++) {
      const a = merged[i].to,
        b =
          merged[(i + 1) % merged.length].from +
          (i + 1 < merged.length ? 0 : L);
      if (b - a <= 0.5) continue;
      const run = slice(poly, a, b);
      out.push({ poly: run, corners: polyCorners(run) });
    }
  });
  return out;
}

/** Polyline indices of the sharp nodes of a direct path. */
function cornersFromNodes(
  nodes: LineNode[],
  poly: Polyline,
  w: number,
  h: number,
): number[] {
  // The contour polyline was rebuilt from the flattened points, so find each
  // sharp node's point by position.
  const out: number[] = [];
  for (const i of sharpNodes(nodes, true, w, h)) {
    const nx = nodes[i].x * w,
      ny = nodes[i].y * h;
    let best = -1,
      bestD = 1;
    for (let k = 0; k < poly.xy.length / 2; k++) {
      const d = Math.hypot(poly.xy[k * 2] - nx, poly.xy[k * 2 + 1] - ny);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) out.push(best === poly.xy.length / 2 - 1 ? 0 : best);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Puts a portal at the point of a path nearest `p` (pixels). */
export function portalOnPath(
  path: ShapePath,
  p: Vec,
  w: number,
  h: number,
): { seg: number; t: number; gap: number } | null {
  const hit = nearest(path.nodes, true, w, h, p);
  return hit ? { seg: hit.seg, t: hit.t, gap: hit.d } : null;
}

/** The path of a shape nearest a pixel point (for placing portals). */
export function nearestPath(
  parts: readonly ShapePart[],
  p: Vec,
  w: number,
  h: number,
): { path: ShapePath; seg: number; t: number; gap: number } | null {
  let best: { path: ShapePath; seg: number; t: number; gap: number } | null =
    null;
  for (const path of paths(parts)) {
    const hit = portalOnPath(path, p, w, h);
    if (hit && (!best || hit.gap < best.gap)) best = { path, ...hit };
  }
  return best;
}

/**
 * Keeps portals on their walls after the nodes changed (a node added,
 * removed or moved): each one goes to the nearest point of its path's new
 * outline. Portals whose path is gone are dropped.
 */
export function reanchorPortals(
  before: readonly ShapePart[],
  after: readonly ShapePart[],
  portals: readonly ShapePortal[],
  w: number,
  h: number,
): ShapePortal[] {
  const out: ShapePortal[] = [];
  for (const portal of portals) {
    const path = findPath(after, portal.part),
      old = findPath(before, portal.part);
    if (!path) continue;
    if (old && old.nodes === path.nodes) {
      out.push(portal);
      continue;
    }
    const at = portalPoint(before, portal, w, h);
    const hit = at ? portalOnPath(path, at, w, h) : null;
    out.push(hit ? { ...portal, seg: hit.seg, t: hit.t } : portal);
  }
  return out;
}

/** Re-homes portals onto new paths (after a flatten): by position. */
function rehomePortals(
  before: readonly ShapePart[],
  after: readonly ShapePart[],
  portals: readonly ShapePortal[],
  w: number,
  h: number,
): ShapePortal[] {
  const out: ShapePortal[] = [];
  for (const portal of portals) {
    const at = portalPoint(before, portal, w, h);
    if (!at) continue;
    const hit = nearestPath(after, at, w, h);
    if (hit && hit.gap < PORTAL_SNAP_PX * 2)
      out.push({ ...portal, part: hit.path.id, seg: hit.seg, t: hit.t });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Editing whole shapes
// ---------------------------------------------------------------------------

/** The patch that moves a shape by (dx, dy), map fractions. */
export function shiftShape(
  s: Pick<MMShape, "parts" | "frame">,
  dx: number,
  dy: number,
): Pick<MMShape, "parts" | "frame"> {
  return {
    parts: mapPaths(s.parts, (p) => ({
      ...p,
      nodes: p.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
      ...(p.prim
        ? { prim: { ...p.prim, cx: p.prim.cx + dx, cy: p.prim.cy + dy } }
        : {}),
    })),
    frame: { ...s.frame, x: s.frame.x + dx, y: s.frame.y + dy },
  };
}

/** A frame carried along by an affine map (pixels). */
export function transformFrame(
  f: ShapeFrame,
  w: number,
  h: number,
  map: (p: Vec) => Vec,
): ShapeFrame {
  const o = { x: f.x * w, y: f.y * h },
    r = (f.rot * Math.PI) / 180,
    o2 = map(o),
    u = map({ x: o.x + Math.cos(r) * 100, y: o.y + Math.sin(r) * 100 }),
    v = map({ x: o.x - Math.sin(r) * 100, y: o.y + Math.cos(r) * 100 }),
    lu = Math.hypot(u.x - o2.x, u.y - o2.y),
    lv = Math.hypot(v.x - o2.x, v.y - o2.y);
  return {
    x: o2.x / w,
    y: o2.y / h,
    rot: normalizeDeg((Math.atan2(u.y - o2.y, u.x - o2.x) * 180) / Math.PI),
    scale: Math.max(0.01, Math.min(100, (f.scale * Math.sqrt(lu * lv)) / 100)),
  };
}

/** Applies an affine map (pixels) to a shape's geometry. Primitives follow
 * when the map keeps them rectangular; `uniform` scales strokes and portals. */
export function transformShape(
  s: MMShape,
  w: number,
  h: number,
  map: (p: Vec) => Vec,
  uniform: number,
  round: (n: LineNode) => LineNode = (n) => n,
): Partial<MMShape> {
  const k = Math.max(0.01, uniform),
    clamp = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, v));
  return {
    parts: mapPaths(s.parts, (p) => {
      const prim = p.prim ? transformPrim(p.prim, w, h, map) : null;
      const next: ShapePath = {
        id: p.id,
        op: p.op,
        nodes: transformNodes(p.nodes, w, h, map).map(round),
      };
      if (prim) next.prim = prim;
      return next;
    }),
    frame: transformFrame(s.frame, w, h, map),
    portals: s.portals.map((pt) => ({
      ...pt,
      width: clamp(pt.width * k, 0.0005, 0.5),
    })),
    stroke: {
      ...s.stroke,
      color: {
        ...s.stroke.color,
        width: clamp(s.stroke.color.width * k, 0.0002, 0.2),
        casing: clamp(s.stroke.color.casing * k, 0, 0.05),
      },
      stamp: {
        ...s.stroke.stamp,
        size: clamp(s.stroke.stamp.size * k, 0.0005, 0.2),
      },
    },
    fill: {
      ...s.fill,
      feather: clamp(s.fill.feather * k, 0, 0.2),
    },
  };
}

/** Rebuilds a path from its primitive (after its numbers were edited),
 * keeping portals on the same walls. */
export function withPrim(
  s: Pick<MMShape, "parts" | "portals">,
  pathId: string,
  prim: ShapePrim,
  w: number,
  h: number,
  round: (n: LineNode) => LineNode = (n) => n,
): Pick<MMShape, "parts" | "portals"> {
  const old = findPath(s.parts, pathId);
  const parts = mapPaths(s.parts, (p) =>
    p.id === pathId
      ? { ...p, prim, nodes: primNodes(prim, w, h).map(round) }
      : p,
  );
  const next = findPath(parts, pathId);
  // Same walls (only sizes changed): doors keep their wall and place on it.
  // Walls added or removed (corners rounded, sides changed): by position.
  return {
    parts,
    portals:
      old && next && old.nodes.length === next.nodes.length
        ? s.portals.slice()
        : reanchorPortals(s.parts, parts, s.portals, w, h),
  };
}

/** New nodes for one path (node editing drops its primitive). */
export function withNodes(
  s: Pick<MMShape, "parts" | "portals">,
  pathId: string,
  nodes: LineNode[],
  w: number,
  h: number,
): Pick<MMShape, "parts" | "portals"> {
  const parts = mapPaths(s.parts, (p) =>
    p.id === pathId ? { id: p.id, op: p.op, nodes } : p,
  );
  return {
    parts,
    portals: reanchorPortals(s.parts, parts, s.portals, w, h),
  };
}

/**
 * Turns the outline into plain paths, for good: one path per loop, in the
 * order that rebuilds it (outer loops added, holes subtracted, islands in
 * holes added…). Curves become many corner nodes — that is what "flatten"
 * means; everything else about the shape stays.
 */
export function flattenParts(
  s: Pick<MMShape, "parts" | "portals">,
  w: number,
  h: number,
  newId: () => string,
): Pick<MMShape, "parts" | "portals"> {
  const tree = new PolyTreeD();
  const base = evaluate(s.parts, w, h, 0.25);
  Clipper.booleanOpDWithPolyTree(
    ClipType.Union,
    base,
    null,
    tree,
    FillRule.NonZero,
    PRECISION,
  );
  const parts: ShapePath[] = [];
  const walk = (node: PolyPathD, d: number) => {
    for (let i = 0; i < node.count; i++) {
      const child = node.child(i),
        poly = child.poly;
      if (poly && poly.length >= 3) {
        const pts = simplify(
          poly.map((p) => ({ x: p.x, y: p.y })),
          0.25,
        );
        if (pts.length >= 3)
          parts.push({
            id: newId(),
            op: parts.length === 0 ? "add" : d % 2 === 0 ? "add" : "subtract",
            nodes: pts.map((p) => ({ x: p.x / w, y: p.y / h })),
          });
      }
      walk(child, d + 1);
    }
  };
  walk(tree, 0);
  return {
    parts,
    portals: rehomePortals(s.parts, parts, s.portals, w, h),
  };
}

/**
 * Combines shapes into the first (bottom) one, keeping every part: the
 * others join as groups (or paths) with `op`. Portals come along.
 */
export function combineParts(
  shapes: Pick<MMShape, "parts" | "portals">[],
  op: ShapeOp,
  newId: () => string,
): Pick<MMShape, "parts" | "portals"> {
  const [first, ...rest] = shapes;
  const parts: ShapePart[] = [...first.parts];
  for (const s of rest) {
    if (s.parts.length === 1) parts.push({ ...s.parts[0], op });
    else parts.push({ id: newId(), op, parts: s.parts });
  }
  return { parts, portals: shapes.flatMap((s) => s.portals) };
}

/** Splits a shape's top-level parts into shapes of their own (each a base). */
export function releaseParts(
  s: Pick<MMShape, "parts" | "portals">,
): Pick<MMShape, "parts" | "portals">[] {
  return s.parts.map((p) => {
    const own = new Set(paths([p]).map((x) => x.id));
    return {
      parts: [{ ...p, op: "add" as const }],
      portals: s.portals.filter((pt) => own.has(pt.part)),
    };
  });
}

/** Closed nodes from a polygon drawn with Konva's `tension` (the old Region
 * tool): the same curve, as Bézier nodes. */
export function closedTensionNodes(
  points: Vec[],
  tension: number,
  w: number,
  h: number,
): LineNode[] {
  const px = points.map((p) => ({ x: p.x * w, y: p.y * h })),
    n = px.length;
  return px.map((p, i) => {
    const node: LineNode = { x: p.x / w, y: p.y / h };
    if (tension <= 0 || n < 3) return node;
    const { hi, ho } = smoothHandles(
      px[(i - 1 + n) % n],
      p,
      px[(i + 1) % n],
      tension,
    );
    return {
      ...node,
      t: "smooth",
      hi: { x: hi.x / w, y: hi.y / h },
      ho: { x: ho.x / w, y: ho.y / h },
    };
  });
}

/** A simple path bounding box (map fractions) — the frame's default origin. */
export function partsBox(parts: readonly ShapePart[], w: number, h: number) {
  const o = outline(parts, w, h, 1);
  return {
    x: o.bounds.x / w,
    y: o.bounds.y / h,
    width: o.bounds.width / w,
    height: o.bounds.height / h,
  };
}
