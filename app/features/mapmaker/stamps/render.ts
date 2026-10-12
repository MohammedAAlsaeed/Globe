/**
 * Turns stamps into pixels: rasters for the canvas (cached and shared by
 * every placement with the same look), catalog thumbnails, and shadows.
 *
 * Vector art is redrawn at whatever size is needed — the canvas at the
 * current zoom, a print at full resolution — so stamps stay sharp at any
 * size. Rasters are cached per power-of-two width, so a forest of a
 * hundred pines at the same zoom shares one small canvas.
 */
import { fillSource } from "../brush/engine";
import { filterHex, filterRgb, hasFilters, hexToRgb, rgbToHex } from "../brush/textures";
import type { MMLayer, MMStamp, ShadowSettings } from "../types";
import type { ArtPart, VectorArt } from "./art";
import { setOfAsset, stampAsset, type StampAsset } from "./catalog";
import { stampCenter, stampExtent } from "./geometry";

/** What decides a stamp's pixels (not where or how big it is placed). */
export type StampColors = Pick<MMStamp, "asset" | "ink" | "fill" | "hue" | "saturation" | "brightness" | "contrast">;

const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a),
    y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
/** The paint for each part role, from the stamp's two (filtered) colors. */
function palette(ink: string, fill: string | null) {
  return {
    ink,
    solid: ink,
    fill,
    shade: fill && mix(fill, ink, 0.38),
    light: fill && mix(fill, "#ffffff", 0.55),
  } as Record<ArtPart["role"], string | null>;
}

const paths = new Map<string, Path2D>();
const path2d = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

/** Draws vector art scaled to `scale` px per art unit, at the origin. */
export function drawArt(ctx: CanvasRenderingContext2D, art: VectorArt, ink: string, fill: string | null, scale: number) {
  const colors = palette(ink, fill);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const part of art.parts) {
    const color = colors[part.role];
    if (!color) continue;
    if (part.role === "ink") {
      ctx.strokeStyle = color;
      ctx.lineWidth = part.width ?? 1.6;
      ctx.stroke(path2d(part.d));
    } else {
      ctx.fillStyle = color;
      ctx.fill(path2d(part.d));
    }
  }
  ctx.restore();
}

// ---- uploaded images: loaded once, then filtered on demand -----------------------
type ImageEntry = { img: HTMLImageElement | null; failed: boolean; waiters: Set<() => void> };
const images = new Map<string, ImageEntry>();
/** The loaded image of an uploaded asset (null while loading; `onLoad` is
 * called once it arrives). */
function imageOf(a: Extract<StampAsset, { kind: "image" }>, onLoad?: () => void) {
  let e = images.get(a.key);
  if (!e) {
    const entry: ImageEntry = { img: null, failed: false, waiters: new Set() };
    images.set(a.key, (e = entry));
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      entry.img = img;
      entry.waiters.forEach((w) => w());
      entry.waiters.clear();
    };
    img.onerror = () => {
      entry.failed = true;
      entry.waiters.forEach((w) => w());
      entry.waiters.clear();
    };
    img.src = a.url;
  }
  if (!e.img && !e.failed && onLoad) e.waiters.add(onLoad);
  return e.img;
}

// ---- rasters ----------------------------------------------------------------------
const MAX_RASTERS = 600;
const rasters = new Map<string, HTMLCanvasElement>();
const bucket = (px: number) => Math.min(8192, Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, px)))));

function remember(key: string, c: HTMLCanvasElement) {
  rasters.set(key, c);
  if (rasters.size > MAX_RASTERS) rasters.delete(rasters.keys().next().value!);
  return c;
}

/**
 * The stamp's picture, at least `px` wide (null while an uploaded image is
 * still loading — `onReady` is then called once it can be drawn).
 */
export function stampRaster(o: StampColors, px: number, onReady?: () => void): HTMLCanvasElement | null {
  const asset = stampAsset(o.asset);
  if (!asset) return null;
  const f = { hue: o.hue, saturation: o.saturation, brightness: o.brightness, contrast: o.contrast };
  if (asset.kind === "image") {
    const img = imageOf(asset, onReady);
    if (!img) return null;
    const key = `${o.asset}|${f.hue}|${f.saturation}|${f.brightness}|${f.contrast}`;
    const hit = rasters.get(key);
    if (hit) return hit;
    return remember(key, filteredImage(img, f));
  }
  const w = bucket(px),
    key = `${o.asset}|${o.ink}|${o.fill}|${f.hue}|${f.saturation}|${f.brightness}|${f.contrast}|${w}`,
    hit = rasters.get(key);
  if (hit) {
    rasters.delete(key); // keep recently used rasters
    rasters.set(key, hit);
    return hit;
  }
  const art = asset.art(),
    c = document.createElement("canvas");
  c.width = w;
  c.height = Math.max(1, Math.round((w * art.h) / art.w));
  drawArt(c.getContext("2d")!, art, filterHex(o.ink, f), o.fill && filterHex(o.fill, f), w / art.w);
  return remember(key, c);
}

