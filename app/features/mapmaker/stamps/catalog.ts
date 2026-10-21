/**
 * The stamp catalog: every stamp a map can use, grouped into sets.
 *
 *   asset  one drawable picture, addressed by a key stored in the map:
 *            "b:<set>:<variant>"  built-in vector art (./builtin)
 *            "u:<asset id>"       an uploaded image (server asset library)
 *   set    variants of one thing (six different pines). Placing from a set
 *          can pick a random variant each time.
 *   pack   who made the sets: "atelier" and "classic" ship with the app;
 *          server packs (official or a person's own uploads) are added at
 *          runtime with `registerRemoteSets`.
 *
 * A map stores only asset keys, so the same tree drawn fifty times is one
 * picture with fifty placements (see MMStamp).
 */
import { BUILTIN_SETS, CLASSIC_SETS, type BuiltinSet } from "./builtin";
import type { VectorArt } from "./art";

/** `library`: official server packs not filed elsewhere (and locked packs);
 * `custom`: the person's own uploads. */
export type StampCategory =
  | "terrain"
  | "vegetation"
  | "settlements"
  | "water"
  | "symbols"
  | "library"
  | "custom";
export const STAMP_CATEGORIES: { key: StampCategory; labelKey: string }[] = [
  { key: "terrain", labelKey: "stCatTerrain" },
  { key: "vegetation", labelKey: "stCatVegetation" },
  { key: "settlements", labelKey: "stCatSettlements" },
  { key: "water", labelKey: "stCatWater" },
  { key: "symbols", labelKey: "stCatSymbols" },
  { key: "library", labelKey: "stCatLibrary" },
  { key: "custom", labelKey: "stCatCustom" },
];

export type StampAsset =
  | { key: string; set: string; kind: "vector"; art: () => VectorArt }
  | {
      key: string;
      set: string;
      kind: "image";
      url: string;
      w: number;
      h: number;
    };

export interface StampSet {
  id: string;
  pack: string;
  category: StampCategory;
  /** Built-in sets are translated; server sets carry their own name. */
  labelKey?: string;
  name?: string;
  tags: string[];
  assets: string[];
  /** Vector sets can be recolored (ink and fill); images cannot. */
  vector: boolean;
  ink: string;
  fill: string | null;
  size: number;
  shadow: boolean;
  rotationJitter: number;
  randomFlip: boolean;
  /** Where new stamps of this set are anchored (see MMStamp.pivot). */
  pivot: "base" | "center";
  /** Server packs above the person's plan: shown, but not placeable. */
  locked?: boolean;
  /** Not listed in the catalog: uploaded stamps a map uses, loaded only to draw it. */
  hidden?: boolean;
}

export const builtinKey = (set: string, variant: number) =>
  `b:${set}:${variant}`;

const sets = new Map<string, StampSet>();
const assets = new Map<string, StampAsset>();
const listeners = new Set<() => void>();
let version = 0;

function addBuiltin(b: BuiltinSet, hidden = false) {
  const keys: string[] = [];
  for (let v = 0; v < b.variants; v++) {
    const key = builtinKey(b.id, v);
    let art: VectorArt | null = null;
    assets.set(key, {
      key,
      set: b.id,
      kind: "vector",
      art: () => (art ??= b.draw(v)),
    });
    keys.push(key);
  }
  sets.set(b.id, {
    id: b.id,
    pack: b.pack,
    category: b.category,
    labelKey: b.labelKey,
    tags: b.tags,
    assets: keys,
    vector: true,
    ink: b.ink,
    fill: b.fill,
    size: b.size,
    shadow: b.shadow,
    rotationJitter: b.rotationJitter,
    randomFlip: b.randomFlip,
    pivot: b.pivot,
    ...(hidden ? { hidden: true } : {}),
  });
}
for (const b of [...BUILTIN_SETS, ...CLASSIC_SETS]) addBuiltin(b);

/**
 * Built-in art used by other tools (the Line Tool's wall and fence pieces):
 * drawable by key like any stamp — same rasters, colors and print path —
 * but hidden from the Stamp Tool's catalog.
 */
export function registerHiddenArt(list: BuiltinSet[]) {
  for (const b of list) if (!sets.has(b.id)) addBuiltin(b, true);
}

const BUILTIN_PACKS = new Set(["atelier", "classic", "lines"]);
/**
 * Adds sets loaded from the server. `replace` first drops the server sets
 * listed before (a fresh copy of the library, or signing out); stamps loaded
 * only to draw a map (hidden sets) are kept.
 */
export function registerRemoteSets(
  list: { set: StampSet; assets: StampAsset[] }[],
  replace = false,
) {
  if (replace)
    for (const [id, s] of sets)
      if (!BUILTIN_PACKS.has(s.pack) && !s.hidden) {
        sets.delete(id);
        for (const key of s.assets)
          if (setOfAsset(key)?.id === id) assets.delete(key);
      }
  for (const { set, assets: a } of list) {
    // A listed set takes over assets loaded earlier only to draw a map.
    for (const asset of a) {
      const old = assets.get(asset.key);
      if (old && old.set !== set.id) {
        const hidden = sets.get(old.set);
        if (hidden?.hidden) sets.delete(hidden.id);
      }
      assets.set(asset.key, asset);
    }
    sets.set(set.id, set);
  }
  version++;
  listeners.forEach((l) => l());
}
/** For useSyncExternalStore: re-render when server sets arrive. */
export function subscribeCatalog(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const catalogVersion = () => version;

export const stampSet = (id: string) => sets.get(id);
export const stampAsset = (key: string) => assets.get(key);
export const allSets = () => [...sets.values()].filter((s) => !s.hidden);
/** The set an asset belongs to (missing for assets no longer available). */
export const setOfAsset = (key: string) => {
  const a = assets.get(key);
  return a ? sets.get(a.set) : undefined;
};

/** Natural size (art units or pixels) of an asset, for its aspect ratio. */
export function assetSize(a: StampAsset) {
  if (a.kind === "image") return { w: a.w, h: a.h };
  const art = a.art();
  return { w: art.w, h: art.h };
}

/** Sets matching a search (name in the current language, or a tag), best
 * matches first: names before tags, starting matches before inner ones. */
export function searchSets(
  query: string,
  label: (s: StampSet) => string,
  category: StampCategory | "all",
) {
  const q = query.trim().toLowerCase(),
    inCategory = allSets().filter(
      (s) => category === "all" || s.category === category,
    );
  if (!q) return inCategory;
  const score = (s: StampSet) => {
    const name = label(s).toLowerCase(),
      words = [...s.tags, s.id].map((w) => w.toLowerCase());
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (words.some((w) => w.startsWith(q))) return 2;
    if (words.some((w) => w.includes(q))) return 3;
    return -1;
  };
  return inCategory
    .map((s) => ({ s, k: score(s) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}
