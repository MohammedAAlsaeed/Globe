/**
 * Draws shapes onto a canvas — the same code for the editor (through the
 * Konva nodes in ./ShapeNode), style previews and full-resolution prints.
 *
 *   fill     a colour, a texture (anchored to the map or carried by the
 *            shape's frame) or a classic pattern, inside the outline
 *   stroke   a painted outline (dashes, caps, joins, casing, blur) or wall
 *            pieces laid along it; centred on the outline, inside it (the
 *            stroke is clipped to the shape) or outside it; portals cut
 *            openings, and wall pieces end in their end pieces there
 *   masks    shapes whose fill is "mask" draw nothing themselves: the
 *            layer's mask node (drawLayerMask) keeps only what is inside
 *            them (or hides it, inverted), with a soft edge if asked
 *
 * Sizes come from the device scale of the canvas, so prints are as sharp as
 * the screen. Outlines and stroke layouts are cached per shape and size.
 */
import {
  textureTile,
  tileLevelFor,
  TEXTURE_BASE_PX,
  filterHex,
} from "../brush/textures";
import { PAINT_REF_WIDTH } from "../brush/engine";
import { biomeTexture } from "../textures";
import type { MMShape, ShapeFill, ShapeLook, ShapeFrame } from "../types";
import {
  dashArray,
  deviceScale,
  drawPieces,
  stampKey,
  stampPieces,
  tracePath,
} from "../lines/render";
import type { Placement } from "../lines/distribute";
import {
  outline,
  strokeRuns,
  type ShapeOutline,
  type StrokeRun,
} from "./geometry";

/** What drawing a shape needs (an MMShape, or a draft being drawn). */
export type ShapeDrawable = Pick<
  MMShape,
  "parts" | "portals" | "stroke" | "fill" | "frame"
>;
/** all: fill then stroke · stroke: the stroke only (a mask's walls, drawn
 * over the masked layer) · none: nothing (a mask's own node, hit-only). */
export type ShapePass = "all" | "stroke" | "none";

/** Outline flattening tolerance for a canvas (finer when printing). */
export function shapeTolerance(ctx: CanvasRenderingContext2D) {
  const k = deviceScale(ctx);
  // Quantized, so the cached outline survives small changes of scale.
  return Math.max(
    0.04,
    Math.min(0.5, 0.35 / Math.pow(2, Math.round(Math.log2(k)))),
  );
}

export function shapeOutline(
  s: Pick<MMShape, "parts">,
  w: number,
  h: number,
  tol = 0.35,
): ShapeOutline {
  return outline(s.parts, w, h, tol);
}

