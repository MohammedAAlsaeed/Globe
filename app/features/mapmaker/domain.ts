import type {
  AspectPreset,
  Biome,
  MMLayer,
  MMProject,
  PathKind,
  ResolutionTier,
} from "./types";

export interface ResolutionOption {
  key: ResolutionTier;
  labelKey: string;
  longEdge: number;
  badge: string;
}
export const RESOLUTIONS: ResolutionOption[] = [
  { key: "low", labelKey: "mmResLow", longEdge: 1024, badge: "1K" },
  { key: "medium", labelKey: "mmResMedium", longEdge: 2048, badge: "2K" },
  { key: "high", labelKey: "mmResHigh", longEdge: 3072, badge: "3K" },
  { key: "ultra", labelKey: "mmResUltra", longEdge: 4096, badge: "4K" },
];
export function resolutionBadge(tier: ResolutionTier) {
  return RESOLUTIONS.find((r) => r.key === tier)?.badge ?? "1K";
}

export interface AspectOption {
  key: AspectPreset;
  labelKey: string;
  cols: number;
  rows: number;
}
export const ASPECTS: AspectOption[] = [
  { key: "landscape", labelKey: "mmAspectLandscape", cols: 40, rows: 30 },
  { key: "portrait", labelKey: "mmAspectPortrait", cols: 30, rows: 40 },
  { key: "square", labelKey: "mmAspectSquare", cols: 40, rows: 40 },
  { key: "custom", labelKey: "mmAspectCustom", cols: 40, rows: 30 },
];

/** Fits a cols×rows grid to the resolution tier's long edge, keeping tiles square. */
export function computeCanvasSize(longEdge: number, cols: number, rows: number) {
  const ratio = cols / Math.max(1, rows);
  const width = ratio >= 1 ? longEdge : Math.round(longEdge * ratio),
    height = ratio >= 1 ? Math.round(longEdge / ratio) : longEdge;
  return { width: Math.max(64, width), height: Math.max(64, height) };
}

export const BIOME_LIST: Biome[] = [
  "forest",
  "mountains",
  "desert",
  "water",
  "grass",
  "swamp",
];
export const BIOME_LABEL_KEY: Record<Biome, string> = {
  forest: "mmBiomeForest",
  mountains: "mmBiomeMountains",
  desert: "mmBiomeDesert",
  water: "mmBiomeWater",
  grass: "mmBiomeGrass",
  swamp: "mmBiomeSwamp",
};
export const PATH_KIND_LIST: PathKind[] = ["river", "road", "border"];
export const PATH_KIND_LABEL_KEY: Record<PathKind, string> = {
  river: "mmPathRiver",
  road: "mmPathRoad",
  border: "mmPathBorder",
};

export const DEFAULT_BACKGROUND = "#2c5678";

export function createLayer(name: string): MMLayer {
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    objects: [],
  };
}

export function createProject(opts: {
  name: string;
  resolutionTier: ResolutionTier;
  aspect: AspectPreset;
  cols: number;
  rows: number;
}): MMProject {
  const res = RESOLUTIONS.find((r) => r.key === opts.resolutionTier) ?? RESOLUTIONS[1];
  const { width, height } = computeCanvasSize(res.longEdge, opts.cols, opts.rows);
  return {
    id: crypto.randomUUID(),
    name: opts.name.trim() || "Untitled map",
    width,
    height,
    tileCols: opts.cols,
    tileRows: opts.rows,
    resolutionTier: opts.resolutionTier,
    aspect: opts.aspect,
    background: DEFAULT_BACKGROUND,
    snapToGrid: false,
    layers: [createLayer("Layer 1")],
    updatedAt: Date.now(),
  };
}
