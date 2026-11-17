/**
 * The Texture Catalog's library: the built-in textures plus everything the
 * server lists (GET texture-library — the official library, and the
 * person's own uploads), and the person's favourites.
 *
 *   loadTextureLibrary   fetches the list (metadata and previews only; a
 *                        texture's picture is downloaded when it is used)
 *   useTextureLibrary    the current list, for the catalog
 *   uploadTextures       tidies pictures in the browser (≤ 2048 px, WebP, a
 *                        preview and the average colour) and uploads them
 *   favourites           a texture with the way it's drawn, kept on the
 *                        device and with the account (`syncTextureFavorites`)
 */
import { useEffect, useSyncExternalStore } from "react";
import i18n from "@/lib/i18n";
import { library, textures as texturesApi } from "../../account/api";
import type { AssetPack } from "../../account/types";
import type { PaintSource } from "../types";
import {
  BUILTIN_STYLE,
  builtinCatalog,
  CATALOG_CATEGORIES,
  type CatalogCategory,
  type CatalogPack,
  type CatalogTexture,
} from "./textureCatalog";
import { indexFor } from "./textureSearch";
import {
  registerImageTextures,
  setTextureResolver,
  uploadedTextureId,
  type ImageTextureInfo,
} from "./textures";

// ---- the list --------------------------------------------------------------------------
interface LibraryState {
  packs: CatalogPack[];
  textures: CatalogTexture[];
  /** The server's part has arrived (or failed: then built-ins only). */
  loaded: boolean;
  /** The person can upload their own textures (signed in). */
  signedIn: boolean;
}

/** A translation key in both languages, so either finds a texture. */
const bothLanguages = (key: string) =>
  [...new Set(["en", "ar"].map((lng) => i18n.getFixedT(lng)(key)))].filter(
    (x) => x !== key,
  );

let builtins: ReturnType<typeof builtinCatalog> | null = null;
function builtin() {
  return (builtins ??= builtinCatalog(bothLanguages));
}

let state: LibraryState = {
  packs: [],
  textures: [],
  loaded: false,
  signedIn: false,
};
const listeners = new Set<() => void>();
function set(next: Partial<LibraryState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const EMPTY: LibraryState = {
  packs: [],
  textures: [],
  loaded: false,
  signedIn: false,
};

/** Everything the catalog lists: the built-ins first, then the server's. */
export function useTextureLibrary(): LibraryState {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  useEffect(() => {
    if (!state.loaded) void loadTextureLibrary(state.signedIn);
  }, []);
  const b = builtin();
  return {
    ...s,
    packs: [...b.packs, ...s.packs],
    textures: [...b.textures, ...s.textures],
  };
}

const category = (c: string | null): CatalogCategory | null =>
  (CATALOG_CATEGORIES as readonly string[]).includes(c ?? "")
    ? (c as CatalogCategory)
    : null;
const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

let request: Promise<void> | null = null;
/**
 * Fetches the server's library (again). `signedIn`: whether "me" can hold
 * uploads — the list itself is public, so guests see the official library.
 */
export function loadTextureLibrary(signedIn = state.signedIn): Promise<void> {
  if (signedIn !== state.signedIn) {
    request = null;
    set({ signedIn });
  }
  request ??= texturesApi
    .library()
    .then((lib) => {
      const packs = lib.packs.map((p): CatalogPack => ({
        id: p.id,
        name: p.name,
        creator: p.mine ? "me" : "official",
        style: p.mine ? "" : (p.style ?? "").trim(),
        locked: p.locked,
        createdAt: time(p.created_at),
      }));
      const byId = new Map(packs.map((p) => [p.id, p]));
      const list: CatalogTexture[] = [],
        infos: ImageTextureInfo[] = [];
      for (const a of lib.textures) {
        const pack = byId.get(a.pack_id);
        if (!pack) continue;
        const id = uploadedTextureId(a.id),
          cat = category(a.category),
          tags = [...new Set(a.tags.map((t) => t.trim()).filter(Boolean))];
        infos.push({
          id,
          name: a.name,
          url: a.url,
          thumbUrl: a.thumb_url,
          color: a.color,
        });
        list.push({
          id,
          name: a.name,
          creator: pack.creator,
          style: pack.style,
          packId: pack.id,
          category: cat,
          tags,
          createdAt: time(a.created_at),
          color: a.color,
          locked: pack.locked,
          tile: a.meta?.tile !== false,
          defaultScale: typeof a.meta?.scale === "number" ? a.meta.scale : null,
          index: indexFor({
            names: [a.name],
            other: [
              ...tags,
              pack.name ?? "",
              pack.style,
              ...(cat ? [cat, ...bothLanguages(`mmTexCat_${cat}`)] : []),
            ],
          }),
        });
      }
      registerImageTextures(infos);
      set({ packs, textures: list, loaded: true });
    })
    .catch(() => {
      // Offline or the API is down: the built-in textures are still there.
      request = null;
      set({ loaded: true });
    });
  return request;
}

/** The texture library this browser fetched is no longer right (signed out, say). */
export function resetTextureLibrary(signedIn: boolean) {
  request = null;
  set({ packs: [], textures: [], loaded: false, signedIn });
}

// Textures a map uses that the list doesn't have (a pack since locked, or
// someone else's upload in a template): asked for by id.
setTextureResolver(async (ids) => {
  // Asking needs an account; a guest's map holds official textures, listed above.
  if (!state.signedIn) return [];
  const assets = await library.resolve(ids.map((id) => id.slice(2)));
  return assets.map((a) => ({
    id: uploadedTextureId(a.id),
    name: a.name,
    url: a.url,
    thumbUrl: a.thumb_url ?? a.url,
    color: a.color ?? null,
  }));
});

/** The style a built-in or server style key is shown as. */
export function styleLabel(style: string, t: (k: string) => string) {
  if (style === BUILTIN_STYLE) return t("txcStyleProcedural");
  return style || t("txcStyleGeneral");
}

// ---- uploading ----------------------------------------------------------------------------
/** The longest side kept: sharp enough for the largest print tiles. */
const MAX_SIDE = 2048;
const PREVIEW = 192;

export interface PreparedTexture {
  picture: Blob;
  preview: Blob;
  color: string;
  width: number;
  height: number;
}

const toBlob = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (webp) =>
        webp && webp.type === "image/webp"
          ? resolve(webp)
          : c.toBlob(
              (png) => (png ? resolve(png) : reject(new Error("encode"))),
              "image/png",
            ),
      "image/webp",
      quality,
    ),
  );

