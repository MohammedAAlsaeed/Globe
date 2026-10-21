/**
 * The Line Tool's art catalog: what a Stamp Stroke can repeat along a path.
 *
 *   built-in   original vector pieces (./art): walls, fences, palisades,
 *              railways, hedges, cliffs, ridges… recolourable, sharp in print
 *   stamps     any Stamp Tool set (trees, rocks, mountains…), lined up
 *   library    official line packs from the server (admins)
 *   custom     the person's own uploaded line pieces
 *
 * A set names its pieces by *asset key* — the same keys the Stamp Tool uses
 * ("b:…" vector art, "u:…" uploaded images) — so drawing, colouring,
 * caching, uploads and printing all go through one proven path
 * (../stamps/render). A line stores the keys themselves (MMLine.stamp.parts),
 * so it still draws even when its set isn't listed any more.
 */
import {
  builtinKey,
  registerHiddenArt,
  stampAsset,
  stampSet,
  allSets,
  assetSize,
  type StampSet,
} from "../stamps/catalog";
import type { BuiltinSet } from "../stamps/builtin";
import type { VectorArt } from "../stamps/art";
import type { LineParts, LineStampStroke } from "../types";
import * as art from "./art";

export type LineCategory =
  "walls" | "fences" | "roads" | "nature" | "stamps" | "library" | "custom";
export const LINE_CATEGORIES: { key: LineCategory; labelKey: string }[] = [
  { key: "walls", labelKey: "lnCatWalls" },
  { key: "fences", labelKey: "lnCatFences" },
  { key: "roads", labelKey: "lnCatRoads" },
  { key: "nature", labelKey: "lnCatNature" },
  { key: "stamps", labelKey: "lnCatStamps" },
  { key: "library", labelKey: "lnCatLibrary" },
  { key: "custom", labelKey: "lnCatCustom" },
];

/** Defaults a set gives a Stamp Stroke when picked (the rest of the look stays). */
export type LineSetDefaults = Pick<
  LineStampStroke,
  | "ink"
  | "fill"
  | "size"
  | "spacing"
  | "followPath"
  | "fit"
  | "corners"
  | "caps"
  | "scaleJitter"
  | "rotationJitter"
  | "anchor"
>;

export interface LineArtSet {
  id: string;
  category: LineCategory;
  /** Built-in sets are translated; server sets carry their own name. */
  labelKey?: string;
  name?: string;
  tags: string[];
  parts: LineParts;
  /** Vector pieces can be recoloured (ink / fill). */
  vector: boolean;
  defaults: LineSetDefaults;
  /** Server packs above the person's plan: shown, but not usable. */
  locked?: boolean;
}

// ---- built-in pieces ------------------------------------------------------------------
const INK = "#3a2e22";
/** Registers art under hidden stamp sets: `b:ln-<name>:<variant>`. */
function pieces(
  name: string,
  variants: number,
  draw: (seed: number) => VectorArt,
): string[] {
  const id = `ln-${name}`;
  const def: BuiltinSet = {
    id,
    pack: "lines",
    category: "symbols",
    labelKey: `ln_${name}`,
    tags: [],
    variants,
    draw: (v) => draw(seedOf(id, v)),
    ink: INK,
    fill: null,
    size: 0.02,
    shadow: false,
    rotationJitter: 0,
    randomFlip: false,
    pivot: "center",
  };
  registerHiddenArt([def]);
  return Array.from({ length: variants }, (_, v) => builtinKey(id, v));
}
const seedOf = (id: string, v: number) => {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h ^ (v * 2654435761)) >>> 0;
};

const base: LineSetDefaults = {
  ink: INK,
  fill: "#cfc2a4",
  size: 0.008,
  spacing: 0,
  followPath: true,
  fit: true,
  corners: "split",
  caps: true,
  scaleJitter: 0,
  rotationJitter: 0,
  anchor: "center",
};
const builtin = (
  id: string,
  category: LineCategory,
  parts: LineParts,
  defaults: Partial<LineSetDefaults>,
  tags: string[] = [],
): LineArtSet => ({
  id: `lb:${id}`,
  category,
  labelKey: `ln_${id}`,
  tags,
  parts,
  vector: true,
  defaults: { ...base, ...defaults },
});

