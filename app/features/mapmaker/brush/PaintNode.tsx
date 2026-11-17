"use client";
/**
 * One committed paint object on a non-land layer: its raster as a
 * Konva.Image, drawn with the object's opacity and blend mode (destination-
 * out for the eraser) inside its own layer. (Land layers draw their paint as
 * texture through LandLayerNode instead.)
 *
 * Rasters are cached per object *instance* (objects are immutable, so undo/
 * redo reuses them for free). When the view is zoomed, the old raster is
 * shown scaled immediately and a sharp one is rendered once zooming pauses —
 * so Ctrl+scroll stays smooth even on a map with hundreds of strokes.
 */
import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { Image as KonvaImage } from "react-konva";
import { paintCompositeOp, renderPaint, type RenderedPaint } from "./engine";
import { subscribeTextures, textureMisses, texturesVersion } from "./textures";
import type { MMPaint } from "../types";

/** `waiting`: drawn with a stand-in for a texture still on its way (see
 * brush/textures.ts), at texture `version`. */
type Entry = {
  W: number;
  H: number;
  r: RenderedPaint | null;
  waiting: boolean;
  version: number;
};

function render(o: MMPaint, W: number, H: number): Entry {
  const misses = textureMisses(),
    version = texturesVersion(),
    r = renderPaint(o, W, H);
  return { W, H, r, waiting: textureMisses() !== misses, version };
}
const rasters = new WeakMap<MMPaint, Entry>();

function rasterFor(o: MMPaint, W: number, H: number): Entry {
  let entry = rasters.get(o);
  if (!entry || (entry.waiting && entry.version !== texturesVersion())) {
    entry = render(o, W, H);
    rasters.set(o, entry);
  }
  return entry;
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
  useSyncExternalStore(subscribeTextures, texturesVersion, texturesVersion);
  const entry = rasterFor(o, W, H),
    stale = entry.W !== W || entry.H !== H;
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => {
      rasters.set(o, render(o, W, H));
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
