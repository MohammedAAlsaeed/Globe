/**
 * Line Tool geometry: the path engine behind every line on the map.
 *
 * A line is a list of *nodes* (control points). Each node sits at (x, y) in
 * map fractions (0..1 of the width / height, like every other object) and
 * may carry two Bézier handles, `hi` (into the node) and `ho` (out of it),
 * stored *relative* to the node. Between two nodes runs one cubic Bézier:
 *
 *   P0 = node i          P1 = node i + its `ho`
 *   P3 = node i + 1      P2 = node i + 1 + its `hi`
 *
 * A node without handles makes a sharp corner; a "smooth" node keeps its two
 * handles on one straight line, so the curve flows through it. Only these
 * few control points are stored — never the thousands of pixels drawn from
 * them — so lines stay light, editable and smooth at any zoom or print size.
 *
 * Everything here is pure math (no canvas, no React), shared by the
 * renderer, the editor and the unit tests. Functions taking `w, h` work in
 * pixels of a w × h map.
 */

export interface Vec {
  x: number;
  y: number;
}
export type NodeType = "corner" | "smooth";
export interface LineNode {
  x: number;
  y: number;
  /** Unset = corner. */
  t?: NodeType;
  /** Handle into the node, relative (map fractions). */
  hi?: Vec;
  /** Handle out of the node, relative (map fractions). */
  ho?: Vec;
}
/** One cubic piece, in pixels. */
export interface Cubic {
  p0: Vec;
  p1: Vec;
  p2: Vec;
  p3: Vec;
}

const EPS = 1e-9;
const isZero = (v?: Vec) => !v || (Math.abs(v.x) < EPS && Math.abs(v.y) < EPS);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** The cubic pieces of a line, in pixels (closed lines add the closing piece). */
export function cubics(
  nodes: LineNode[],
  closed: boolean,
  w: number,
  h: number,
): Cubic[] {
  const out: Cubic[] = [],
    n = nodes.length;
  const last = closed && n > 2 ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = nodes[i],
      b = nodes[(i + 1) % n];
    out.push({
      p0: { x: a.x * w, y: a.y * h },
      p1: { x: (a.x + (a.ho?.x ?? 0)) * w, y: (a.y + (a.ho?.y ?? 0)) * h },
      p2: { x: (b.x + (b.hi?.x ?? 0)) * w, y: (b.y + (b.hi?.y ?? 0)) * h },
      p3: { x: b.x * w, y: b.y * h },
    });
  }
  return out;
}

/** Whether a cubic is really a straight segment (no handles). */
export function isStraight(c: Cubic) {
  return dist(c.p0, c.p1) < EPS && dist(c.p2, c.p3) < EPS;
}

export function cubicPoint(c: Cubic, t: number): Vec {
  const u = 1 - t,
    a = u * u * u,
    b = 3 * u * u * t,
    d = 3 * u * t * t,
    e = t * t * t;
  return {
    x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x,
    y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y,
  };
}
/** The derivative (direction of travel) at t. */
export function cubicTangent(c: Cubic, t: number): Vec {
  const u = 1 - t;
  let x =
      3 * u * u * (c.p1.x - c.p0.x) +
      6 * u * t * (c.p2.x - c.p1.x) +
      3 * t * t * (c.p3.x - c.p2.x),
    y =
      3 * u * u * (c.p1.y - c.p0.y) +
      6 * u * t * (c.p2.y - c.p1.y) +
      3 * t * t * (c.p3.y - c.p2.y);
  // Degenerate handle at an end: fall back to the chord.
  if (Math.abs(x) < EPS && Math.abs(y) < EPS) {
    x = c.p3.x - c.p0.x;
    y = c.p3.y - c.p0.y;
  }
  return { x, y };
}

// ---------------------------------------------------------------------------
// Flattening & arc length
// ---------------------------------------------------------------------------

/**
 * A line flattened into a dense polyline with cumulative arc length, so
 * anything can be placed by *distance travelled* (not by node count).
 */
export interface Polyline {
  /** x0, y0, x1, y1, … in pixels. */
  xy: Float64Array;
  /** Distance from the start to each point. */
  cum: Float64Array;
  /** Point index where each node lies (closed lines: plus the end point). */
  nodeAt: number[];
  length: number;
  closed: boolean;
}

