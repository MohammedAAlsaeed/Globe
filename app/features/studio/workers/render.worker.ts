/// <reference lib="webworker" />
import { goreBox, latitudeAt, sourceY, bleedBounds } from "../domain/geometry";
import { samplePixel } from "../rendering/sampling";
import { drawLayers } from "../rendering/layers";
import type { RenderRequest, RenderResponse } from "./protocol";
const send = (m: RenderResponse) => self.postMessage(m);
self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  try {
    const { source, globe: s, layers, dpi, mode, preview } = event.data;
    const bitmap = await createImageBitmap(source);
    let w = bitmap.width,
      h = bitmap.height;
    if (w * h > 60e6) throw new Error("errorImage");
    // Progressive downscaling provides an area prefilter before inverse sampling.
    const g = goreBox(s),
      ppm = dpi / 25.4;
    const targetW =
      mode === "panorama" ? 2048 : Math.ceil(Math.PI * s.width * ppm);
    let src = new OffscreenCanvas(w, h);
    let ctx = src.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    drawLayers(ctx, layers, w, h);
    while (w > targetW * 2 && w > 1024) {
      const nw = Math.ceil(w / 2),
        nh = Math.ceil(h / 2),
        next = new OffscreenCanvas(nw, nh);
      next.getContext("2d")!.drawImage(src, 0, 0, nw, nh);
      src.width = 0;
      src = next;
      w = nw;
      h = nh;
    }
    ctx = src.getContext("2d", { willReadFrequently: true })!;
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const indices =
      mode === "panorama"
        ? [0]
        : (event.data.indices ?? Array.from({ length: s.gores }, (_, i) => i));
    const count = indices.length;
    const bounds = new Map<number, { left: number; right: number }>();
    for (let position = 0; position < count; position++) {
      const index = indices[position];
      const ow = mode === "panorama" ? 2048 : Math.ceil(g.width * ppm),
        oh = mode === "panorama" ? 1024 : Math.ceil(g.height * ppm);
      if (ow * oh > 32e6 || Math.max(ow, oh) > 16000)
        throw new Error("pieceLimit");
      const canvas = new OffscreenCanvas(ow, oh),
        out = canvas.getContext("2d")!,
        img = out.createImageData(ow, oh);
      for (let y = 0; y < oh; y++) {
        const localY = (y + 0.5) / ppm - g.top;
        if (
          mode === "gores" &&
          (localY < -s.bleed || localY > g.goreHeight + s.bleed)
        )
          continue;
        const f =
          mode === "panorama"
            ? (y + 0.5) / oh
            : Math.max(0, Math.min(1, localY / g.goreHeight));
        const lat =
            mode === "panorama"
              ? Math.PI / 2 - f * Math.PI
              : latitudeAt(f * g.goreHeight, g.arcs),
          sy = sourceY(lat, s);
        if (sy === null) continue;
        const cos = Math.max(1e-8, Math.cos(lat));
        if (mode === "gores" && !bounds.has(y))
          bounds.set(y, bleedBounds(localY, s, g));
        const bound = bounds.get(y);
        for (let x = 0; x < ow; x++) {
          const localX = (x + 0.5) / ppm - g.left - g.goreWidth / 2;
          if (
            mode === "gores" &&
            bound &&
            (localX < bound.left || localX > bound.right)
          )
            continue;
          const lon =
            mode === "panorama"
              ? (x + 0.5) / ow
              : index / s.gores +
                0.5 / s.gores +
                localX / (g.goreWidth * cos) / s.gores +
                s.offset / 360;
          // Pole extension is clamped to the gore sector rather than wrapping many times.
          const u =
            mode === "gores" && cos < 0.015
              ? index / s.gores + 0.5 / s.gores + s.offset / 360
              : lon;
          samplePixel(
            pixels,
            w,
            h,
            u * w - 0.5,
            sy * h - 0.5,
            preview ? "bilinear" : s.resampling,
            img.data,
            (y * ow + x) * 4,
          );
        }
        if (y % 64 === 0)
          send({ type: "progress", value: (position + y / oh) / count });
      }
      out.putImageData(img, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      canvas.width = 0;
      canvas.height = 0;
      send({ type: "asset", index, blob, width: ow, height: oh });
    }
    src.width = 0;
    send({ type: "done" });
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : "errorGeneric",
    });
  }
};
