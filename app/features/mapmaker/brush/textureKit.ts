/**
 * Building blocks for the procedural textures (./libraryTextures and
 * friends): colour ramps, periodic noise fields, cell lattices, bricks,
 * stripes and spots. Every helper works in tile coordinates (u, v ∈ [0, 1))
 * and wraps at the tile's edge, so whatever is built from them tiles
 * without seams.
 */
import { fbm, hash2, ridged, smoothstep, worley } from "./noise";

export type RGB = [number, number, number];
export type Gen = (u: number, v: number) => RGB;

export { fbm, hash2, ridged, smoothstep, worley };

// ---- colour -------------------------------------------------------------------------
export const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
};
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
/** Adds light (glow) without passing white. */
export const glow = (c: RGB, g: RGB, k: number): RGB => [
  Math.min(255, c[0] + g[0] * k),
  Math.min(255, c[1] + g[1] * k),
  Math.min(255, c[2] + g[2] * k),
];
export function ramp(stops: string[]) {
  const cols = stops.map(rgb);
  return (t: number): RGB => {
    const x = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1),
      i = Math.floor(x);
    return mix(cols[i], cols[i + 1], x - i);
  };
}

// ---- scalar helpers -------------------------------------------------------------------
export const n01 = (n: number) => n * 0.5 + 0.5;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const frac = (x: number) => x - Math.floor(x);
/** Distance to the nearest whole number (0 on a line, 0.5 between). */
export const toLine = (x: number) => {
  const f = frac(x);
  return Math.min(f, 1 - f);
};
const wrapI = (i: number, n: number) => ((i % n) + n) % n;

// ---- fields ------------------------------------------------------------------------
/** Periodic fBm in [0, 1] at `scale` features per tile, optionally warped. */
export function field(
  u: number,
  v: number,
  seed: number,
  scale: number,
  octaves = 4,
  warp = 0,
) {
  let x = u * scale,
    y = v * scale;
  if (warp) {
    const ws = Math.max(1, Math.round(scale / 2));
    x += fbm(u * ws, v * ws, seed + 71, 3, ws) * warp * scale * 0.25;
    y += fbm(u * ws, v * ws, seed + 72, 3, ws) * warp * scale * 0.25;
  }
  return n01(fbm(x, y, seed, octaves, scale));
}
/** Ridged fBm in [0, 1]: sharp crests (rock, veins, cracks). */
export const ridges = (
  u: number,
  v: number,
  seed: number,
  scale: number,
  octaves = 4,
) => ridged(u * scale, v * scale, seed, octaves, scale);
/** Fine grain: a brightness multiplier around 1. */
export const grain = (
  u: number,
  v: number,
  seed: number,
  amount = 0.1,
  scale = 64,
) => 1 - amount / 2 + field(u, v, seed, scale, 2) * amount;
/** Anisotropic noise: features `sx` by `sy` per tile (both whole numbers). */
export const aniso = (
  u: number,
  v: number,
  seed: number,
  sx: number,
  sy: number,
  octaves = 3,
) => {
  let sum = 0,
    amp = 1,
    norm = 0,
    fx = sx,
    fy = sy;
  for (let o = 0; o < octaves; o++) {
    // gradient noise on a stretched lattice that still wraps: periods sx·2^o, sy·2^o
    sum += amp * stretched(u * fx, v * fy, seed + o * 977, fx, fy);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return n01(sum / norm);
};
/** Value noise with separate x / y periods (smooth, in [-1, 1]). */
function stretched(x: number, y: number, seed: number, px: number, py: number) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    tx = x - x0,
    ty = y - y0,
    sx = tx * tx * (3 - 2 * tx),
    sy = ty * ty * (3 - 2 * ty),
    h = (i: number, j: number) =>
      hash2(wrapI(i, px), wrapI(j, py), seed) * 2 - 1,
    a = h(x0, y0),
    b = h(x0 + 1, y0),
    c = h(x0, y0 + 1),
    d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---- cells ---------------------------------------------------------------------------
/** Voronoi cells, optionally warped: { f1, f2, id, edge = f2 − f1 }. */
export function cells(u: number, v: number, seed: number, n: number, warp = 0) {
  let x = u * n,
    y = v * n;
  if (warp) {
    x += fbm(u * 4, v * 4, seed + 41, 2, 4) * warp;
    y += fbm(u * 4, v * 4, seed + 42, 2, 4) * warp;
  }
  const w = worley(x, y, seed, n);
  return { ...w, edge: w.f2 - w.f1 };
}
/**
 * A regular lattice of `cols` × `rows` centres, odd rows shifted half a
 * cell when `offset`: hexagons, scales, coins. Distances are in column
 * widths; `edge` is the gap to the second-nearest centre.
 */
export function lattice(
  u: number,
  v: number,
  cols: number,
  rows: number,
  offset = true,
) {
  const aspect = cols / rows;
  let f1 = 9,
    f2 = 9,
    ci = 0,
    cj = 0,
    dx1 = 0,
    dy1 = 0;
  const j0 = Math.floor(v * rows);
  for (let dj = -1; dj <= 1; dj++) {
    const j = j0 + dj,
      sh = offset && wrapI(j, rows) % 2 === 1 ? 0.5 : 0,
      i0 = Math.floor(u * cols - sh);
    for (let di = -1; di <= 1; di++) {
      const i = i0 + di,
        cx = (i + sh + 0.5) / cols,
        cy = (j + 0.5) / rows,
        dx = (u - cx) * cols,
        dy = ((v - cy) * cols) / aspect,
        d = Math.hypot(dx, dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        ci = wrapI(i, cols);
        cj = wrapI(j, rows);
        dx1 = dx;
        dy1 = dy;
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, edge: f2 - f1, i: ci, j: cj, dx: dx1, dy: dy1 };
}
/** Bricks: `cols` per row, `rows` rows, alternate rows shifted by `shift`. */
export function bricks(
  u: number,
  v: number,
  cols: number,
  rows: number,
  shift = 0.5,
) {
  const y = v * rows,
    row = Math.floor(y),
    x = u * cols + (wrapI(row, rows) % 2) * shift,
    col = Math.floor(x),
    fx = x - col,
    fy = y - row;
  return {
    i: wrapI(col, cols),
    j: wrapI(row, rows),
    fx,
    fy,
    // distance to the mortar, in brick heights
    edge: Math.min(Math.min(fx, 1 - fx) * (rows / cols), Math.min(fy, 1 - fy)),
  };
}
/** Spots: 1 inside sparse round dots (`density` 0…1 of the cells). */
export function spots(
  u: number,
  v: number,
  seed: number,
  n: number,
  radius: number,
  density = 1,
) {
  const w = worley(u * n, v * n, seed, n);
  return w.id < density ? smoothstep(radius, radius * 0.6, w.f1) : 0;
}
/** Crumpled facets: a brightness offset (≈ −0.5…0.2). */
export function crumple(u: number, v: number, seed: number, n: number) {
  const c = cells(u, v, seed, n, 0.6);
  return (c.id - 0.5) * 0.3 - smoothstep(0.04, 0, c.edge) * 0.45;
}
/** Light from the upper left on a height field h(u, v). */
export function lit(
  h: (u: number, v: number) => number,
  u: number,
  v: number,
  eps = 1 / 256,
  k = 6,
) {
  const d = h(u, v) - h(u - eps, v - eps);
  return 1 + Math.max(-0.5, Math.min(0.5, d * k));
}
