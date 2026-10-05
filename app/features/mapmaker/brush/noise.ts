/**
 * Deterministic randomness and noise for the brush engine.
 *
 * Everything the brush does at random — dab jitter, coastline wiggle,
 * texture grain — comes from here and is fully seeded, so a stroke replays
 * identically on every render, after undo/redo and at print resolution.
 * Pure math, no DOM: safe to unit-test under Node.
 */

/** mulberry32 — tiny, fast, well-distributed seeded PRNG returning [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit integer hash of a lattice point + seed. */
function hashInt(x: number, y: number, seed: number) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Integer hash of a lattice point + seed → [0, 1). Order-independent, so a
 * value depends only on *where* it's sampled — the key to previews that stay
 * stable while the user is still drawing. */
export function hash2(x: number, y: number, seed: number) {
  return hashInt(x, y, seed) / 4294967296;
}

const wrap = (i: number, period: number) => ((i % period) + period) % period;

// 256 unit gradients, precomputed so noise evaluation needs no trigonometry.
const GX = new Float64Array(256),
  GY = new Float64Array(256);
for (let k = 0; k < 256; k++) {
  GX[k] = Math.cos((k / 256) * Math.PI * 2);
  GY[k] = Math.sin((k / 256) * Math.PI * 2);
}

/** Gradient (Perlin-style) noise in roughly [-1, 1]. When `period` > 0 the
 * lattice wraps every `period` cells in both axes, which makes the noise —
 * and any texture built from it — tile seamlessly. */
export function gradientNoise(x: number, y: number, seed: number, period = 0) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  let ix0 = x0,
    iy0 = y0,
    ix1 = x0 + 1,
    iy1 = y0 + 1;
  if (period) {
    ix0 = ((x0 % period) + period) % period;
    iy0 = ((y0 % period) + period) % period;
    ix1 = ix0 + 1 === period ? 0 : ix0 + 1;
    iy1 = iy0 + 1 === period ? 0 : iy0 + 1;
  }
  const g00 = hashInt(ix0, iy0, seed) & 255,
    g10 = hashInt(ix1, iy0, seed) & 255,
    g01 = hashInt(ix0, iy1, seed) & 255,
    g11 = hashInt(ix1, iy1, seed) & 255;
  const n00 = GX[g00] * fx + GY[g00] * fy,
    n10 = GX[g10] * (fx - 1) + GY[g10] * fy,
    n01 = GX[g01] * fx + GY[g01] * (fy - 1),
    n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10),
    v = fy * fy * fy * (fy * (fy * 6 - 15) + 10),
    a = n00 + (n10 - n00) * u,
    b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.41421356;
}

/** Fractal (fBm) gradient noise in roughly [-1, 1]. Each octave doubles the
 * frequency *and* the period, so a periodic fBm still tiles. */
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
  period = 0,
  persistence = 0.5,
) {
  let sum = 0,
    amp = 1,
    norm = 0,
    freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum +=
      amp *
      gradientNoise(
        x * freq,
        y * freq,
        seed + o * 1013,
        period ? period * freq : 0,
      );
    norm += amp;
    amp *= persistence;
    freq *= 2;
  }
  return sum / norm;
}

/** Ridged fBm in [0, 1] — sharp crests, good for rock and mountain grain. */
export function ridged(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
  period = 0,
) {
  let sum = 0,
    amp = 0.5,
    freq = 1,
    norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n =
      1 -
      Math.abs(
        gradientNoise(
          x * freq,
          y * freq,
          seed + o * 733,
          period ? period * freq : 0,
        ),
      );
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Periodic cellular (Worley) noise: distances to the nearest (f1) and
 * second-nearest (f2) feature point, in cell units. */
export function worley(x: number, y: number, seed: number, period: number) {
  const cx = Math.floor(x),
    cy = Math.floor(y);
  let f1 = 9,
    f2 = 9,
    id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i,
        gy = cy + j,
        hx = wrap(gx, period),
        hy = wrap(gy, period),
        h = hashInt(hx, hy, seed),
        px = gx + (h & 0xffff) / 65536,
        py = gy + (h >>> 16) / 65536,
        ddx = px - x,
        ddy = py - y,
        d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(hx, hy, seed + 31);
      } else if (d < f2) f2 = d;
    }
  return { f1, f2, id };
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A short random 31-bit seed for new objects. */
export function newSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}
