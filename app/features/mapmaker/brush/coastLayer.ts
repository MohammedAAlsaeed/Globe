/**
 * Main-thread side of the layer coast effect: merges a layer's paint into one
 * land raster, hands it to the coast worker, and returns the finished layer
 * image as a canvas.
 */
import { renderCoastEffect, type CoastInput } from "./coastfx";
import { renderPaint, type RenderedPaint } from "./engine";
import { paintCompositeOp } from "./PaintNode";
import type { CoastResponse } from "./coast.worker";
import type { CoastEffect, MMPaint } from "../types";

/** Working resolution for the on-screen coast (the print uses full size). */
export const COAST_SCREEN_MAX = 2048;
/** Resolution of the quick first pass shown while the sharp one renders. */
export const COAST_QUICK = 1024;

// Paint rasters at the coast's working resolutions, per immutable object
// (one entry per size: the quick and the sharp pass use different sizes).
const rasterCache = new WeakMap<MMPaint, Map<number, RenderedPaint | null>>();
function plainRaster(o: MMPaint, W: number, H: number) {
  let sizes = rasterCache.get(o);
  if (!sizes) rasterCache.set(o, (sizes = new Map()));
  if (sizes.has(W)) return sizes.get(W)!;
  const r = renderPaint(o, W, H, false, true);
  if (sizes.size > 3) sizes.clear();
  sizes.set(W, r);
  return r;
}

/** All of a layer's paint merged in order (erasers and blend modes applied). */
export function buildLandRaster(paints: MMPaint[], W: number, H: number) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  for (const o of paints) {
    const r = plainRaster(o, W, H);
    if (!r) continue;
    ctx.globalAlpha = o.opacity;
    ctx.globalCompositeOperation = paintCompositeOp(o);
    ctx.drawImage(r.canvas, r.x, r.y);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return ctx.getImageData(0, 0, W, H);
}

// ---- worker client ------------------------------------------------------------
let worker: Worker | null = null,
  nextId = 1;
const pending = new Map<number, (out: Uint8ClampedArray | null) => void>();

function getWorker() {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./coast.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<CoastResponse>) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.(e.data.out);
    };
    worker.onerror = () => {
      // Fall back to the main thread for everything still waiting.
      worker?.terminate();
      worker = null;
      for (const [, done] of pending) done(null);
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function runEffect(input: CoastInput): Promise<Uint8ClampedArray | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(renderCoastEffect(input));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ ...input, id }, [input.rgba.buffer]);
  });
}

/**
 * The finished coast layer image at W×H, or null when the layer holds no land.
 */
export async function renderCoastLayer(
  paints: MMPaint[],
  fx: CoastEffect,
  seed: number,
  W: number,
  H: number,
): Promise<HTMLCanvasElement | null> {
  if (!paints.length) return null;
  const land = buildLandRaster(paints, W, H);
  const out = await runEffect({
    width: W,
    height: H,
    rgba: land.data,
    fx,
    seed,
  });
  if (!out) return null;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.getContext("2d")!.putImageData(
    new ImageData(new Uint8ClampedArray(out.buffer as ArrayBuffer), W, H),
    0,
    0,
  );
  return c;
}

/** The on-screen working size for a project (aspect preserved). */
export function coastScreenSize(
  projectW: number,
  projectH: number,
  max = COAST_SCREEN_MAX,
) {
  const W = Math.min(projectW, max);
  return { W, H: Math.round((W * projectH) / projectW) };
}
