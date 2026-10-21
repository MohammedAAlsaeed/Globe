/**
 * Putting large images into PDFs quickly.
 *
 * pdf-lib's own `embedPng` decodes the PNG and compresses it again in
 * JavaScript, on the page's thread: for a big map that freezes the tab for
 * many seconds, or runs it out of memory. Here the pixels are compressed by
 * the browser's native `CompressionStream`, a strip at a time (so the page
 * stays responsive and memory stays small), into the PDF's own image format:
 * RGB with an optional soft mask for transparency. PNG files are unpacked
 * the same way (native inflate; only the row filters are undone here).
 */
import {
  drawImage,
  degrees,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
  type Rotation,
} from "pdf-lib";

/** RGBA pixels, read a strip of rows at a time. */
export interface PixelSource {
  width: number;
  height: number;
  /** `rows` rows from row `y`, as RGBA (4 bytes a pixel). */
  read(y: number, rows: number): ArrayLike<number> | Promise<ArrayLike<number>>;
}

export interface DrawOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate?: Rotation;
}

/** An image in a PDF, ready to be drawn on any of its pages. */
export interface PdfImage {
  width: number;
  height: number;
  draw(page: PDFPage, options: DrawOptions): void;
}

const STRIP_BYTES = 8 << 20; // about 8 MB of RGBA per strip

/** Compresses (zlib) whatever `produce` writes, natively. */
function compressor() {
  const stream = new CompressionStream("deflate"),
    writer = stream.writable.getWriter(),
    result = new Response(stream.readable).arrayBuffer();
  return {
    write: (bytes: Uint8Array) => writer.write(bytes as BufferSource),
    async done(): Promise<Uint8Array> {
      await writer.close();
      return new Uint8Array(await result);
    },
  };
}

/** Embeds RGBA pixels as a PDF image (with a soft mask only where some pixel is transparent). */
export async function embedPixels(
  pdf: PDFDocument,
  source: PixelSource,
): Promise<PdfImage> {
  const { width, height } = source,
    rgb = compressor(),
    alpha = compressor(),
    step = Math.max(1, Math.floor(STRIP_BYTES / (width * 4)));
  let opaque = true;
  for (let y = 0; y < height; y += step) {
    const rows = Math.min(step, height - y),
      px = await source.read(y, rows),
      n = width * rows,
      color = new Uint8Array(n * 3),
      mask = new Uint8Array(n);
    for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
      color[k] = px[j];
      color[k + 1] = px[j + 1];
      color[k + 2] = px[j + 2];
      const a = px[j + 3];
      mask[i] = a;
      if (a !== 255) opaque = false;
    }
    await Promise.all([rgb.write(color), alpha.write(mask)]);
    // Let the page breathe between strips (progress bars, cancel buttons).
    if (y + rows < height) await new Promise((r) => setTimeout(r, 0));
  }
  const [colorBytes, maskBytes] = await Promise.all([rgb.done(), alpha.done()]);
  const ctx = pdf.context,
    image = {
      Type: "XObject",
      Subtype: "Image",
      Width: width,
      Height: height,
      BitsPerComponent: 8,
      Filter: "FlateDecode",
    };
  const smask = opaque
    ? undefined
    : ctx.register(
        ctx.stream(maskBytes, { ...image, ColorSpace: "DeviceGray" }),
      );
  const ref = ctx.register(
    ctx.stream(colorBytes, {
      ...image,
      ColorSpace: "DeviceRGB",
      ...(smask ? { SMask: smask } : {}),
    }),
  );
  return placed(ref, width, height);
}

function placed(ref: PDFRef, width: number, height: number): PdfImage {
  return {
    width,
    height,
    draw(page, o) {
      const name = page.node.newXObject("Image", ref);
      page.pushOperators(
        ...drawImage(name, {
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          rotate: o.rotate ?? degrees(0),
          xSkew: degrees(0),
          ySkew: degrees(0),
        }),
      );
    },
  };
}

/** A canvas as pixels, read in strips (never the whole canvas at once). */
export function canvasPixels(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): PixelSource {
  const ctx = canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return {
    width: canvas.width,
    height: canvas.height,
    read: (y, rows) => ctx.getImageData(0, y, canvas.width, rows).data,
  };
}

