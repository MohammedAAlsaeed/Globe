/**
 * Draws lines onto a canvas — the same function for the editor (via the
 * Konva LineShape), thumbnails, previews and full-resolution prints.
 *
 *   Color  the path is traced as true vector Bézier curves, so it stays
 *          sharp at any zoom or print size; dashes are measured in stroke
 *          widths (a dashed road keeps its rhythm when widened); a casing
 *          (outline) is drawn underneath; blur softens the edge.
 *   Stamp  pieces are laid out by arc length (./distribute) and drawn from
 *          the stamp rasters (../stamps/render), requested at the size
 *          they'll really appear on the device — so a print gets crisp art.
 *
 * Layouts are cached per line object and size: a map of hundreds of walls
 * only re-lays out the one being edited.
 */
import { stampRaster } from "../stamps/render";
import type { LineColorStroke, MMLine } from "../types";
import { flatten, sharpNodes, type LineNode, type Polyline, type Vec } from "./geometry";
import { layoutPieces, type Placement } from "./distribute";
import { pieceAspect } from "./catalog";

/** What drawing a line needs (an MMLine, or a draft being drawn). */
export type Drawable = Pick<MMLine, "nodes" | "closed" | "mode" | "stroke" | "stamp">;

/** Traces the Bézier path into the current canvas path, in pixels. */
export function tracePath(ctx: CanvasRenderingContext2D, nodes: LineNode[], closed: boolean, w: number, h: number) {
  const n = nodes.length;
  if (!n) return;
  ctx.moveTo(nodes[0].x * w, nodes[0].y * h);
  const last = closed && n > 2 ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = nodes[i],
      b = nodes[(i + 1) % n];
    if (!a.ho && !b.hi) ctx.lineTo(b.x * w, b.y * h);
    else
      ctx.bezierCurveTo(
        (a.x + (a.ho?.x ?? 0)) * w,
        (a.y + (a.ho?.y ?? 0)) * h,
        (b.x + (b.hi?.x ?? 0)) * w,
        (b.y + (b.hi?.y ?? 0)) * h,
        b.x * w,
        b.y * h,
      );
  }
  if (closed && n > 2) ctx.closePath();
}

/** The dash array (pixels) for a pattern at a stroke width. */
export function dashArray(s: LineColorStroke, widthPx: number): number[] {
  const d = Math.max(0.1, s.dash) * widthPx,
    g = Math.max(0.1, s.gap) * widthPx,
    dot = 0.001;
  switch (s.pattern) {
    case "dashed":
    case "custom":
      return [d, g];
    case "dotted":
      // Zero-length dashes with round caps are dots; the gap is measured
      // between dot edges, so add one width for centre-to-centre spacing.
      return [dot, g + widthPx];
    case "dashdot":
      return [d, g, dot, g + (s.cap === "butt" ? 0 : widthPx)];
    default:
      return [];
  }
}

/** How much a canvas transform scales (device pixels per drawing unit). */
export function deviceScale(ctx: CanvasRenderingContext2D) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

/** One stroke pass, optionally blurred (shadow trick: drawn off to the side,
 * only its blurred shadow lands in place — works in every browser). */
function strokePass(ctx: CanvasRenderingContext2D, line: Drawable, w: number, h: number, color: string, width: number, dash: number[], cap: CanvasLineCap, blurPx: number) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = line.stroke.join;
  ctx.miterLimit = 4;
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  if (blurPx > 0.3) {
    const k = deviceScale(ctx),
      far = 100000 / k;
    ctx.shadowColor = color;
    ctx.shadowBlur = blurPx * k;
    ctx.shadowOffsetX = far * k;
    ctx.translate(-far, 0);
  }
  ctx.beginPath();
  tracePath(ctx, line.nodes, line.closed, w, h);
  ctx.stroke();
  ctx.restore();
}

export function drawColorLine(ctx: CanvasRenderingContext2D, line: Drawable, w: number, h: number) {
  const s = line.stroke,
    width = Math.max(0.35, s.width * w),
    blurPx = s.blur * width * 0.9,
    // Dots need round caps whatever the cap setting.
    cap: CanvasLineCap = s.pattern === "dotted" ? "round" : s.cap;
  if (s.casing > 0) strokePass(ctx, line, w, h, s.casingColor, width + 2 * s.casing * w, [], s.pattern === "solid" ? cap : "butt", blurPx);
  strokePass(ctx, line, w, h, s.color, width, dashArray(s, width), cap, blurPx);
}

// ---- stamp strokes -----------------------------------------------------------------
interface Layout {
  w: number;
  h: number;
  key: string;
  pieces: Placement[];
}
const layouts = new WeakMap<object, Layout>();
const MAX_PIECES = 4000;

/** Flattens a line (cached per object and size). */
const polys = new WeakMap<object, { w: number; h: number; poly: Polyline }>();
export function linePoly(line: Drawable, w: number, h: number): Polyline {
  const hit = polys.get(line);
  if (hit && hit.w === w && hit.h === h) return hit.poly;
  const poly = flatten(line.nodes, line.closed, w, h, 0.35);
  polys.set(line, { w, h, poly });
  return poly;
}

