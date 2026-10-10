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
import { DEFAULT_BRUSH, DEFAULT_SOURCE } from "./presets";
import { shapeMask, strokeMask, type RenderedPaint } from "./engine";
import type {
  BrushSettings,
  LandMode,
  LandSettings,
  MMLand,
  MMLayer,
  NaturalEdge,
} from "../types";

/** A new land layer's look: grassland, until a texture is chosen. */
export const DEFAULT_LAND: LandSettings = {
  base: { ...DEFAULT_SOURCE, type: "texture", texture: "grass" },
};

/** A land layer's settings with defaults filled in. */
export function landSettings(layer: MMLayer): LandSettings {
  return layer.land ?? DEFAULT_LAND;
}

/** The Land tool's free brush: a hard round tip, dense dabs, no jitter —
 * the coastline's character comes from the layer's coast settings. */
export function landBrush(size: number): BrushSettings {
  return {
    ...DEFAULT_BRUSH,
    tip: "round",
    size,
    flow: 1,
    softness: 0,
    spacing: 0.08,
    pen: { ...DEFAULT_BRUSH.pen, enabled: false },
  };
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
    return o.size
      ? strokeMask(o.points, landBrush(o.size), o.seed, W, aspect)
      : null;
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
  /** Natural edge of Edge Shape and rough shapes. */
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
