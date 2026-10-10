/**
 * The brush engine: turns a paint object's recipe (./types MMPaint) into
 * pixels at any resolution.
 *
 * Pipeline for every paint object:
 *   1. **Mask** — an alpha canvas of *where* paint goes: stamped dabs (Free),
 *      a filled outline (Rect / Ellipse / Polygon, optionally with a natural
 *      coastline edge), or filled cells (Grid Block); feather softens its edge.
 *   2. **Source** — the flat color or the seamless texture (anchored to the
 *      map origin, so neighbouring strokes of one texture line up perfectly),
 *      after Hue / Saturation / Brightness / Contrast.
 * The result is drawn with the object's opacity and blend mode (destination-
 * out for the eraser) inside its own layer. Coastline decoration is not a
 * brush concern: it belongs to the land layer (./coastfx.ts).
 *
 * The shape geometry and the dab walker are shared with the Land tool
 * (./land.ts), so a land shape and a paint shape drawn alike match exactly.
 *
 * Coordinates: data is normalized (x ∈ [0,1] of width, y ∈ [0,1] of height);
 * the engine works internally in "map units" (both axes in fractions of map
 * width) so every length — dab size, spacing, jitter, coastline — is
 * resolution-independent and the same random choices are made at every scale.
 */
import {
  coastline,
  ellipsePolygon,
  hexCorners,
  hexCellAt,
  type Vec,
} from "./coast";
import { DEFAULT_EDGE_SETTINGS } from "./presets";
import { mulberry32 } from "./noise";
import {
  TEXTURE_BASE_PX,
  filterHex,
  textureTile,
  tileLevelFor,
} from "./textures";
import { blurInto, tipCanvas } from "./tips";
import type {
  BrushSettings,
  GridSettings,
  MMPaint,
  NaturalEdge,
  PaintPoint,
  PaintSource,
} from "../types";

/** Display width that texture sizes / effect strengths were tuned at. */
export const PAINT_REF_WIDTH = 900;
/** Smallest dab spacing, in map units (keeps tiny brushes affordable). */
const MIN_SPACING = 0.00035;

