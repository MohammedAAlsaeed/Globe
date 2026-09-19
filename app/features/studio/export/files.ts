import { zipSync, strToU8 } from "fflate";
import { goreSvg, blobDataUrl } from "./svg";
import type { GlobeSettings, GoreAsset } from "../domain/types";
import { pngWithDpi } from "./png";
export async function standaloneGore(
  asset: GoreAsset,
  s: GlobeSettings,
  dpi: number,
  format: "png" | "svg",
  outline = false,
) {
  const text = goreSvg(s, asset.index, await blobDataUrl(asset.blob), outline);
  if (format === "svg") return new Blob([text], { type: "image/svg+xml" });
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = asset.width;
    canvas.height = asset.height;
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await pngWithDpi(canvas, dpi);
    canvas.width = 0;
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function goreArchive(
  assets: GoreAsset[],
  s: GlobeSettings,
  dpi: number,
  format: "png" | "svg",
  outline: boolean,
  signal: AbortSignal,
  onProgress: (v: number) => void,
) {
  const entries: Record<string, Uint8Array> = {};
  entries["ASSEMBLY.txt"] = strToU8(
    `AL-IDRISI ATELIER\n${s.gores} gores; ${s.width} mm equatorial diameter x ${s.height} mm height.\n${dpi} PPI; ${s.tab} mm tapered glue tabs; ${s.bleed} mm bleed.\nPrint at 100%. Solid line = cut; dashed seam = glue-tab fold.\nNumbered gores join in ascending order, with the last joining the first.\nTest on plain paper. Align the equator first.\nSVG contains a raster map and independent vector cutting paths.\n\nالإدريسي: اطبع بالحجم الفعلي ١٠٠٪. الخط المتصل للقص والمتقطع لطي لسان اللصق.\nرتب الشرائح حسب أرقامها، وحاذِ خط الاستواء أولاً. جرّب على ورق عادي.\n`,
  );
  for (let i = 0; i < assets.length; i++) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    entries[`gore-${String(i + 1).padStart(2, "0")}.${format}`] =
      new Uint8Array(
        await (
          await standaloneGore(assets[i], s, dpi, format, outline)
        ).arrayBuffer(),
      );
    onProgress((i + 1) / assets.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob([new Uint8Array(zipSync(entries, { level: 0 }))], {
    type: "application/zip",
  });
}