/** Adaptive subdivision: splits a cubic until it's flat within `tol` px. */
function flattenCubic(c: Cubic, tol: number, out: number[], depth = 0) {
  if (isStraight(c)) {
    out.push(c.p3.x, c.p3.y);
    return;
  }
  // Flatness: how far the handles stray from the chord.
  const ux = 3 * c.p1.x - 2 * c.p0.x - c.p3.x,
    uy = 3 * c.p1.y - 2 * c.p0.y - c.p3.y,
    vx = 3 * c.p2.x - c.p0.x - 2 * c.p3.x,
    vy = 3 * c.p2.y - c.p0.y - 2 * c.p3.y;
  const flat = Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy);
  if (flat <= 16 * tol * tol || depth > 16) {
    out.push(c.p3.x, c.p3.y);
    return;
  }
  const [a, b] = splitCubic(c, 0.5);
  flattenCubic(a, tol, out, depth + 1);
  flattenCubic(b, tol, out, depth + 1);
}

/** De Casteljau: the two halves of a cubic split at t. */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const lerp = (a: Vec, b: Vec): Vec => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const p01 = lerp(c.p0, c.p1),
    p12 = lerp(c.p1, c.p2),
    p23 = lerp(c.p2, c.p3),
    p012 = lerp(p01, p12),
    p123 = lerp(p12, p23),
    m = lerp(p012, p123);
  return [
    { p0: c.p0, p1: p01, p2: p012, p3: m },
    { p0: m, p1: p123, p2: p23, p3: c.p3 },
  ];
}

export function flatten(
  nodes: LineNode[],
  closed: boolean,
  w: number,
  h: number,
  tol = 0.3,
): Polyline {
  const segs = cubics(nodes, closed, w, h),
    pts: number[] = [],
    nodeAt: number[] = [];
  if (nodes.length) {
    pts.push(nodes[0].x * w, nodes[0].y * h);
    nodeAt.push(0);
  }
  for (const c of segs) {
    flattenCubic(c, tol, pts);
    nodeAt.push(pts.length / 2 - 1);
  }
  const n = pts.length / 2,
    xy = Float64Array.from(pts),
    cum = new Float64Array(n);
  for (let i = 1; i < n; i++)
    cum[i] =
      cum[i - 1] +
      Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
  return {
    xy,
    cum,
    nodeAt,
    length: n ? cum[n - 1] : 0,
    closed: closed && nodes.length > 2,
  };
}

