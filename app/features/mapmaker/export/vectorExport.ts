/**
 * Saving a map with its texts as vectors (SVG and PDF).
 *
 * The map is rendered in parts, bottom to top (MapCreatorEditor →
 * renderMapParts): pictures of everything that isn't a text, split wherever
 * a text sits between them, and the texts themselves. So a text under a
 * stamp stays under it, while letters stay sharp at any zoom and printer.
 *
 *   SVG   pictures as embedded PNGs; texts as outlines, or as real <text>
 *         that stays editable, with the fonts inside the file if asked
 *         (../text/exportVector);
 *   PDF   pictures as images; texts as filled vector paths (outlined —
 *         looks the same in every viewer, needs no fonts), with the same
 *         words as invisible text on top, so they can be selected, copied
 *         and searched. Shadows, which PDFs can't blur, go in as small
 *         pictures under their text; an outline under a faded fill is cut
 *         out where the letters are (a soft mask), as on the map.
 */
import type { MMText } from "../types";
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import {
  isVectorText,
  prepareTextExport,
  shadowPicture,
  svgFontFaces,
  textPathD,
  textRunsPlaced,
  textToSvg,
  type TextExportMode,
} from "../text/exportVector";
import { subsetFont } from "../text/subset";
import {
  faceFor,
  loadFontkit,
  parseCanvasFont,
  webFacesOf,
} from "../text/webOutlines";

export type MapPart =
  | { kind: "raster"; canvas: HTMLCanvasElement }
  | { kind: "text"; o: MMText; /** The layer's opacity. */ opacity: number };

