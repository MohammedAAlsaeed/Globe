/**
 * Brush presets (24, in four groups like Inkarnate's preset menu) and the
 * user's saved Favorites.
 *
 * A preset sets the brush head (tip, size, flow, softness, spacing, jitter…)
 * and may also set a blend mode, opacity and paint source — e.g. "Soft
 * Shadow" is a dark multiply brush, "Forest Canopy" scatters forest texture.
 * Presets without a source keep whatever texture/color is currently chosen.
 */
import type {
  BlendMode,
  BrushSettings,
  EdgeSettings,
  PaintSource,
} from "../types";

export type PresetGroup = "freehand" | "blending" | "shading" | "texture";

export interface BrushPreset {
  id: string;
  group: PresetGroup;
  labelKey: string;
  brush: Partial<BrushSettings>;
  opacity?: number;
  blend?: BlendMode;
  source?: Partial<PaintSource>;
}

export const PRESET_GROUPS: { key: PresetGroup; labelKey: string }[] = [
  { key: "freehand", labelKey: "mmPresetGroupFreehand" },
  { key: "blending", labelKey: "mmPresetGroupBlending" },
  { key: "shading", labelKey: "mmPresetGroupShading" },
  { key: "texture", labelKey: "mmPresetGroupTexture" },
];

export const DEFAULT_BRUSH: BrushSettings = {
  tip: "round",
  size: 0.03,
  flow: 0.8,
  softness: 0.35,
  spacing: 0.12,
  rotation: 0,
  sizeJitter: 0,
  opacityJitter: 0,
  rotationJitter: 0,
  scatter: 0,
  pen: { enabled: true, size: true, opacity: false, flow: true },
};

export const DEFAULT_SOURCE: PaintSource = {
  type: "texture",
  color: "#6b8f4e",
  texture: "grass",
  textureScale: 1,
  textureRotation: 0,
  hue: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
};

/** Coastline looks for Edge Shape — the quickest way to a beautiful shore. */
export const EDGE_STYLES: {
  id: string;
  labelKey: string;
  edge: Partial<EdgeSettings>;
}[] = [
  {
    // Shallow-water glow, ripple lines, ink shore line and a sandy beach.
    id: "coast",
    labelKey: "mmEdgeStyleCoast",
    edge: {
      roughness: 0.6,
      detail: 0.75,
      feather: 0.001,
      outlineWidth: 0.0011,
      outlineColor: "#3a2f24",
      ripples: 3,
      rippleSpacing: 0.0065,
      rippleColor: "#e9f2f1",
      rippleOpacity: 0.5,
      innerShade: 0,
      shoreColor: "#e6d3a3",
      shoreStrength: 0.75,
      shoreWidth: 0.0045,
      glowColor: "#8fd2d4",
      glowWidth: 0.015,
      glowOpacity: 0.6,
      islets: 0.35,
    },
  },
  {
    // Parchment-map look: crisp ink edge, gentle inner depth, no water effects.
    id: "ink",
    labelKey: "mmEdgeStyleInk",
    edge: {
      roughness: 0.65,
      detail: 0.85,
      feather: 0.0005,
      outlineWidth: 0.0017,
      outlineColor: "#2b231b",
      ripples: 0,
      innerShade: 0.3,
      innerShadeWidth: 0.008,
      shoreStrength: 0,
      glowOpacity: 0,
      islets: 0.2,
    },
  },
  {
    // Watercolor-soft edge for blending biomes into each other.
    id: "soft",
    labelKey: "mmEdgeStyleSoft",
    edge: {
      roughness: 0.5,
      detail: 0.6,
      feather: 0.006,
      outlineWidth: 0,
      ripples: 0,
      innerShade: 0,
      shoreStrength: 0,
      glowOpacity: 0,
      islets: 0,
    },
  },
  {
    // For painting water onto water: a bright shallows rim fading inward.
    id: "shallows",
    labelKey: "mmEdgeStyleShallows",
    edge: {
      roughness: 0.5,
      detail: 0.7,
      feather: 0.004,
      outlineWidth: 0,
      ripples: 2,
      rippleSpacing: 0.008,
      rippleColor: "#d9f0ee",
      rippleOpacity: 0.35,
      innerShade: -0.6,
      innerShadeWidth: 0.02,
      shoreStrength: 0,
      glowOpacity: 0,
      islets: 0,
    },
  },
  {
    // Rugged, dark-rimmed cliffs with heavy fractal detail and surf.
    id: "cliffs",
    labelKey: "mmEdgeStyleCliffs",
    edge: {
      roughness: 0.9,
      detail: 1,
      feather: 0.0007,
      outlineWidth: 0.0014,
      outlineColor: "#241d17",
      ripples: 2,
      rippleSpacing: 0.005,
      rippleColor: "#f2f2ec",
      rippleOpacity: 0.5,
      innerShade: 0.55,
      innerShadeWidth: 0.012,
      shoreStrength: 0,
      glowColor: "#b9dfe0",
      glowWidth: 0.006,
      glowOpacity: 0.45,
      islets: 0.5,
    },
  },
  {
    // A plain natural edge, no decoration.
    id: "clean",
    labelKey: "mmEdgeStyleClean",
    edge: {
      roughness: 0.4,
      detail: 0.5,
      feather: 0.001,
      outlineWidth: 0,
      ripples: 0,
      innerShade: 0,
      shoreStrength: 0,
      glowOpacity: 0,
      islets: 0,
    },
  },
];