/** The point at distance `d` along a polyline (clamped to its ends). */
export function pointAt(poly: Polyline, d: number): Vec & { i: number } {
  const { xy, cum } = poly,
    n = cum.length;
  if (n === 0) return { x: 0, y: 0, i: 0 };
  if (d <= 0 || n === 1) return { x: xy[0], y: xy[1], i: 0 };
  if (d >= poly.length)
    return { x: xy[(n - 1) * 2], y: xy[(n - 1) * 2 + 1], i: n - 2 };
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1,
    t = (d - cum[lo]) / seg;
  return {
    x: xy[lo * 2] + (xy[hi * 2] - xy[lo * 2]) * t,
    y: xy[lo * 2 + 1] + (xy[hi * 2 + 1] - xy[lo * 2 + 1]) * t,
    i: lo,
  };
}
/** Direction of travel at distance `d`, radians (averaged over ±`span` px). */
export function angleAt(poly: Polyline, d: number, span = 2): number {
  const a = pointAt(poly, d - span),
    b = pointAt(poly, d + span);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// ---------------------------------------------------------------------------
// Free Draw: from a shaky pointer trail to a few smooth nodes
// ---------------------------------------------------------------------------

/** Ramer–Douglas–Peucker: keeps only the points that matter (pixels). */
export function simplify(points: Vec[], tol: number): Vec[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = points[a],
      pb = points[b],
      dx = pb.x - pa.x,
      dy = pb.y - pa.y,
      len = Math.hypot(dx, dy);
    let far = -1,
      farD = tol;
    for (let i = a + 1; i < b; i++) {
      const p = points[i],
        d =
          len < EPS
            ? dist(p, pa)
            : Math.abs(dy * p.x - dx * p.y + pb.x * pa.y - pb.y * pa.x) / len;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Moving-average smoothing of a trail (ends pinned), `passes` times. */
export function smoothTrail(points: Vec[], passes: number): Vec[] {
  let pts = points;
  for (let k = 0; k < passes && pts.length > 2; k++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++)
      next.push({
        x: (pts[i - 1].x + 2 * pts[i].x + pts[i + 1].x) / 4,
        y: (pts[i - 1].y + 2 * pts[i].y + pts[i + 1].y) / 4,
      });
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/**
 * Handles for a smooth node from its neighbours (Catmull-Rom style, the same
 * construction Konva uses for `tension`), relative to the node, in pixels.
 * Each handle is proportional to the distance to its own neighbour, so short
 * and long segments both stay well-shaped.
 */
export function smoothHandles(
  prev: Vec | null,
  cur: Vec,
  next: Vec | null,
  tension = 0.4,
): { hi: Vec; ho: Vec } {
  if (!prev && !next) return { hi: { x: 0, y: 0 }, ho: { x: 0, y: 0 } };
  const a = prev ?? cur,
    b = next ?? cur,
    d01 = dist(a, cur),
    d12 = dist(cur, b),
    sum = d01 + d12 || 1,
    tx = b.x - a.x,
    ty = b.y - a.y;
  // Ends of an open line: aim the single handle along the first/last chord.
  const fa = prev ? (tension * d01) / sum : 0,
    fb = next ? (tension * d12) / sum : 0;
  return { hi: { x: -fa * tx, y: -fa * ty }, ho: { x: fb * tx, y: fb * ty } };
}

/** Turn angle at `cur`, radians (0 = straight on). */
function turn(prev: Vec, cur: Vec, next: Vec) {
  const a = Math.atan2(cur.y - prev.y, cur.x - prev.x),
    b = Math.atan2(next.y - cur.y, next.x - cur.x);
  let d = Math.abs(b - a);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * Fits a Free Draw trail (pixels) with a few nodes: smooths it, drops what
 * doesn't matter, keeps sharp turns as corners and makes everything else a
 * smooth node. `smoothing` 0..1: 0 follows the hand closely, 1 is very
 * smooth (fewer nodes). Returns nodes in map fractions.
 */
export function fitTrail(
  points: Vec[],
  w: number,
  h: number,
  smoothing: number,
  closed = false,
): LineNode[] {
  if (points.length === 0) return [];
  const s = Math.max(0, Math.min(1, smoothing));
  const smoothed = smoothTrail(points, Math.round(1 + s * 5)),
    tol = 0.6 + s * 5.5,
    key = simplify(smoothed, tol);
  if (closed && key.length > 3 && dist(key[0], key[key.length - 1]) < tol * 2)
    key.pop();
  const n = key.length,
    cornerTurn = (0.55 + s * 0.35) * (Math.PI / 2);
  return key.map((p, i) => {
    const prev = i > 0 ? key[i - 1] : closed && n > 2 ? key[n - 1] : null,
      next = i < n - 1 ? key[i + 1] : closed && n > 2 ? key[0] : null;
    const node: LineNode = { x: p.x / w, y: p.y / h };
    if (!prev || !next || turn(prev, p, next) > cornerTurn) {
      // Corner, or an end of an open line: aim one handle so the curve still
      // leaves smoothly toward its neighbour.
      if (prev && next) return node;
      const { hi, ho } = smoothHandles(prev, p, next, 0.4);
      if (next) node.ho = { x: ho.x / w, y: ho.y / h };
      if (prev) node.hi = { x: hi.x / w, y: hi.y / h };
      return node;
    }
    const { hi, ho } = smoothHandles(prev, p, next, 0.4);
    return {
      ...node,
      t: "smooth",
      hi: { x: hi.x / w, y: hi.y / h },
      ho: { x: ho.x / w, y: ho.y / h },
    };
  });
}

/**
 * Nodes from a legacy polyline drawn with Konva's `tension` (the old Path
 * tool and brush strokes): the same curve, as Bézier nodes. Long freehand
 * trails are simplified first (within ~0.5 px at 2K), so they stay editable.
 */
export function nodesFromTension(
  points: Vec[],
  tension: number,
  w: number,
  h: number,
): LineNode[] {
  const px = points.map((p) => ({ x: p.x * w, y: p.y * h })),
    key = px.length > 24 ? simplify(px, 0.5 * (w / 2048)) : px;
  return key.map((p, i) => {
    const prev = key[i - 1] ?? null,
      next = key[i + 1] ?? null,
      node: LineNode = { x: p.x / w, y: p.y / h };
    if (!prev || !next || tension <= 0) return node;
    const { hi, ho } = smoothHandles(prev, p, next, tension);
    return {
      ...node,
      t: "smooth",
      hi: { x: hi.x / w, y: hi.y / h },
      ho: { x: ho.x / w, y: ho.y / h },
    };
  });
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** Re-derives the handles of smooth node `i` from its neighbours (after a
 * neighbour moved or the node turned smooth), keeping the curve flowing. */
export function autoSmooth(
  nodes: LineNode[],
  i: number,
  closed: boolean,
  w: number,
  h: number,
): LineNode {
  const n = nodes.length,
    at = (k: number) => ({ x: nodes[k].x * w, y: nodes[k].y * h }),
    prev = i > 0 ? at(i - 1) : closed && n > 2 ? at(n - 1) : null,
    next = i < n - 1 ? at(i + 1) : closed && n > 2 ? at(0) : null,
    { hi, ho } = smoothHandles(prev, at(i), next, 0.4);
  return {
    x: nodes[i].x,
    y: nodes[i].y,
    t: "smooth",
    hi: prev ? { x: hi.x / w, y: hi.y / h } : undefined,
    ho: next ? { x: ho.x / w, y: ho.y / h } : undefined,
  };
}

/** Corner ⇄ smooth. A corner loses its handles (sharp); a smooth node gets
 * flowing ones. */
export function toggleNodeType(
  nodes: LineNode[],
  i: number,
  closed: boolean,
  w: number,
  h: number,
): LineNode[] {
  return nodes.map((nd, k) => {
    if (k !== i) return nd;
    if (nd.t === "smooth") return { x: nd.x, y: nd.y };
    return autoSmooth(nodes, i, closed, w, h);
  });
}

/**
 * Moves one handle of a node. On a smooth node the opposite handle turns to
 * stay in line (keeping its own length), unless `breakTangent` (Alt-drag),
 * which makes the node a corner with independent handles.
 */
export function moveHandle(
  node: LineNode,
  which: "hi" | "ho",
  rel: Vec,
  w: number,
  h: number,
  breakTangent: boolean,
): LineNode {
  const other = which === "hi" ? "ho" : "hi",
    next: LineNode = { ...node, [which]: rel };
  if (breakTangent) {
    next.t = "corner";
    return next;
  }
  if (node.t === "smooth" && node[other] && !isZero(node[other])) {
    const o = node[other]!,
      len = Math.hypot(o.x * w, o.y * h),
      rl = Math.hypot(rel.x * w, rel.y * h) || 1;
    next[other] = {
      x: (-rel.x * w * len) / rl / w,
      y: (-rel.y * h * len) / rl / h,
    };
  }
  return next;
}

/** Where a pixel point lies closest to a line: piece index, t on it, and the
 * distance in px. Used to pick a line and to insert nodes. */
export function nearest(
  nodes: LineNode[],
  closed: boolean,
  w: number,
  h: number,
  p: Vec,
): { seg: number; t: number; d: number; at: Vec } | null {
  const segs = cubics(nodes, closed, w, h);
  let best: { seg: number; t: number; d: number; at: Vec } | null = null;
  segs.forEach((c, seg) => {
    const steps = isStraight(c) ? 1 : 32;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps,
        q = isStraight(c)
          ? projectOnSegment(c.p0, c.p3, p)
          : { t, at: cubicPoint(c, t) },
        d = dist(q.at, p);
      if (!best || d < best.d) best = { seg, t: q.t, d, at: q.at };
      if (isStraight(c)) break;
    }
  });
  if (!best) return null;
  // Refine on curves with a few bisection steps around the best sample.
  const b = best as { seg: number; t: number; d: number; at: Vec },
    c = segs[b.seg];
  if (!isStraight(c)) {
    let lo = Math.max(0, b.t - 1 / 32),
      hi = Math.min(1, b.t + 1 / 32);
    for (let k = 0; k < 12; k++) {
      const m1 = lo + (hi - lo) / 3,
        m2 = hi - (hi - lo) / 3;
      if (dist(cubicPoint(c, m1), p) < dist(cubicPoint(c, m2), p)) hi = m2;
      else lo = m1;
    }
    const t = (lo + hi) / 2,
      at = cubicPoint(c, t);
    b.t = t;
    b.at = at;
    b.d = dist(at, p);
  }
  return b;
}
function projectOnSegment(a: Vec, b: Vec, p: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len2 = dx * dx + dy * dy;
  const t =
    len2 < EPS
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { t, at: { x: a.x + dx * t, y: a.y + dy * t } };
}

/**
 * Inserts a node on piece `seg` at `t` without changing the curve's shape
 * (De Casteljau split): the neighbours' handles are shortened accordingly.
 */
export function insertNode(
  nodes: LineNode[],
  closed: boolean,
  seg: number,
  t: number,
  w: number,
  h: number,
): LineNode[] {
  const c = cubics(nodes, closed, w, h)[seg];
  if (!c) return nodes;
  const n = nodes.length,
    a = seg,
    b = (seg + 1) % n,
    rel = (v: Vec, o: Vec): Vec => ({ x: (v.x - o.x) / w, y: (v.y - o.y) / h });
  const [l, r] = splitCubic(c, t),
    out = nodes.slice();
  const straight = isStraight(c);
  out[a] = { ...nodes[a], ...(straight ? {} : { ho: rel(l.p1, l.p0) }) };
  out[b] = { ...nodes[b], ...(straight ? {} : { hi: rel(r.p2, r.p3) }) };
  const mid: LineNode = straight
    ? { x: l.p3.x / w, y: l.p3.y / h }
    : {
        x: l.p3.x / w,
        y: l.p3.y / h,
        t: "smooth",
        hi: rel(l.p2, l.p3),
        ho: rel(r.p1, r.p0),
      };
  out.splice(seg + 1, 0, mid);
  return out;
}

/** Removes node `i` (an open line keeps at least 2 nodes, a closed one 3). */
export function removeNode(
  nodes: LineNode[],
  i: number,
  closed: boolean,
): LineNode[] {
  if (nodes.length <= (closed ? 3 : 2)) return nodes;
  return nodes.filter((_, k) => k !== i);
}

/** The same line drawn the other way (start ⇄ end, handles swapped). */
export function reverseNodes(nodes: LineNode[]): LineNode[] {
  return nodes
    .slice()
    .reverse()
    .map((nd) => {
      const out: LineNode = { x: nd.x, y: nd.y };
      if (nd.t) out.t = nd.t;
      if (nd.ho) out.hi = nd.ho;
      if (nd.hi) out.ho = nd.hi;
      return out;
    });
}

/** Applies an affine map (pixels → pixels) to every node and handle. */
export function transformNodes(
  nodes: LineNode[],
  w: number,
  h: number,
  map: (p: Vec) => Vec,
): LineNode[] {
  const o = map({ x: 0, y: 0 }),
    vec = (v: Vec) => {
      const q = map({ x: v.x * w, y: v.y * h });
      return { x: (q.x - o.x) / w, y: (q.y - o.y) / h };
    };
  return nodes.map((nd) => {
    const q = map({ x: nd.x * w, y: nd.y * h }),
      out: LineNode = { x: q.x / w, y: q.y / h };
    if (nd.t) out.t = nd.t;
    if (nd.hi) out.hi = vec(nd.hi);
    if (nd.ho) out.ho = vec(nd.ho);
    return out;
  });
}

export function shiftNodes(
  nodes: LineNode[],
  dx: number,
  dy: number,
): LineNode[] {
  return nodes.map((nd) => ({ ...nd, x: nd.x + dx, y: nd.y + dy }));
}

/**
 * Angle constraint (Shift): the point `to` turned to the nearest multiple of
 * `stepDeg` around `from`, keeping its distance. Pixels.
 */
export function snapAngle(from: Vec, to: Vec, stepDeg = 45): Vec {
  const d = dist(from, to),
    step = (stepDeg * Math.PI) / 180,
    a = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step;
  return { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d };
}

/** Bounding box of a line in pixels (curves included). */
export function bounds(
  nodes: LineNode[],
  closed: boolean,
  w: number,
  h: number,
) {
  const poly = flatten(nodes, closed, w, h, 1);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < poly.xy.length; i += 2) {
    x0 = Math.min(x0, poly.xy[i]);
    x1 = Math.max(x1, poly.xy[i]);
    y0 = Math.min(y0, poly.xy[i + 1]);
    y1 = Math.max(y1, poly.xy[i + 1]);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Indices of nodes where the line turns sharply (corners for walls, posts). */
export function sharpNodes(
  nodes: LineNode[],
  closed: boolean,
  w: number,
  h: number,
  minTurnDeg = 35,
): number[] {
  const out: number[] = [],
    n = nodes.length,
    px = (k: number) => ({ x: nodes[k].x * w, y: nodes[k].y * h });
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const nd = nodes[i];
    if (nd.t === "smooth") continue;
    const c = px(i),
      inDir =
        nd.hi && !isZero(nd.hi)
          ? { x: c.x - nd.hi.x * w, y: c.y - nd.hi.y * h }
          : px((i - 1 + n) % n),
      outDir =
        nd.ho && !isZero(nd.ho)
          ? { x: c.x + nd.ho.x * w, y: c.y + nd.ho.y * h }
          : px((i + 1) % n);
    if ((turn(inDir, c, outDir) * 180) / Math.PI >= minTurnDeg) out.push(i);
  }
  return out;
}