/** A picture made ready to upload as a texture: scaled, its preview and colour. */
export async function prepareTexture(file: File): Promise<PreparedTexture> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height)),
    c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * k));
  c.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();

  // The preview: the middle square, small.
  const side = Math.min(c.width, c.height),
    p = document.createElement("canvas");
  p.width = p.height = Math.min(PREVIEW, side);
  const pctx = p.getContext("2d")!;
  pctx.imageSmoothingQuality = "high";
  pctx.drawImage(
    c,
    (c.width - side) / 2,
    (c.height - side) / 2,
    side,
    side,
    0,
    0,
    p.width,
    p.height,
  );

  // The average colour (of what isn't transparent).
  const s = document.createElement("canvas");
  s.width = s.height = 16;
  const sctx = s.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(c, 0, 0, 16, 16);
  const d = sctx.getImageData(0, 0, 16, 16).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    r += d[i] * a;
    g += d[i + 1] * a;
    b += d[i + 2] * a;
    n += a;
  }
  const hex = (v: number) =>
    Math.round(n ? v / n : 185)
      .toString(16)
      .padStart(2, "0");

  return {
    picture: await toBlob(c, 0.92),
    preview: await toBlob(p, 0.85),
    color: `#${hex(r)}${hex(g)}${hex(b)}`,
    width: c.width,
    height: c.height,
  };
}

/** A file's name as a texture name; its words become tags. */
export function nameFromFile(file: File) {
  const name = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name || "Texture";
}

/** The person's own texture pack, made on first upload. */
async function ownPack(): Promise<AssetPack> {
  const packs = await library.packs("textures");
  return (
    packs.find((p) => !p.official) ??
    (await library.createPack({ name: "My textures", kind: "textures" }))
  );
}

