/**
 * Saving a finished map as an image: the formats offered, the sizes the
 * plan allows, and the encoders that need more than `canvas.toBlob`.
 *
 *   PNG   lossless, the best general choice; carries the print DPI (pHYs)
 *   JPEG  much smaller, with a quality setting; carries the DPI (JFIF)
 *   WebP  small with high quality, for the web
 *   TIFF  uncompressed RGB with its DPI, what many print shops ask for
 *   PDF   one page at the map's physical size, ready to send to a printer
 *
 * Everything here except `encodeMapImage` is pure, so it is unit tested.
 */

import { DEFAULT_CANVAS_PIXELS, canvasFits } from "../../../lib/canvasLimits";

export type ImageFormat = "png" | "jpeg" | "webp" | "tiff" | "pdf";

export const IMAGE_FORMATS: { id: ImageFormat; ext: string; mime: string; lossy: boolean }[] = [
  { id: "png", ext: "png", mime: "image/png", lossy: false },
  { id: "jpeg", ext: "jpg", mime: "image/jpeg", lossy: true },
  { id: "webp", ext: "webp", mime: "image/webp", lossy: true },
  { id: "tiff", ext: "tif", mime: "image/tiff", lossy: false },
  { id: "pdf", ext: "pdf", mime: "application/pdf", lossy: false },
];

/** The largest canvas we render on a computer (browsers fail well before 268 MP). */
export const MAX_CANVAS_PIXELS = DEFAULT_CANVAS_PIXELS;

export interface ExportSize {
  scale: number;
  width: number;
  height: number;
  /** Above the plan's export limit (shown, opens the upgrade prompt). */
  locked: boolean;
}

/**
 * The sizes offered for a map: a quarter, half, full and double size.
 * Sizes this device can't draw (`canvasPixels`, see lib/canvasLimits) are
 * never offered — on an iPhone or iPad they would come out blank.
 */
export function exportSizes(width: number, height: number, maxPx: number, canvasPixels = MAX_CANVAS_PIXELS): ExportSize[] {
  return [0.25, 0.5, 1, 2]
    .map((scale) => ({ scale, width: Math.round(width * scale), height: Math.round(height * scale) }))
    .filter((s) => s.width >= 64 && s.height >= 64 && canvasFits(s.width, s.height, canvasPixels))
    .map((s) => ({ ...s, locked: Math.max(s.width, s.height) > maxPx }));
}

/** Printed size in centimetres at a DPI. */
export function printSizeCm(px: number, dpi: number): number {
  return Math.round((px / dpi) * 2.54 * 10) / 10;
}

/** A safe file name from the map's name ("My map!" → "My-map"). */
export function fileName(name: string, ext: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "map";
  return `${base}.${ext}`;
}

/**
 * An uncompressed baseline TIFF (8-bit RGB, one strip, little-endian) with
 * its resolution in pixels per inch. Alpha is flattened onto white.
 */
export function encodeTiff(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, dpi: number): Uint8Array {
  const pixels = width * height,
    dataSize = pixels * 3,
    entries = 12,
    ifdSize = 2 + entries * 12 + 4,
    headerSize = 8,
    bpsOffset = headerSize + ifdSize,
    resOffset = bpsOffset + 6,
    dataOffset = resOffset + 16;
  const out = new Uint8Array(dataOffset + dataSize),
    v = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49; // "II": little-endian
  v.setUint16(2, 42, true);
  v.setUint32(4, headerSize, true);
  v.setUint16(headerSize, entries, true);
  let p = headerSize + 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    v.setUint16(p, tag, true);
    v.setUint16(p + 2, type, true);
    v.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(p + 8, value, true);
    else v.setUint32(p + 8, value, true);
    p += 12;
  };
  const SHORT = 3,
    LONG = 4,
    RATIONAL = 5;
  entry(256, LONG, 1, width); // ImageWidth
  entry(257, LONG, 1, height); // ImageLength
  entry(258, SHORT, 3, bpsOffset); // BitsPerSample 8,8,8
  entry(259, SHORT, 1, 1); // Compression: none
  entry(262, SHORT, 1, 2); // Photometric: RGB
  entry(273, LONG, 1, dataOffset); // StripOffsets
  entry(277, SHORT, 1, 3); // SamplesPerPixel
  entry(278, LONG, 1, height); // RowsPerStrip
  entry(279, LONG, 1, dataSize); // StripByteCounts
  entry(282, RATIONAL, 1, resOffset); // XResolution
  entry(283, RATIONAL, 1, resOffset + 8); // YResolution
  entry(296, SHORT, 1, 2); // ResolutionUnit: inch
  v.setUint32(p, 0, true); // no next IFD
  for (let i = 0; i < 3; i++) v.setUint16(bpsOffset + i * 2, 8, true);
  v.setUint32(resOffset, Math.round(dpi), true);
  v.setUint32(resOffset + 4, 1, true);
  v.setUint32(resOffset + 8, Math.round(dpi), true);
  v.setUint32(resOffset + 12, 1, true);
  for (let i = 0, o = dataOffset; i < pixels; i++, o += 3) {
    const a = rgba[i * 4 + 3] / 255;
    out[o] = Math.round(rgba[i * 4] * a + 255 * (1 - a));
    out[o + 1] = Math.round(rgba[i * 4 + 1] * a + 255 * (1 - a));
    out[o + 2] = Math.round(rgba[i * 4 + 2] * a + 255 * (1 - a));
  }
  return out;
}

/** Writes the DPI into a JPEG's JFIF header (browsers leave it unset). */
export function jpegWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  // SOI, then APP0 "JFIF\0": version (2), units (1), X density (2), Y density (2).
  const isJfif = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.slice(6, 11)) === "JFIF\0";
  if (!isJfif) return bytes;
  const out = bytes.slice(),
    d = Math.min(65535, Math.round(dpi));
  out[13] = 1; // dots per inch
  out[14] = d >> 8;
  out[15] = d & 255;
  out[16] = d >> 8;
  out[17] = d & 255;
  return out;
}

/** Writes the DPI into a PNG as a pHYs chunk, right after IHDR. */
export function pngWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const chunk = new Uint8Array(21),
    v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // "pHYs"
  v.setUint32(8, Math.round(dpi / 0.0254));
  v.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1; // metres
  let crc = 0xffffffff;
  for (const byte of chunk.slice(4, 17)) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  v.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.slice(0, 33));
  out.set(chunk, 33);
  out.set(bytes.slice(33), 54);
  return out;
}