// ---- PNG ----

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Undoes one row's PNG filter into `line` (`prev` is the row above). */
function unfilter(
  filter: number,
  src: Uint8Array,
  at: number,
  line: Uint8Array,
  prev: Uint8Array,
  bpp: number,
): boolean {
  const n = line.length;
  switch (filter) {
    case 0:
      line.set(src.subarray(at, at + n));
      return true;
    case 1:
      for (let i = 0; i < n; i++)
        line[i] = (src[at + i] + (i >= bpp ? line[i - bpp] : 0)) & 255;
      return true;
    case 2:
      for (let i = 0; i < n; i++) line[i] = (src[at + i] + prev[i]) & 255;
      return true;
    case 3:
      for (let i = 0; i < n; i++)
        line[i] =
          (src[at + i] + (((i >= bpp ? line[i - bpp] : 0) + prev[i]) >> 1)) &
          255;
      return true;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? line[i - bpp] : 0,
          b = prev[i],
          c = i >= bpp ? prev[i - bpp] : 0,
          pa = Math.abs(b - c),
          pb = Math.abs(a - c),
          pc = Math.abs(a + b - 2 * c);
        line[i] =
          (src[at + i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      return true;
    default:
      return false;
  }
}

/**
 * An 8-bit, non-interlaced RGB or RGBA PNG — what canvases make — as RGBA
 * pixels, unpacked a strip at a time as they are read (in order, top to
 * bottom). Anything else returns null (use pdf-lib's own decoder).
 */
export async function pngPixels(png: Uint8Array): Promise<PixelSource | null> {
  if (png.length < 33 || PNG_SIGNATURE.some((b, i) => png[i] !== b))
    return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength),
    parts: Uint8Array[] = [];
  let width = 0,
    height = 0,
    channels = 0;
  for (let p = 8; p + 8 <= png.length;) {
    const length = view.getUint32(p),
      type = String.fromCharCode(
        png[p + 4],
        png[p + 5],
        png[p + 6],
        png[p + 7],
      ),
      data = png.subarray(p + 8, p + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      const depth = data[8],
        color = data[9],
        interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6))
        return null;
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    p += 12 + length;
  }
  if (!width || !height || !channels || !parts.length) return null;
  const joined = new Uint8Array(parts.reduce((n, d) => n + d.length, 0));
  parts.reduce((at, d) => (joined.set(d, at), at + d.length), 0);
  const raw = await inflate(joined),
    stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  let line = new Uint8Array(stride),
    prev = new Uint8Array(stride),
    next = 0;
  return {
    width,
    height,
    read(y, rows) {
      if (y !== next) throw new Error("PNG rows are read in order");
      const out = new Uint8Array(width * rows * 4);
      for (let r = 0; r < rows; r++, next++) {
        const at = next * (stride + 1);
        if (!unfilter(raw[at], raw, at + 1, line, prev, channels))
          throw new Error("errorImage");
        const o = r * width * 4;
        if (channels === 4) out.set(line, o);
        else
          for (let i = 0, j = o; i < stride; i += 3, j += 4) {
            out[j] = line[i];
            out[j + 1] = line[i + 1];
            out[j + 2] = line[i + 2];
            out[j + 3] = 255;
          }
        [line, prev] = [prev, line];
      }
      return out;
    },
  };
}

/** The whole PNG as RGBA (small images and tests; see `pngPixels`). */
export async function decodePng(
  png: Uint8Array,
): Promise<{ width: number; height: number; rgba: Uint8Array } | null> {
  const px = await pngPixels(png);
  if (!px) return null;
  const rgba = (await px.read(0, px.height)) as Uint8Array;
  return { width: px.width, height: px.height, rgba };
}

/** Embeds PNG bytes: natively when they are a canvas-style PNG, else via pdf-lib. */
export async function embedPngFast(
  pdf: PDFDocument,
  png: Uint8Array,
): Promise<PdfImage> {
  const pixels = await pngPixels(png).catch(() => null);
  if (pixels) {
    try {
      return await embedPixels(pdf, pixels);
    } catch {
      // A PNG we misread (a damaged row filter): pdf-lib's decoder below.
    }
  }
  const image = await pdf.embedPng(png);
  return {
    width: image.width,
    height: image.height,
    draw: (page, o) =>
      page.drawImage(image, {
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        rotate: o.rotate,
      }),
  };
}
