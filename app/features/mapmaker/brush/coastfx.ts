/**
 * The layer coast effect — pure pixel math (no DOM), run in a Web Worker.
 *
 * Input: the layer's painted land as RGBA (everything painted in the layer,
 * merged, erasers applied). Output: the final layer image — land with a
 * natural coastline, plus the water effects around it.
 *
 *  1. **Land mask** — paint coverage, optionally smoothed, thresholded at
 *     50 %: the coast always has a crisp edge, whatever brush made it.
 *  2. **Signed distance field** — exact Euclidean distance transform
 *     (Felzenszwalb–Huttenlocher), positive on land, negative in water.
 *  3. **Natural coastline** — the distance field is displaced by fractal
 *     spatial noise near the edge (bays, headlands, fine jaggedness); islets
 *     are grown from a second noise field in a band of water off the coast.
 *     Noise lives in map units, so the coast is identical at every resolution
 *     and only changes where the painted land itself changed.
 *  4. **Final distance field** of the new coastline drives every effect:
 *     depth shading and shallow-water glow by distance, wave lines as exact
 *     iso-distance contours (they round off naturally further out), a sandy
 *     shore band, edge shading and an ink outline. Land that the coastline
 *     pushed beyond the paint takes the colour of the nearest painted land.
 */
import { gradientNoise, hash2 } from "./noise";
import type { CoastEffect } from "../types";

export interface CoastInput {
  width: number;
  height: number;
  /** Unpremultiplied RGBA of the merged layer paint. */
  rgba: Uint8ClampedArray;
  fx: CoastEffect;
  seed: number;
}

const INF = 1e20;

function smoothstep(e0: number, e1: number, x: number) {
  const t =
    e1 === e0
      ? x >= e1
        ? 1
        : 0
      : Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---- Euclidean distance transform ---------------------------------------------
/** 1-D squared distance transform of sampled function f (lower envelope of
 * parabolas). `arg` receives, for each q, the index of the minimising sample. */
function dt1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  arg: Int32Array,
  v: Int32Array,
  z: Float64Array,
) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
    arg[q] = v[k];
  }
}

/**
 * Exact Euclidean distance from every pixel to the nearest pixel where
 * `feature` is 1 (0 on feature pixels), and optionally that pixel's index.
 *
 * Felzenszwalb–Huttenlocher, separable. The column pass runs the 1-D lower
 * envelope for *all columns at once*, sweeping row by row, so memory is read
 * contiguously (a plain per-column sweep strides through the whole image and
 * is several times slower on large maps).
 */
export function edt(
  feature: Uint8Array,
  w: number,
  h: number,
  withIndex = false,
) {
  const N = w * h,
    colSq = new Float32Array(N),
    colRow = withIndex ? new Int32Array(N) : null;
  {
    // ---- column pass, vectorised over x ----
    const K = new Int32Array(w),
      V = new Int32Array(N), // V[k*w + x]: k-th parabola vertex (row) of column x
      Z = new Float32Array(N + w); // Z[k*w + x]: k-th boundary of column x
    const fAt = (y: number, x: number) => (feature[y * w + x] ? 0 : INF);
    for (let x = 0; x < w; x++) {
      V[x] = 0;
      Z[x] = -INF;
      Z[w + x] = INF;
    }
    for (let q = 1; q < h; q++) {
      const fq = q * w;
      for (let x = 0; x < w; x++) {
        const f = feature[fq + x] ? 0 : INF;
        let k = K[x],
          vk = V[k * w + x],
          s = (f + q * q - (fAt(vk, x) + vk * vk)) / (2 * q - 2 * vk);
        while (s <= Z[k * w + x]) {
          k--;
          vk = V[k * w + x];
          s = (f + q * q - (fAt(vk, x) + vk * vk)) / (2 * q - 2 * vk);
        }
        k++;
        V[k * w + x] = q;
        Z[k * w + x] = s;
        Z[(k + 1) * w + x] = INF;
        K[x] = k;
      }
    }
    K.fill(0);
    for (let q = 0; q < h; q++) {
      const row = q * w;
      for (let x = 0; x < w; x++) {
        let k = K[x];
        while (Z[(k + 1) * w + x] < q) k++;
        K[x] = k;
        const vk = V[k * w + x],
          dq = q - vk,
          f = feature[vk * w + x] ? 0 : INF;
        colSq[row + x] = dq * dq + f;
        if (colRow) colRow[row + x] = vk;
      }
    }
  }
  // ---- row pass (contiguous already) ----
  const f = new Float64Array(w),
    d = new Float64Array(w),
    arg = new Int32Array(w),
    v = new Int32Array(w),
    z = new Float64Array(w + 1),
    dist = new Float32Array(N),
    index = withIndex ? new Int32Array(N) : null;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = colSq[row + x];
    dt1d(f, w, d, arg, v, z);
    for (let x = 0; x < w; x++) {
      dist[row + x] = d[x] >= INF * 0.5 ? INF : Math.sqrt(d[x]);
      if (index && colRow) {
        const cx = arg[x];
        index[row + x] = colRow[row + cx] * w + cx;
      }
    }
  }
  return { dist, index };
}

