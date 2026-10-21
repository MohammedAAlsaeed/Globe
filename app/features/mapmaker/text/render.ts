/**
 * Drawing a text's outlines on a canvas, in this order:
 *
 *   shadow    the silhouette of the letters (and their outline), blurred and
 *             offset along the map — at its own opacity, whatever the
 *             letters' own opacity is;
 *   outline   "outside": behind the letters, twice as wide, so only the halo
 *             shows — it follows the joined word's final shape, never each
 *             Arabic letter separately; "center": on the edge, over them;
 *   fill      the letters, at their own opacity. With a faded fill, the
 *             outline is cut out under the letters first, so faded ink keeps
 *             a crisp edge and no darker band.
 *
 * The context is expected in em units (1 = the text's size); everything is
 * vector, so the same calls give sharp letters on screen and at 16K.
 */
import type { TextLook } from "../types";
import { opsToSvg, type Ops, type TextGeometry } from "./geometry";

export function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

const pathCache = new WeakMap<TextGeometry, Path2D>();
function addOps(target: Path2D | CanvasRenderingContext2D, ops: Ops) {
  for (let i = 0; i < ops.length;) {
    const op = ops[i];
    if (op === 0) {
      target.moveTo(ops[i + 1], ops[i + 2]);
      i += 3;
    } else if (op === 1) {
      target.lineTo(ops[i + 1], ops[i + 2]);
      i += 3;
    } else if (op === 2) {
      target.quadraticCurveTo(ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4]);
      i += 5;
    } else if (op === 3) {
      target.bezierCurveTo(
        ops[i + 1],
        ops[i + 2],
        ops[i + 3],
        ops[i + 4],
        ops[i + 5],
        ops[i + 6],
      );
      i += 7;
    } else {
      target.closePath();
      i += 1;
    }
  }
}
/** The geometry's letters as one Path2D (cached). */
export function textPath(geo: TextGeometry): Path2D {
  let p = pathCache.get(geo);
  if (!p) {
    if (typeof Path2D !== "undefined") {
      try {
        // An SVG path string is the fastest way to build a big Path2D.
        p = new Path2D(opsToSvg(geo.ops, 1, 0, 0, 4));
      } catch {
        p = new Path2D();
        addOps(p, geo.ops);
      }
    } else p = {} as Path2D;
    pathCache.set(geo, p);
  }
  return p;
}

/** Browser-drawn letters (East Asian, scripts without a shipped font). */
function drawWeb(
  ctx: CanvasRenderingContext2D,
  geo: TextGeometry,
  paint: (ctx: CanvasRenderingContext2D, text: string) => void,
) {
  for (const w of geo.web) {
    ctx.save();
    ctx.transform(...w.m);
    ctx.font = w.css;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    paint(ctx, w.text);
    ctx.restore();
  }
}

/** Pixels per em on the device right now (the context's scale). */
function deviceScale(ctx: CanvasRenderingContext2D) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

function strokeStyle(
  ctx: CanvasRenderingContext2D,
  look: TextLook,
  width: number,
) {
  ctx.lineWidth = width;
  ctx.lineJoin = look.outline.join;
  ctx.miterLimit = 3;
  ctx.lineCap = "round";
}

type Look = Pick<TextLook, "fill" | "fillOpacity" | "outline" | "shadow">;