export interface UploadOptions {
  /** A pack to add to (official packs: staff); else the person's own. */
  packId?: string;
  category?: CatalogCategory | null;
  tags?: string[];
  /** Repeats seamlessly (default) or a single sheet. */
  tile?: boolean;
  scale?: number;
  /** Progress: files done so far. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Uploads pictures as textures, one by one, and refreshes the library.
 * Returns the ids ("u:…") of those that made it, and the first error.
 */
export async function uploadTextures(
  files: File[],
  opts: UploadOptions = {},
): Promise<{ ids: string[]; error: unknown }> {
  const ids: string[] = [];
  let error: unknown = null;
  if (!files.length) return { ids, error };
  try {
    const packId = opts.packId ?? (await ownPack()).id;
    for (const [i, file] of files.entries()) {
      try {
        const prepared = await prepareTexture(file),
          name = nameFromFile(file),
          ext = prepared.picture.type === "image/webp" ? "webp" : "png",
          asset = await library.upload(
            packId,
            prepared.picture,
            `${name}.${ext}`,
            {
              name,
              category: opts.category ?? null,
              tags: opts.tags ?? [],
              thumbnail: prepared.preview,
              color: prepared.color,
              meta: {
                tile: opts.tile ?? true,
                ...(opts.scale ? { scale: opts.scale } : {}),
              },
            },
          );
        ids.push(uploadedTextureId(asset.id));
      } catch (e) {
        error ??= e;
      }
      opts.onProgress?.(i + 1, files.length);
    }
  } catch (e) {
    error ??= e;
  } finally {
    // Whatever made it up is listed, even if a later file failed.
    await loadTextureLibrary(true);
  }
  return { ids, error };
}

// ---- favourites ------------------------------------------------------------------------
export interface TextureFavorite {
  id: string;
  /** The texture and the way it is drawn (type "texture"). */
  source: PaintSource;
}
const FAV_KEY = "idrisi.textures.favorites.v1";
const MAX_FAVORITES = 60;
let favorites: { items: TextureFavorite[]; updatedAt: number } = {
  items: [],
  updatedAt: 0,
};
const favListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "null");
    if (raw && Array.isArray(raw.items))
      favorites = {
        items: raw.items.filter(
          (x: TextureFavorite) => x && typeof x.id === "string" && x.source,
        ),
        updatedAt: Number(raw.updatedAt) || 0,
      };
  } catch {
    // unreadable: start with none
  }
}
function setFavorites(items: TextureFavorite[], updatedAt = Date.now()) {
  favorites = { items: items.slice(0, MAX_FAVORITES), updatedAt };
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  } catch {
    // storage full or blocked: kept for this page
  }
  favListeners.forEach((l) => l());
}

/** What a favourite keeps of a source (its texture and how it is drawn). */
export function favoriteSource(s: PaintSource): PaintSource {
  return {
    type: "texture",
    color: s.color,
    texture: s.texture,
    textureScale: s.textureScale,
    textureRotation: s.textureRotation,
    textureOffsetX: s.textureOffsetX ?? 0,
    textureOffsetY: s.textureOffsetY ?? 0,
    hue: s.hue,
    saturation: s.saturation,
    brightness: s.brightness,
    contrast: s.contrast,
  };
}
const round = (v: number | undefined) => Math.round((v ?? 0) * 1000) / 1000;
/** Two sources draw a texture the same way (the colour field aside). */
export const sameTextureLook = (a: PaintSource, b: PaintSource) =>
  a.texture === b.texture &&
  round(a.textureScale) === round(b.textureScale) &&
  round(a.textureRotation) === round(b.textureRotation) &&
  round(a.textureOffsetX) === round(b.textureOffsetX) &&
  round(a.textureOffsetY) === round(b.textureOffsetY) &&
  round(a.hue) === round(b.hue) &&
  round(a.saturation) === round(b.saturation) &&
  round(a.brightness) === round(b.brightness) &&
  round(a.contrast) === round(b.contrast);

export function useTextureFavorites() {
  return useSyncExternalStore(
    (l) => {
      favListeners.add(l);
      return () => {
        favListeners.delete(l);
      };
    },
    () => favorites.items,
    () => [] as TextureFavorite[],
  );
}
export function toggleFavorite(source: PaintSource) {
  const hit = favorites.items.find((f) => sameTextureLook(f.source, source));
  setFavorites(
    hit
      ? favorites.items.filter((f) => f !== hit)
      : [
          {
            id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            source: favoriteSource(source),
          },
          ...favorites.items,
        ],
  );
  schedulePush();
}

let signedInForSync = false,
  pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush() {
  if (!signedInForSync) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void texturesApi
      .saveFavorites({
        items: favorites.items,
        updated_at: favorites.updatedAt,
      })
      .catch(() => {
        // Offline or refused: the device keeps its copy; the next change retries.
      });
  }, 1200);
}

/**
 * Signed in: the newer of the account's and this device's favourites wins
 * (and the other side is brought up to date). Signed out: device only.
 */
export async function syncTextureFavorites(signedIn: boolean) {
  signedInForSync = signedIn;
  if (!signedIn) return;
  try {
    const remote = await texturesApi.favorites();
    if (remote.updated_at > favorites.updatedAt)
      setFavorites(remote.items, remote.updated_at);
    else if (favorites.updatedAt > remote.updated_at) schedulePush();
  } catch {
    // unreachable: try again on the next sign-in or change
  }
}