export { isVectorText, prepareTextExport, type TextExportMode };

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encodeFailed"))),
      "image/png",
    ),
  );
}
async function dataUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await blobOf(canvas);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
/** An SVG <image> filling the map (built as data, not markup, so editors don't read it as HTML). */
function svgImage(width: number, height: number, href: string): string {
  const attrs = { width, height, preserveAspectRatio: "none", href };
  return `<image ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ")}/>`;
}
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An SVG of the map: pictures and texts in their order. `embedFonts`: editable texts carry their fonts. */
export async function encodeSvg(
  parts: MapPart[],
  outW: number,
  outH: number,
  {
    title,
    mode,
    embedFonts = true,
  }: { title: string; mode: TextExportMode; embedFonts?: boolean },
): Promise<Blob> {
  const chunks: string[] = [];
  const defs: string[] = [];
  const embed = mode === "editable" && embedFonts;
  if (embed) {
    const css = await svgFontFaces(
      parts.flatMap((p) => (p.kind === "text" ? [p.o] : [])),
      outH / outW,
    );
    if (css) defs.push(`<style>${css}</style>`);
  }
  let n = 0;
  for (const p of parts) {
    if (p.kind === "raster") {
      chunks.push(svgImage(outW, outH, await dataUrl(p.canvas)));
    } else {
      const svg = textToSvg(p.o, outW, outH, mode, `t${++n}`, embed);
      defs.push(svg.defs);
      chunks.push(
        p.opacity < 0.999
          ? `<g opacity="${p.opacity}">${svg.body}</g>`
          : svg.body,
      );
    }
  }
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">` +
    `<title>${esc(title)}</title>${defs.some(Boolean) ? `<defs>${defs.join("")}</defs>` : ""}${chunks.join("")}</svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

/** "#rgb", "#rrggbb", "#rrggbbaa" or "rgb(a)(…)" → 0..1 components. */
export function parseColor(c: string): { r: number; g: number; b: number } {
  const s = c.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((h) => h + h).join("") : hex;
    return {
      r: parseInt(full.slice(0, 2), 16) / 255,
      g: parseInt(full.slice(2, 4), 16) / 255,
      b: parseInt(full.slice(4, 6), 16) / 255,
    };
  }
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 };
  return { r: 0, g: 0, b: 0 };
}

const PDF_BLENDS: Record<string, string> = {
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  darken: "Darken",
  lighten: "Lighten",
  "color-dodge": "ColorDodge",
  "color-burn": "ColorBurn",
  "hard-light": "HardLight",
  "soft-light": "SoftLight",
  difference: "Difference",
  exclusion: "Exclusion",
};

type PdfLib = typeof import("pdf-lib");

/** Layout features off for invisible text (see addTextLayer). */
const PLAIN = Object.fromEntries(
  [
    "init",
    "medi",
    "fina",
    "isol",
    "med2",
    "fin2",
    "fin3",
    "rlig",
    "liga",
    "dlig",
    "clig",
    "calt",
    "ccmp",
    "locl",
    "mark",
    "mkmk",
    "kern",
    "curs",
  ].map((f) => [f, false]),
);

/**
 * The texts' words as invisible text over their letters: each run in the
 * font file that drew it (cut down to its letters), stretched to the run's
 * width, so selecting, copying and searching find the real words.
 */
async function addTextLayer(
  lib: PdfLib,
  pdf: PDFDocument,
  page: PDFPage,
  texts: MMText[],
  outW: number,
  outH: number,
  k: number,
  h: number,
) {
  pdf.registerFontkit(
    (await loadFontkit()) as unknown as Parameters<
      PDFDocument["registerFontkit"]
    >[0],
  );
  const placed = texts.flatMap((o) => {
    try {
      return textRunsPlaced(o, outW, outH);
    } catch {
      return [];
    }
  });
  // Pieces: a run, or for browser-drawn letters a run cut at its font slices.
  type Piece = {
    key: string;
    text: string;
    origin: [number, number];
    along: [number, number];
    up: [number, number];
    width: number;
  };
  const pieces: Piece[] = [];
  const sources = new Map<
    string,
    { bytes: ArrayBuffer | Uint8Array; cps: Set<number>; subset: boolean }
  >();
  const need = (
    key: string,
    bytes: ArrayBuffer | Uint8Array,
    text: string,
    subset: boolean,
  ) => {
    let s = sources.get(key);
    if (!s) sources.set(key, (s = { bytes, cps: new Set(), subset }));
    for (const ch of text) s.cps.add(ch.codePointAt(0)!);
  };
  for (const p of placed) {
    const text = p.run.text.replace(/\s+/g, " ");
    if (!text.trim()) continue;
    if (p.run.face) {
      need(p.run.face.path, p.run.face.bytes, text, true);
      pieces.push({
        key: p.run.face.path,
        text,
        origin: p.origin,
        along: p.along,
        up: p.up,
        width: p.width,
      });
      continue;
    }
    if (!p.run.css) continue;
    // East Asian letters: each slice of the web font is its own font file.
    const { weight, italic } = parseCanvasFont(p.run.css);
    const chars = [...text];
    const slices = webFacesOf({ text, css: p.run.css, m: [1, 0, 0, 1, 0, 0] });
    const per = p.width / chars.length;
    let i = 0;
    while (i < chars.length) {
      const f = faceFor(
        slices.map((s) => s.face),
        chars[i].codePointAt(0)!,
        weight,
        italic,
      );
      let j = i + 1;
      while (
        j < chars.length &&
        faceFor(
          slices.map((s) => s.face),
          chars[j].codePointAt(0)!,
          weight,
          italic,
        ) === f
      )
        j++;
      const src = f && slices.find((s) => s.face === f);
      if (src) {
        const t = chars.slice(i, j).join("");
        need(f.url, src.bytes, t, false);
        pieces.push({
          key: f.url,
          text: t,
          origin: [
            p.origin[0] + p.along[0] * per * i,
            p.origin[1] + p.along[1] * per * i,
          ],
          along: p.along,
          up: p.up,
          width: per * (j - i),
        });
      }
      i = j;
    }
  }
  if (!pieces.length) return;
  const fonts = new Map<string, PDFFont>();
  for (const [key, s] of sources) {
    try {
      // Shipped fonts: cut down by HarfBuzz (layout kept). Web slices are small already.
      const bytes = s.subset ? await subsetFont(s.bytes, s.cps) : s.bytes;
      // Letters as they are (no joined forms): the PDF's text map then
      // reads every one back as the letter typed.
      if (bytes)
        fonts.set(
          key,
          await pdf.embedFont(bytes, { subset: !s.subset, features: PLAIN }),
        );
    } catch (e) {
      if (process.env.DEBUG_PDF) console.log("font", key, e);
      // A font pdf-lib can't take: its words stay in the keywords only.
    }
  }
  const {
    beginText,
    endText,
    setFontAndSize,
    setTextRenderingMode,
    TextRenderingMode,
    setTextMatrix,
    setCharacterSqueeze,
    showText,
    pushGraphicsState,
    popGraphicsState,
  } = lib;
  page.pushOperators(pushGraphicsState());
  for (const piece of pieces) {
    const font = fonts.get(piece.key);
    if (!font) continue;
    let hex, natural;
    try {
      hex = font.encodeText(piece.text);
      natural = font.widthOfTextAtSize(piece.text, 1);
    } catch (e) {
      if (process.env.DEBUG_PDF) console.log("encode", piece.text, e);
      continue;
    }
    if (!(natural > 0) || !(piece.width > 0)) continue;
    const name = page.node.newFontDictionary(font.name, font.ref);
    // Output pixels (y down) → PDF points (y up); one text unit = one em.
    const [ax, ay] = piece.along,
      [ux, uy] = piece.up,
      [ox, oy] = piece.origin;
    page.pushOperators(
      beginText(),
      setFontAndSize(name, 1),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setTextMatrix(ax * k, -ay * k, ux * k, -uy * k, ox * k, h - oy * k),
      setCharacterSqueeze(
        Math.max(1, Math.min(1000, (100 * piece.width) / natural)),
      ),
      showText(hex),
      endText(),
    );
  }
  page.pushOperators(popGraphicsState());
}

/** A PDF page at the map's printed size (`dpi`): pictures as images, texts as vector outlines (plus selectable text). */
export async function encodeVectorPdf(
  parts: MapPart[],
  outW: number,
  outH: number,
  { title, dpi }: { title: string; dpi: number },
): Promise<Blob> {
  const lib = await import("pdf-lib");
  const {
    PDFDocument,
    rgb,
    grayscale,
    pushGraphicsState,
    popGraphicsState,
    setGraphicsState,
    setLineJoin,
    setFillingGrayscaleColor,
    rectangle,
    fill,
    drawSvgPath,
    LineJoinStyle,
    LineCapStyle,
  } = lib;
  const { embedPixels, canvasPixels } = await import("../../../lib/pdfImage");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("Al-Idrisi Atelier");
  const k = 72 / dpi,
    w = outW * k,
    h = outH * k;
  const page = pdf.addPage([w, h]);
  const rgbOf = (c: string) => {
    const v = parseColor(c);
    return rgb(v.r, v.g, v.b);
  };
  // Searchable words: every text's letters, listed in the document's keywords too.
  const words: string[] = [];
  const texts: MMText[] = [];
  for (const p of parts) {
    if (p.kind === "raster") {
      const image = await embedPixels(pdf, canvasPixels(p.canvas));
      image.draw(page, { x: 0, y: 0, width: w, height: h });
      continue;
    }
    const o = p.o;
    texts.push(o);
    words.push(o.text.replace(/\s+/g, " ").trim());
    const shadow = shadowPicture(o, outW, outH);
    if (shadow) {
      const image = await embedPixels(pdf, canvasPixels(shadow.canvas));
      image.draw(page, {
        x: shadow.x * k,
        y: h - (shadow.y + shadow.canvas.height) * k,
        width: shadow.canvas.width * k,
        height: shadow.canvas.height * k,
      });
    }
    const { d, scale } = textPathD(o, outW, outH);
    if (!d) continue;
    const opacity = o.opacity * p.opacity;
    const blendName =
      o.blend && o.blend !== "normal" ? PDF_BLENDS[o.blend] : undefined;
    const blendMode = blendName
      ? (lib.BlendMode as Record<string, string>)[blendName]
      : undefined;
    const at = { x: 0, y: h, scale: k, blendMode: blendMode as never };
    const outline =
      o.outline.enabled && o.outline.width > 0 && o.outline.opacity > 0;
    const ow =
      o.outline.width * scale * (o.outline.position === "outside" ? 2 : 1);
    const join =
      o.outline.join === "round"
        ? LineJoinStyle.Round
        : o.outline.join === "bevel"
          ? LineJoinStyle.Bevel
          : LineJoinStyle.Miter;
    const stroke = (cut: boolean) => {
      page.pushOperators(pushGraphicsState(), setLineJoin(join));
      if (cut) {
        // A soft mask: white everywhere but the letters, so the outline only
        // shows outside them (under a faded fill it would show through).
        const mask = pdf.context.formXObject(
          [
            pushGraphicsState(),
            setFillingGrayscaleColor(1),
            rectangle(0, 0, w, h),
            fill(),
            ...drawSvgPath(d, {
              x: 0,
              y: h,
              scale: k,
              color: grayscale(0),
              borderColor: undefined,
              borderWidth: 0,
            }),
            popGraphicsState(),
          ],
          {
            BBox: [0, 0, w, h],
            Group: { Type: "Group", S: "Transparency", CS: "DeviceGray" },
          },
        );
        const gs = pdf.context.obj({
          Type: "ExtGState",
          SMask: {
            Type: "Mask",
            S: "Luminosity",
            G: pdf.context.register(mask),
          },
        });
        page.pushOperators(setGraphicsState(page.node.newExtGState("GS", gs)));
      }
      page.drawSvgPath(d, {
        ...at,
        borderColor: rgbOf(o.outline.color),
        borderWidth: ow,
        borderOpacity: o.outline.opacity * opacity,
        borderLineCap: LineCapStyle.Round,
      });
      page.pushOperators(popGraphicsState());
    };
    if (outline && o.outline.position === "outside")
      stroke(o.fillOpacity < 0.999);
    if (o.fillOpacity > 0)
      page.drawSvgPath(d, {
        ...at,
        color: rgbOf(o.fill),
        opacity: o.fillOpacity * opacity,
      });
    if (outline && o.outline.position === "center") stroke(false);
  }
  if (texts.length) {
    try {
      await addTextLayer(lib, pdf, page, texts, outW, outH, k, h);
    } catch {
      // The letters are drawn either way; only selecting them is lost.
    }
  }
  if (words.length) pdf.setKeywords(words.filter(Boolean));
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
