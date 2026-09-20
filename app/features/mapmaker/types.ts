/**
 * Standalone map-creator data model. Deliberately independent from
 * features/studio/domain/types.ts (the print/globe pipeline's document
 * model) so this editor can evolve freely — sliders, textures, locking —
 * without risking the shared print/export path. It reuses only the
 * cross-cutting primitives (icon ids, biome/path palettes) so the two
 * editors stay visually consistent.
 */
import type { IconId } from "../studio/domain/icons";

export type { IconId };
export type Point = { x: number; y: number };
export type Biome =
  | "forest"
  | "mountains"
  | "desert"
  | "water"
  | "grass"
  | "swamp";
export type PathKind = "river" | "road" | "border";
export type LabelAlign = "start" | "center" | "end";

export interface MMBrush {
  id: string;
  kind: "brush";
  points: Point[];
  color: string;
  size: number;
  opacity: number;
  softness: number;
}
export interface MMIcon {
  id: string;
  kind: "icon";
  icon: IconId;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
}
export interface MMPath {
  id: string;
  kind: "path";
  pathKind: PathKind;
  points: Point[];
  width: number;
  color: string;
  opacity: number;
  softness: number;
}
export interface MMRegion {
  id: string;
  kind: "region";
  biome: Biome;
  points: Point[];
  opacity: number;
  textureScale: number;
  textureRotation: number;
}
export interface MMLabel {
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
export type MMObject = MMBrush | MMIcon | MMPath | MMRegion | MMLabel;

export interface MMLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  objects: MMObject[];
}

export type ResolutionTier = "low" | "medium" | "high" | "ultra";
export type AspectPreset = "landscape" | "portrait" | "square" | "custom";

export interface MMProject {
  id: string;
  name: string;
  width: number;
  height: number;
  tileCols: number;
  tileRows: number;
  resolutionTier: ResolutionTier;
  aspect: AspectPreset;
  background: string;
  snapToGrid: boolean;
  layers: MMLayer[];
  updatedAt: number;
}

export function objectCount(layer: MMLayer) {
  return layer.objects.length;
}
