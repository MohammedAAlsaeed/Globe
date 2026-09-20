import type { IconId } from "./icons";
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
/** A single placeable, transformable map icon (mountain, city, tree…). */
export interface IconObject {
  id: string;
  kind: "icon";
  icon: IconId;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
}
export type PathKind = "river" | "road" | "border";
/** A river, road or border, drawn as a normalized polyline. */
export interface PathObject {
  id: string;
  kind: "path";
  pathKind: PathKind;
  points: Point[];
  width: number;
  color: string;
}
export type Biome = "forest" | "mountains" | "desert" | "water" | "grass" | "swamp";
/** A closed biome region, filled with a per-biome color when rendered. */
export interface RegionObject {
  id: string;
  kind: "region";
  biome: Biome;
  points: Point[];
  opacity: number;
}
export type LabelAlign = "start" | "center" | "end";
/** A bilingual text label; `rtl` drives canvas text direction independent of app language. */
export interface LabelObject {
  id: string;
  kind: "label";
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  align: LabelAlign;
  rtl: boolean;
}
export type MapObject = IconObject | PathObject | RegionObject | LabelObject;
export interface MapLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: Stroke[];
  objects: MapObject[];
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
