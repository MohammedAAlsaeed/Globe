/**
 * The server's Stamp Catalog (GET stamp-library) as catalog sets: stamps
 * sharing a `set_key` within a pack become one set whose variants keep
 * their own names and tags; a set takes its placing defaults (anchor, size,
 * shadow) from its first stamp. Pure, so the tests use it too.
 */
import type { Asset, StampLibrary } from "../../account/types";
import {
  STAMP_CATEGORIES,
  type StampAsset,
  type StampCategory,
  type StampSet,
} from "./catalog";

const CATEGORIES = new Set<string>(
  STAMP_CATEGORIES.map((c) => c.key).filter(
    (k) => k !== "library" && k !== "custom",
  ),
);
export const uploadedKey = (assetId: string) => `u:${assetId}`;

/** Defaults for uploaded pictures: as drawn (no recolor), no added shadow. */
export function imageSet(
  id: string,
  pack: string,
  name: string,
  category: StampCategory,
  assetKeys: string[],
  extra: Partial<StampSet> = {},
): StampSet {
  return {
    id,
    pack,
    category,
    name,
    tags: [],
    assets: assetKeys,
    vector: false,
    ink: "#3a2e22",
    fill: null,
    size: 0.05,
    shadow: false,
    rotationJitter: 0,
    randomFlip: false,
    pivot: "center",
    ...extra,
  };
}
export const imageAsset = (
  a: Pick<Asset, "id" | "url" | "thumb_url" | "width" | "height">,
  set: string,
): StampAsset => ({
  key: uploadedKey(a.id),
  set,
  kind: "image",
  url: a.url,
  thumbUrl: a.thumb_url,
  w: a.width ?? 1,
  h: a.height ?? 1,
});
const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

type LibraryStamp = StampLibrary["stamps"][number];
/** The library's packs and stamps as catalog sets (grouped by set_key). */
export function librarySets(lib: StampLibrary) {
  const byPack = new Map<string, LibraryStamp[]>();
  for (const a of lib.stamps)
    byPack.set(a.pack_id, [...(byPack.get(a.pack_id) ?? []), a]);
  return lib.packs.flatMap((pack) => {
    const groups = new Map<string, LibraryStamp[]>();
    for (const a of byPack.get(pack.id) ?? []) {
      const key = a.set_key ?? `one-${a.id}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    return [...groups].map(([key, list]) => {
      const id = `s:${pack.id}:${key}`,
        first = list[0],
        meta = first.meta ?? {},
        filed = list.find((a) => a.category && CATEGORIES.has(a.category)),
        category = (filed?.category ??
          (pack.official ? "library" : "custom")) as StampCategory;
      return {
        set: imageSet(
          id,
          pack.id,
          first.name,
          category,
          list.map((a) => uploadedKey(a.id)),
          {
            tags: [...new Set(list.flatMap((a) => a.tags))],
            size: meta.size ?? 0.05,
            pivot: meta.pivot ?? "center",
            shadow: meta.shadow ?? false,
            locked: pack.locked,
            creator: pack.official ? "official" : "me",
            packName: pack.name,
            style: pack.style ?? "",
            createdAt: Math.max(...list.map((a) => time(a.created_at))),
            variantNames: list.map((a) => a.name),
            variantTags: list.map((a) => a.tags),
          },
        ),
        // A locked pack's stamps carry only their preview: shown, never drawn.
        assets: list.map((a) =>
          imageAsset({ ...a, url: a.url ?? a.thumb_url }, id),
        ),
      };
    });
  });
}
