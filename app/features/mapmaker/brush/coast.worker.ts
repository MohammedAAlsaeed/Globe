/// <reference lib="webworker" />
/**
 * Runs the land layer coast effect (./coastfx.ts) off the main thread, so the
 * editor stays responsive while a large map's coastline is rebuilt.
 *
 * The coastline shape is the expensive part and depends only on the land
 * mask and the shape settings, so the last few shapes are kept: painting
 * texture or changing decoration (waves, glow, depth…) only re-composes.
 */
import {
  buildCoastShape,
  composeCoast,
  type CoastInput,
  type CoastShape,
} from "./coastfx";

export type CoastRequest = CoastInput & {
  id: number;
  /** Identifies the mask + shape settings; equal keys mean an equal shape. */
  shapeKey: string;
};
export type CoastResponse = {
  id: number;
  image: Uint8ClampedArray | null;
  land: Uint8Array | null;
  error?: string;
};

/** Small LRU of recent shapes (e.g. quick + sharp pass of two land layers). */
const MAX_SHAPES = 4;
const shapes = new Map<string, CoastShape | null>();

function shapeFor(req: CoastRequest) {
  if (shapes.has(req.shapeKey)) {
    const hit = shapes.get(req.shapeKey)!;
    shapes.delete(req.shapeKey); // refresh its LRU position
    shapes.set(req.shapeKey, hit);
    return hit;
  }
  const shape = buildCoastShape(
    req.mask,
    req.width,
    req.height,
    req.fx,
    req.seed,
    req.wrap,
  );
  shapes.set(req.shapeKey, shape);
  if (shapes.size > MAX_SHAPES) shapes.delete(shapes.keys().next().value!);
  return shape;
}

self.onmessage = (event: MessageEvent<CoastRequest>) => {
  const req = event.data;
  try {
    const shape = shapeFor(req),
      out = shape ? composeCoast(shape, req.rgba, req.fx, req.seed) : null;
    const msg: CoastResponse = {
      id: req.id,
      image: out?.image ?? null,
      land: out?.land ?? null,
    };
    self.postMessage(msg, out ? [out.image.buffer, out.land.buffer] : []);
  } catch (error) {
    const msg: CoastResponse = {
      id: req.id,
      image: null,
      land: null,
      error: String(error),
    };
    self.postMessage(msg);
  }
};
