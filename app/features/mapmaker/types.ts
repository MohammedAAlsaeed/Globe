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
  /** Optional: added after v1. Older saved projects lack this field — read as `?? 0`. */
  rotation?: number;
  /** Optional: true when (x, y) is the alignment anchor — the left edge,
   * middle or right edge of the text for start/center/end (mirrored for RTL).
   * Labels saved before this existed lack it and keep their original
   * top-left placement so existing maps never shift. */
  anchored?: boolean;
}
// -----------------------------------------------------------------------------
// Brush Tool 2.0 — raster-style "paint" objects
// -----------------------------------------------------------------------------
// A paint object is stored as *recipe*, not pixels: the input geometry plus
// every brush setting and a random seed. The brush engine
// (./brush/engine.ts) replays it deterministically at any resolution, so a
// stroke looks identical on screen, after undo/redo, and in a 4K print.

/** Brush sub-tools. */
export type PaintMode = "free" | "edge" | "grid" | "rect" | "ellipse" | "polygon";
/** Canvas blend modes offered for paint (a subset of globalCompositeOperation). */
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "soft-light"
  | "hard-light"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";
/** Brush tip (dab) shapes; `stamp:<iconId>` turns any stamp into a tip. */
export type BrushTip =
  | "round"
  | "square"
  | "chalk"
  | "rough"
  | "cloud"
  | "splatter"
  | "bristle"
  | "stipple"
  | "leaf"
  | `stamp:${string}`;

/** What the paint is made of: a flat color or a seamless texture, both
 * passed through the Hue/Saturation/Brightness/Contrast filters. */
export interface PaintSource {
  type: "color" | "texture";
  color: string;
  texture: string;
  /** Texture tile scale (1 = catalog default). */
  textureScale: number;
  /** Texture rotation, degrees. */
  textureRotation: number;
  /** -180..180 degrees. */
  hue: number;
  /** -1..1 (0 = unchanged). */
  saturation: number;
  /** -1..1 (0 = unchanged). */
  brightness: number;
  /** -1..1 (0 = unchanged). */
  contrast: number;
}

/** Pen-pressure dynamics (pen/stylus input only; mouse is always full). */
export interface PenDynamics {
  enabled: boolean;
  size: boolean;
  opacity: boolean;
  flow: boolean;
}

/** Brush-head settings (Free Brush). Lengths are fractions of map width. */
export interface BrushSettings {
  tip: BrushTip;
  /** Dab diameter, fraction of the map width. */
  size: number;
  /** Per-dab paint amount, 0..1 (builds up where dabs overlap). */
  flow: number;
  /** Edge falloff of each dab, 0 (hard) .. 1 (fully soft). */
  softness: number;
  /** Distance between dabs, as a fraction of the dab diameter. */
  spacing: number;
  /** Tip angle, degrees. */
  rotation: number;
  /** 0..1 random reduction of each dab's size. */
  sizeJitter: number;
  /** 0..1 random reduction of each dab's opacity. */
  opacityJitter: number;
  /** 0..1 random tip rotation (1 = any angle). */
  rotationJitter: number;
  /** 0..2 random offset of each dab, in dab diameters. */
  scatter: number;
  pen: PenDynamics;
}

/** Natural-edge settings (Edge Shape, and rough-edged geometric shapes). */
export interface EdgeSettings {
  /** 0..1 how far the edge wanders from the drawn outline. */
  roughness: number;
  /** 0..1 how much fine, fractal coastline detail is added. */
  detail: number;
  /** Soft fade at the edge, fraction of map width. */
  feather: number;
  /** Ink outline drawn along the edge (0 width = none). */
  outlineWidth: number;
  outlineColor: string;
  /** Concentric "coastline ripple" lines outside the shape. */
  ripples: number;
  rippleSpacing: number;
  rippleColor: string;
  rippleOpacity: number;
  /** -1..1 shading just inside the edge: >0 darkens (depth), <0 lightens (shallows). */
  innerShade: number;
  /** Width of the inner shading band, fraction of map width. */
  innerShadeWidth: number;
  /** Optional beach/shore band color just inside the edge ("" = none). */
  shoreColor: string;
  /** Strength 0..1 and width of the shore band. */
  shoreStrength: number;
  shoreWidth: number;
  /** Soft glow just outside the edge — e.g. light shallow water round land. */
  glowColor: string;
  glowWidth: number;
  glowOpacity: number;
  /** 0..1 — how many small islets are scattered just off the edge. */
  islets: number;
}

export interface GridSettings {
  type: "square" | "hex";
  /** Cell width, fraction of map width. */
  cell: number;
}

/** A painted sample. `p` is pen pressure 0..1 (omitted = full pressure). */
export interface PaintPoint {
  x: number;
  y: number;
  p?: number;
}

export interface MMPaint {
  id: string;
  kind: "paint";
  mode: PaintMode;
  /** Eraser: removes whatever is beneath it in the same layer. */
  erase: boolean;
  blend: BlendMode;
  /** Overall stroke opacity — overlapping dabs never exceed it. */
  opacity: number;
  source: PaintSource;
  /** Free: brush samples. Edge: lasso outline. Polygon: vertices.
   * Rect/Ellipse: two opposite corners of the bounding box. Grid: unused. */
  points: PaintPoint[];
  /** Free Brush only. */
  brush?: BrushSettings;
  /** Edge Shape, and Rect/Ellipse/Polygon when `rough` is on. */
  edge?: EdgeSettings;
  /** Rect/Ellipse/Polygon: use the natural, coastline-style edge. */
  rough?: boolean;
  /** Grid Block only: painted cells as [col, row] pairs. */
  cells?: [number, number][];
  grid?: GridSettings;
  /** Seed for every random choice the engine makes. */
  seed: number;
}

export type MMObject = MMBrush | MMIcon | MMPath | MMRegion | MMLabel | MMPaint;

/** Brush-layer role (Inkarnate-style). Optional — older layers read as "custom". */
export type LayerRole = "land" | "water" | "custom";

export interface MMLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  objects: MMObject[];
  role?: LayerRole;
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

/** A loose union of every field any object kind can carry; call sites only
 * set fields matching the target object's own kind (see MapCreatorEditor's
 * updateObject/onPatch call sites). */
export interface MMPatch {
  icon?: IconId;
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  color?: string;
  pathKind?: PathKind;
  points?: Point[];
  width?: number;
  biome?: Biome;
  opacity?: number;
  textureScale?: number;
  textureRotation?: number;
  text?: string;
  size?: number;
  align?: LabelAlign;
  rtl?: boolean;
  anchored?: boolean;
  softness?: number;
}