/** An uploaded image with the color filters applied (at most 2048 px). */
function filteredImage(img: HTMLImageElement, f: { hue: number; saturation: number; brightness: number; contrast: number }) {
  const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight)),
    c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (!hasFilters(f)) return c;
  try {
    const data = ctx.getImageData(0, 0, c.width, c.height),
      d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [r, g, b] = filterRgb(d[i], d[i + 1], d[i + 2], f);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    // A cross-origin image without CORS can't be read: draw it unfiltered.
  }
  return c;
}

// ---- clip masks and blending ---------------------------------------------------------
const clipped = new WeakMap<MMStamp, { key: string; canvas: HTMLCanvasElement }>();
/**
 * What a stamp draws: its picture, or — clip "texture" — its shape filled
 * with the texture, the picture's lines and shading multiplied on top. The
 * texture is anchored to the map (W × H = the map in stage px), so stamps
 * side by side share one continuous surface.
 */
export function stampPicture(o: MMStamp, px: number, W: number, H: number, onReady?: () => void): HTMLCanvasElement | null {
  const base = stampRaster(o, px, onReady);
  if (!base || o.clip !== "texture" || !o.clipSource) return base;
  const key = `${base.width}|${W}|${H}`,
    hit = clipped.get(o);
  if (hit?.key === key) return hit.canvas;
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d")!,
    { w, h } = stampExtent(o, W),
    center = stampCenter(o, W, H);
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.save();
  // The raster has the art's proportions; the stamp may be stretched.
  ctx.scale(c.width / w, c.height / h);
  fillSource(ctx, o.clipSource, W, center.x - w / 2, center.y - h / 2, w, h);
  ctx.restore();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(base, 0, 0);
  clipped.set(o, { key, canvas: c });
  return c;
}

/** How a stamp is composited in its layer: an eraser cuts, otherwise its
 * blend mode — unless the layer blends as a whole. */
export function stampCompositeOp(o: Pick<MMStamp, "clip" | "blend">, layer: Pick<MMLayer, "blend">): GlobalCompositeOperation | undefined {
  if (o.clip === "erase") return "destination-out";
  if (layer.blend && layer.blend !== "normal") return undefined;
  return o.blend && o.blend !== "normal" ? o.blend : undefined;
}

export { stampAspect } from "./geometry";

// ---- thumbnails ----------------------------------------------------------------------
const thumbs = new Map<string, string>();
/** A small PNG data URL of an asset in its set's colors, for the catalog. */
export function stampThumb(assetKey: string, ink?: string, fill?: string | null, onReady?: () => void) {
  const set = setOfAsset(assetKey),
    i = ink ?? set?.ink ?? "#3a2e22",
    f = fill === undefined ? (set?.fill ?? null) : fill,
    key = `${assetKey}|${i}|${f}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const r = stampRaster({ asset: assetKey, ink: i, fill: f, hue: 0, saturation: 0, brightness: 0, contrast: 0 }, 128, onReady);
  if (!r) return null;
  const url = r.toDataURL("image/png");
  thumbs.set(key, url);
  return url;
}

// ---- shadows ---------------------------------------------------------------------------
/** The soft ground shadow of built-in sets, and of layers by default. */
export const DEFAULT_SHADOW: ShadowSettings = {
  color: "#1c140b",
  opacity: 0.35,
  blur: 0.06,
  angle: 50,
  distance: 0.05,
};
/** The shadow a stamp actually gets (null: none). */
export function resolveShadow(o: Pick<MMStamp, "asset" | "shadow" | "customShadow">, layer: Pick<MMLayer, "stampShadow">): ShadowSettings | null {
  switch (o.shadow) {
    case "none":
      return null;
    case "custom":
      return o.customShadow ?? DEFAULT_SHADOW;
    case "layer":
      return layer.stampShadow ?? DEFAULT_SHADOW;
    default:
      return setOfAsset(o.asset)?.shadow ? DEFAULT_SHADOW : null;
  }
}
