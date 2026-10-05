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
const rasters = new WeakMap<MMPaint, Entry>();

function rasterFor(o: MMPaint, W: number, H: number): Entry {
  let entry = rasters.get(o);
  if (!entry) {
    entry = { W, H, r: renderPaint(o, W, H) };
    rasters.set(o, entry);
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
}: {
  o: MMPaint;
  W: number;
  H: number;
}) {
  const [, setVersion] = useState(0);
  const entry = rasterFor(o, W, H),
    stale = entry.W !== W || entry.H !== H;
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => {
      rasters.set(o, { W, H, r: renderPaint(o, W, H) });
      setVersion((v) => v + 1);
    }, 140);
    return () => clearTimeout(timer);
  }, [o, W, H, stale]);
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
