/**
 * Stamps from the server's asset library, added to the catalog.
 *
 *   loadLibrary    the signed-in person's library: official packs (those
 *                  above their plan appear locked, as one preview card) and
 *                  their own uploads ("My stamps").
 *   resolvePlaced  uploaded stamps a map already uses but the library
 *                  doesn't list (a pack locked after a downgrade, say), so
 *                  every map still draws completely.
 *
 * Assets sharing a `set_key` within a pack become one set with variants.
 */
import { library } from "../../account/api";
import type { Asset, AssetPack } from "../../account/types";
import { registerRemoteSets, stampAsset, type StampAsset, type StampCategory, type StampSet } from "./catalog";

const CATEGORIES: StampCategory[] = ["terrain", "vegetation", "settlements", "water", "symbols"];
export const uploadedKey = (assetId: string) => `u:${assetId}`;

/** Defaults for uploaded pictures: as drawn (no recolor), no added shadow. */
function imageSet(id: string, pack: string, name: string, category: StampCategory, assetKeys: string[], extra: Partial<StampSet> = {}): StampSet {
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
    ...extra,
  };
}
const imageAsset = (a: Asset, set: string): StampAsset => ({
  key: uploadedKey(a.id),
  set,
  kind: "image",
  url: a.url,
  w: a.width ?? 1,
  h: a.height ?? 1,
});

/** One pack's assets as sets (grouped by set_key; ungrouped assets stand alone). */
export function packSets(pack: AssetPack, assets: Asset[]) {
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = a.set_key ?? `one-${a.id}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups].map(([key, list]) => {
    const id = `s:${pack.id}:${key}`,
      category: StampCategory = pack.official
        ? (CATEGORIES.find((c) => c === list[0].category) ?? "library")
        : "custom";
    return {
      set: imageSet(id, pack.id, list[0].name, category, list.map((a) => uploadedKey(a.id)), {
        tags: [...new Set(list.flatMap((a) => a.tags)), pack.name],
      }),
      assets: list.map((a) => imageAsset(a, id)),
    };
  });
}

let loading: Promise<void> | null = null;
/** Loads (or reloads) the person's library into the catalog. */
export function loadLibrary(): Promise<void> {
  loading ??= (async () => {
    try {
      const packs = await library.packs();
      const lists = await Promise.all(
        packs.map(async (pack) => {
          if (pack.locked) {
            // Above the plan: one preview card, not placeable.
            const id = `p:${pack.id}`,
              cover: StampAsset[] = pack.cover_url ? [{ key: `c:${pack.id}`, set: id, kind: "image", url: pack.cover_url, w: 1, h: 1 }] : [];
            return [{ set: imageSet(id, pack.id, pack.name, "library", cover.map((c) => c.key), { locked: true }), assets: cover }];
          }
          return packSets(pack, await library.assets(pack.id).catch(() => []));
        }),
      );
      registerRemoteSets(lists.flat(), true);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Signed out: only the built-in stamps remain listed. */
export function clearLibrary() {
  registerRemoteSets([], true);
}

const asked = new Set<string>();
/** Loads uploaded stamps a map uses that the catalog doesn't know yet. */
export async function resolvePlaced(keys: string[]) {
  const ids = [...new Set(keys)]
    .filter((k) => k.startsWith("u:") && !stampAsset(k) && !asked.has(k))
    .map((k) => k.slice(2));
  if (!ids.length) return;
  ids.forEach((id) => asked.add(uploadedKey(id)));
  for (let i = 0; i < ids.length; i += 200) {
    const found = await library.resolve(ids.slice(i, i + 200)).catch(() => []);
    registerRemoteSets(
      found.map((a) => {
        const id = `h:${a.id}`;
        return { set: imageSet(id, a.pack_id, a.name, "custom", [uploadedKey(a.id)], { hidden: true }), assets: [imageAsset(a, id)] };
      }),
    );
  }
}