/** Where every piece of a Stamp Stroke goes at this size (cached). */
export function stampLayout(line: Drawable, w: number, h: number): Placement[] {
  const st = line.stamp,
    aspect = (k: string | null | undefined) => (k ? pieceAspect(k) : null),
    segAspect = aspect(st.parts.seg[0]) ?? 3,
    // The key changes when an uploaded piece finishes loading (its aspect becomes known).
    key = `${segAspect}|${aspect(st.parts.start)}|${aspect(st.parts.end)}|${aspect(st.parts.corner)}`;
  const hit = layouts.get(line);
  if (hit && hit.w === w && hit.h === h && hit.key === key) return hit.pieces;
  const thick = st.size * w,
    len = (k: string | null | undefined) => {
      const a = aspect(k);
      return a ? a * thick : 0;
    };
  const poly = linePoly(line, w, h);
  const pieces = layoutPieces(poly, {
    pieceLen: segAspect * thick,
    thick,
    spacing: st.spacing,
    fit: st.fit,
    corners: st.corners,
    cornerAt: st.corners === "split" ? sharpNodes(line.nodes, line.closed, w, h).map((i) => poly.nodeAt[i]) : [],
    startLen: st.caps ? len(st.parts.start) : 0,
    endLen: st.caps ? len(st.parts.end) : 0,
    cornerLen: len(st.parts.corner),
    followPath: st.followPath,
    rotation: (st.rotation * Math.PI) / 180,
    offset: st.offset,
    flip: st.flip,
    scaleJitter: st.scaleJitter,
    rotationJitter: st.rotationJitter,
    variants: st.parts.seg.length,
    anchor: st.anchor,
    seed: st.seed,
    max: MAX_PIECES,
  });
  layouts.set(line, { w, h, key, pieces });
  return pieces;
}

const colors = { hue: 0, saturation: 0, brightness: 0, contrast: 0 };
export function drawStampLine(ctx: CanvasRenderingContext2D, line: Drawable, w: number, h: number, onReady?: () => void) {
  const st = line.stamp,
    k = deviceScale(ctx),
    pieces = stampLayout(line, w, h);
  for (const p of pieces) {
    const asset =
      p.role === "seg" ? st.parts.seg[p.variant % st.parts.seg.length] : p.role === "start" ? st.parts.start : p.role === "end" ? st.parts.end : st.parts.corner;
    if (!asset) continue;
    const aspect = pieceAspect(asset) ?? 1,
      // Pieces that follow the path are stretched end to end; upright ones
      // (trees, rocks) keep their own proportions.
      // Path-following pieces overlap their neighbours a hair (art boxes
      // include the outline's round ends), so walls never show seams.
      drawLen = st.followPath && p.role === "seg" ? p.len * 1.04 + 1 / k : p.thick * aspect;
    const img = stampRaster({ asset, ink: st.ink, fill: st.fill, ...colors }, drawLen * k, onReady);
    if (!img) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (p.flip) ctx.scale(1, -1);
    ctx.drawImage(img, -drawLen / 2, -p.thick / 2, drawLen, p.thick);
    ctx.restore();
  }
}

/** Draws a whole line (opacity and blend are applied by the caller / node). */
export function drawLine(ctx: CanvasRenderingContext2D, line: Drawable, w: number, h: number, onReady?: () => void) {
  if (line.nodes.length < 2) return;
  if (line.mode === "stamp") drawStampLine(ctx, line, w, h, onReady);
  else drawColorLine(ctx, line, w, h);
}

/** How far a line's paint reaches beyond its path, pixels (for bounds/hits). */
export function lineReach(line: Drawable, w: number) {
  if (line.mode === "stamp") return (line.stamp.size * w * (1 + Math.abs(line.stamp.offset)) * (line.stamp.anchor === "base" ? 2 : 1)) / 2 + 1;
  const s = line.stroke;
  return (s.width * w) / 2 + s.casing * w + s.blur * s.width * w + 1;
}

/** Distance from a pixel point to the drawn path (for picking). */
export function distanceToLine(line: Drawable, w: number, h: number, p: Vec) {
  const poly = linePoly(line, w, h);
  let best = Infinity;
  for (let i = 0; i + 3 < poly.xy.length; i += 2) {
    const ax = poly.xy[i],
      ay = poly.xy[i + 1],
      bx = poly.xy[i + 2],
      by = poly.xy[i + 3],
      dx = bx - ax,
      dy = by - ay,
      l2 = dx * dx + dy * dy,
      t = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y));
  }
  return best;
}

/** A small preview of a look (for the styles list): a gentle S-curve. */
export function lookPreview(line: Omit<Drawable, "nodes" | "closed">, widthPx = 120, heightPx = 36, onReady?: () => void): HTMLCanvasElement {
  const c = document.createElement("canvas"),
    dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  c.width = Math.round(widthPx * dpr);
  c.height = Math.round(heightPx * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  // Thickness as it would be on a 900 px map, kept within the swatch; the
  // "map" is then sized so the look renders exactly that thick.
  const frac =
      line.mode === "stamp" ? line.stamp.size * (line.stamp.anchor === "base" ? 2 : 1) * (1 + Math.abs(line.stamp.offset)) : line.stroke.width + line.stroke.casing * 2,
    thickPx = Math.max(2, Math.min(heightPx * 0.55, frac * 900)),
    m = thickPx / Math.max(1e-6, frac),
    px = (x: number, y: number) => ({ x: x / m, y: y / m });
  const nodes: LineNode[] = [
    { ...px(8, heightPx * 0.62), ho: px(widthPx * 0.22, -heightPx * 0.5) },
    { ...px(widthPx - 8, heightPx * 0.38), hi: px(-widthPx * 0.22, heightPx * 0.5) },
  ];
  drawLine(ctx, { ...line, nodes, closed: false }, m, m, onReady);
  return c;
}