/** Draws a text. `ctx` is in em units; its own globalAlpha/composite are kept. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  geo: TextGeometry,
  look: Look,
) {
  if (!geo.ops.length && !geo.web.length) return;
  const path = textPath(geo);
  const scale = deviceScale(ctx);
  const outline =
    look.outline.enabled && look.outline.width > 0 && look.outline.opacity > 0;
  const outsideWidth =
    look.outline.position === "outside"
      ? look.outline.width * 2
      : look.outline.width;

  // ---- shadow: a silhouette thrown far off-canvas, so only its shadow lands
  if (look.shadow.enabled && look.shadow.opacity > 0) {
    ctx.save();
    const FAR = 1e5;
    const m = ctx.getTransform();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e - FAR, m.f);
    ctx.shadowColor = rgba(look.shadow.color, look.shadow.opacity);
    ctx.shadowBlur = look.shadow.blur * scale;
    ctx.shadowOffsetX = FAR + look.shadow.offsetX * scale;
    ctx.shadowOffsetY = look.shadow.offsetY * scale;
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";
    ctx.fill(path);
    if (outline) {
      strokeStyle(ctx, look as TextLook, outsideWidth);
      ctx.stroke(path);
    }
    drawWeb(ctx, geo, (c, t) => {
      c.fillText(t, 0, 0);
      if (outline) {
        c.lineWidth = outsideWidth * 100;
        c.strokeText(t, 0, 0);
      }
    });
    ctx.restore();
  }

  const fillColor = rgba(look.fill, 1);
  const outlineColor = rgba(look.outline.color, 1);
  // ---- outline behind the letters
  if (outline && look.outline.position === "outside") {
    if (look.fillOpacity < 0.999)
      drawCutOutline(ctx, geo, path, look, outsideWidth);
    else {
      ctx.save();
      ctx.globalAlpha *= look.outline.opacity;
      ctx.strokeStyle = outlineColor;
      strokeStyle(ctx, look as TextLook, outsideWidth);
      ctx.stroke(path);
      drawWeb(ctx, geo, (c, t) => {
        c.lineWidth = outsideWidth * 100;
        c.strokeStyle = outlineColor;
        c.lineJoin = look.outline.join;
        c.strokeText(t, 0, 0);
      });
      ctx.restore();
    }
  }
  // ---- the letters
  if (look.fillOpacity > 0) {
    ctx.save();
    ctx.globalAlpha *= look.fillOpacity;
    ctx.fillStyle = fillColor;
    ctx.fill(path);
    drawWeb(ctx, geo, (c, t) => {
      c.fillStyle = fillColor;
      c.fillText(t, 0, 0);
    });
    ctx.restore();
  }
  // ---- outline on the edge
  if (outline && look.outline.position === "center") {
    ctx.save();
    ctx.globalAlpha *= look.outline.opacity;
    ctx.strokeStyle = outlineColor;
    strokeStyle(ctx, look as TextLook, look.outline.width);
    ctx.stroke(path);
    drawWeb(ctx, geo, (c, t) => {
      c.lineWidth = look.outline.width * 100;
      c.strokeStyle = outlineColor;
      c.strokeText(t, 0, 0);
    });
    ctx.restore();
  }
}

/** The outside outline with the letters' shape cut out of it (for faded fills). */
function drawCutOutline(
  ctx: CanvasRenderingContext2D,
  geo: TextGeometry,
  path: Path2D,
  look: Look,
  width: number,
) {
  const m = ctx.getTransform();
  const pad = width;
  const { x0, y0, x1, y1 } = geo.bounds;
  // The box on the device.
  const corners = [
    [x0 - pad, y0 - pad],
    [x1 + pad, y0 - pad],
    [x0 - pad, y1 + pad],
    [x1 + pad, y1 + pad],
  ].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const dx0 = Math.floor(Math.min(...corners.map((c) => c[0]))),
    dy0 = Math.floor(Math.min(...corners.map((c) => c[1]))),
    dx1 = Math.ceil(Math.max(...corners.map((c) => c[0]))),
    dy1 = Math.ceil(Math.max(...corners.map((c) => c[1])));
  const w = dx1 - dx0,
    h = dy1 - dy0;
  if (w <= 0 || h <= 0 || w * h > 64e6) return;
  const buf = document.createElement("canvas");
  buf.width = w;
  buf.height = h;
  const b = buf.getContext("2d");
  if (!b) return;
  b.setTransform(m.a, m.b, m.c, m.d, m.e - dx0, m.f - dy0);
  b.strokeStyle = rgba(look.outline.color, 1);
  strokeStyle(b, look as TextLook, width);
  b.stroke(path);
  drawWeb(b, geo, (c, t) => {
    c.lineWidth = width * 100;
    c.strokeText(t, 0, 0);
  });
  b.globalCompositeOperation = "destination-out";
  b.fill(path);
  drawWeb(b, geo, (c, t) => c.fillText(t, 0, 0));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= look.outline.opacity;
  ctx.drawImage(buf, dx0, dy0);
  ctx.restore();
}

/** Hit area: the letters, their outline and a little more, so small names are easy to click. */
export function hitText(
  ctx: CanvasRenderingContext2D,
  geo: TextGeometry,
  look: Pick<TextLook, "outline">,
  color: string,
  box: boolean,
  minPx = 8,
) {
  const path = textPath(geo);
  const scale = deviceScale(ctx);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.fill(path);
  ctx.lineWidth = Math.max(
    minPx / scale,
    look.outline.enabled ? look.outline.width * 2 : 0,
    0.15,
  );
  ctx.lineJoin = "round";
  ctx.stroke(path);
  // Straight texts: the block's box too (spaces, thin letters). Curved ones
  // keep to their letters, so what's under the bend stays clickable.
  if (!box) return;
  const { x0, y0, x1, y1 } = geo.bounds;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}
