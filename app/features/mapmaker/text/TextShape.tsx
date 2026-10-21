/**
 * The Konva node that draws a text on the map.
 *
 * A custom Konva.Shape (registered as "MapText", so react-konva creates it
 * like a built-in node) that:
 *   - draws the text's outlines (./geometry → ./render) in em units scaled
 *     to the map, so they are vectors at every zoom and in every export;
 *   - reports its true bounds (curves and outlines included) for selection,
 *     the Transformer and marquee selection;
 *   - is hit on its letters (straight texts: their whole box), with a
 *     comfortable minimum width;
 *   - draws through a buffer when the whole text is semi-transparent, so
 *     its outline, shadow and letters don't stack up darker;
 *   - redraws by itself when a font it needs arrives.
 *
 * Straight and arc texts sit at their anchor (x, y) and turn with
 * `rotation`; path texts are drawn in map space (the node stays at 0, 0).
 */
import type React from "react";
import Konva from "konva";
import type { Context } from "konva/lib/Context";
import type { MMText } from "../types";
import { onFontsChange } from "./fontStore";
import { textGeometry } from "./geometry";
import { drawText, hitText } from "./render";

const waiting = new Set<Konva.Shape>();
let subscribed = false;
function redrawWhenFontsArrive(shape: Konva.Shape) {
  waiting.add(shape);
  if (subscribed) return;
  subscribed = true;
  onFontsChange(() => {
    const layers = new Set<Konva.Layer>();
    for (const s of waiting) {
      const l = s.getLayer();
      if (l) layers.add(l);
    }
    waiting.clear();
    for (const l of layers) l.batchDraw();
  });
}

export class MapText extends Konva.Shape {
  /** The text as drawn (a live box width while dragging the side handles). */
  private obj(): MMText | null {
    const o = this.attrs.text as MMText | undefined;
    if (!o) return null;
    const live = this.attrs.liveBox as number | null | undefined;
    return live !== undefined && live !== o.boxWidth
      ? { ...o, boxWidth: live }
      : o;
  }
  private geo() {
    const o = this.obj(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!o || !w || !h) return null;
    const geo = textGeometry(o, h / w);
    if (!geo.ready) redrawWhenFontsArrive(this);
    return { o, geo, k: o.size * w };
  }
  _sceneFunc(context: Context) {
    if (this.attrs.editing) return;
    const g = this.geo();
    if (!g) return;
    const ctx = (context as unknown as { _context: CanvasRenderingContext2D })
      ._context;
    ctx.save();
    ctx.scale(g.k, g.k);
    drawText(ctx, g.geo, g.o);
    ctx.restore();
  }
  _hitFunc(context: Context) {
    const g = this.geo();
    if (!g) return;
    const ctx = (context as unknown as { _context: CanvasRenderingContext2D })
      ._context;
    ctx.save();
    ctx.scale(g.k, g.k);
    hitText(
      ctx,
      g.geo,
      g.o,
      this.colorKey,
      g.o.curveMode === "straight" ||
        (g.o.curveMode === "arc" && Math.abs(g.o.curve) < 25),
    );
    ctx.restore();
  }
  getSelfRect() {
    const g = this.geo();
    if (!g) return { x: 0, y: 0, width: 0, height: 0 };
    const { x0, y0, x1, y1 } = g.geo.bounds;
    const pad = g.o.outline.enabled
      ? g.o.outline.width * (g.o.outline.position === "outside" ? 2 : 1)
      : 0.02;
    return {
      x: (x0 - pad) * g.k,
      y: (y0 - pad) * g.k,
      width: (x1 - x0 + pad * 2) * g.k,
      height: (y1 - y0 + pad * 2) * g.k,
    };
  }
  _useBufferCanvas() {
    return this.getAbsoluteOpacity() < 1 && !!this.getStage();
  }
}
(Konva as unknown as Record<string, unknown>).MapText = MapText;

export interface MapTextProps extends Konva.ShapeConfig {
  text: MMText;
  W: number;
  H: number;
  /** Hidden while it's being typed into (the inline editor shows it). */
  editing?: boolean;
  liveBox?: number | null;
  ref?: React.Ref<Konva.Shape>;
}
/** react-konva creates nodes by class name: `<MapTextNode text={…} W H />`. */
export const MapTextNode = "MapText" as unknown as React.FC<MapTextProps>;
