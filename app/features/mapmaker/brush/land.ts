/**
 * The Land tool's renderer: turns a land object (../types MMLand) into an
 * alpha coverage raster — *where* land is added or removed. Land has no
 * colour of its own; the land layer composites every land object into one
 * mask (./landLayer.ts), and the coast effect builds the coastline from it.
 *
 * Geometry is shared with the brush engine, so a land Edge Shape is exactly
 * the natural outline the brush used to draw — minus the decoration, which
 * now belongs to the layer's coast.
 */
import { DEFAULT_SOURCE } from "./presets";
import { colorize, makeCanvas, shapeMask, type RenderedPaint } from "./engine";
import {
  STROKE_STEP,
  StrokeBuilder,
  roughStroke,
  strokeBounds,
  strokeCoverage,
  type RoughStroke,
} from "./roughStroke";
import type {
  LandMode,
  LandSettings,
  MMLand,
  MMLayer,
  NaturalEdge,
  PaintPoint,
  PaintSource,
} from "../types";

/** A new land layer's look: grassland, until a texture is chosen. */
export const DEFAULT_LAND: LandSettings = {
  base: { ...DEFAULT_SOURCE, type: "texture", texture: "grass" },
};

/** A land layer's settings with defaults filled in. */
export function landSettings(layer: MMLayer): LandSettings {
  return layer.land ?? DEFAULT_LAND;
}

/** The rough stroke of a free land object (see ./roughStroke.ts). */
export function landStroke(o: MMLand, aspect: number): RoughStroke {
  return roughStroke(o.points, o.size ?? 0, o.edge, o.seed, aspect);
}