let builtins: LineArtSet[] | null = null;
/** The built-in line sets (art registered on first use). */
export function builtinLineSets(): LineArtSet[] {
  if (builtins) return builtins;
  const stoneBlock = pieces("stoneWallBlock", 1, art.stoneWallBlock)[0],
    tower = pieces("castleTower", 1, art.castleTower)[0],
    post = pieces("fencePost", 1, art.fencePost)[0];
  builtins = [
    builtin(
      "stoneWall",
      "walls",
      {
        seg: pieces("stoneWall", 3, art.stoneWall),
        start: stoneBlock,
        end: stoneBlock,
        corner: stoneBlock,
      },
      { size: 0.009, fill: "#c9bda3" },
      ["stone", "wall", "dry"],
    ),
    builtin(
      "castleWall",
      "walls",
      {
        seg: pieces("castleWall", 2, art.castleWall),
        start: tower,
        end: tower,
        corner: tower,
      },
      { size: 0.012, fill: "#d3c4a6" },
      ["castle", "fort", "rampart", "city"],
    ),
    builtin(
      "palisade",
      "walls",
      { seg: pieces("palisade", 3, art.palisade) },
      { size: 0.008, fill: "#a5835a", corners: "continuous" },
      ["stockade", "logs", "wood", "camp"],
    ),
    builtin(
      "woodenFence",
      "fences",
      {
        seg: pieces("woodenFence", 3, art.woodenFence),
        start: post,
        end: post,
        corner: post,
      },
      { size: 0.005, fill: "#a8875e" },
      ["fence", "rail", "farm"],
    ),
    builtin(
      "hedge",
      "fences",
      { seg: pieces("hedge", 3, art.hedge) },
      {
        size: 0.01,
        ink: "#26301c",
        fill: "#6f8c48",
        corners: "continuous",
        scaleJitter: 0.2,
        spacing: -0.2,
        fit: false,
      },
      ["bush", "hedgerow", "green"],
    ),
    builtin(
      "railway",
      "roads",
      { seg: pieces("railway", 2, art.railway) },
      { size: 0.008, fill: "#8a6a45", corners: "continuous", caps: false },
      ["rail", "train", "track"],
    ),
    builtin(
      "footprints",
      "roads",
      { seg: pieces("footprints", 2, art.footprints) },
      {
        size: 0.006,
        fill: null,
        spacing: 0.4,
        corners: "continuous",
        fit: false,
        caps: false,
      },
      ["steps", "trail", "journey"],
    ),
    builtin(
      "chevrons",
      "roads",
      { seg: pieces("chevrons", 1, art.chevrons) },
      {
        size: 0.007,
        fill: null,
        spacing: 0.6,
        corners: "continuous",
        fit: false,
        caps: false,
      },
      ["arrow", "route", "march"],
    ),
    builtin(
      "cliff",
      "nature",
      { seg: pieces("cliff", 3, art.cliff) },
      { size: 0.014, fill: "#b9ab8f", corners: "continuous", caps: false },
      ["cliff", "escarpment", "edge"],
    ),
    builtin(
      "ridge",
      "nature",
      { seg: pieces("ridge", 4, art.ridge) },
      {
        size: 0.03,
        fill: "#e0d2b2",
        corners: "continuous",
        caps: false,
        anchor: "base",
        spacing: -0.3,
        fit: false,
        followPath: false,
        scaleJitter: 0.25,
      },
      ["mountain", "range", "peaks"],
    ),
    builtin(
      "waveLine",
      "nature",
      { seg: pieces("waveLine", 1, art.waveLine) },
      {
        size: 0.006,
        ink: "#d6e4ea",
        fill: null,
        corners: "continuous",
        caps: false,
        spacing: 0.1,
        fit: false,
      },
      ["surf", "sea", "coast"],
    ),
  ];
  return builtins;
}