/**
 * Signed distance to the edge of `land` (px, >0 inside, <0 outside),
 * computed on a 2× downsampled grid and bilinearly upsampled. Distances are
 * smooth fields, so this loses well under a pixel of accuracy while doing a
 * quarter of the work; callers refine the last pixel at the edge themselves
 * from full-resolution coverage. Optionally also returns, per pixel, the
 * index of a nearby land pixel (full resolution) — used to colour land the
 * coastline grew beyond the paint.
 */
export function signedDistance(
  land: Uint8Array,
  w: number,
  h: number,
  withNearest = false,
) {
  const f = w * h > 700_000 ? 2 : 1,
    w2 = Math.ceil(w / f),
    h2 = Math.ceil(h / f),
    m = new Uint8Array(w2 * h2),
    inv = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w2; x++) {
      let c = 0,
        n = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const xx = x * f + dx,
            yy = y * f + dy;
          if (xx < w && yy < h) {
            c += land[yy * w + xx];
            n++;
          }
        }
      const l = c * 2 >= n ? 1 : 0;
      m[y * w2 + x] = l;
      inv[y * w2 + x] = 1 - l;
    }
  const toLand = edt(m, w2, h2, withNearest),
    toWater = edt(inv, w2, h2);
  const S2 = new Float32Array(w2 * h2);
  for (let i = 0; i < S2.length; i++)
    S2[i] = m[i] ? toWater.dist[i] - 0.5 : -(toLand.dist[i] - 0.5);
  const S = new Float32Array(w * h),
    nearest = withNearest ? new Int32Array(w * h) : null;
  if (f === 1) {
    S.set(S2);
    if (nearest && toLand.index) nearest.set(toLand.index);
    return { S, nearest };
  }
  // Bilinear upsample; the x-mapping is the same for every row, so precompute it.
  const X0 = new Int32Array(w),
    X1 = new Int32Array(w),
    TX = new Float32Array(w),
    XN = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    const sx = Math.max(0, Math.min(w2 - 1, (x + 0.5) / f - 0.5));
    X0[x] = Math.floor(sx);
    X1[x] = Math.min(w2 - 1, X0[x] + 1);
    TX[x] = sx - X0[x];
    XN[x] = Math.round(sx);
  }
  for (let y = 0; y < h; y++) {
    const sy = Math.max(0, Math.min(h2 - 1, (y + 0.5) / f - 0.5)),
      r0 = Math.floor(sy) * w2,
      r1 = Math.min(h2 - 1, Math.floor(sy) + 1) * w2,
      ty = sy - Math.floor(sy),
      rn = Math.round(sy) * w2,
      row = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = X0[x],
        x1 = X1[x],
        tx = TX[x],
        a = S2[r0 + x0] + (S2[r0 + x1] - S2[r0 + x0]) * tx,
        b = S2[r1 + x0] + (S2[r1 + x1] - S2[r1 + x0]) * tx;
      S[row + x] = (a + (b - a) * ty) * f;
    }
    if (nearest && toLand.index)
      for (let x = 0; x < w; x++) {
        const j = toLand.index[rn + XN[x]],
          jy = (j / w2) | 0;
        nearest[row + x] =
          Math.min(h - 1, jy * f) * w + Math.min(w - 1, (j - jy * w2) * f);
      }
  }
  return { S, nearest };
}

/** Separable box blur (radius r) of a float field. */
function boxBlur(
  src: Float32Array,
  w: number,
  h: number,
  r: number,
): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h),
    out = new Float32Array(w * h),
    inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++)
      acc += src[row + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * inv;
      const add = x + r + 1,
        sub = x - r;
      acc +=
        src[row + (add >= w ? w - 1 : add)] - src[row + (sub < 0 ? 0 : sub)];
    }
  }
  // vertical pass row-by-row with a running column accumulator (contiguous)
  const acc = new Float32Array(w);
  for (let y = -r; y <= r; y++) {
    const row = (y < 0 ? 0 : y >= h ? h - 1 : y) * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w,
      addRow = Math.min(h - 1, y + r + 1) * w,
      subRow = Math.max(0, y - r) * w;
    for (let x = 0; x < w; x++) {
      out[row + x] = acc[x] * inv;
      acc[x] += tmp[addRow + x] - tmp[subRow + x];
    }
  }
  return out;
}

