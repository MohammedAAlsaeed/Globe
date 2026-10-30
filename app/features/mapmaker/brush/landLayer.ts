/**
 * Main-thread side of a land layer. A land layer keeps *where* land is apart
 * from *what it looks like*:
 *
 *  - **Land mask** — every land object (Land tool) merged in order: additions
 *    drawn, removals cut out.
 *  - **Land texture** — the layer's base texture with every paint object
 *    (Brush tool) on top, opaque everywhere. A texture eraser restores the
 *    base texture; it never removes land.
 *
 * Both go to the coast worker (./coast.worker.ts), which returns the finished
 * layer image (texture inside the coastline, decoration around it) and the
 * final land coverage.
 */
import {
  colorize,
  fillSource,
  makeCanvas,
  paintCompositeOp,
  renderPaint,
  type RenderedPaint,
} from "./engine";
import { coastShapeKey, renderCoastEffect, type CoastInput } from "./coastfx";
import { renderLand } from "./land";
import type { CoastRequest, CoastResponse } from "./coast.worker";
import type { CoastEffect, MMLand, MMPaint, PaintSource } from "../types";

/** Working resolution of the on-screen land layer (the print uses full size). */
const LAND_SCREEN_MAX = 2048;
/** Resolution of the quick first pass shown while the sharp one renders. */
export const LAND_QUICK = 1024;

/** The on-screen working size for a project (aspect preserved). */
export function landScreenSize(
  projectW: number,
  projectH: number,
  max = LAND_SCREEN_MAX,
) {
  const W = Math.min(projectW, max);
  return { W, H: Math.round((W * projectH) / projectW) };
}

// ---- object rasters ------------------------------------------------------------
// Objects are immutable, so a raster is cached per object instance and size
// (a few sizes per object: the quick pass, the sharp pass, the display).
const rasters = new WeakMap<
  MMPaint | MMLand,
  Map<number, RenderedPaint | null>
>();

/** A paint or land object rendered at stage size W×H (cached). */
export function rasterAt(o: MMPaint | MMLand, W: number, H: number) {
  let sizes = rasters.get(o);
  if (!sizes) rasters.set(o, (sizes = new Map()));
  if (sizes.has(W)) return sizes.get(W)!;
  const r = o.kind === "land" ? renderLand(o, W, H) : renderPaint(o, W, H);
  if (sizes.size > 3) sizes.clear();
  sizes.set(W, r);
  return r;
}

// ---- mask & texture --------------------------------------------------------------
/** Draws land objects in order: additions over, removals cut out. */
function drawLandShapes(
  ctx: CanvasRenderingContext2D,
  lands: MMLand[],
  W: number,
  H: number,
) {
  for (const o of lands) {
    const r = rasterAt(o, W, H);
    if (!r) continue;
    ctx.globalCompositeOperation = o.erase ? "destination-out" : "source-over";
    ctx.drawImage(r.canvas, r.x, r.y);
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Draws paint objects over the land texture in `ctx` (opacity and blend
 * applied). Erasers restore the base texture instead of cutting a hole. */
export function drawTexturePaint(
  ctx: CanvasRenderingContext2D,
  paints: MMPaint[],
  base: PaintSource,
  W: number,
  H: number,
) {
  for (const o of paints) {
    const r = rasterAt(o, W, H);
    if (!r) continue;
    ctx.globalAlpha = o.opacity;
    if (o.erase) {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(colorize(r.canvas, base, W, r.x, r.y), r.x, r.y);
    } else {
      ctx.globalCompositeOperation = paintCompositeOp(o);
      ctx.drawImage(r.canvas, r.x, r.y);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** The merged land mask as coverage 0..255 per pixel. */
function buildLandMask(lands: MMLand[], W: number, H: number) {
  const c = makeCanvas(W, H),
    ctx = c.getContext("2d", { willReadFrequently: true })!;
  drawLandShapes(ctx, lands, W, H);
  const rgba = ctx.getImageData(0, 0, W, H).data,
    mask = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3];
  return mask;
}

/** The land texture: base texture with all paint on top, opaque RGBA. */
function buildLandTexture(
  base: PaintSource,
  paints: MMPaint[],
  W: number,
  H: number,
) {
  const c = makeCanvas(W, H),
    ctx = c.getContext("2d", { willReadFrequently: true })!;
  fillSource(ctx, base, W, 0, 0, W, H);
  drawTexturePaint(ctx, paints, base, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

// ---- worker client ------------------------------------------------------------
type Done = (res: Pick<CoastResponse, "image" | "land">) => void;
let worker: Worker | null = null,
  nextId = 1;
const pending = new Map<number, Done>();

function getWorker() {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./coast.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<CoastResponse>) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.(e.data);
    };
    worker.onerror = () => {
      // Give up on the worker; everything still waiting resolves empty and
      // later requests run on the main thread.
      worker?.terminate();
      worker = null;
      for (const [, done] of pending) done({ image: null, land: null });
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function runCoast(input: CoastInput, shapeKey: string) {
  const w = getWorker();
  if (!w) {
    const out = renderCoastEffect(input);
    return Promise.resolve({
      image: out?.image ?? null,
      land: out?.land ?? null,
    });
  }
  return new Promise<Pick<CoastResponse, "image" | "land">>((resolve) => {
    const id = nextId++,
      req: CoastRequest = { ...input, id, shapeKey };
    pending.set(id, resolve);
    w.postMessage(req, [input.mask.buffer, input.rgba.buffer]);
  });
}

// A short, stable key per object instance — equal keys mean the same land.
let serial = 0;
const serials = new WeakMap<object, number>();
const objKey = (o: object) => {
  let k = serials.get(o);
  if (k === undefined) serials.set(o, (k = ++serial));
  return k;
};

// ---- the layer ------------------------------------------------------------------
export interface LandLayerInput {
  layerId: string;
  lands: MMLand[];
  paints: MMPaint[];
  base: PaintSource;
  fx: CoastEffect;
  seed: number;
  /** The map's left and right edges meet (see MMProject.seamless). */
  wrap?: boolean;
}
export interface LandLayerImage {
  /** The finished layer at the working size. */
  image: HTMLCanvasElement;
  /** Final land coverage as alpha (for clipping live previews to the land). */
  land: HTMLCanvasElement;
}

function toCanvas(rgba: Uint8ClampedArray, W: number, H: number) {
  const c = makeCanvas(W, H);
  c.getContext("2d")!.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer), W, H),
    0,
    0,
  );
  return c;
}

/** The finished land layer at W×H, or null when the layer holds no land. */
export async function renderLandLayer(
  input: LandLayerInput,
  W: number,
  H: number,
): Promise<LandLayerImage | null> {
  const { lands, paints, base, fx, seed, wrap = false } = input;
  if (!lands.some((o) => !o.erase)) return null;
  const shapeKey = [
    input.layerId,
    `${W}x${H}`,
    seed,
    coastShapeKey(fx),
    wrap ? "wrap" : "",
    lands.map(objKey).join(","),
  ].join("|");
  const out = await runCoast(
    {
      width: W,
      height: H,
      mask: buildLandMask(lands, W, H),
      rgba: buildLandTexture(base, paints, W, H),
      fx,
      seed,
      wrap,
    },
    shapeKey,
  );
  if (!out.image || !out.land) return null;
  const landRgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < out.land.length; i++) {
    const o = i * 4;
    landRgba[o] = landRgba[o + 1] = landRgba[o + 2] = 255;
    landRgba[o + 3] = out.land[i];
  }
  return { image: toCanvas(out.image, W, H), land: toCanvas(landRgba, W, H) };
}
