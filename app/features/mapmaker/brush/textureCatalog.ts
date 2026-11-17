/**
 * The Texture Catalog's model: what is listed, and how it is searched,
 * filtered, sorted and grouped. Pure (no DOM, no network), so the catalog
 * and the tests share it; the library itself is loaded by ./textureLibrary.
 *
 * The library is organised the way a cartographer browses it:
 *
 *   creator   who made it: the atelier (built in), the official library,
 *             or me (my own uploads)
 *   style     the look it belongs to (an official pack's `style`)
 *   pack      a set of textures inside a style
 *
 * Filters of different kinds must all hold (AND); choices within one kind
 * are alternatives (OR): two packs ticked show the textures of either.
 */
import { TEXTURE_CATEGORY_KEYS, TEXTURES } from "./textures";
import { LIBRARY_TAGS } from "./libraryTextures";
import {
  indexFor,
  labelMatches,
  matchScore,
  type SearchIndex,
} from "./textureSearch";

export type Creator = "atelier" | "official" | "me";
export const CREATORS: Creator[] = ["atelier", "official", "me"];

/** How textures are filed (built-in and uploaded alike). */
export const CATALOG_CATEGORIES = TEXTURE_CATEGORY_KEYS;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export interface CatalogPack {
  id: string;
  /** Server packs carry a name; built-in ones a translation key. */
  name?: string;
  labelKey?: string;
  creator: Creator;
  /** The style key: "" when the pack has none. */
  style: string;
  locked: boolean;
  createdAt: number;
}

export interface CatalogTexture {
  /** What a map stores: a built-in id, or "u:<asset id>". */
  id: string;
  name?: string;
  labelKey?: string;
  creator: Creator;
  style: string;
  packId: string;
  category: CatalogCategory | null;
  tags: string[];
  createdAt: number;
  /** Average colour (uploaded textures). */
  color: string | null;
  /** Above the plan: a preview only. */
  locked: boolean;
  /** Repeats without seams (uploaded textures may be single sheets). */
  tile: boolean;
  /** The scale it is drawn at when chosen (uploaded textures), else none. */
  defaultScale: number | null;
  /** What it is searched by (see ./textureSearch). */
  index: SearchIndex;
}

// ---- the built-in textures ------------------------------------------------------------
/** The atelier's own style: textures drawn by code. */
export const BUILTIN_STYLE = "procedural";
/** Words each built-in texture is also found by, in English and Arabic. */
const BUILTIN_TAGS: Record<string, string[]> = {
  grass: ["green", "field", "lawn", "plain", "أخضر", "حقل", "سهل"],
  meadow: ["flowers", "field", "spring", "زهور", "حقل", "ربيع"],
  savanna: ["dry", "grass", "plain", "steppe", "جاف", "سهل", "سهوب"],
  forest: ["trees", "woods", "canopy", "أشجار", "غابة"],
  pine: ["conifer", "taiga", "forest", "trees", "مخروطيات", "غابة", "أشجار"],
  jungle: ["rainforest", "tropical", "trees", "استوائية", "غابة مطيرة"],
  swamp: ["marsh", "bog", "wetland", "سبخة", "أهوار"],
  farmland: ["farm", "fields", "crops", "مزارع", "حقول", "زراعة"],
  sand: ["beach", "coast", "شاطئ", "ساحل"],
  dunes: ["sand", "desert", "رمال", "صحراء"],
  desert: ["arid", "dry", "sand", "قاحلة", "جاف", "رمال"],
  dirt: ["soil", "earth", "ground", "تربة", "أرض"],
  mud: ["wet", "soil", "وحل", "تربة"],
  rock: ["stone", "rocky", "حجر", "صخور"],
  mountains: ["peaks", "highlands", "قمم", "مرتفعات"],
  cliffs: ["crags", "rock", "جروف", "صخور"],
  snow: ["winter", "white", "شتاء", "أبيض"],
  ice: ["frozen", "glacier", "متجمد", "نهر جليدي"],
  tundra: ["cold", "arctic", "بارد", "قطبي"],
  ash: ["volcanic", "burnt", "بركاني", "محروق"],
  shallows: ["reef", "coast", "lagoon", "شعاب", "ساحل", "ضحلة"],
  ocean: ["sea", "water", "بحر", "ماء"],
  deep: ["ocean", "abyss", "sea", "أعماق", "بحر"],
  lava: ["fire", "volcano", "magma", "نار", "بركان"],
  parchment: ["paper", "old", "vellum", "ورق", "قديم", "مخطوطة"],
  cobblestone: ["road", "street", "stones", "طريق", "شارع", "حجارة"],
  planks: ["wood", "floor", "boards", "خشب", "أرضية"],
  flagstone: ["floor", "tiles", "paving", "بلاط", "أرضية"],
  inkwash: ["ink", "watercolor", "wash", "حبر", "ألوان مائية"],
  // The Navigators (all also found by "navigator", "chart", "ملاح", "بحري")
  navSeaGrid: [
    "sea",
    "grid",
    "squares",
    "teal",
    "بحر",
    "شبكة",
    "مربعات",
    "فيروزي",
  ],
  navSeaTeal: ["sea", "teal", "water", "بحر", "فيروزي", "ماء"],
  navWaveMarks: ["sea", "waves", "teal", "بحر", "أمواج", "موج"],
  navSeaChart: [
    "sea",
    "watercolor",
    "rhumb",
    "بحر",
    "ألوان مائية",
    "خطوط البوصلة",
  ],
  navParchment: ["paper", "old", "stains", "ورق", "قديم", "بقع", "رق"],
  navRhumbParchment: [
    "paper",
    "rhumb",
    "compass",
    "lines",
    "ورق",
    "بوصلة",
    "خطوط",
  ],
  navCreamPaper: ["paper", "crumpled", "cream", "ورق", "مجعد", "كريمي"],
  navRicePaper: ["paper", "fibres", "white", "ورق", "ألياف", "أبيض", "أرز"],
  navIslandGrass: ["grass", "island", "green", "عشب", "جزيرة", "أخضر"],
  navHills: [
    "hills",
    "contours",
    "island",
    "mountains",
    "تلال",
    "خطوط كنتور",
    "جزيرة",
    "جبال",
  ],
  navOchreLand: ["land", "ochre", "yellow", "أرض", "مغرة", "أصفر"],
  navShore: [
    "beach",
    "sand",
    "coast",
    "island",
    "شاطئ",
    "رمل",
    "ساحل",
    "جزيرة",
  ],
};
const NAVIGATOR_TAGS = [
  "navigator",
  "chart",
  "sea chart",
  "ملاح",
  "ملاحون",
  "بحري",
  "خريطة بحرية",
];
/** The atelier's packs: one per category. */
export const builtinPackId = (category: string) => `builtin:${category}`;

