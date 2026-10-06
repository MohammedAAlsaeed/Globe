"use client";
/**
 * One committed paint object on the canvas: its raster as a Konva.Image,
 * drawn with the object's opacity and blend mode (destination-out for the
 * eraser) inside its own layer.
 *
 * Rasters are cached per object *instance* (objects are immutable, so undo/
 * redo reuses them for free). When the view is zoomed, the old raster is
 * shown scaled immediately and a sharp one is rendered once zooming pauses —
 * so Ctrl+scroll stays smooth even on a map with hundreds of strokes.
 */
import { memo, useEffect, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import { renderPaint, type RenderedPaint } from "./engine";
import type { MMPaint } from "../types";

type Entry = { W: number; H: number; r: RenderedPaint | null };
// Decorated and plain (coast-layer) rasters are cached separately.
const rasters = new WeakMap<MMPaint, Entry>(),
  plainRasters = new WeakMap<MMPaint, Entry>();

function rasterFor(o: MMPaint, W: number, H: number, plain: boolean): Entry {
  const cache = plain ? plainRasters : rasters;
  let entry = cache.get(o);
  if (!entry) {
    entry = { W, H, r: renderPaint(o, W, H, false, plain) };
    cache.set(o, entry);
  }
  return entry;
}

/** A fresh raster at an exact size (used for full-resolution print). */
export function paintRasterAt(o: MMPaint, W: number, H: number) {
  return renderPaint(o, W, H);
}

export function paintCompositeOp(
  o: Pick<MMPaint, "erase" | "blend">,
): GlobalCompositeOperation {
  return o.erase
    ? "destination-out"
    : o.blend === "normal"
      ? "source-over"
      : o.blend;
}

export const PaintNode = memo(function PaintNode({
  o,
  W,
  H,
  plain = false,
}: {
  o: MMPaint;
  W: number;
  H: number;
  /** Without edge decoration (inside a coast-effect layer). */
  plain?: boolean;
}) {
  const [, setVersion] = useState(0);
  const entry = rasterFor(o, W, H, plain),
    stale = entry.W !== W || entry.H !== H;
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => {
      (plain ? plainRasters : rasters).set(o, {
        W,
        H,
        r: renderPaint(o, W, H, false, plain),
      });
      setVersion((v) => v + 1);
    }, 140);
    return () => clearTimeout(timer);
  }, [o, W, H, stale, plain]);
  const r = entry.r;
  if (!r) return null;
  const k = W / entry.W;
  return (
    <KonvaImage
      id={o.id}
      name="mm-paint"
      image={r.canvas}
      x={r.x * k}
      y={r.y * k}
      width={r.canvas.width * k}
      height={r.canvas.height * k}
      opacity={o.opacity}
      globalCompositeOperation={paintCompositeOp(o)}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
});
