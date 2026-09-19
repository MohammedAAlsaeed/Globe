/** Millimetres are the canonical unit. UI units never enter projection math. */
export type Resampling = "bilinear" | "bicubic" | "lanczos";
export type SourceProjection = "equirectangular" | "mercator";
export interface GlobeSettings {
  width: number;
  height: number;
  gores: number;
  gap: number;
  offset: number;
  tab: number;
  bleed: number;
  guides: boolean;
  grid: boolean;
  labels: boolean;
  sourceProjection: SourceProjection;
  north: number;
  south: number;
  resampling: Resampling;
}
export interface PrintSettings {
  paper: "A4" | "A3" | "Letter" | "custom";
  width: number;
  height: number;
  orientation: "auto" | "portrait" | "landscape";
  margin: number;
  overlap: number;
  calibrationX: number;
  calibrationY: number;
  marks: boolean;
  outline: boolean;
}
export interface Point {
  x: number;
  y: number;
}
export interface Stroke {
  id: string;
  kind: "brush" | "symbol";
  points: Point[];
  color: string;
  size: number;
  symbol?: string;
}
export interface MapLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: Stroke[];
}
export interface StudioDocument {
  name: string;
  globe: GlobeSettings;
  print: PrintSettings;
  dpi: number;
  layers: MapLayer[];
}
export interface Placement {
  gore: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  cropX: number;
  cropY: number;
  fullWidth: number;
  fullHeight: number;
  tile: string;
}
export interface PrintPage {
  width: number;
  height: number;
  items: Placement[];
}
export interface PrintPlan {
  pages: PrintPage[];
  tiled: boolean;
  error?: string;
}
export interface GoreAsset {
  index: number;
  url: string;
  blob: Blob;
  width: number;
  height: number;
}
export const DEFAULT_GLOBE: GlobeSettings = {
  width: 150,
  height: 150,
  gores: 12,
  gap: 3,
  offset: 0,
  tab: 3,
  bleed: 1,
  guides: true,
  grid: false,
  labels: true,
  sourceProjection: "equirectangular",
  north: 85.05112878,
  south: -85.05112878,
  resampling: "bicubic",
};
export const DEFAULT_PRINT: PrintSettings = {
  paper: "A4",
  width: 210,
  height: 297,
  orientation: "auto",
  margin: 8,
  overlap: 8,
  calibrationX: 1,
  calibrationY: 1,
  marks: true,
  outline: false,
};
export const DEFAULT_DOCUMENT: StudioDocument = {
  name: "My globe",
  globe: DEFAULT_GLOBE,
  print: DEFAULT_PRINT,
  dpi: 300,
  layers: [],
};