/**
 * The built-in textures as catalog entries. `names(key)` gives a
 * translation key's text in every language (so either finds them).
 */
export function builtinCatalog(names: (labelKey: string) => string[]): {
  packs: CatalogPack[];
  textures: CatalogTexture[];
} {
  const textures = TEXTURES.map((t): CatalogTexture => {
    const category: CatalogCategory = t.category,
      // A word may come from both lists (dunes: "desert"): each tag once.
      tags = [
        ...new Set([
          category,
          ...(BUILTIN_TAGS[t.id] ?? LIBRARY_TAGS[t.id] ?? []),
          ...(category === "navigators" ? NAVIGATOR_TAGS : []),
        ]),
      ];
    return {
      id: t.id,
      labelKey: t.labelKey,
      creator: "atelier",
      style: BUILTIN_STYLE,
      packId: builtinPackId(category),
      category,
      tags,
      createdAt: 0,
      color: null,
      locked: false,
      tile: true,
      defaultScale: null,
      index: indexFor({
        names: [...names(t.labelKey), t.id],
        other: [...tags, ...names(`mmTexCat_${category}`)],
      }),
    };
  });
  const packs = CATALOG_CATEGORIES.filter((c) =>
    textures.some((t) => t.category === c),
  ).map((c): CatalogPack => ({
    id: builtinPackId(c),
    labelKey: `mmTexCat_${c}`,
    creator: "atelier",
    style: BUILTIN_STYLE,
    locked: false,
    createdAt: 0,
  }));
  return { packs, textures };
}

// ---- queries --------------------------------------------------------------------------
/** What the hierarchy has selected: a creator, a style or some packs. */
export type HierarchyNode =
  | { kind: "all" }
  | { kind: "creator"; creator: Creator }
  | { kind: "style"; creator: Creator; style: string }
  | { kind: "packs"; packs: string[] };

/** A style's key, unique across creators. */
export const styleKey = (creator: Creator, style: string) =>
  `${creator}|${style}`;
export const UNTAGGED = "__untagged__";