export const DEFAULT_EDGE_SETTINGS: EdgeSettings = {
  roughness: 0.6,
  detail: 0.75,
  feather: 0.001,
  outlineWidth: 0.0011,
  outlineColor: "#3a2f24",
  ripples: 3,
  rippleSpacing: 0.0065,
  rippleColor: "#e9f2f1",
  rippleOpacity: 0.5,
  innerShade: 0,
  innerShadeWidth: 0.012,
  shoreColor: "#e6d3a3",
  shoreStrength: 0.75,
  shoreWidth: 0.0045,
  glowColor: "#8fd2d4",
  glowWidth: 0.015,
  glowOpacity: 0.6,
  islets: 0.35,
};

export const PRESETS: BrushPreset[] = [
  // Freehand
  {
    id: "hard-round",
    group: "freehand",
    labelKey: "mmPresetHardRound",
    brush: { tip: "round", size: 0.02, flow: 1, softness: 0, spacing: 0.08 },
    opacity: 1,
  },
  {
    id: "soft-round",
    group: "freehand",
    labelKey: "mmPresetSoftRound",
    brush: {
      tip: "round",
      size: 0.035,
      flow: 0.7,
      softness: 0.75,
      spacing: 0.1,
    },
    opacity: 0.9,
  },
  {
    id: "ink-pen",
    group: "freehand",
    labelKey: "mmPresetInkPen",
    brush: {
      tip: "round",
      size: 0.003,
      flow: 1,
      softness: 0,
      spacing: 0.05,
      pen: { enabled: true, size: true, opacity: false, flow: false },
    },
    opacity: 1,
    source: { type: "color", color: "#2b231b" },
  },
  {
    id: "marker",
    group: "freehand",
    labelKey: "mmPresetMarker",
    brush: {
      tip: "square",
      size: 0.012,
      flow: 0.6,
      softness: 0.1,
      spacing: 0.08,
      rotation: 35,
    },
    opacity: 0.85,
  },
  {
    id: "chalk",
    group: "freehand",
    labelKey: "mmPresetChalk",
    brush: {
      tip: "chalk",
      size: 0.02,
      flow: 0.8,
      softness: 0.1,
      spacing: 0.18,
      rotationJitter: 1,
      sizeJitter: 0.15,
    },
    opacity: 0.9,
  },
  {
    id: "dry-bristle",
    group: "freehand",
    labelKey: "mmPresetDryBristle",
    brush: {
      tip: "bristle",
      size: 0.03,
      flow: 0.55,
      softness: 0.1,
      spacing: 0.06,
      rotation: 90,
      opacityJitter: 0.3,
    },
    opacity: 0.9,
  },
  {
    id: "pencil",
    group: "freehand",
    labelKey: "mmPresetPencil",
    brush: {
      tip: "chalk",
      size: 0.004,
      flow: 0.7,
      softness: 0,
      spacing: 0.08,
      rotationJitter: 1,
    },
    opacity: 0.9,
    source: { type: "color", color: "#3b3127" },
  },
  {
    id: "stipple",
    group: "freehand",
    labelKey: "mmPresetStipple",
    brush: {
      tip: "stipple",
      size: 0.03,
      flow: 0.9,
      softness: 0,
      spacing: 0.45,
      rotationJitter: 1,
      sizeJitter: 0.3,
    },
    opacity: 0.9,
  },
  // Blending
  {
    id: "soft-blender",
    group: "blending",
    labelKey: "mmPresetSoftBlender",
    brush: {
      tip: "round",
      size: 0.08,
      flow: 0.22,
      softness: 1,
      spacing: 0.08,
      opacityJitter: 0.5,
    },
    opacity: 0.6,
  },
  {
    id: "cloud-blend",
    group: "blending",
    labelKey: "mmPresetCloudBlend",
    brush: {
      tip: "cloud",
      size: 0.07,
      flow: 0.7,
      softness: 0.5,
      spacing: 0.1,
      rotationJitter: 1,
      sizeJitter: 0.3,
      opacityJitter: 0.45,
      scatter: 0.2,
    },
    opacity: 0.7,
  },
  {
    id: "feather-edge",
    group: "blending",
    labelKey: "mmPresetFeatherEdge",
    brush: {
      tip: "rough",
      size: 0.05,
      flow: 0.4,
      softness: 0.8,
      spacing: 0.12,
      rotationJitter: 1,
      sizeJitter: 0.4,
      opacityJitter: 0.7,
      scatter: 0.35,
    },
    opacity: 0.5,
  },
  {
    id: "mist",
    group: "blending",
    labelKey: "mmPresetMist",
    brush: {
      tip: "cloud",
      size: 0.12,
      flow: 0.4,
      softness: 0.8,
      spacing: 0.12,
      rotationJitter: 1,
      scatter: 0.3,
      opacityJitter: 0.6,
    },
    opacity: 0.5,
    source: { type: "color", color: "#eef3f5" },
  },
  // Shading
  {
    id: "soft-shadow",
    group: "shading",
    labelKey: "mmPresetSoftShadow",
    brush: { tip: "round", size: 0.06, flow: 0.18, softness: 1, spacing: 0.1 },
    opacity: 0.35,
    blend: "multiply",
    source: { type: "color", color: "#3d3326" },
  },
  {
    id: "highlight",
    group: "shading",
    labelKey: "mmPresetHighlight",
    brush: { tip: "round", size: 0.05, flow: 0.18, softness: 1, spacing: 0.1 },
    opacity: 0.35,
    blend: "screen",
    source: { type: "color", color: "#fff4d6" },
  },
  {
    id: "hill-shade",
    group: "shading",
    labelKey: "mmPresetHillShade",
    brush: {
      tip: "rough",
      size: 0.04,
      flow: 0.25,
      softness: 0.7,
      spacing: 0.12,
      rotationJitter: 1,
      opacityJitter: 0.4,
    },
    opacity: 0.4,
    blend: "multiply",
    source: { type: "color", color: "#6b5236" },
  },
  {
    id: "depth-shade",
    group: "shading",
    labelKey: "mmPresetDepthShade",
    brush: { tip: "round", size: 0.09, flow: 0.15, softness: 1, spacing: 0.1 },
    opacity: 0.4,
    blend: "multiply",
    source: { type: "color", color: "#14324f" },
  },
  {
    id: "warm-glow",
    group: "shading",
    labelKey: "mmPresetWarmGlow",
    brush: { tip: "round", size: 0.07, flow: 0.35, softness: 1, spacing: 0.1 },
    opacity: 0.6,
    blend: "overlay",
    source: { type: "color", color: "#ffb35c" },
  },
  // Texture
  {
    id: "texture-fill",
    group: "texture",
    labelKey: "mmPresetTextureFill",
    brush: { tip: "round", size: 0.05, flow: 1, softness: 0.25, spacing: 0.1 },
    opacity: 0.95,
  },
  {
    id: "texture-soft",
    group: "texture",
    labelKey: "mmPresetTextureSoft",
    brush: {
      tip: "round",
      size: 0.06,
      flow: 0.45,
      softness: 0.85,
      spacing: 0.1,
      opacityJitter: 0.35,
    },
    opacity: 0.9,
  },
  {
    id: "rough-texture",
    group: "texture",
    labelKey: "mmPresetRoughTexture",
    brush: {
      tip: "rough",
      size: 0.045,
      flow: 0.9,
      softness: 0.2,
      spacing: 0.14,
      rotationJitter: 1,
      sizeJitter: 0.35,
      scatter: 0.15,
    },
    opacity: 0.95,
  },
  {
    id: "splatter",
    group: "texture",
    labelKey: "mmPresetSplatter",
    brush: {
      tip: "splatter",
      size: 0.05,
      flow: 0.9,
      softness: 0.05,
      spacing: 0.4,
      rotationJitter: 1,
      sizeJitter: 0.4,
      scatter: 0.5,
    },
    opacity: 0.95,
  },
  {
    id: "forest-canopy",
    group: "texture",
    labelKey: "mmPresetForestCanopy",
    brush: {
      tip: "leaf",
      size: 0.035,
      flow: 0.95,
      softness: 0.1,
      spacing: 0.18,
      rotationJitter: 1,
      sizeJitter: 0.4,
      scatter: 0.5,
    },
    opacity: 1,
    source: { type: "texture", texture: "forest" },
  },
  {
    id: "rocky-scatter",
    group: "texture",
    labelKey: "mmPresetRockyScatter",
    brush: {
      tip: "rough",
      size: 0.022,
      flow: 0.95,
      softness: 0.05,
      spacing: 0.55,
      rotationJitter: 1,
      sizeJitter: 0.6,
      scatter: 0.9,
    },
    opacity: 1,
    source: { type: "texture", texture: "rock" },
  },
  {
    id: "sea-foam",
    group: "texture",
    labelKey: "mmPresetSeaFoam",
    brush: {
      tip: "splatter",
      size: 0.025,
      flow: 0.6,
      softness: 0.3,
      spacing: 0.35,
      rotationJitter: 1,
      sizeJitter: 0.5,
      scatter: 0.45,
      opacityJitter: 0.5,
    },
    opacity: 0.7,
    source: { type: "color", color: "#eef7f6" },
  },
];

export function presetById(id: string) {
  return PRESETS.find((p) => p.id === id);
}

// ---- favorites (per browser, survive across maps) ---------------------------------
export interface FavoriteBrush {
  id: string;
  name: string;
  brush: BrushSettings;
  opacity: number;
  blend: BlendMode;
  source: PaintSource;
}
const FAVORITES_KEY = "mapmaker-brush-favorites";

export function loadFavorites(): FavoriteBrush[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const list = raw ? (JSON.parse(raw) as FavoriteBrush[]) : [];
    return Array.isArray(list)
      ? list.filter((f) => f && f.id && f.brush && f.source).slice(0, 40)
      : [];
  } catch {
    return [];
  }
}
export function saveFavorites(list: FavoriteBrush[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    // storage unavailable (private mode, quota) — favorites just won't persist
  }
}
