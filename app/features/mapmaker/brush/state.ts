/**
 * The Brush Tool's working state — everything the panel edits — plus preset
 * application and per-browser persistence of the last-used brush.
 */
import {
  DEFAULT_BRUSH,
  DEFAULT_EDGE_SETTINGS,
  DEFAULT_SOURCE,
  EDGE_STYLES,
  type BrushPreset,
  type FavoriteBrush,
} from "./presets";
import type {
  BlendMode,
  BrushSettings,
  EdgeSettings,
  GridSettings,
  PaintMode,
  PaintSource,
} from "../types";

export interface BrushState {
  mode: PaintMode;
  erase: boolean;
  /** Preset / favorite the settings came from (null once customized). */
  presetId: string | null;
  brush: BrushSettings;
  opacity: number;
  blend: BlendMode;
  source: PaintSource;
  edge: EdgeSettings;
  /** Edge style the edge settings came from (null once customized). */
  edgeStyle: string | null;
  /** Rect/Ellipse/Polygon: natural coastline-style edge. */
  rough: boolean;
  grid: GridSettings;
}

export const DEFAULT_BRUSH_STATE: BrushState = {
  mode: "free",
  erase: false,
  presetId: "texture-fill",
  brush: {
    ...DEFAULT_BRUSH,
    size: 0.05,
    flow: 1,
    softness: 0.25,
    spacing: 0.1,
  },
  opacity: 0.9,
  blend: "normal",
  source: DEFAULT_SOURCE,
  edge: { ...DEFAULT_EDGE_SETTINGS, ...EDGE_STYLES[0].edge },
  edgeStyle: EDGE_STYLES[0].id,
  rough: false,
  grid: { type: "square", cell: 0.025 },
};

export function applyPreset(
  state: BrushState,
  preset: BrushPreset,
): BrushState {
  return {
    ...state,
    presetId: preset.id,
    brush: {
      ...DEFAULT_BRUSH,
      ...preset.brush,
      pen: { ...DEFAULT_BRUSH.pen, ...preset.brush.pen },
    },
    opacity: preset.opacity ?? state.opacity,
    blend: preset.blend ?? "normal",
    source: preset.source
      ? { ...state.source, ...preset.source }
      : state.source,
  };
}
export function applyFavorite(
  state: BrushState,
  fav: FavoriteBrush,
): BrushState {
  return {
    ...state,
    presetId: fav.id,
    brush: fav.brush,
    opacity: fav.opacity,
    blend: fav.blend,
    source: fav.source,
  };
}

const STATE_KEY = "mapmaker-brush-state";
export function loadBrushState(): BrushState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return DEFAULT_BRUSH_STATE;
    const s = JSON.parse(raw) as Partial<BrushState>;
    // Merge field-by-field so a state saved by an older build still loads.
    return {
      ...DEFAULT_BRUSH_STATE,
      ...s,
      brush: {
        ...DEFAULT_BRUSH_STATE.brush,
        ...s.brush,
        pen: { ...DEFAULT_BRUSH.pen, ...s.brush?.pen },
      },
      source: { ...DEFAULT_SOURCE, ...s.source },
      edge: { ...DEFAULT_BRUSH_STATE.edge, ...s.edge },
      grid: { ...DEFAULT_BRUSH_STATE.grid, ...s.grid },
      erase: false,
    };
  } catch {
    return DEFAULT_BRUSH_STATE;
  }
}
export function saveBrushState(state: BrushState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — the brush just resets next session
  }
}
