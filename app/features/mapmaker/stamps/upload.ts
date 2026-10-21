/**
 * Uploading your own stamps.
 *
 * Pictures are tidied before they leave the browser: transparent margins are
 * trimmed (so the selection box hugs the drawing), very large pictures are
 * scaled down to 2048 px, and the result is saved as WebP — sharp, small,
 * and kind to the plan's storage quota.
 */
import { library } from "../../account/api";
import type { AssetPack } from "../../account/types";
import { loadLibrary } from "./remote";

const MAX_SIDE = 2048;

/** The picture, trimmed, scaled and re-encoded. */
export async function prepareStampImage(file: File): Promise<Blob> {
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
  const webp = await new Promise<Blob | null>((r) =>
    out.toBlob(r, "image/webp", 0.92),
  );
  if (webp && webp.type === "image/webp") return webp;
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode"))),
      "image/png",
    ),
  );
}

const baseName = (file: File) =>
  file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Stamp";

/** The person's own stamp pack, made on first upload. */
async function ownPack(): Promise<AssetPack> {
  const packs = await library.packs();
  return (
    packs.find((p) => !p.official) ??
    (await library.createPack({ name: "My stamps" }))
  );
}

/**
 * Uploads pictures as stamps — each its own stamp, or (`asSet`) all as
 * variants of one stamp — and refreshes the catalog. Returns the set id of
 * the first new stamp, to select it.
 */
export async function uploadStamps(
  files: File[],
  asSet: boolean,
): Promise<string | null> {
  if (!files.length) return null;
  const pack = await ownPack(),
    setKey = asSet ? `set-${Date.now().toString(36)}` : null;
  let first: string | null = null;
  try {
    for (const file of files) {
      const blob = await prepareStampImage(file),
        ext = blob.type === "image/webp" ? "webp" : "png",
        asset = await library.upload(
          pack.id,
          blob,
          `${baseName(file)}.${ext}`,
          { name: baseName(file), set_key: setKey },
        );
      first ??= `s:${pack.id}:${asset.set_key ?? `one-${asset.id}`}`;
    }
  } finally {
    // Whatever made it up is in the catalog, even if a later file failed.
    await loadLibrary();
  }
  return first;
}