// ---- server line packs ------------------------------------------------------------------
let remote: LineArtSet[] = [];
const listeners = new Set<() => void>();
let version = 0;
/** Replaces the line sets loaded from the server (see ./remote). */
export function setRemoteLineSets(list: LineArtSet[]) {
  remote = list;
  version++;
  listeners.forEach((l) => l());
}
export function subscribeLineCatalog(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const lineCatalogVersion = () => version;

// ---- stamps as line art --------------------------------------------------------------------
/** A Stamp Tool set used as line art: its variants stand in a row. */
export function stampLineSet(s: StampSet): LineArtSet {
  const first = s.assets[0] ? stampAsset(s.assets[0]) : undefined,
    size = first ? assetSize(first) : { w: 1, h: 1 },
    // A stamp's size is its width; a line piece's is its thickness (height).
    thick = s.size * (size.h / Math.max(1e-6, size.w));
  return {
    id: `ls:${s.id}`,
    category: "stamps",
    labelKey: s.labelKey,
    name: s.name,
    tags: s.tags,
    parts: { seg: s.assets },
    vector: s.vector,
    locked: s.locked,
    defaults: {
      ...base,
      ink: s.ink,
      fill: s.fill,
      size: Math.max(0.002, Math.min(0.2, thick)),
      spacing: 0.15,
      followPath: false,
      fit: false,
      corners: "continuous",
      caps: false,
      scaleJitter: s.randomFlip ? 0.25 : 0,
      rotationJitter: s.rotationJitter > 0 ? 0.3 : 0,
      anchor: s.pivot,
    },
  };
}

/** Every line set, in catalog order. */
export function allLineSets(): LineArtSet[] {
  const stamps = allSets()
    .filter((s) => !s.locked && s.assets.length > 0 && s.pack !== "classic")
    .map(stampLineSet);
  return [...builtinLineSets(), ...remote, ...stamps];
}
export function lineSet(id: string): LineArtSet | undefined {
  if (id.startsWith("ls:")) {
    const s = stampSet(id.slice(3));
    return s ? stampLineSet(s) : undefined;
  }
  return [...builtinLineSets(), ...remote].find((s) => s.id === id);
}
export const defaultLineSet = () => builtinLineSets()[0];

/** A line set's name in the current language. */
export function lineSetLabel(t: (k: string) => string, s: LineArtSet) {
  return s.name ?? (s.labelKey ? t(s.labelKey) : s.id);
}

/** A piece's drawable asset (undefined while an uploaded piece isn't loaded). */
export const pieceAsset = (key: string) => stampAsset(key);

/** Natural aspect (length / thickness) of a piece, or null while unknown. */
export function pieceAspect(key: string): number | null {
  const a = stampAsset(key);
  if (!a) return null;
  const { w, h } = assetSize(a);
  return h > 0 ? w / h : null;
}

/** Every asset key a line uses (to load uploaded pieces a map needs). */
export function lineAssetKeys(parts: LineParts): string[] {
  return [...parts.seg, parts.start, parts.end, parts.corner].filter(
    (k): k is string => !!k,
  );
}

/** Search by name (current language) or tag, best matches first. */
export function searchLineSets(
  query: string,
  label: (s: LineArtSet) => string,
  category: LineCategory | "all",
) {
  const q = query.trim().toLowerCase(),
    list = allLineSets().filter(
      (s) => category === "all" || s.category === category,
    );
  if (!q) return list;
  const score = (s: LineArtSet) => {
    const name = label(s).toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (s.tags.some((w) => w.toLowerCase().startsWith(q))) return 2;
    if (s.tags.some((w) => w.toLowerCase().includes(q))) return 3;
    return -1;
  };
  return list
    .map((s) => ({ s, k: score(s) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}