export interface RenderedPaint {
  canvas: HTMLCanvasElement;
  /** Top-left of the raster, in stage pixels at the rendered width. */
  x: number;
  y: number;
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---- free-brush dab walker -----------------------------------------------------
export interface Dab {
  x: number;
  y: number;
  /** Diameter, map units. */
  size: number;
  alpha: number;
  /** Degrees. */
  angle: number;
}

/**
 * Walks a stream of samples and emits evenly spaced dabs. Used identically by
 * the live preview (fed sample by sample) and the final render (fed all at
 * once), so what you draw is exactly what gets committed.
 */
export class DabWalker {
  private rng: () => number;
  private last: (Vec & { p: number }) | null = null;
  private toNext = 0;
  constructor(
    private brush: BrushSettings,
    seed: number,
    private aspect: number,
  ) {
    this.rng = mulberry32(seed);
  }
  private pressure(p: number | undefined) {
    return this.brush.pen.enabled && p !== undefined
      ? Math.max(0, Math.min(1, p))
      : 1;
  }
  private baseSize(p: number) {
    return (
      this.brush.size *
      (this.brush.pen.enabled && this.brush.pen.size ? 0.12 + 0.88 * p : 1)
    );
  }
  private emit(x: number, y: number, p: number, out: Dab[]) {
    const b = this.brush,
      r1 = this.rng(),
      r2 = this.rng(),
      r3 = this.rng(),
      r4 = this.rng(),
      r5 = this.rng(),
      size = this.baseSize(p) * (1 - b.sizeJitter * r1),
      pen = b.pen.enabled;
    out.push({
      x: x + (r4 * 2 - 1) * b.scatter * size,
      y: y + (r5 * 2 - 1) * b.scatter * size,
      size,
      alpha:
        b.flow *
        (pen && b.pen.flow ? p : 1) *
        (pen && b.pen.opacity ? 0.15 + 0.85 * p : 1) *
        (1 - b.opacityJitter * r2),
      angle: b.rotation + (r3 * 2 - 1) * 180 * b.rotationJitter,
    });
  }
  /** Feeds one normalized sample; returns the dabs it produced. */
  feed(pt: PaintPoint): Dab[] {
    const out: Dab[] = [],
      cur = { x: pt.x, y: pt.y * this.aspect, p: this.pressure(pt.p) };
    if (!this.last) {
      this.emit(cur.x, cur.y, cur.p, out);
      this.last = cur;
      this.toNext = Math.max(
        MIN_SPACING,
        this.brush.spacing * this.baseSize(cur.p),
      );
      return out;
    }
    const a = this.last,
      dx = cur.x - a.x,
      dy = cur.y - a.y,
      len = Math.hypot(dx, dy);
    let t = 0;
    while (len > 0 && t + this.toNext <= len) {
      t += this.toNext;
      const k = t / len,
        p = a.p + (cur.p - a.p) * k;
      this.emit(a.x + dx * k, a.y + dy * k, p, out);
      this.toNext = Math.max(
        MIN_SPACING,
        this.brush.spacing * this.baseSize(p),
      );
    }
    this.toNext -= len - t;
    this.last = cur;
    return out;
  }
}

/** Stamps dabs into an alpha mask whose top-left sits at (ox, oy) stage px. */
export function drawDabs(
  ctx: CanvasRenderingContext2D,
  dabs: Dab[],
  brush: BrushSettings,
  W: number,
  ox: number,
  oy: number,
) {
  const tip = brush.tip,
    tipImg = tip === "round" ? null : tipCanvas(tip, brush.softness),
    hard = 1 - brush.softness;
  for (const d of dabs) {
    const r = Math.max(0.35, (d.size * W) / 2),
      x = d.x * W - ox,
      y = d.y * W - oy;
    ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha));
    if (!tipImg) {
      // Round tip: a radial gradient is crisp at any size and softness.
      if (hard >= 0.98 || r < 1.2) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(x, y, r * hard * 0.95, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.5, "rgba(255,255,255,0.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.save();
      ctx.translate(x, y);
      if (d.angle) ctx.rotate((d.angle * Math.PI) / 180);
      ctx.drawImage(tipImg, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ---- source fill -------------------------------------------------------------------
/** Fills (0,0,w,h) of `ctx` — whose top-left is stage px (ox, oy) — with the
 * paint source, texture anchored to the map origin. */
export function fillSource(
  ctx: CanvasRenderingContext2D,
  source: PaintSource,
  W: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
) {
  if (source.type === "color") {
    ctx.fillStyle = filterHex(source.color, source);
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const pxPerTile =
      TEXTURE_BASE_PX * source.textureScale * (W / PAINT_REF_WIDTH),
    level = tileLevelFor(pxPerTile),
    tile = textureTile(source.texture, level, source),
    pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  const k = pxPerTile / tile.width;
  pattern.setTransform(
    new DOMMatrix().translate(-ox, -oy).rotate(source.textureRotation).scale(k),
  );
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
}

// ---- shape geometry ------------------------------------------------------------
/** The geometry of any filled shape — a paint shape or a land shape. */
export interface ShapeGeometry {
  /** "edge" (natural lasso), "rect", "ellipse", "polygon" or "grid". */
  mode: string;
  points: PaintPoint[];
  seed: number;
  /** Rect/Ellipse/Polygon: natural, coastline-style edge. */
  rough?: boolean;
  edge?: NaturalEdge;
  cells?: [number, number][];
  grid?: GridSettings;
}

/** The closed outline(s) of a shape, in map units. `fast` (live previews)
 * omits only the finest fractal levels; the shape itself is the same. */
export function shapePolygons(
  g: ShapeGeometry,
  aspect: number,
  fast = false,
): Vec[][] {
  const pts = g.points.map((p) => ({ x: p.x, y: p.y * aspect }));
  const edge = g.edge ?? DEFAULT_EDGE_SETTINGS;
  const natural = (poly: Vec[]) => [
    coastline(poly, {
      roughness: edge.roughness,
      detail: edge.detail,
      seed: g.seed,
      maxLevels: fast ? 3 : 6,
    }),
  ];
  switch (g.mode) {
    case "edge":
      return pts.length >= 3 ? natural(pts) : [];
    case "rect": {
      if (pts.length < 2) return [];
      const [a, b] = pts,
        poly = [
          { x: a.x, y: a.y },
          { x: b.x, y: a.y },
          { x: b.x, y: b.y },
          { x: a.x, y: b.y },
        ];
      return g.rough ? natural(poly) : [poly];
    }
    case "ellipse": {
      if (pts.length < 2) return [];
      const [a, b] = pts,
        poly = ellipsePolygon(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          Math.abs(b.x - a.x) / 2,
          Math.abs(b.y - a.y) / 2,
        );
      return g.rough ? natural(poly) : [poly];
    }
    case "polygon":
      return pts.length >= 3 ? (g.rough ? natural(pts) : [pts]) : [];
    case "grid": {
      const grid = g.grid ?? { type: "square", cell: 0.025 };
      return (g.cells ?? []).map(([c, r]) =>
        grid.type === "hex"
          ? hexCorners(c, r, grid.cell)
          : [
              { x: c * grid.cell, y: r * grid.cell },
              { x: (c + 1) * grid.cell, y: r * grid.cell },
              { x: (c + 1) * grid.cell, y: (r + 1) * grid.cell },
              { x: c * grid.cell, y: (r + 1) * grid.cell },
            ],
      );
    }
    default:
      return [];
  }
}

/** Grid cell under a normalized point. */
export function gridCellAt(
  x: number,
  y: number,
  grid: GridSettings,
  aspect: number,
): [number, number] {
  const mx = x,
    my = y * aspect;
  return grid.type === "hex"
    ? hexCellAt(mx, my, grid.cell)
    : [Math.floor(mx / grid.cell), Math.floor(my / grid.cell)];
}

function tracePolys(
  ctx: CanvasRenderingContext2D,
  polys: Vec[][],
  W: number,
  ox: number,
  oy: number,
) {
  ctx.beginPath();
  for (const poly of polys) {
    poly.forEach((p, i) =>
      i
        ? ctx.lineTo(p.x * W - ox, p.y * W - oy)
        : ctx.moveTo(p.x * W - ox, p.y * W - oy),
    );
    ctx.closePath();
  }
}

// ---- rendering -------------------------------------------------------------------
/** Renders a paint object at stage width W / height H. Null when empty.
 * `fast` is for live previews (coarser natural edges, same shape). */
export function renderPaint(
  o: MMPaint,
  W: number,
  H: number,
  fast = false,
): RenderedPaint | null {
  const aspect = H / W;
  const mask =
    o.mode === "free"
      ? o.brush
        ? strokeMask(o.points, o.brush, o.seed, W, aspect)
        : null
      : shapeMask(o, W, aspect, fast, (o.edge?.feather ?? 0) * W);
  return (
    mask && {
      ...mask,
      canvas: colorize(
        mask.canvas,
        o.erase ? null : o.source,
        W,
        mask.x,
        mask.y,
      ),
    }
  );
}

/** Alpha mask of a free stroke: the dabs, cropped to their bounds. */
export function strokeMask(
  points: PaintPoint[],
  brush: BrushSettings,
  seed: number,
  W: number,
  aspect: number,
): RenderedPaint | null {
  if (!points.length) return null;
  const walker = new DabWalker(brush, seed, aspect),
    dabs: Dab[] = [];
  for (const p of points) dabs.push(...walker.feed(p));
  if (!dabs.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const d of dabs) {
    const r = d.size / 2;
    x0 = Math.min(x0, d.x - r);
    y0 = Math.min(y0, d.y - r);
    x1 = Math.max(x1, d.x + r);
    y1 = Math.max(y1, d.y + r);
  }
  const ox = Math.floor(x0 * W) - 2,
    oy = Math.floor(y0 * W) - 2,
    w = Math.ceil(x1 * W) + 2 - ox,
    h = Math.ceil(y1 * W) + 2 - oy;
  const mask = makeCanvas(w, h);
  drawDabs(mask.getContext("2d")!, dabs, brush, W, ox, oy);
  return { canvas: mask, x: ox, y: oy };
}

/** Alpha mask of a filled shape, cropped to its bounds; `feather` (px)
 * softens its edge. */
export function shapeMask(
  g: ShapeGeometry,
  W: number,
  aspect: number,
  fast: boolean,
  feather = 0,
): RenderedPaint | null {
  const polys = shapePolygons(g, aspect, fast).filter((p) => p.length >= 3);
  if (!polys.length) return null;
  const margin = Math.ceil(Math.max(0, feather) * 2 + 4);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const poly of polys)
    for (const p of poly) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const ox = Math.floor(x0 * W) - margin,
    oy = Math.floor(y0 * W) - margin,
    w = Math.ceil(x1 * W) + margin - ox,
    h = Math.ceil(y1 * W) + margin - oy;
  const hard = makeCanvas(w, h),
    hctx = hard.getContext("2d")!;
  hctx.fillStyle = "#fff";
  tracePolys(hctx, polys, W, ox, oy);
  hctx.fill("nonzero");
  if (feather < 0.5) return { canvas: hard, x: ox, y: oy };
  const soft = makeCanvas(w, h);
  blurInto(soft.getContext("2d")!, hard, feather);
  return { canvas: soft, x: ox, y: oy };
}

/** How a paint object is composited onto what's beneath it. */
export function paintCompositeOp(
  o: Pick<MMPaint, "erase" | "blend">,
): GlobalCompositeOperation {
  return o.erase
    ? "destination-out"
    : o.blend === "normal"
      ? "source-over"
      : o.blend;
}

/** The source clipped to `mask` (whose top-left is stage px ox, oy). With no
 * source the mask itself is returned — what an eraser draws. */
export function colorize(
  mask: HTMLCanvasElement,
  source: PaintSource | null,
  W: number,
  ox: number,
  oy: number,
) {
  if (!source) return mask;
  const out = makeCanvas(mask.width, mask.height),
    ctx = out.getContext("2d")!;
  fillSource(ctx, source, W, ox, oy, out.width, out.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  return out;
}

// ---- live free-brush stroke --------------------------------------------------------
/** What a live stroke is painted with: a brush, and a source (null = the
 * bare mask, as erasers draw it). */
export interface StrokeStyle {
  brush: BrushSettings;
  source: PaintSource | null;
  seed: number;
}

/**
 * The in-progress free stroke (Brush or Land tool): dabs are stamped
 * incrementally into a full-stage mask as samples arrive (no re-render of
 * earlier dabs), and the visible canvas is recomposited at most once per
 * frame.
 */
export class LiveStroke {
  readonly canvas: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private walker: DabWalker;
  constructor(
    private o: StrokeStyle,
    private W: number,
    H: number,
  ) {
    this.canvas = makeCanvas(W, H);
    this.mask = makeCanvas(W, H);
    this.mctx = this.mask.getContext("2d")!;
    this.walker = new DabWalker(o.brush, o.seed, H / W);
  }
  add(pt: PaintPoint) {
    const dabs = this.walker.feed(pt);
    if (dabs.length) drawDabs(this.mctx, dabs, this.o.brush, this.W, 0, 0);
  }
  compose() {
    const ctx = this.canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "copy";
    if (!this.o.source) {
      ctx.drawImage(this.mask, 0, 0);
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fillSource(
      ctx,
      this.o.source,
      this.W,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}

// ---- preview thumbnails -------------------------------------------------------------
const previewCache = new Map<string, string>();
/** A small S-curve stroke rendered with the real engine, for preset lists. */
export function brushPreview(
  brush: BrushSettings,
  source: PaintSource,
  width = 132,
  height = 36,
) {
  const key = JSON.stringify([brush, source, width, height]);
  const hit = previewCache.get(key);
  if (hit) return hit;
  const pts: PaintPoint[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push({
      x: 0.1 + t * 0.8,
      y: 0.5 + Math.sin(t * Math.PI * 2) * 0.26,
      p: 0.35 + 0.65 * Math.sin(t * Math.PI),
    });
  }
  const size = Math.min(0.13, Math.max(0.03, brush.size * 6)),
    o: MMPaint = {
      id: "preview",
      kind: "paint",
      mode: "free",
      erase: false,
      blend: "normal",
      opacity: 1,
      source,
      points: pts,
      brush: { ...brush, size },
      seed: 7,
    };
  const r = renderPaint(o, width, height),
    c = makeCanvas(width, height);
  if (r) c.getContext("2d")!.drawImage(r.canvas, r.x, r.y);
  const url = c.toDataURL("image/png");
  if (previewCache.size > 80) previewCache.clear();
  previewCache.set(key, url);
  return url;
}
