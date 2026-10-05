/**
 * The brush engine: turns a paint object's recipe (./types MMPaint) into
 * pixels at any resolution.
 *
 * Pipeline for every paint object:
 *   1. **Mask** — an alpha canvas of *where* paint goes: stamped dabs (Free),
 *      a filled outline (Edge Shape / Rect / Ellipse / Polygon, optionally
 *      with a natural coastline edge), or filled cells (Grid Block); feather
 *      softens its edge.
 *   2. **Source** — the flat color or the seamless texture (anchored to the
 *      map origin, so neighbouring strokes of one texture line up perfectly),
 *      after Hue / Saturation / Brightness / Contrast.
 *   3. **Decoration** (Edge Shape) — coastline ripple lines outside, depth or
 *      shallows shading inside, and an ink outline on top.
 * The result is drawn by Konva with the object's opacity and blend mode
 * (destination-out for the eraser) inside its own layer.
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
  islets,
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
  EdgeSettings,
  GridSettings,
  MMPaint,
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

function makeCanvas(w: number, h: number) {
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

// ---- geometry of a paint object -------------------------------------------------
/** The closed outline(s) of a non-free paint object, in map units. */
export function paintPolygons(
  o: MMPaint,
  aspect: number,
  fast = false,
): Vec[][] {
  const pts = o.points.map((p) => ({ x: p.x, y: p.y * aspect }));
  const edge = o.edge ?? DEFAULT_EDGE_SETTINGS;
  const opts = {
    roughness: edge.roughness,
    detail: edge.detail,
    seed: o.seed,
    maxLevels: fast ? 3 : 6,
  };
  // The natural edge, plus any islets scattered off it.
  const natural = (poly: Vec[]) => {
    const main = coastline(poly, opts);
    return edge.islets > 0 && !o.erase && !fast
      ? [main, ...islets(main, edge.islets, opts)]
      : [main];
  };
  switch (o.mode) {
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
      return o.rough ? natural(poly) : [poly];
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
      return o.rough ? natural(poly) : [poly];
    }
    case "polygon":
      return pts.length >= 3 ? (o.rough ? natural(pts) : [pts]) : [];
    case "grid": {
      const g = o.grid ?? { type: "square", cell: 0.025 };
      return (o.cells ?? []).map(([c, r]) =>
        g.type === "hex"
          ? hexCorners(c, r, g.cell)
          : [
              { x: c * g.cell, y: r * g.cell },
              { x: (c + 1) * g.cell, y: r * g.cell },
              { x: (c + 1) * g.cell, y: (r + 1) * g.cell },
              { x: c * g.cell, y: (r + 1) * g.cell },
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
 * `fast` (live previews while dragging) skips the costlier edge decoration
 * — glow, ripples, shore and shading — but keeps the exact same geometry. */
export function renderPaint(
  o: MMPaint,
  W: number,
  H: number,
  fast = false,
): RenderedPaint | null {
  const aspect = H / W;
  return o.mode === "free"
    ? renderFree(o, W, aspect)
    : renderShape(o, W, aspect, fast);
}

function renderFree(
  o: MMPaint,
  W: number,
  aspect: number,
): RenderedPaint | null {
  const brush = o.brush;
  if (!brush || !o.points.length) return null;
  const walker = new DabWalker(brush, o.seed, aspect),
    dabs: Dab[] = [];
  for (const p of o.points) dabs.push(...walker.feed(p));
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
  return { canvas: colorize(mask, o, W, ox, oy), x: ox, y: oy };
}

/** Source (or plain white for the eraser) clipped to the mask. */
function colorize(
  mask: HTMLCanvasElement,
  o: MMPaint,
  W: number,
  ox: number,
  oy: number,
) {
  if (o.erase) return mask;
  const out = makeCanvas(mask.width, mask.height),
    ctx = out.getContext("2d")!;
  fillSource(ctx, o.source, W, ox, oy, out.width, out.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  return out;
}

function renderShape(
  o: MMPaint,
  W: number,
  aspect: number,
  fast: boolean,
): RenderedPaint | null {
  const polys = paintPolygons(o, aspect, fast).filter((p) => p.length >= 3);
  if (!polys.length) return null;
  const edge = { ...DEFAULT_EDGE_SETTINGS, ...o.edge },
    decorate = !o.erase && (o.mode === "edge" || !!o.rough),
    rich = decorate && !fast,
    feather = Math.max(0, edge.feather * W),
    outline = decorate ? edge.outlineWidth * W : 0,
    ripples = rich ? Math.round(edge.ripples) : 0,
    rippleGap = edge.rippleSpacing * W,
    glow = rich && edge.glowOpacity > 0 ? edge.glowWidth * W : 0,
    margin = Math.ceil(
      feather * 2 + outline + ripples * rippleGap + glow * 2.5 + 4,
    );
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

  // 1. mask (hard shape, then feathered)
  const hardMask = makeCanvas(w, h),
    hctx = hardMask.getContext("2d")!;
  hctx.fillStyle = "#fff";
  tracePolys(hctx, polys, W, ox, oy);
  hctx.fill("nonzero");
  let mask = hardMask;
  if (feather >= 0.5) {
    mask = makeCanvas(w, h);
    blurInto(mask.getContext("2d")!, hardMask, feather);
  }
  if (o.erase) return { canvas: mask, x: ox, y: oy };

  // 2. the filled body: source, inner shading, clipped to the mask
  const body = makeCanvas(w, h),
    bctx = body.getContext("2d")!;
  fillSource(bctx, o.source, W, ox, oy, w, h);
  if (rich && edge.shoreColor && edge.shoreStrength > 0)
    innerBand(
      bctx,
      polys,
      edge.shoreColor,
      edge.shoreStrength,
      edge.shoreWidth * W,
      W,
      ox,
      oy,
      w,
      h,
    );
  if (rich && edge.innerShade !== 0)
    innerBand(
      bctx,
      polys,
      edge.innerShade > 0 ? "#120c06" : "#fffffa",
      Math.min(1, Math.abs(edge.innerShade)) *
        (edge.innerShade > 0 ? 0.85 : 0.9),
      edge.innerShadeWidth * W,
      W,
      ox,
      oy,
      w,
      h,
    );
  bctx.globalCompositeOperation = "destination-in";
  bctx.drawImage(mask, 0, 0);
  if (!decorate) return { canvas: body, x: ox, y: oy };

  // 3. decoration: glow and ripples beneath, body, ink outline on top
  const out = makeCanvas(w, h),
    octx = out.getContext("2d")!;
  if (glow >= 0.5)
    outerGlow(
      octx,
      polys,
      edge.glowColor,
      edge.glowOpacity,
      glow,
      W,
      ox,
      oy,
      w,
      h,
    );
  if (ripples > 0) drawRipples(octx, polys, edge, W, ox, oy, w, h);
  octx.drawImage(body, 0, 0);
  if (outline >= 0.3) {
    octx.save();
    octx.lineJoin = "round";
    octx.lineCap = "round";
    octx.lineWidth = Math.max(0.6, outline);
    octx.strokeStyle = edge.outlineColor;
    tracePolys(octx, polys, W, ox, oy);
    octx.stroke();
    octx.restore();
  }
  return { canvas: out, x: ox, y: oy };
}

/** A soft band of `color` just inside the edge (depth shading, a shallows
 * highlight, a sandy beach): the outline is stroked wide, blurred, and
 * clipped to the shape — solid at the shore, fading smoothly inland. */
function innerBand(
  ctx: CanvasRenderingContext2D,
  polys: Vec[][],
  color: string,
  strength: number,
  width: number,
  W: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
) {
  if (width < 0.5 || strength <= 0) return;
  const band = makeCanvas(w, h),
    bctx = band.getContext("2d")!;
  bctx.lineJoin = "round";
  bctx.strokeStyle = "#fff";
  bctx.lineWidth = width * 1.3;
  tracePolys(bctx, polys, W, ox, oy);
  bctx.stroke();
  const soft = makeCanvas(w, h);
  blurInto(soft.getContext("2d")!, band, width * 0.6, 0, 0, color);
  ctx.save();
  tracePolys(ctx, polys, W, ox, oy);
  ctx.clip();
  ctx.globalAlpha = Math.min(1, strength);
  ctx.drawImage(soft, 0, 0);
  ctx.restore();
}

/** Soft halo just outside the shape (e.g. light shallow water round land):
 * the shape is dilated by stroking its outline, then blurred. */
function outerGlow(
  ctx: CanvasRenderingContext2D,
  polys: Vec[][],
  color: string,
  opacity: number,
  width: number,
  W: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
) {
  const g = makeCanvas(w, h),
    gctx = g.getContext("2d")!;
  gctx.fillStyle = gctx.strokeStyle = "#fff";
  gctx.lineJoin = "round";
  gctx.lineWidth = width;
  tracePolys(gctx, polys, W, ox, oy);
  gctx.fill("nonzero");
  gctx.stroke();
  ctx.globalAlpha = Math.min(1, opacity);
  blurInto(ctx, g, width * 0.8, 0, 0, color);
  ctx.globalAlpha = 1;
}

/** Concentric coastline ripple lines outside the shape: each one is the
 * outline offset outward (round joins smooth them progressively), fading
 * with distance from the shore. */
function drawRipples(
  ctx: CanvasRenderingContext2D,
  polys: Vec[][],
  edge: EdgeSettings,
  W: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
) {
  const n = Math.round(edge.ripples),
    gap = edge.rippleSpacing * W,
    line = Math.max(0.8, Math.min(gap * 0.32, W * 0.0011));
  for (let i = 1; i <= n; i++) {
    const ring = makeCanvas(w, h),
      rctx = ring.getContext("2d")!,
      d = gap * i;
    rctx.lineJoin = "round";
    rctx.strokeStyle = edge.rippleColor;
    tracePolys(rctx, polys, W, ox, oy);
    rctx.lineWidth = 2 * d + line;
    rctx.stroke();
    rctx.globalCompositeOperation = "destination-out";
    rctx.lineWidth = Math.max(0.1, 2 * d - line);
    rctx.stroke();
    rctx.fill("nonzero");
    ctx.globalAlpha =
      edge.rippleOpacity * Math.pow(1 - (i - 1) / (n + 0.6), 1.25);
    ctx.drawImage(ring, 0, 0);
  }
  ctx.globalAlpha = 1;
}

// ---- live free-brush stroke --------------------------------------------------------
/**
 * The in-progress Free Brush stroke: dabs are stamped incrementally into a
 * full-stage mask as samples arrive (no re-render of earlier dabs), and the
 * visible canvas is recomposited at most once per frame.
 */
export class LiveStroke {
  readonly canvas: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private walker: DabWalker;
  constructor(
    private o: Omit<MMPaint, "points">,
    private W: number,
    H: number,
  ) {
    this.canvas = makeCanvas(W, H);
    this.mask = makeCanvas(W, H);
    this.mctx = this.mask.getContext("2d")!;
    this.walker = new DabWalker(o.brush!, o.seed, H / W);
  }
  add(pt: PaintPoint) {
    const dabs = this.walker.feed(pt);
    if (dabs.length) drawDabs(this.mctx, dabs, this.o.brush!, this.W, 0, 0);
  }
  compose() {
    const ctx = this.canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "copy";
    if (this.o.erase) {
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
