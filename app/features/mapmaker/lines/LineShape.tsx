/**
 * The Konva node that draws a line on the canvas.
 *
 * A custom Konva.Shape (registered as "LineShape", so react-konva can create
 * it like any built-in node) that:
 *   - draws with ./render's drawLine — vector strokes and stamp pieces at
 *     the device's real resolution (prints included);
 *   - reports its true bounds (curves, stroke width, casing, pieces), so
 *     selection boxes, the Transformer and marquee selection hug the line;
 *   - is hit along the path with a comfortable minimum width, so thin lines
 *     are still easy to click;
 *   - draws through a buffer when semi-transparent, so overlapping pieces
 *     and the casing don't stack up darker than the line's opacity.
 *
 * Its look is read from the `line` attribute, so the node editor and live
 * previews update a line imperatively (setAttr) without re-rendering React.
 */
import type React from "react";
import Konva from "konva";
import type { Context } from "konva/lib/Context";
import type { MMLine } from "../types";
import { drawLine, linePoly, lineReach, tracePath, type Drawable } from "./render";

/** Minimum clickable width around a line, screen pixels. */
const HIT_MIN_PX = 12;

export class LineShape extends Konva.Shape {
  private line(): Drawable | null {
    return (this.attrs.line as Drawable | undefined) ?? null;
  }
  _sceneFunc(context: Context) {
    const line = this.line(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!line || !w || !h) return;
    const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
    drawLine(ctx, line, w, h, () => this.getLayer()?.batchDraw());
  }
  _hitFunc(context: Context) {
    const line = this.line(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!line || line.nodes.length < 2) return;
    const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
    ctx.beginPath();
    tracePath(ctx, line.nodes, line.closed, w, h);
    ctx.lineWidth = Math.max(HIT_MIN_PX, lineReach(line, w) * 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.colorKey;
    ctx.stroke();
  }
  getSelfRect() {
    const line = this.line(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!line || line.nodes.length === 0 || !w || !h) return { x: 0, y: 0, width: 0, height: 0 };
    const poly = linePoly(line, w, h),
      pad = lineReach(line, w);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i < poly.xy.length; i += 2) {
      x0 = Math.min(x0, poly.xy[i]);
      x1 = Math.max(x1, poly.xy[i]);
      y0 = Math.min(y0, poly.xy[i + 1]);
      y1 = Math.max(y1, poly.xy[i + 1]);
    }
    return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + pad * 2, height: y1 - y0 + pad * 2 };
  }
  _useBufferCanvas() {
    return this.getAbsoluteOpacity() < 1 && !!this.getStage();
  }
}
(Konva as unknown as Record<string, unknown>).LineShape = LineShape;

export interface LineShapeProps extends Konva.ShapeConfig {
  line: Drawable | MMLine;
  W: number;
  H: number;
  ref?: React.Ref<Konva.Shape>;
}
/** react-konva creates nodes by class name: `<LineShapeNode line={…} W H />`. */
export const LineShapeNode = "LineShape" as unknown as React.FC<LineShapeProps>;
