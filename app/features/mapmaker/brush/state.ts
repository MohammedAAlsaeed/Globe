/**
 * The Brush Tool's working state — everything the panel edits — plus preset
 * application and per-browser persistence of the last-used brush.
 */
import {
  DEFAULT_BRUSH,
  DEFAULT_EDGE_SETTINGS,
  DEFAULT_SOURCE,
  PRESETS,
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
  /** The preset / favorite a customized brush started from: what its resets
   * return to (kept through edits; null = the factory brush). */
  baseId?: string | null;
  brush: BrushSettings;
  opacity: number;
  blend: BlendMode;
  source: PaintSource;
  /** Rect/Ellipse/Polygon: natural edge and feather. */
  edge: EdgeSettings;
  /** Rect/Ellipse/Polygon: natural coastline-style edge. */
  rough: boolean;
  grid: GridSettings;
}

const PAINT_MODE_KEYS: PaintMode[] = [
  "free",
  "grid",
  "rect",
  "ellipse",
  "polygon",
];

export const DEFAULT_BRUSH_STATE: BrushState = {
  mode: "free",
  erase: false,
  // The "Texture fill" preset (keep in step with it in ./presets).
  presetId: "texture-fill",
  baseId: "texture-fill",
  brush: {
    ...DEFAULT_BRUSH,
    size: 0.05,
    flow: 1,
    softness: 0.25,
    spacing: 0.1,
  },
  opacity: 0.95,
  blend: "normal",
  source: DEFAULT_SOURCE,
  edge: DEFAULT_EDGE_SETTINGS,
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
    baseId: preset.id,
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
    baseId: fav.id,
    brush: fav.brush,
    opacity: fav.opacity,
    blend: fav.blend,
    source: fav.source,
  };
}

/**
 * What the brush's resets return to: the preset or favorite it started from
 * (as a painter expects — "back to my Soft Round"), else the factory brush.
 * Mode, edge and grid aren't part of presets, so they keep the factory values;
 * the paint picked (texture or colour) is kept, only its adjustments reset.
 * A favorite brings back its own paint, as it does when chosen.
 */
export function brushBase(
  state: Pick<BrushState, "presetId" | "baseId" | "source">,
  favorites: FavoriteBrush[],
): BrushState {
  const id = state.presetId ?? state.baseId ?? null,
    // The paint chosen (texture or colour) stays; its adjustments reset.
    source: PaintSource = {
      ...DEFAULT_SOURCE,
      type: state.source.type,
      color: state.source.color,
      texture: state.source.texture,
    },
    start = { ...DEFAULT_BRUSH_STATE, source };
  if (!id) return start;
  const fav = favorites.find((f) => f.id === id);
  if (fav) return applyFavorite(start, fav);
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? applyPreset(start, preset) : start;
}

const STATE_KEY = "mapmaker-brush-state";
export function loadBrushState(): BrushState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return DEFAULT_BRUSH_STATE;
    const s = JSON.parse(raw) as Partial<BrushState>;
    const e = { ...DEFAULT_EDGE_SETTINGS, ...s.edge };
    delete (s as Record<string, unknown>).edgeStyle; // removed setting
    // Merge field-by-field so a state saved by an older build still loads
    // (fields it no longer has are dropped; Edge Shape moved to the Land tool).
    return {
      ...DEFAULT_BRUSH_STATE,
      ...s,
      mode: PAINT_MODE_KEYS.includes(s.mode as PaintMode)
        ? (s.mode as PaintMode)
        : "free",
      brush: {
        ...DEFAULT_BRUSH_STATE.brush,
        ...s.brush,
        pen: { ...DEFAULT_BRUSH.pen, ...s.brush?.pen },
      },
      source: { ...DEFAULT_SOURCE, ...s.source },
      edge: { roughness: e.roughness, detail: e.detail, feather: e.feather },
      grid: { ...DEFAULT_BRUSH_STATE.grid, ...s.grid },
      erase: false,
      presetId: typeof s.presetId === "string" ? s.presetId : null,
      // Saved before the base was remembered: the preset it shows, if any.
      baseId:
        typeof s.baseId === "string"
          ? s.baseId
          : typeof s.presetId === "string"
            ? s.presetId
            : null,
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
