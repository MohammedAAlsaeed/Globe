import type { Biome } from "./types";
import { BIOME_FILL } from "../studio/rendering/layers";

/**
 * Small procedural swatches for each biome — a flat base tint plus a
 * scattering of darker/lighter flecks. Used both as the "Dirt"-style
 * picker swatches in the Region tool's top bar and as the actual
 * `fillPatternImage` for painted regions in the standalone editor, so what
 * you pick is what you paint. Purely a canvas-drawing concern of this
 * feature — it never touches the shared print/export renderer.
 */
function mix(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16),
    r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255,
    f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

const cache = new Map<string, HTMLCanvasElement>();

export function biomeTexture(biome: Biome): HTMLCanvasElement {
  const cached = cache.get(biome);
  if (cached) return cached;
  const base = BIOME_FILL[biome],
    size = 64,
    canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let seed = biome.length * 7919 + 13;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  };
  const speckCount = biome === "water" ? 26 : biome === "desert" ? 40 : 60;
  for (let i = 0; i < speckCount; i++) {
    const x = rand() * size,
      y = rand() * size,
      r = 0.6 + rand() * (biome === "forest" || biome === "mountains" ? 2.4 : 1.4),
      dark = rand() > 0.45;
    ctx.fillStyle = mix(base, dark ? -22 - rand() * 26 : 18 + rand() * 24);
    ctx.globalAlpha = 0.35 + rand() * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  cache.set(biome, canvas);
  return canvas;
}

export function biomeSwatchDataUrl(biome: Biome): string {
  return biomeTexture(biome).toDataURL("image/png");
}