export interface CatalogQuery {
  text: string;
  node: HierarchyNode;
  /** Filters (each OR within, AND across). Empty = no filter. */
  packs: string[];
  creators: Creator[];
  /** Style keys (see styleKey). */
  styles: string[];
  /** Tags (and categories); UNTAGGED for textures without any. */
  tags: string[];
  /** Only textures this map already uses. */
  usedOnly: boolean;
  /** Only textures added in the last 30 days. */
  newOnly: boolean;
}
export const EMPTY_QUERY: CatalogQuery = {
  text: "",
  node: { kind: "all" },
  packs: [],
  creators: [],
  styles: [],
  tags: [],
  usedOnly: false,
  newOnly: false,
};
const NEW_DAYS = 30;

function inNode(t: CatalogTexture, node: HierarchyNode) {
  switch (node.kind) {
    case "all":
      return true;
    case "creator":
      return t.creator === node.creator;
    case "style":
      return t.creator === node.creator && t.style === node.style;
    case "packs":
      return node.packs.includes(t.packId);
  }
}

/** The textures a query lists, with their search score (best first only when sorted so). */
export function queryTextures(
  textures: CatalogTexture[],
  q: CatalogQuery,
  ctx: { used: ReadonlySet<string>; now: number; ignoreNode?: boolean },
): { texture: CatalogTexture; score: number }[] {
  const out: { texture: CatalogTexture; score: number }[] = [];
  for (const t of textures) {
    if (!ctx.ignoreNode && !inNode(t, q.node)) continue;
    if (q.packs.length && !q.packs.includes(t.packId)) continue;
    if (q.creators.length && !q.creators.includes(t.creator)) continue;
    if (q.styles.length && !q.styles.includes(styleKey(t.creator, t.style)))
      continue;
    if (q.tags.length) {
      const own = [...t.tags, ...(t.category ? [t.category] : [])],
        untagged = t.tags.length === 0;
      if (!q.tags.some((x) => (x === UNTAGGED ? untagged : own.includes(x))))
        continue;
    }
    if (q.usedOnly && !ctx.used.has(t.id)) continue;
    if (q.newOnly && ctx.now - t.createdAt > NEW_DAYS * 86_400_000) continue;
    const score = matchScore(t.index, q.text);
    if (score > 0) out.push({ texture: t, score });
  }
  return out;
}

export type CatalogSort = "relevance" | "title" | "newest";
export function sortTextures(
  list: { texture: CatalogTexture; score: number }[],
  sort: CatalogSort,
  label: (t: CatalogTexture) => string,
  locale?: string,
) {
  const byTitle = (
    a: { texture: CatalogTexture },
    b: { texture: CatalogTexture },
  ) => label(a.texture).localeCompare(label(b.texture), locale);
  return [...list].sort((a, b) =>
    sort === "newest"
      ? b.texture.createdAt - a.texture.createdAt || byTitle(a, b)
      : sort === "title"
        ? byTitle(a, b)
        : b.score - a.score,
  );
}

export type CatalogGroup = "none" | "pack" | "category" | "tag";
/** Groups in first-seen order; a texture with several tags is under each. */
export function groupTextures(
  list: CatalogTexture[],
  by: CatalogGroup,
): { key: string; items: CatalogTexture[] }[] {
  if (by === "none") return [{ key: "", items: list }];
  const groups = new Map<string, CatalogTexture[]>();
  const add = (key: string, t: CatalogTexture) =>
    groups.set(key, [...(groups.get(key) ?? []), t]);
  for (const t of list) {
    if (by === "pack") add(t.packId, t);
    else if (by === "category") add(t.category ?? "", t);
    else if (t.tags.length) for (const tag of t.tags) add(tag, t);
    else add(UNTAGGED, t);
  }
  return [...groups].map(([key, items]) => ({ key, items }));
}

/** How many textures each pack, style and creator holds in a result. */
export function hierarchyCounts(list: CatalogTexture[]) {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const t of list) {
    bump(`c:${t.creator}`);
    bump(`s:${styleKey(t.creator, t.style)}`);
    bump(`p:${t.packId}`);
  }
  return counts;
}

/** Packs and tags whose names match the search: offered as filters. */
export function suggestions(
  text: string,
  packs: { id: string; label: string }[],
  tags: string[],
  max = 6,
) {
  if (text.trim().length < 2) return [];
  return [
    ...packs
      .filter((p) => labelMatches(p.label, text))
      .map((p) => ({ kind: "pack" as const, key: p.id, label: p.label })),
    ...tags
      .filter((t) => t !== UNTAGGED && labelMatches(t, text))
      .map((t) => ({ kind: "tag" as const, key: t, label: t })),
  ].slice(0, max);
}
