/**
 * Standalone map-creator data model. Deliberately independent from
 * features/studio/domain/types.ts (the print/globe pipeline's document
 * model) so this editor can evolve freely — sliders, textures, locking —
 * without risking the shared print/export path. It reuses only the
 * cross-cutting primitives (icon ids, biome/path palettes) so the two
 * editors stay visually consistent.
 */
import type { IconId } from "../studio/domain/icons";
import type { LineNode } from "./lines/geometry";

export type { IconId, LineNode };
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

/** Fields every object can carry (all optional; older maps lack them). */
export interface MMObjectBase {
  id: string;
  /** Objects sharing a group id are selected, moved and copied together. */
  group?: string;
  /** Can't be picked or changed on the canvas (select it in the Objects list). */
  locked?: boolean;
  /** Not drawn (and not printed). */
  hidden?: boolean;
}

export interface MMBrush extends MMObjectBase {
  kind: "brush";
  points: Point[];
  color: string;
  size: number;
  opacity: number;
  softness: number;
}
/** Legacy map symbol (before the Stamp Tool). Older saved maps may still
 * contain these; they are converted to stamps when opened (stamps/migrate). */
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
/** Legacy freehand path (before the Line Tool). Older saved maps may still
 * contain these; they open as lines with the same look (stamps/migrate). */
export interface MMPath extends MMObjectBase {
  kind: "path";
  pathKind: PathKind;
  points: Point[];
  width: number;
  color: string;
  opacity: number;
  softness: number;
}
export interface MMRegion extends MMObjectBase {
  kind: "region";
  biome: Biome;
  points: Point[];
  opacity: number;
  textureScale: number;
  textureRotation: number;
}
/** Legacy text label (before the Text Tool). Older saved maps may still
 * contain these; they open as Text Tool texts with the same words, place,
 * size, colour and turn (stamps/migrate). */
