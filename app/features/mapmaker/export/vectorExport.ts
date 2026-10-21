/**
 * Saving a map with its texts as vectors (SVG and PDF).
 *
 * The map is rendered in parts, bottom to top (MapCreatorEditor →
 * renderMapParts): pictures of everything that isn't a text, split wherever
 * a text sits between them, and the texts themselves. So a text under a
 * stamp stays under it, while letters stay sharp at any zoom and printer.
 *
 *   SVG   pictures as embedded PNGs; texts as outlines, or as real <text>
 *         that stays editable (../text/exportVector);
 *   PDF   pictures as images; texts as filled vector paths (outlined —
 *         looks the same in every viewer, needs no fonts). Shadows, which
 *         PDFs can't blur, go in as small pictures under their text.
 */
import type { MMText } from "../types";
import {
  isVectorText,
  shadowPicture,
  textPathD,
  textToSvg,
  type TextExportMode,
} from "../text/exportVector";

export type MapPart =
  | { kind: "raster"; canvas: HTMLCanvasElement }
  | { kind: "text"; o: MMText; /** The layer's opacity. */ opacity: number };

export { isVectorText, type TextExportMode };

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
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An SVG of the map: pictures and texts in their order. */
export async function encodeSvg(
  parts: MapPart[],
  outW: number,
  outH: number,
  { title, mode }: { title: string; mode: TextExportMode },
): Promise<Blob> {
  const chunks: string[] = [];
  const defs: string[] = [];
  let n = 0;
  for (const p of parts) {
    if (p.kind === "raster") {
      chunks.push(
        `<image width="${outW}" height="${outH}" preserveAspectRatio="none" href="${await dataUrl(p.canvas)}"/>`,
      );
    } else {
      const svg = textToSvg(p.o, outW, outH, mode, `t${++n}`);
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

/** A PDF page at the map's printed size (`dpi`): pictures as images, texts as vector outlines. */
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
    pushGraphicsState,
    popGraphicsState,
    setLineJoin,
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
  // Searchable words: every text's letters, listed in the document's keywords.
  const words: string[] = [];
  for (const p of parts) {
    if (p.kind === "raster") {
      const image = await embedPixels(pdf, canvasPixels(p.canvas));
      image.draw(page, { x: 0, y: 0, width: w, height: h });
      continue;
    }
    const o = p.o;
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
    const stroke = () => {
      page.pushOperators(pushGraphicsState(), setLineJoin(join));
      page.drawSvgPath(d, {
        ...at,
        borderColor: rgbOf(o.outline.color),
        borderWidth: ow,
        borderOpacity: o.outline.opacity * opacity,
        borderLineCap: LineCapStyle.Round,
      });
      page.pushOperators(popGraphicsState());
    };
    const rgbOf = (c: string) => {
      const v = parseColor(c);
      return rgb(v.r, v.g, v.b);
    };
    if (outline && o.outline.position === "outside") stroke();
    if (o.fillOpacity > 0)
      page.drawSvgPath(d, {
        ...at,
        color: rgbOf(o.fill),
        opacity: o.fillOpacity * opacity,
      });
    if (outline && o.outline.position === "center") stroke();
  }
  if (words.length) pdf.setKeywords(words.filter(Boolean));
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
