import type { GoreAsset } from "../domain/types";
import type { RenderRequest, RenderResponse } from "../workers/protocol";
export function releaseAssets(assets: GoreAsset[]) {
  assets.forEach((a) => URL.revokeObjectURL(a.url));
}
/** Termination is immediate, even during a large resampling loop. */
export function renderInWorker(
  request: RenderRequest,
  signal: AbortSignal,
  onProgress?: (value: number) => void,
): Promise<GoreAsset[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Cancelled", "AbortError"));
    if (typeof OffscreenCanvas === "undefined")
      return reject(new Error("workerUnsupported"));
    const worker = new Worker(
        new URL("../workers/render.worker.ts", import.meta.url),
        { type: "module" },
      ),
      assets: GoreAsset[] = [];
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      cleanup();
      releaseAssets(assets);
      reject(error);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => fail(new Error("errorGeneric"));
    worker.onmessage = (event: MessageEvent<RenderResponse>) => {
      const m = event.data;
      if (m.type === "progress") onProgress?.(m.value);
      else if (m.type === "asset")
        assets.push({ ...m, url: URL.createObjectURL(m.blob) });
      else if (m.type === "done") {
        cleanup();
        resolve(assets);
      } else fail(new Error(m.message));
    };
    worker.postMessage(request);
  });
}