/** Coverage raster (white, alpha = coverage) of pixels [x, x+w)×[y, y+h). */
function coverageCanvas(
  s: RoughStroke,
  W: number,
  b: { x: number; y: number; w: number; h: number },
) {
  const cov = strokeCoverage(s, W, b.x, b.y, b.w, b.h),
    img = new ImageData(b.w, b.h),
    px = img.data;
  for (let i = 0; i < cov.length; i++) {
    const o = i * 4;
    px[o] = px[o + 1] = px[o + 2] = 255;
    px[o + 3] = Math.round(cov[i] * 255);
  }
  const c = makeCanvas(b.w, b.h);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

/** Alpha mask of a rough land stroke, cropped to its bounds. */
export function roughStrokeMask(
  s: RoughStroke,
  W: number,
): RenderedPaint | null {
  if (!s.line.length || s.radius <= 0) return null;
  const b = strokeBounds(s, W);
  if (b.w <= 0 || b.h <= 0) return null;
  return { canvas: coverageCanvas(s, W, b), x: b.x, y: b.y };
}

/**
 * The in-progress free land stroke, drawn on the CPU (used only where
 * WebGL2 is unavailable; the GPU engine draws it live otherwise). Fixed
 * vertices are added to a full-stage mask as they appear; the short tail to
 * the pointer is redrawn each frame.
 */
export class LiveLandStroke {
  readonly canvas: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private builder: StrokeBuilder;
  private drawn = 0;
  private stroke: RoughStroke;
  constructor(
    o: MMLand,
    private source: PaintSource | null,
    private W: number,
    private H: number,
  ) {
    this.canvas = makeCanvas(W, H);
    this.mask = makeCanvas(W, H);
    this.mctx = this.mask.getContext("2d")!;
    this.stroke = landStroke(o, H / W);
    this.builder = new StrokeBuilder(
      Math.max(1e-5, this.stroke.radius * STROKE_STEP),
    );
  }
  add(pt: PaintPoint) {
    this.builder.feed({ x: pt.x, y: (pt.y * this.H) / this.W });
  }
  /** Draws fixed segments not yet in the mask; returns the tail stroke. */
  private sync(): RoughStroke | null {
    const line = this.builder.polyline(),
      fixed = this.builder.fixedCount,
      s = this.stroke;
    if (fixed > this.drawn) {
      const part = {
          ...s,
          line: line.slice(Math.max(0, this.drawn - 1), fixed),
        },
        r = roughStrokeMask(part, this.W);
      if (r) this.mctx.drawImage(r.canvas, r.x, r.y);
      this.drawn = fixed;
    }
    const tail = line.slice(Math.max(0, fixed - 1));
    return tail.length > 1 ? { ...s, line: tail } : null;
  }
  compose() {
    const tail = this.sync(),
      ctx = this.canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const r = tail && roughStrokeMask(tail, this.W);
    if (r) ctx.drawImage(r.canvas, r.x, r.y);
    if (this.source) {
      const tex = colorize(this.canvas, this.source, this.W, 0, 0);
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(tex, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
  }
}

/** Coverage of one land object at stage width W / height H (white, alpha =
 * coverage), cropped to its bounds; null when empty. `fast` is for live
 * previews (coarser natural edges, same shape). */
export function renderLand(
  o: MMLand,
  W: number,
  H: number,
  fast = false,
): RenderedPaint | null {
  const aspect = H / W;
  if (o.mode === "free")
    return o.size ? roughStrokeMask(landStroke(o, aspect), W) : null;
  return shapeMask(o, W, aspect, fast);
}

// ---- Land tool settings ---------------------------------------------------------
/** Everything the Land panel edits; remembered per browser. */
export interface LandToolState {
  mode: LandMode;
  /** Remove land (open water) instead of adding it. */
  erase: boolean;
  /** Free brush diameter, fraction of the map width. */
  size: number;
  /** Natural edge of every mode: the free brush (in proportion to its size),
   * Edge Shape and the rough shapes. */
  edge: NaturalEdge;
  /** Polygon/Rect/Ellipse: natural edge instead of straight sides. */
  rough: boolean;
}

export const LAND_MODES: {
  key: LandMode;
  glyph: string;
  labelKey: string;
  hintKey: string;
}[] = [
  {
    key: "free",
    glyph: "freeBrush",
    labelKey: "mmModeFree",
    hintKey: "mmLandFreeHint",
  },
  {
    key: "edge",
    glyph: "edgeShape",
    labelKey: "mmModeEdge",
    hintKey: "mmLandEdgeHint",
  },
  {
    key: "polygon",
    glyph: "polygon",
    labelKey: "mmModePolygon",
    hintKey: "mmLandPolygonHint",
  },
  {
    key: "rect",
    glyph: "rect",
    labelKey: "mmModeRect",
    hintKey: "mmLandRectHint",
  },
  {
    key: "ellipse",
    glyph: "ellipse",
    labelKey: "mmModeEllipse",
    hintKey: "mmLandEllipseHint",
  },
];

export const DEFAULT_LAND_TOOL: LandToolState = {
  mode: "edge",
  erase: false,
  size: 0.06,
  edge: { roughness: 0.6, detail: 0.75 },
  rough: true,
};

const LAND_TOOL_KEY = "mapmaker-land-tool";
export function loadLandTool(): LandToolState {
  try {
    const raw = localStorage.getItem(LAND_TOOL_KEY);
    if (!raw) return DEFAULT_LAND_TOOL;
    const s = JSON.parse(raw) as Partial<LandToolState>;
    return {
      ...DEFAULT_LAND_TOOL,
      ...s,
      mode: LAND_MODES.some((m) => m.key === s.mode)
        ? (s.mode as LandMode)
        : DEFAULT_LAND_TOOL.mode,
      edge: { ...DEFAULT_LAND_TOOL.edge, ...s.edge },
      erase: false,
    };
  } catch {
    return DEFAULT_LAND_TOOL;
  }
}
export function saveLandTool(state: LandToolState) {
  try {
    localStorage.setItem(LAND_TOOL_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — the tool just resets next session
  }
}