export interface MMLabel extends MMObjectBase {
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

/** Brush sub-tools. (Edge Shape lives in the Land tool — see MMLand.) */
export type PaintMode = "free" | "grid" | "rect" | "ellipse" | "polygon";
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

/** A natural, coastline-like edge (see ./brush/coast.ts). */
export interface NaturalEdge {
  /** 0..1 how far the edge wanders from the drawn outline. */
  roughness: number;
  /** 0..1 how much fine, fractal coastline detail is added. */
  detail: number;
}

/** Edge of the Brush Tool's rough Rect/Ellipse/Polygon: a natural outline
 * plus a soft fade. Purely the shape's geometry — coastline decoration
 * (outline, beach, glow, waves…) belongs to the land layer's coast effect. */
export interface EdgeSettings extends NaturalEdge {
  /** Soft fade at the edge, fraction of map width. */
  feather: number;
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

/**
 * A Brush Tool stroke. On a land layer, paint is the land's *texture*: it is
 * clipped to the land shape (MMLand), and paint outside it is kept, hidden,
 * until the land grows over it. On other layers it is drawn as-is.
 */
export interface MMPaint extends MMObjectBase {
  kind: "paint";
  mode: PaintMode;
  /** Eraser: removes whatever is beneath it in the same layer. */
  erase: boolean;
  blend: BlendMode;
  /** Overall stroke opacity — overlapping dabs never exceed it. */
  opacity: number;
  source: PaintSource;
  /** Free: brush samples. Polygon: vertices.
   * Rect/Ellipse: two opposite corners of the bounding box. Grid: unused. */
  points: PaintPoint[];
  /** Free Brush only. */
  brush?: BrushSettings;
  /** Rect/Ellipse/Polygon when `rough` is on (and the feather of all shapes). */
  edge?: EdgeSettings;
  /** Rect/Ellipse/Polygon: use the natural, coastline-style edge. */
  rough?: boolean;
  /** Grid Block only: painted cells as [col, row] pairs. */
  cells?: [number, number][];
  grid?: GridSettings;
  /** Seed for every random choice the engine makes. */
  seed: number;
}

// -----------------------------------------------------------------------------
// Land Tool — the shape of the land
// -----------------------------------------------------------------------------
// A land layer keeps *where* land is apart from *what it looks like*: MMLand
// objects (drawn with the Land tool) add or remove land and so define the
// coastline; MMPaint objects (the Brush tool) only colour the land. Like
// paint, land objects are recipes replayed deterministically at any size.

/** Land sub-tools. */
export type LandMode = "free" | "edge" | "polygon" | "rect" | "ellipse";

export interface MMLand extends MMObjectBase {
  kind: "land";
  mode: LandMode;
  /** Removes land (opens water) instead of adding it. */
  erase: boolean;
  /** Free: brush samples. Edge: lasso outline. Polygon: vertices.
   * Rect/Ellipse: two opposite corners of the bounding box. */
  points: PaintPoint[];
  /** Free only: brush diameter, fraction of the map width. */
  size?: number;
  /** Edge Shape, and Polygon/Rect/Ellipse when `rough` is on. */
  edge?: NaturalEdge;
  /** Polygon/Rect/Ellipse: use the natural, coastline-style edge. */
  rough?: boolean;
  seed: number;
}

/** A land layer's own settings. */
export interface LandSettings {
  /** What land looks like where no texture has been painted yet. */
  base: PaintSource;
}

// -----------------------------------------------------------------------------
// Stamp Tool — placed pictures (mountains, trees, castles, ships…)
// -----------------------------------------------------------------------------
// A stamp is a *placement* of a catalog asset (stamps/catalog.ts): the map
// stores only the asset's key plus how this copy is placed and colored.

/** A drop shadow. Blur and distance are fractions of the stamp's size, so
 * the shadow scales with the stamp. */
export interface ShadowSettings {
  color: string;
  /** 0..1 */
  opacity: number;
  /** 0..1 of the stamp's size. */
  blur: number;
  /** Direction the shadow falls, degrees (0 = right, 90 = down). */
  angle: number;
  /** 0..1 of the stamp's size. */
  distance: number;
}
/** none: no shadow · default: the stamp set's own shadow · layer: the
 * layer's shared stamp shadow · custom: this stamp's own settings. */
export type StampShadowMode = "none" | "default" | "layer" | "custom";
/** How a stamp's shape is used:
 *  none     the picture as drawn
 *  texture  the shape filled with a texture (the land texture of the layer
 *           below by default), keeping the picture's lines and shading
 *  erase    the shape cuts through everything beneath it in its layer */
export type StampClip = "none" | "texture" | "erase";
/** The point a stamp is placed at, turns and grows around: its base (where
 * a tree or a house meets the ground) or its center. */
export type StampPivot = "base" | "center";

export interface MMStamp extends MMObjectBase {
  kind: "stamp";
  /** Catalog asset key ("b:<set>:<variant>" built-in, "u:<id>" uploaded). */
  asset: string;
  /** Center, fractions of the map width / height. */
  x: number;
  y: number;
  /** Width, fraction of the map width (height follows the art's aspect). */
  size: number;
  /** Degrees. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** Vector stamps: outline color and body color (null = no body). */
  ink: string;
  fill: string | null;
  opacity: number;
  /** -180..180 degrees. */
  hue: number;
  /** -1..1 (0 = unchanged), like the Brush Tool's color filters. */
  saturation: number;
  brightness: number;
  contrast: number;
  shadow: StampShadowMode;
  /** Shadow mode "custom". */
  customShadow?: ShadowSettings;
  /** How the stamp mixes with what's beneath it in its layer (unset = normal).
   * Ignored when the layer has a blend mode of its own. */
  blend?: BlendMode;
  /** Clip mask (unset = none). */
  clip?: StampClip;
  /** Clip "texture": what fills the shape. */
  clipSource?: PaintSource;
  /** What (x, y) is: the stamp's base or its center (unset = center, as
   * stamps were placed before pivots existed). */
  pivot?: StampPivot;
  /** Height relative to the art's own proportions (unset = 1). */
  stretch?: number;
}

// -----------------------------------------------------------------------------
// Line Tool — editable vector paths (roads, rivers, borders, walls, fences…)
// -----------------------------------------------------------------------------
// A line keeps its *geometry* (Bézier nodes, see ./lines/geometry) apart from
// its *look*: the same nodes can be drawn as a coloured stroke or as a row of
// stamp pieces, and switching between the two never touches the path. Both
// looks are kept on the object, so a dirt road turned into a stone wall and
// back gets its old colour and width again.

/** Color: a painted stroke. Stamp: pieces of art repeated along the path. */
export type LineMode = "color" | "stamp";
export type LinePattern = "solid" | "dashed" | "dotted" | "dashdot" | "custom";
export type LineCap = "round" | "butt" | "square";
export type LineJoin = "round" | "miter" | "bevel";

/** A painted stroke. Lengths are fractions of the map width, so a road keeps
 * its size relative to the map at every zoom and in print. */
export interface LineColorStroke {
  color: string;
  width: number;
  pattern: LinePattern;
  /** Dash length and gap, in stroke widths (dashed / dash-dot / custom). */
  dash: number;
  gap: number;
  cap: LineCap;
  join: LineJoin;
  /** 0..1 soft, blurred edges. */
  blur: number;
  /** Outline drawn under the stroke on both sides (roads), fraction of map width (0 = none). */
  casing: number;
  casingColor: string;
}

/** The art pieces a Stamp Stroke repeats: catalog asset keys (built-in
 * vector art "b:…", uploaded images "u:…"). */
export interface LineParts {
  /** The repeated piece; several = variants picked at random. */
  seg: string[];
  start?: string | null;
  end?: string | null;
  /** Placed on sharp corners when corners are "split". */
  corner?: string | null;
}

export interface LineStampStroke {
  /** The line-art set the pieces came from (for the panel; may be unknown). */
  set: string;
  parts: LineParts;
  /** Vector art colors (uploaded images keep their own). */
  ink: string;
  fill: string | null;
  /** Thickness of the pieces, fraction of the map width. */
  size: number;
  /** Gap between pieces, fraction of a piece's length (negative overlaps). */
  spacing: number;
  /** Extra rotation of every piece, degrees. */
  rotation: number;
  /** Pieces turn with the path (walls) or stay upright (trees). */
  followPath: boolean;
  /** Sideways shift, in thicknesses (+ = right of the drawing direction). */
  offset: number;
  /** Mirrors the pieces across the path (which side a wall's towers face). */
  flip: boolean;
  /** Stretch each run a little so a whole number of pieces fits. */
  fit: boolean;
  /** One run along the whole path, or a new run (and corner piece) at each sharp corner. */
  corners: "continuous" | "split";
  /** Use the start/end pieces on open lines. */
  caps: boolean;
  /** 0..1 random size / rotation per piece (hedges, tree lines). */
  scaleJitter: number;
  rotationJitter: number;
  /** Side-view art stands on the line ("base"); top-down art straddles it. */
  anchor: "center" | "base";
  seed: number;
}

/** Everything about how a line looks (a "style"): what the tool draws new
 * lines with, what a line keeps, and what the styles library saves. */
export interface LineLook {
  mode: LineMode;
  stroke: LineColorStroke;
  stamp: LineStampStroke;
  opacity: number;
  /** How the line mixes with what's beneath it in its layer (unset = normal). */
  blend?: BlendMode;
}

export interface MMLine extends MMObjectBase, LineLook {
  kind: "line";
  /** Optional name (e.g. "Northern Road"), shown in the Objects list. */
  name?: string;
  /** The library style this line was drawn with (reset returns to it). */
  styleId?: string | null;
  /** A closed loop (city walls, a lake shore) rather than an open path. */
  closed: boolean;
  nodes: LineNode[];
}

// -----------------------------------------------------------------------------
// Text Tool — names, titles and notes, in any language
// -----------------------------------------------------------------------------
// A text keeps its words as plain Unicode (never pictures of letters) plus a
// *look*: the font profile (an Arabic + Latin pairing with fallbacks for
// every other script), size, colour, effects and curve. The text engine
// (./text) shapes it with HarfBuzz — joined Arabic, marks, ligatures,
// mixed directions — and draws the same vector letters on screen, in prints
// and in exports. Lengths are fractions of the map width; letter effects are
// in em (fractions of the text's own size), so they scale with the text.

/** start/end follow the writing direction; left/right are fixed. */
export type TextAlign = "start" | "center" | "end" | "left" | "right";
export type TextDirection = "auto" | "ltr" | "rtl";
/** straight · arc (a circular bend) · path (follows a drawn curve). */
export type TextCurveMode = "straight" | "arc" | "path";
/** How letters follow a curve: warp (the whole line bends smoothly, keeps
 * Arabic joined), letters (each letter turns on its own), words (each word
 * turns as a whole), auto (warp for joined scripts, letters for the rest). */
export type CurveLetters = "auto" | "warp" | "letters" | "words";

export interface TextOutline {
  enabled: boolean;
  color: string;
  /** Thickness, em. */
  width: number;
  /** 0..1 */
  opacity: number;
  join: LineJoin;
  /** outside: drawn behind the letters (a halo around the joined word) · center: on the edge. */
  position: "outside" | "center";
}
export interface TextShadow {
  enabled: boolean;
  color: string;
  /** 0..1 */
  opacity: number;
  /** em */
  blur: number;
  /** em, along the map (the light comes from the same side for every text). */
  offsetX: number;
  offsetY: number;
}

/** Everything about how a text looks (what presets and saved text styles hold). */
export interface TextLook {
  /** Font profile id (see text/fonts). */
  profile: string;
  /** A font chosen by hand for the text (its own scripts); null = the profile's. */
  font: string | null;
  /** Height of the letters (em), fraction of the map width. */
  size: number;
  /** 100..900 (variable fonts take any value; others their nearest real weight). */
  weight: number;
  italic: boolean;
  /** All capitals (Latin, Greek, Cyrillic; other scripts have none). */
  caps: boolean;
  /** em; joined scripts get it only between letters that don't join. */
  letterSpacing: number;
  /** em added at each space. */
  wordSpacing: number;
  /** Baseline to baseline, relative to each font's own natural line height. */
  lineHeight: number;
  align: TextAlign;
  direction: TextDirection;
  /** BCP 47 language ("ar", "fa", "ur", "en"…); "" = from the letters. */
  lang: string;
  /** OpenType features turned on/off by hand ("dlig", "smcp", "onum"…). */
  features: Record<string, boolean>;
  /** 0..1 Arabic elongation (kashida/tatweel) between letters that join. */
  kashida: number;
  fill: string;
  fillOpacity: number;
  /** The whole text (fill, outline and shadow together). */
  opacity: number;
  blend?: BlendMode;
  outline: TextOutline;
  shadow: TextShadow;
  curveMode: TextCurveMode;
  /** Arc: -100..100 (0 straight, + bends like an arch, − like a bowl). */
  curve: number;
  letters: CurveLetters;
}

/** The curve a text follows (curve mode "path"). Nodes are map fractions,
 * like a line's, so the path moves and reshapes like one. */
export interface TextPath {
  nodes: LineNode[];
  /** Read the path from its other end. */
  reverse: boolean;
  /** Where on the path the text sits. */
  align: "start" | "center" | "end";
  /** Shift along the path, fraction of its length (-0.5..0.5). */
  offset: number;
  /** above: the text stands on the path · center: on its middle · below: hangs under it. */
  side: "above" | "center" | "below";
  /** Extra distance from the path, em (+ away from the side the text is on). */
  baseline: number;
  /** Rounds off sharp bends under the letters, so they never collide. */
  smooth: boolean;
}

export interface MMText extends MMObjectBase, TextLook {
  kind: "text";
  text: string;
  /** The anchor (map fractions): the alignment edge of the text, halfway up.
   * Path texts keep it at their middle. */
  x: number;
  y: number;
  /** Degrees (straight and arc texts). */
  rotation: number;
  /** Wrapping width, fraction of the map width; null = one line per paragraph. */
  boxWidth: number | null;
  /** The curve (kept while another curve mode is used, so switching back restores it). */
  path?: TextPath;
  /** Optional name in the Objects list (the text itself otherwise). */
  name?: string;
  /** The library style it was made with (Reset returns to it). */
  styleId?: string | null;
  /** Follows a stamp (a city's name moving with its city). */
  attach?: { to: string; dx: number; dy: number } | null;
}

/** Every object kind a layer can hold. Legacy kinds (MMIcon, MMPath,
 * MMLabel) are converted when a map opens (see ./stamps/migrate). */
export type MMObject = MMBrush | MMStamp | MMLine | MMRegion | MMText | MMPaint | MMLand;

/** Brush-layer role (Inkarnate-style). Optional — older layers read as "custom". */
export type LayerRole = "land" | "water" | "custom";

/**
 * A land layer's coastline (Inkarnate's land-layer coast). All the layer's
 * land shapes are merged into one land mask; the coast follows the edge of
 * the *whole* mask, so overlapping shapes never show inner coastlines and
 * removing land opens glowing, rippled water. The shape settings always
 * apply; `enabled` switches the decoration (outline, beach, shading, glow,
 * waves and depth) on or off. Lengths are fractions of the map width.
 */
export interface CoastEffect {
  /** Coast & water decoration on/off (the coastline shape always applies). */
  enabled: boolean;
  /** Preset the settings came from (null once customized). */
  style: string | null;
  /** The preset a customized coast started from: what its resets return to. */
  baseStyle?: string | null;
  // ---- coastline shape
  /** 0..1 how far the coast wanders from the drawn land edge (0 = exact). */
  roughness: number;
  /** 0..1 how much fine fractal jaggedness is added. */
  detail: number;
  /** 0..1 rounds off small brush wobble before the coast is built. */
  smoothing: number;
  /** 0..1 small islands scattered off the coast. */
  islets: number;
  // ---- land side
  outlineWidth: number;
  outlineColor: string;
  shoreWidth: number;
  shoreStrength: number;
  shoreColor: string;
  /** -1..1 shading just inside the coast: >0 darker, <0 lighter. */
  landShade: number;
  landShadeWidth: number;
  // ---- water side
  glowWidth: number;
  glowOpacity: number;
  glowColor: string;
  waves: number;
  waveSpacing: number;
  /** Distance of the first wave line from the coast. */
  waveOffset: number;
  waveWidth: number;
  waveOpacity: number;
  /** 0..1 how much each further wave fades. */
  waveFade: number;
  /** 0..1 breaks wave lines into dashes, like hand-drawn surf. */
  waveBreakup: number;
  waveColor: string;
  depthStrength: number;
  /** Distance from the coast at which water reaches full depth. */
  depthDistance: number;
  depthColor: string;
}

export interface MMLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  objects: MMObject[];
  role?: LayerRole;
  /** Land layers: coastline settings (unset = defaults). */
  coast?: CoastEffect;
  /** Land layers: base texture (unset = defaults). */
  land?: LandSettings;
  /** The shadow stamps in this layer use in shadow mode "layer" (unset = defaults). */
  stampShadow?: ShadowSettings;
  /** How the whole layer mixes with the layers below it (unset = normal).
   * When set, it replaces its stamps' own blend modes. */
  blend?: BlendMode;
}

export type ResolutionTier = "low" | "medium" | "high" | "ultra";
export type AspectPreset = "landscape" | "portrait" | "square" | "custom";

/** Links a project to its cloud copy: the map's id and the revision these
 * edits are based on. Device-only — never part of the saved document. */
export interface CloudBinding {
  id: string;
  revision: number;
  /** When this device last saved (or loaded) that revision — a local copy
   * edited after it (updatedAt > savedAt) has unsaved changes. */
  savedAt?: number;
}

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
  /** Set when the project is saved in the cloud (see features/account). */
  cloud?: CloudBinding;
}

export function objectCount(layer: MMLayer) {
  return layer.objects.length;
}

/** A loose union of every field any object kind can carry; call sites only
 * set fields matching the target object's own kind (see MapCreatorEditor's
 * updateObject/onPatch call sites). */
export interface MMPatch {
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
  nodes?: LineNode[];
}
