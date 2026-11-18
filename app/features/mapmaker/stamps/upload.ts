/**
 * Uploading your own stamps.
 *
 * Pictures are tidied before they leave the browser: transparent margins are
 * trimmed (so the selection box hugs the drawing), very large pictures are
 * scaled down to 2048 px, and the result is saved as WebP — sharp, small,
 * and kind to the plan's storage quota. A 192 px preview goes with each, so
 * the Stamp Catalog lists thousands of stamps without downloading them.
 */
import { library } from "../../account/api";
import type { AssetPack } from "../../account/types";
import { loadLibrary } from "./remote";

const MAX_SIDE = 2048;

/** The picture, trimmed, scaled and re-encoded. */
export async function prepareStampImage(file: File): Promise<Blob> {
  return (await prepareStamp(file)).picture;
}

const PREVIEW = 192;
const encode = async (c: HTMLCanvasElement, quality: number) => {
  const webp = await new Promise<Blob | null>((r) =>
    c.toBlob(r, "image/webp", quality),
  );
  if (webp && webp.type === "image/webp") return webp;
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode"))),
      "image/png",
    ),
  );
};

/** The picture (trimmed, scaled, re-encoded), its preview and its average colour. */
export async function prepareStamp(
  file: File,
): Promise<{ picture: Blob; preview: Blob; color: string }> {
  const out = await trimmed(file);
  const k = Math.min(1, PREVIEW / Math.max(out.width, out.height)),
    small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(out.width * k));
  small.height = Math.max(1, Math.round(out.height * k));
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(out, 0, 0, small.width, small.height);
  // The average colour of what's drawn (transparent pixels don't count).
  const px = sctx.getImageData(0, 0, small.width, small.height).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    r += px[i] * a;
    g += px[i + 1] * a;
    b += px[i + 2] * a;
    n += a;
  }
  const hex = (v: number) =>
    Math.round(n ? v / n : 128)
      .toString(16)
      .padStart(2, "0");
  return {
    picture: await encode(out, 0.92),
    preview: await encode(small, 0.85),
    color: `#${hex(r)}${hex(g)}${hex(b)}`,
  };
}

/** The picture with its transparent margins trimmed, at most MAX_SIDE. */
async function trimmed(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const src = document.createElement("canvas");
  src.width = bitmap.width;
  src.height = bitmap.height;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // The box around everything that isn't (almost) fully transparent.
  const { data, width, height } = sctx.getImageData(
    0,
    0,
    src.width,
    src.height,
  );
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("emptyImage");
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * k));
  out.height = Math.max(1, Math.round(h * k));
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  return out;
}

export const baseName = (file: File) =>
  file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Stamp";

/** The person's own stamp pack, made on first upload. */
async function ownPack(): Promise<AssetPack> {
  const packs = await library.packs();
  return (
    packs.find((p) => !p.official) ??
    (await library.createPack({ name: "My stamps" }))
  );
}

/** Uploads one picture (with its preview and colour) into a pack. */
export async function uploadStampFile(
  packId: string,
  file: File,
  details: AssetDetailsIn = {},
) {
  const { picture, preview, color } = await prepareStamp(file),
    ext = picture.type === "image/webp" ? "webp" : "png",
    name = details.name ?? baseName(file);
  return library.upload(packId, picture, `${name}.${ext}`, {
    ...details,
    name,
    thumbnail: preview,
    color,
  });
}
type AssetDetailsIn = Omit<
  NonNullable<Parameters<typeof library.upload>[3]>,
  "thumbnail" | "color"
>;

/**
 * Uploads pictures as stamps — each its own stamp, or (`asSet`) all as
 * variants of one stamp — and refreshes the catalog. Returns the set id of
 * the first new stamp, to select it.
 */
export async function uploadStamps(
  files: File[],
  asSet: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<string | null> {
  if (!files.length) return null;
  const pack = await ownPack(),
    setKey = asSet ? `set-${Date.now().toString(36)}` : null;
  let first: string | null = null,
    done = 0;
  try {
    for (const file of files) {
      const asset = await uploadStampFile(pack.id, file, { set_key: setKey });
      first ??= `s:${pack.id}:${asset.set_key ?? `one-${asset.id}`}`;
      onProgress?.(++done, files.length);
    }
  } finally {
    // Whatever made it up is in the catalog, even if a later file failed.
    await loadLibrary();
  }
  return first;
}
