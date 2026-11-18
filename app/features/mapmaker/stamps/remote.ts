/**
 * Stamps from the server's asset library, added to the catalog.
 *
 *   loadLibrary    the Stamp Catalog's library in one request (GET
 *                  stamp-library): the published official packs — for
 *                  guests too — and, signed in, the person's own uploads.
 *                  Packs above the plan are listed locked: their stamps
 *                  show a preview but can't be placed.
 *   resolvePlaced  uploaded stamps a map already uses but the library
 *                  doesn't list (a pack locked after a downgrade, say), so
 *                  every map still draws completely.
 *
 * Stamps sharing a `set_key` within a pack become one set with variants.
 * Pictures are downloaded only when drawn; catalogs show the previews.
 */
import { library, stamps as stampsApi } from "../../account/api";
import type { StampLibrary } from "../../account/types";
import { registerRemoteSets, stampAsset } from "./catalog";
import { imageAsset, imageSet, librarySets, uploadedKey } from "./librarySets";

export { librarySets, uploadedKey };

let loading: Promise<void> | null = null,
  loaded = false,
  packs: StampLibrary["packs"] = [];
/** Loads (or reloads) the library into the catalog (guests too). */
export function loadLibrary(): Promise<void> {
  loading ??= (async () => {
    try {
      const lib = await stampsApi.library();
      packs = lib.packs;
      registerRemoteSets(librarySets(lib), true);
    } catch {
      // Offline or the API is down: the built-in stamps still work.
    } finally {
      loading = null;
      loaded = true;
    }
  })();
  return loading;
}
/** Whether the library was asked for at least once (arrived, or failed). */
export const libraryLoaded = () => loaded;
/** The server's stamp packs (the catalog lists empty ones too). */
export const libraryPacks = () => packs;

/** Signed out: only the built-in stamps remain listed. */
export function clearLibrary() {
  packs = [];
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
        return {
          set: imageSet(id, a.pack_id, a.name, "custom", [uploadedKey(a.id)], {
            hidden: true,
          }),
          assets: [imageAsset(a, id)],
        };
      }),
    );
  }
}