/** Fractal coastline noise at a map-unit position, roughly in [-1, 1]. */
function coastNoise(mx: number, my: number, octaves: number, seed: number) {
  let sum = 0,
    amp = 1,
    norm = 0,
    wl = 0.11;
  for (let o = 0; o < octaves; o++) {
    sum += amp * gradientNoise(mx / wl, my / wl, seed + o * 101);
    norm += amp;
    amp *= 0.64;
    wl *= 0.5;
  }
  return sum / norm;
}

/** Renders the coast effect; returns RGBA (unpremultiplied) or null if the
 * layer has no land at all. */
export function renderCoastEffect({
  width: w,
  height: h,
  rgba,
  fx,
  seed,
}: CoastInput): Uint8ClampedArray | null {
  const N = w * h,
    unit = w; // px per map unit

  // 1. land mask
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = rgba[i * 4 + 3] / 255;
  // A box blur rounds off brush wobble before the coast is built.
  const blurR = Math.round(fx.smoothing * 0.005 * unit),
    cov: Float32Array = boxBlur(raw, w, h, blurR);
  const land0 = new Uint8Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    const l = cov[i] >= 0.5;
    land0[i] = l ? 1 : 0;
    if (l) any = true;
  }
  if (!any) return null;

  // 2. signed distance of the painted land (+ nearest-land index for colour)
  const base = signedDistance(land0, w, h, true),
    D = base.S;
  for (let i = 0; i < N; i++) {
    // Sub-pixel edge position from the (smoothed) full-resolution coverage.
    if (D[i] > -2 && D[i] < 2)
      D[i] = Math.max(-1.5, Math.min(1.5, (cov[i] - 0.5) * 2.5));
  }

  // 3. natural coastline: fractal displacement near the edge + islets
  const amp = fx.roughness * 0.045 * unit,
    octaves = 2 + Math.round(fx.detail * 4),
    isleBand = 0.035 * unit,
    isleGap = 0.005 * unit,
    islets = fx.islets;
  if (amp > 0.3 || islets > 0)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x,
          d = D[i],
          mx = x / unit,
          my = y / unit;
        let nd = d;
        if (amp > 0.3 && Math.abs(d) < amp * 1.25 + 2)
          nd = d + amp * coastNoise(mx, my, octaves, seed);
        if (islets > 0 && d < -isleGap && d > -isleBand) {
          // Islets: a sparse, multi-scale field — rare larger isles, a few
          // small rocks — that thins out with distance from the shore.
          const f =
              0.55 * gradientNoise(mx / 0.016, my / 0.016, seed + 707) +
              0.3 * gradientNoise(mx / 0.007, my / 0.007, seed + 808) +
              0.15 * gradientNoise(mx / 0.003, my / 0.003, seed + 909),
            thr = 0.62 - islets * 0.42 + (-d / isleBand) * 0.26;
          if (f > thr) nd = Math.max(nd, (f - thr) * 0.008 * unit);
        }
        D[i] = nd;
      }

  // 4. final distance field of the new coastline
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = D[i] > 0 ? 1 : 0;
  const finalS = signedDistance(land, w, h).S;

  // 5. compose
  const out = new Uint8ClampedArray(N * 4),
    depthC = hexRgb(fx.depthColor),
    glowC = hexRgb(fx.glowColor),
    waveC = hexRgb(fx.waveColor),
    shoreC = hexRgb(fx.shoreColor),
    lineC = hexRgb(fx.outlineColor),
    depthDist = Math.max(1, fx.depthDistance * unit),
    glowW = Math.max(1, fx.glowWidth * unit),
    waveSp = Math.max(2, fx.waveSpacing * unit),
    waveOff = Math.max(0, fx.waveOffset * unit),
    waveLw = Math.max(0.8, fx.waveWidth * unit),
    waves = Math.round(fx.waves),
    waveEnd = waveOff + (waves - 1) * waveSp + waveLw,
    shoreW = Math.max(0.5, fx.shoreWidth * unit),
    shadeW = Math.max(0.5, fx.landShadeWidth * unit),
    lineW = fx.outlineWidth * unit;
  const idx = base.nearest!,
    waterFxEnd = Math.max(
      fx.glowOpacity > 0 ? glowW : 0,
      waves > 0 && fx.waveOpacity > 0 ? waveEnd + 1 : 0,
      lineW + 2,
      2,
    ),
    landFxEnd = Math.max(
      fx.shoreStrength > 0 ? shoreW * 1.6 : 0,
      fx.landShade !== 0 ? shadeW * 1.6 : 0,
      lineW + 2,
      2,
    ),
    depthOn = fx.depthStrength > 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        o = i * 4;
      // signed distance to the final coast (px): >0 land, <0 water
      let df = finalS[i];

      // Fast paths: open sea (depth only) and land interior (paint only) —
      // the vast majority of pixels.
      if (df <= -waterFxEnd) {
        if (depthOn) {
          const a = fx.depthStrength * smoothstep(0, depthDist, -df);
          if (a > 0) {
            out[o] = depthC[0];
            out[o + 1] = depthC[1];
            out[o + 2] = depthC[2];
            out[o + 3] = a * 255;
          }
        }
        continue;
      }
      if (df >= landFxEnd) {
        const src = rgba[o + 3] >= 96 ? o : idx[i] * 4;
        out[o] = rgba[src];
        out[o + 1] = rgba[src + 1];
        out[o + 2] = rgba[src + 2];
        out[o + 3] = 255;
        continue;
      }

      if (df > -1.5 && df < 1.5) df = Math.max(-1.5, Math.min(1.5, D[i]));
      // premultiplied "over" accumulator, inlined for speed
      let R = 0,
        G = 0,
        B = 0,
        A = 0,
        a = 0;
      const landA = Math.max(0, Math.min(1, df + 0.5));
      if (landA < 1) {
        const dw = df < 0 ? -df : 0; // distance out to sea
        if (depthOn) {
          a = fx.depthStrength * smoothstep(0, depthDist, dw);
          R = depthC[0] * a;
          G = depthC[1] * a;
          B = depthC[2] * a;
          A = a;
        }
        if (fx.glowOpacity > 0 && dw < glowW) {
          const t = 1 - smoothstep(0, glowW, dw);
          a = fx.glowOpacity * Math.pow(t, 1.6);
          R = glowC[0] * a + R * (1 - a);
          G = glowC[1] * a + G * (1 - a);
          B = glowC[2] * a + B * (1 - a);
          A = a + A * (1 - a);
        }
        if (
          waves > 0 &&
          fx.waveOpacity > 0 &&
          dw > waveOff - waveLw &&
          dw < waveEnd + 1
        ) {
          const k = Math.max(
              0,
              Math.min(waves - 1, Math.round((dw - waveOff) / waveSp)),
            ),
            c = waveOff + k * waveSp,
            line =
              1 -
              smoothstep(
                waveLw * 0.5 - 0.6,
                waveLw * 0.5 + 0.6,
                Math.abs(dw - c),
              );
          if (line > 0) {
            a = fx.waveOpacity * line * Math.pow(1 - fx.waveFade, k);
            if (fx.waveBreakup > 0) {
              const n = gradientNoise(
                x / unit / 0.018,
                y / unit / 0.018,
                seed + 31 * (k + 1),
              );
              a *= 1 - fx.waveBreakup * (1 - smoothstep(-0.35, 0.05, n));
            }
            R = waveC[0] * a + R * (1 - a);
            G = waveC[1] * a + G * (1 - a);
            B = waveC[2] * a + B * (1 - a);
            A = a + A * (1 - a);
          }
        }
      }
      if (landA > 0) {
        // land colour: own paint, or the nearest painted land where the
        // coastline grew beyond the paint
        const src = rgba[o + 3] >= 96 ? o : idx[i] * 4;
        let r = rgba[src],
          g = rgba[src + 1],
          b = rgba[src + 2];
        const dl = df > 0 ? df : 0;
        if (fx.shoreStrength > 0 && dl < shoreW * 1.6) {
          const grain = 0.94 + hash2(x >> 1, y >> 1, seed) * 0.12,
            t = fx.shoreStrength * Math.pow(1 - smoothstep(0, shoreW, dl), 1.2);
          r += (shoreC[0] * grain - r) * t;
          g += (shoreC[1] * grain - g) * t;
          b += (shoreC[2] * grain - b) * t;
        }
        if (fx.landShade !== 0 && dl < shadeW * 1.6) {
          const t =
            Math.abs(fx.landShade) * 0.6 * (1 - smoothstep(0, shadeW, dl));
          if (fx.landShade > 0) {
            r *= 1 - t;
            g *= 1 - t;
            b *= 1 - t;
          } else {
            r += (255 - r) * t;
            g += (255 - g) * t;
            b += (255 - b) * t;
          }
        }
        R = r * landA + R * (1 - landA);
        G = g * landA + G * (1 - landA);
        B = b * landA + B * (1 - landA);
        A = landA + A * (1 - landA);
      }
      if (lineW >= 0.3) {
        a =
          (1 - smoothstep(lineW * 0.5 - 0.6, lineW * 0.5 + 0.6, Math.abs(df))) *
          Math.min(1, lineW + 0.4);
        if (a > 0) {
          R = lineC[0] * a + R * (1 - a);
          G = lineC[1] * a + G * (1 - a);
          B = lineC[2] * a + B * (1 - a);
          A = a + A * (1 - a);
        }
      }
      if (A > 0) {
        out[o] = R / A;
        out[o + 1] = G / A;
        out[o + 2] = B / A;
        out[o + 3] = A * 255;
      }
    }
  return out;
}
