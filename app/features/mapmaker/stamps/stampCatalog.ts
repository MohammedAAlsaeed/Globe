/**
 * The Stamp Catalog's model: the stamps a person can browse, as catalog
 * entries. Pure (no DOM, no network), so the catalog and the tests share it.
 *
 * It is organised like the Texture Catalog (see ../brush/textureCatalog,
 * whose search, filters, sorting and grouping it reuses):
 *
 *   creator   the atelier (built in), the official library, or me
 *   style     the look a pack belongs to (built in: the atelier's drawings
 *             or the classic symbols; server packs: their `style`)
 *   pack      a set of stamps inside a style (built in: one per category)
 *   set       one stamp, or a Stamp Set — variants of one thing (six
 *             pines); each variant can be chosen on its own
 *
 * A set is found by its name, its variants' names, its pack, its tags and
 * its category, in English and Arabic.
 */
import type {
  CatalogItem,
  CatalogPack,
  Creator,
} from "../brush/textureCatalog";
import { indexFor } from "../brush/textureSearch";
import { STAMP_CATEGORIES, type StampCategory, type StampSet } from "./catalog";

export interface CatalogStamp extends CatalogItem {
  /** The set's id (what the Stamp Tool selects). */
  id: string;
  set: StampSet;
  /** Built-in sets are translated; server sets carry their own name. */
  name?: string;
  labelKey?: string;
  category: StampCategory;
  /** Each variant: its asset key and (server sets) its own name. */
  variants: { key: string; name?: string }[];
  /** Above the plan: a preview only. */
  locked: boolean;
}

/** Built-in styles (labels: stcStyle_<key>). */
export const ATELIER_STYLE = "atelier";
export const CLASSIC_STYLE = "classic";
/** The atelier's packs: its drawings, one per category, and the classic symbols. */
export const builtinStampPack = (set: Pick<StampSet, "pack" | "category">) =>
  set.pack === "classic" ? "builtin:classic" : `builtin:${set.category}`;

const BUILTIN = new Set(["atelier", "classic", "lines"]);
export const isBuiltinSet = (s: Pick<StampSet, "pack">) => BUILTIN.has(s.pack);

/** Server packs by id: how the catalog lists them. */
export function stampPacks(
  sets: StampSet[],
  serverPacks: {
    id: string;
    name: string;
    style: string | null;
    official: boolean;
    locked: boolean;
    created_at?: string;
  }[],
): CatalogPack[] {
  const builtin = new Map<string, CatalogPack>();
  for (const s of sets) {
    if (!isBuiltinSet(s)) continue;
    const id = builtinStampPack(s);
    if (!builtin.has(id))
      builtin.set(id, {
        id,
        labelKey:
          s.pack === "classic"
            ? "stcPackClassic"
            : (STAMP_CATEGORIES.find((c) => c.key === s.category)?.labelKey ??
              s.category),
        creator: "atelier",
        style: s.pack === "classic" ? CLASSIC_STYLE : ATELIER_STYLE,
        locked: false,
        createdAt: 0,
      });
  }
  // Atelier drawings first (in category order), then the classic symbols.
  const order = (p: CatalogPack) =>
    p.id === "builtin:classic"
      ? 99
      : STAMP_CATEGORIES.findIndex((c) => `builtin:${c.key}` === p.id);
  return [
    ...[...builtin.values()].sort((a, b) => order(a) - order(b)),
    ...serverPacks.map((p): CatalogPack => ({
      id: p.id,
      name: p.name,
      creator: p.official ? "official" : "me",
      style: p.style ?? "",
      locked: p.locked,
      createdAt: p.created_at ? Date.parse(p.created_at) || 0 : 0,
    })),
  ];
}

/**
 * The sets as catalog entries. `names(key)` gives a translation key's text
 * in every language (so either finds them); `packName(id)` a server pack's.
 */
export function catalogStamps(
  sets: StampSet[],
  names: (labelKey: string) => string[],
): CatalogStamp[] {
  return sets.map((s): CatalogStamp => {
    const builtin = isBuiltinSet(s),
      creator: Creator = builtin ? "atelier" : (s.creator ?? "official"),
      tags = [...new Set(s.tags)],
      catLabel = STAMP_CATEGORIES.find((c) => c.key === s.category)?.labelKey;
    return {
      id: s.id,
      set: s,
      ...(s.labelKey ? { labelKey: s.labelKey } : { name: s.name ?? s.id }),
      creator,
      style: builtin
        ? s.pack === "classic"
          ? CLASSIC_STYLE
          : ATELIER_STYLE
        : (s.style ?? ""),
      packId: builtin ? builtinStampPack(s) : s.pack,
      category: s.category,
      tags,
      createdAt: s.createdAt ?? 0,
      locked: !!s.locked,
      variants: s.assets.map((key, i) => ({
        key,
        ...(s.variantNames?.[i] ? { name: s.variantNames[i] } : {}),
      })),
      index: indexFor({
        names: [
          ...(s.labelKey ? names(s.labelKey) : [s.name ?? ""]),
          ...(s.variantNames ?? []),
          s.id.replace(/^classic-/, ""),
        ],
        other: [
          ...tags,
          ...(s.variantTags ?? []).flat(),
          s.packName ?? "",
          s.style ?? "",
          s.category,
          ...(catLabel ? names(catLabel) : []),
        ],
      }),
    };
  });
}

/** The variant to place: a fixed one, or (null) a random one each time. */
export interface StampChoice {
  set: string;
  variant: number | null;
}
