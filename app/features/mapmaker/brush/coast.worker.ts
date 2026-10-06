/// <reference lib="webworker" />
/**
 * Runs the layer coast effect (./coastfx.ts) off the main thread, so the
 * editor stays responsive while a large map's coastline is rebuilt.
 */
import { renderCoastEffect, type CoastInput } from "./coastfx";

export type CoastRequest = CoastInput & { id: number };
export type CoastResponse = {
  id: number;
  out: Uint8ClampedArray | null;
  error?: string;
};

self.onmessage = (event: MessageEvent<CoastRequest>) => {
  const { id, ...input } = event.data;
  try {
    const out = renderCoastEffect(input);
    const msg: CoastResponse = { id, out };
    self.postMessage(msg, out ? [out.buffer] : []);
  } catch (error) {
    const msg: CoastResponse = { id, out: null, error: String(error) };
    self.postMessage(msg);
  }
};
