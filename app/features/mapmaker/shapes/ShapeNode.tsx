/**
 * The Konva nodes that draw shapes on the canvas.
 *
 *   ShapeShape   one shape: draws with ./render (fill, stroke, walls) at the
 *                device's real resolution; is hit on its fill and along its
 *                outline (masks: on the outline only, so a mask never hides
 *                the objects under it from clicks); reports its true bounds
 *                for selection boxes and the Transformer; draws through a
 *                buffer when semi-transparent, so fill and stroke don't stack
 *   ShapeMask    the layer's masks, applied to everything drawn in the layer
 *                before it (the last node of a layer that has masks)
 *
 * Both read their data from attributes, so the editor updates them
 * imperatively while dragging (setAttr) without re-rendering React.
 */
import type React from "react";
import Konva from "konva";
import type { Context } from "konva/lib/Context";
import {
  drawLayerMask,
  drawShape,
  shapeOutline,
  shapeReach,
  traceOutline,
  type ShapeDrawable,
  type ShapePass,
} from "./render";

/** Minimum clickable band around an outline, screen pixels. */
const HIT_MIN_PX = 12;
const raw = (c: Context) =>
  (c as unknown as { _context: CanvasRenderingContext2D })._context;

export class ShapeShape extends Konva.Shape {
  private shape(): ShapeDrawable | null {
    return (this.attrs.shape as ShapeDrawable | undefined) ?? null;
  }
  private pass(): ShapePass {
    return (this.attrs.pass as ShapePass | undefined) ?? "all";
  }
  _sceneFunc(context: Context) {
    const s = this.shape(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!s || !w || !h) return;
    drawShape(raw(context), s, w, h, this.pass(), () =>
      this.getLayer()?.batchDraw(),
    );
  }
  _hitFunc(context: Context) {
    const s = this.shape(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!s || !w || !h) return;
    const ctx = raw(context),
      o = shapeOutline(s, w, h, 1);
    if (!o.contours.length) return;
    ctx.beginPath();
    traceOutline(ctx, o, w, h);
    ctx.fillStyle = this.colorKey;
    ctx.strokeStyle = this.colorKey;
    // Shapes are picked anywhere inside; masks and outline-only shapes
    // (no fill) by their outline, so what's inside stays clickable.
    if (s.fill.type !== "mask" && s.fill.type !== "none") ctx.fill("nonzero");
    ctx.lineWidth = Math.max(
      HIT_MIN_PX,
      s.stroke.mode === "none" ? 0 : shapeReach(s, w) * 2,
    );
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  getSelfRect() {
    const s = this.shape(),
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!s || !w || !h) return { x: 0, y: 0, width: 0, height: 0 };
    const b = shapeOutline(s, w, h, 1).bounds,
      pad = s.fill.type === "mask" ? 1 : shapeReach(s, w);
    return {
      x: b.x - pad,
      y: b.y - pad,
      width: b.width + pad * 2,
      height: b.height + pad * 2,
    };
  }
  _useBufferCanvas() {
    return this.getAbsoluteOpacity() < 1 && !!this.getStage();
  }
}
(Konva as unknown as Record<string, unknown>).ShapeShape = ShapeShape;

export class ShapeMask extends Konva.Shape {
  _sceneFunc(context: Context) {
    const masks = (this.attrs.masks as ShapeDrawable[] | undefined) ?? [],
      w = this.attrs.W as number,
      h = this.attrs.H as number;
    if (!masks.length || !w || !h) return;
    drawLayerMask(raw(context), masks, w, h);
  }
  _hitFunc() {}
  getSelfRect() {
    const w = (this.attrs.W as number) || 0,
      h = (this.attrs.H as number) || 0;
    return { x: 0, y: 0, width: w, height: h };
  }
}
(Konva as unknown as Record<string, unknown>).ShapeMask = ShapeMask;

export interface ShapeShapeProps extends Konva.ShapeConfig {
  shape: ShapeDrawable;
  W: number;
  H: number;
  pass?: ShapePass;
  ref?: React.Ref<Konva.Shape>;
}
/** react-konva creates nodes by class name: `<ShapeShapeNode shape={…} W H />`. */
export const ShapeShapeNode =
  "ShapeShape" as unknown as React.FC<ShapeShapeProps>;

export interface ShapeMaskProps extends Konva.ShapeConfig {
  masks: ShapeDrawable[];
  W: number;
  H: number;
}
export const ShapeMaskNode = "ShapeMask" as unknown as React.FC<ShapeMaskProps>;