/** Traces the outline into the current canvas path (call fill/clip after). */
export function traceOutline(
  ctx: CanvasRenderingContext2D,
  o: ShapeOutline,
  w: number,
  h: number,
) {
  if (o.direct) {
    tracePath(ctx, o.direct.nodes, true, w, h);
    return;
  }
  for (const c of o.contours) {
    const n = c.xy.length / 2;
    if (n < 3) continue;
    ctx.moveTo(c.xy[0], c.xy[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(c.xy[i * 2], c.xy[i * 2 + 1]);
    ctx.closePath();
  }
}

// ---- fill ------------------------------------------------------------------------------
/** The pattern transform of a texture or pattern fill (pixels → user space). */
function fillMatrix(
  fill: ShapeFill,
  frame: ShapeFrame,
  w: number,
  h: number,
  k: number,
) {
  let m = new DOMMatrix();
  if (fill.anchor === "shape")
    m = m
      .translate(frame.x * w, frame.y * h)
      .rotate(frame.rot)
      .scale(frame.scale);
  return m.rotate(fill.source.textureRotation).scale(k);
}

/** The fill style of a shape, or null for none / mask. */
function fillStyle(
  ctx: CanvasRenderingContext2D,
  s: ShapeDrawable,
  w: number,
  h: number,
): string | CanvasPattern | null {
  const f = s.fill;
  if (f.type === "color") return filterHex(f.source.color, f.source);
  if (f.type === "texture") {
    const pxPerTile =
        TEXTURE_BASE_PX *
        f.source.textureScale *
        (w / PAINT_REF_WIDTH) *
        (f.anchor === "shape" ? s.frame.scale : 1),
      level = tileLevelFor(pxPerTile * deviceScale(ctx)),
      tile = textureTile(f.source.texture, level, f.source),
      pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return null;
    const k =
      (TEXTURE_BASE_PX * f.source.textureScale * (w / PAINT_REF_WIDTH)) /
      tile.width;
    pattern.setTransform(fillMatrix(f, s.frame, w, h, k));
    return pattern;
  }
  if (f.type === "pattern") {
    const tile = biomeTexture(f.pattern),
      pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return null;
    // The old Region tool's scale: textureScale at a 900 px wide map.
    pattern.setTransform(
      fillMatrix(
        f,
        s.frame,
        w,
        h,
        f.source.textureScale * (w / PAINT_REF_WIDTH),
      ),
    );
    return pattern;
  }
  return null;
}

function drawFill(
  ctx: CanvasRenderingContext2D,
  s: ShapeDrawable,
  o: ShapeOutline,
  w: number,
  h: number,
) {
  const style = fillStyle(ctx, s, w, h);
  if (!style || s.fill.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= s.fill.opacity;
  ctx.fillStyle = style;
  ctx.beginPath();
  traceOutline(ctx, o, w, h);
  ctx.fill("nonzero");
  ctx.restore();
}

// ---- stroke ------------------------------------------------------------------------------
interface StrokeCache {
  w: number;
  h: number;
  tol: number;
  runs: StrokeRun[];
  key: string;
  pieces: Placement[][];
}
const strokes = new WeakMap<object, StrokeCache>();

function runsOf(
  s: ShapeDrawable,
  o: ShapeOutline,
  w: number,
  h: number,
  tol: number,
) {
  const hit = strokes.get(s);
  if (hit && hit.w === w && hit.h === h && hit.tol === tol) return hit;
  const c: StrokeCache = {
    w,
    h,
    tol,
    runs: strokeRuns(s, o, w, h),
    key: "",
    pieces: [],
  };
  strokes.set(s, c);
  return c;
}

/** Clips to the side of the outline a stroke keeps (inside or outside). */
function clipToSide(
  ctx: CanvasRenderingContext2D,
  o: ShapeOutline,
  w: number,
  h: number,
  side: "inside" | "outside",
) {
  ctx.beginPath();
  if (side === "outside") {
    // Everything but the shape: a huge frame around it, even-odd.
    const b = o.bounds,
      pad = Math.max(w, h) * 4;
    ctx.rect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
  }
  traceOutline(ctx, o, w, h);
  ctx.clip(side === "outside" ? "evenodd" : "nonzero");
}

function traceRuns(ctx: CanvasRenderingContext2D, runs: StrokeRun[]) {
  for (const r of runs) {
    const xy = r.poly.xy,
      n = xy.length / 2;
    if (n < 2) continue;
    ctx.moveTo(xy[0], xy[1]);
    // Closed runs repeat their first point; closePath joins them neatly.
    const last = r.poly.closed ? n - 1 : n;
    for (let i = 1; i < last; i++) ctx.lineTo(xy[i * 2], xy[i * 2 + 1]);
    if (r.poly.closed) ctx.closePath();
  }
}

function strokePass(
  ctx: CanvasRenderingContext2D,
  trace: () => void,
  color: string,
  width: number,
  dash: number[],
  cap: CanvasLineCap,
  join: CanvasLineJoin,
  blurPx: number,
) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  ctx.miterLimit = 4;
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  if (blurPx > 0.3) {
    // Drawn off to the side: only its blurred shadow lands in place.
    const k = deviceScale(ctx),
      far = 100000 / k;
    ctx.shadowColor = color;
    ctx.shadowBlur = blurPx * k;
    ctx.shadowOffsetX = far * k;
    ctx.translate(-far, 0);
  }
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.restore();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: ShapeDrawable,
  o: ShapeOutline,
  w: number,
  h: number,
  tol: number,
  onReady?: () => void,
) {
  const st = s.stroke;
  if (st.mode === "none" || st.opacity <= 0 || !o.contours.length) return;
  const cache = runsOf(s, o, w, h, tol),
    runs = cache.runs;
  ctx.save();
  ctx.globalAlpha *= st.opacity;
  if (st.mode === "color") {
    const c = st.color,
      // Inside / outside strokes keep half of a doubled stroke.
      grow = st.align === "center" ? 1 : 2,
      width = Math.max(0.35, c.width * w) * grow,
      blurPx = c.blur * c.width * w * 0.9,
      cap: CanvasLineCap = c.pattern === "dotted" ? "round" : c.cap;
    if (st.align !== "center") clipToSide(ctx, o, w, h, st.align);
    // No openings and one plain path: stroke the true curves.
    const exact = o.direct && !s.portals.length && runs.length === 1;
    const trace = () =>
      exact
        ? tracePath(ctx, o.direct!.nodes, true, w, h)
        : traceRuns(ctx, runs);
    if (c.casing > 0)
      strokePass(
        ctx,
        trace,
        c.casingColor,
        width + 2 * c.casing * w,
        [],
        c.pattern === "solid" ? cap : "butt",
        c.join,
        blurPx,
      );
    strokePass(
      ctx,
      trace,
      c.color,
      width,
      dashArray(c, width / grow),
      cap,
      c.join,
      blurPx,
    );
  } else {
    const key = `${stampKey(st.stamp)}|${st.align}`;
    if (cache.key !== key || cache.pieces.length !== runs.length) {
      // Runs travel with the shape on their right: + offset moves inward.
      const shift =
        st.align === "inside" ? 0.5 : st.align === "outside" ? -0.5 : 0;
      cache.pieces = runs.map((r) =>
        stampPieces(st.stamp, r.poly, w, r.corners, shift),
      );
      cache.key = key;
    }
    for (const pieces of cache.pieces)
      drawPieces(ctx, st.stamp, pieces, onReady);
  }
  ctx.restore();
}

/** Draws a shape (its opacity and blend are applied by the caller / node). */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  s: ShapeDrawable,
  w: number,
  h: number,
  pass: ShapePass = "all",
  onReady?: () => void,
) {
  if (pass === "none" || !s.parts.length) return;
  const tol = shapeTolerance(ctx),
    o = shapeOutline(s, w, h, tol);
  if (!o.contours.length) return;
  if (pass === "all" && s.fill.type !== "mask") drawFill(ctx, s, o, w, h);
  drawStroke(ctx, s, o, w, h, tol, onReady);
}

/** How far a shape's paint reaches beyond its outline, pixels. */
export function shapeReach(s: Pick<MMShape, "stroke" | "fill">, w: number) {
  const st = s.stroke;
  let r = 1;
  if (st.mode === "color")
    r +=
      st.color.width * w * (st.align === "center" ? 0.5 : 1) +
      st.color.casing * w * 2 +
      st.color.blur * st.color.width * w;
  else if (st.mode === "stamp")
    r +=
      st.stamp.size *
      w *
      (1 + Math.abs(st.stamp.offset)) *
      (st.stamp.anchor === "base" ? 2 : 1);
  if (s.fill.type === "mask") r = Math.max(r, s.fill.feather * w * 2);
  return r;
}

// ---- masks ----------------------------------------------------------------------------------
let maskCanvas: HTMLCanvasElement | null = null;
/**
 * Applies a layer's mask shapes to everything drawn in the layer so far:
 * keeps what is inside the masks (or, for inverted ones, hides what is
 * inside them). Soft edges come from the masks' feather. Drawn at the
 * canvas's own resolution, so it works on screen and in prints alike.
 */
export function drawLayerMask(
  ctx: CanvasRenderingContext2D,
  masks: readonly ShapeDrawable[],
  w: number,
  h: number,
) {
  if (!masks.length) return;
  const cw = ctx.canvas.width,
    ch = ctx.canvas.height;
  if (!cw || !ch) return;
  if (!maskCanvas) maskCanvas = document.createElement("canvas");
  if (maskCanvas.width !== cw || maskCanvas.height !== ch) {
    maskCanvas.width = cw;
    maskCanvas.height = ch;
  }
  const m = maskCanvas.getContext("2d")!;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = "source-over";
  m.clearRect(0, 0, cw, ch);
  const reveals = masks.filter((s) => !s.fill.invert),
    hides = masks.filter((s) => s.fill.invert);
  if (!reveals.length) {
    m.fillStyle = "#fff";
    m.fillRect(0, 0, cw, ch);
  }
  m.setTransform(ctx.getTransform());
  const tol = shapeTolerance(ctx),
    k = deviceScale(ctx);
  const paint = (s: ShapeDrawable) => {
    const o = shapeOutline(s, w, h, tol);
    if (!o.contours.length) return;
    m.save();
    m.fillStyle = "#fff";
    const blur = s.fill.feather * w;
    if (blur * k > 0.5) {
      const far = 100000 / k;
      m.shadowColor = "#fff";
      m.shadowBlur = blur * k;
      m.shadowOffsetX = far * k;
      m.translate(-far, 0);
    }
    m.beginPath();
    traceOutline(m, o, w, h);
    m.fill("nonzero");
    m.restore();
  };
  for (const s of reveals) paint(s);
  m.globalCompositeOperation = "destination-out";
  for (const s of hides) paint(s);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}

// ---- previews --------------------------------------------------------------------------------
/** A small preview of a look (for the styles list): a rounded room shape. */
export function shapeLookPreview(
  look: ShapeLook,
  widthPx = 64,
  heightPx = 44,
  onReady?: () => void,
): HTMLCanvasElement {
  const c = document.createElement("canvas"),
    dpr =
      typeof window !== "undefined"
        ? Math.min(2, window.devicePixelRatio || 1)
        : 1;
  c.width = Math.round(widthPx * dpr);
  c.height = Math.round(heightPx * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  // The look as on a 600 px map, kept within the swatch.
  const m = 600,
    pad = 6 / m,
    nodes = [
      { x: pad, y: pad },
      { x: widthPx / m - pad, y: pad },
      { x: widthPx / m - pad, y: heightPx / m - pad },
      { x: pad, y: heightPx / m - pad },
    ];
  const shape: ShapeDrawable = {
    parts: [{ id: "p", op: "add", nodes }],
    portals: [],
    frame: { x: 0, y: 0, rot: 0, scale: 1 },
    stroke: {
      ...look.stroke,
      color: {
        ...look.stroke.color,
        width: Math.min(look.stroke.color.width, 4 / m),
      },
      stamp: {
        ...look.stroke.stamp,
        size: Math.min(look.stroke.stamp.size, 9 / m),
      },
    },
    fill: look.fill,
  };
  ctx.globalAlpha = look.opacity;
  if (look.fill.type === "mask") {
    // A mask: a checkerboard window in a dashed frame.
    ctx.save();
    ctx.beginPath();
    ctx.rect(6, 6, widthPx - 12, heightPx - 12);
    ctx.clip();
    for (let y = 0; y < heightPx; y += 6)
      for (let x = 0; x < widthPx; x += 6) {
        ctx.fillStyle = (x + y) % 12 ? "#d8dde2" : "#9aa3ab";
        ctx.fillRect(x, y, 6, 6);
      }
    ctx.restore();
    ctx.setLineDash([3, 2]);
    ctx.strokeStyle = "#f2a65a";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(6, 6, widthPx - 12, heightPx - 12);
    ctx.setLineDash([]);
  }
  drawShape(ctx, shape, m, m, "all", onReady);
  return c;
}
