import type { Resampling } from "../domain/types";
const cubic = (x: number) => {
  x = Math.abs(x);
  return x < 1
    ? 1.5 * x * x * x - 2.5 * x * x + 1
    : x < 2
      ? -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2
      : 0;
};
const sinc = (x: number) =>
  x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
const lanczos = (x: number) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0);
/** Wrap longitude, clamp poles, and interpolate premultiplied alpha to avoid halos. */
export function samplePixel(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  method: Resampling,
  out: Uint8ClampedArray,
  offset: number,
) {
  const radius = method === "bilinear" ? 1 : method === "bicubic" ? 2 : 3;
  const weight =
    method === "bilinear"
      ? (v: number) => Math.max(0, 1 - Math.abs(v))
      : method === "bicubic"
        ? cubic
        : lanczos;
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let red = 0,
    green = 0,
    blue = 0,
    alpha = 0,
    total = 0;
  for (let dy = 1 - radius; dy <= radius; dy++) {
    const yy = Math.max(0, Math.min(h - 1, iy + dy)),
      wy = weight(y - (iy + dy));
    for (let dx = 1 - radius; dx <= radius; dx++) {
      const xx = (((ix + dx) % w) + w) % w,
        k = (yy * w + xx) * 4,
        kernel = wy * weight(x - (ix + dx)),
        a = data[k + 3] / 255;
      red += data[k] * a * kernel;
      green += data[k + 1] * a * kernel;
      blue += data[k + 2] * a * kernel;
      alpha += a * kernel;
      total += kernel;
    }
  }
  if (alpha > 1e-8) {
    out[offset] = red / alpha;
    out[offset + 1] = green / alpha;
    out[offset + 2] = blue / alpha;
    out[offset + 3] = 255 * Math.max(0, Math.min(1, alpha / total));
  }
}
