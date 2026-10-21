/**
 * A poster's sheets, on screen (SVG) and in print (PDF), from the same plan
 * and the same artwork picture (see ./render). Marks are vectors:
 *
 *   crop marks      at the trim corners, outside the artwork, where to cut
 *   overlap guides  on tiled posters, the strip the next sheet is glued over
 *   registration    small crosses at each sheet's printed corners
 *   label           at the foot of every sheet: name, sheet A1 of B3, size
 */
import {
  sheetName,
  trimCorners,
  type PosterPlan,
  type PosterSheet,
} from "./layout";
import type { PosterSettings } from "./types";

const INK = "#2b2b2b";
const esc = (v: string) =>
  v.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

/** Crop-mark segments for a sheet: [x1, y1, x2, y2] in mm. */
export function cropMarks(
  plan: PosterPlan,
  sheet: PosterSheet,
): [number, number, number, number][] {
  const len = 5,
    off = Math.max(1.5, plan.bleed + 1);
  return trimCorners(plan, sheet).flatMap(({ x, y, h, v }) => [
    [x + h * off, y, x + h * (off + len), y],
    [x, y + v * off, x, y + v * (off + len)],
  ]);
}

/** Overlap guides for a tiled sheet: dashed lines where the next sheet's edge lands. */
export function overlapGuides(
  plan: PosterPlan,
  sheet: PosterSheet,
  s: PosterSettings,
): [number, number, number, number][] {
  if (plan.sheets.length < 2) return [];
  const c = sheet.clip,
    out: [number, number, number, number][] = [];
  if (sheet.col < plan.cols - 1)
    out.push([
      c.x + c.width - s.overlap,
      c.y,
      c.x + c.width - s.overlap,
      c.y + c.height,
    ]);
  if (sheet.row < plan.rows - 1)
    out.push([
      c.x,
      c.y + c.height - s.overlap,
      c.x + c.width,
      c.y + c.height - s.overlap,
    ]);
  return out;
}

export function sheetLabel(
  plan: PosterPlan,
  sheet: PosterSheet,
  name: string,
  index: number,
): string {
  const size = `${(plan.artwork.width / 10).toFixed(1)} × ${(plan.artwork.height / 10).toFixed(1)} cm`;
  return plan.sheets.length > 1
    ? `${name} · ${sheetName(sheet)} (${index + 1}/${plan.sheets.length}) · ${size} · 100%`
    : `${name} · ${size} · 100%`;
}

/** One sheet as SVG (mm units), the artwork picture placed and clipped. */
export function sheetSvg(
  plan: PosterPlan,
  sheet: PosterSheet,
  s: PosterSettings,
  artworkUrl: string,
  name: string,
  index: number,
): string {
  const c = sheet.clip,
    id = `clip-${sheet.row}-${sheet.col}`,
    lines = (segs: [number, number, number, number][], dash = "") =>
      segs
        .map(
          ([x1, y1, x2, y2]) =>
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
        )
        .join("");
  const reg =
    plan.sheets.length > 1
      ? [
          [c.x, c.y],
          [c.x + c.width, c.y],
          [c.x, c.y + c.height],
          [c.x + c.width, c.y + c.height],
        ]
          .map(([x, y]) => `<path d="M${x - 2} ${y}h4M${x} ${y - 2}v4"/>`)
          .join("")
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheet.width} ${sheet.height}" width="${sheet.width}mm" height="${sheet.height}mm">
<rect width="${sheet.width}" height="${sheet.height}" fill="#fff"/>
<defs><clipPath id="${id}"><rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}"/></clipPath></defs>
<image href="${esc(artworkUrl)}" x="${c.x - sheet.sourceX}" y="${c.y - sheet.sourceY}" width="${plan.canvas.width}" height="${plan.canvas.height}" clip-path="url(#${id})" preserveAspectRatio="none"/>
<g stroke="${INK}" stroke-width="0.2" fill="none">${s.cropMarks ? lines(cropMarks(plan, sheet)) : ""}${reg}</g>
<g stroke="#c0392b" stroke-width="0.25" fill="none" opacity="0.8">${lines(overlapGuides(plan, sheet, s), "2 1.5")}</g>
<text x="${s.margin}" y="${sheet.height - s.margin - 1.5}" font-family="Arial, sans-serif" font-size="2.6" fill="#555">${esc(sheetLabel(plan, sheet, name, index))}</text>
</svg>`;
}

/** The whole poster as a PDF: one page per sheet, the artwork embedded once (JPEG). */
export async function posterPdf(
  plan: PosterPlan,
  s: PosterSettings,
  artwork: HTMLCanvasElement,
  name: string,
  onProgress?: (v: number) => void,
): Promise<Blob> {
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    pushGraphicsState,
    popGraphicsState,
    rectangle,
    clip,
    endPath,
    setLineWidth,
    setStrokingRgbColor,
    setDashPattern,
    moveTo,
    lineTo,
    stroke,
  } = await import("pdf-lib");
  const PT = 72 / 25.4;
  const pdf = await PDFDocument.create();
  pdf.setTitle(name);
  pdf.setCreator("Al-Idrisi Atelier");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    artwork.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encodeFailed"))),
      "image/jpeg",
      0.95,
    ),
  );
  const image = await pdf.embedJpg(await jpeg.arrayBuffer());
  // Standard fonts can't draw every character; labels keep the safe ones.
  const ascii = (v: string) =>
    v
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Map";
  const line = (
    page: import("pdf-lib").PDFPage,
    h: number,
    [x1, y1, x2, y2]: [number, number, number, number],
    color: [number, number, number],
    width: number,
    dash: number[] = [],
  ) =>
    page.pushOperators(
      pushGraphicsState(),
      setLineWidth(width * PT),
      setStrokingRgbColor(...color),
      setDashPattern(
        dash.map((d) => d * PT),
        0,
      ),
      moveTo(x1 * PT, (h - y1) * PT),
      lineTo(x2 * PT, (h - y2) * PT),
      stroke(),
      popGraphicsState(),
    );
  for (let i = 0; i < plan.sheets.length; i++) {
    const sheet = plan.sheets[i],
      c = sheet.clip,
      h = sheet.height,
      page = pdf.addPage([sheet.width * PT, h * PT]);
    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        c.x * PT,
        (h - c.y - c.height) * PT,
        c.width * PT,
        c.height * PT,
      ),
      clip(),
      endPath(),
    );
    page.drawImage(image, {
      x: (c.x - sheet.sourceX) * PT,
      y: (h - (c.y - sheet.sourceY) - plan.canvas.height) * PT,
      width: plan.canvas.width * PT,
      height: plan.canvas.height * PT,
    });
    page.pushOperators(popGraphicsState());
    if (s.cropMarks)
      for (const seg of cropMarks(plan, sheet))
        line(page, h, seg, [0.17, 0.17, 0.17], 0.2);
    for (const seg of overlapGuides(plan, sheet, s))
      line(page, h, seg, [0.75, 0.22, 0.17], 0.25, [2, 1.5]);
    if (plan.sheets.length > 1)
      for (const [x, y] of [
        [c.x, c.y],
        [c.x + c.width, c.y],
        [c.x, c.y + c.height],
        [c.x + c.width, c.y + c.height],
      ]) {
        line(page, h, [x - 2, y, x + 2, y], [0.17, 0.17, 0.17], 0.2);
        line(page, h, [x, y - 2, x, y + 2], [0.17, 0.17, 0.17], 0.2);
      }
    page.drawText(ascii(sheetLabel(plan, sheet, ascii(name), i)), {
      x: s.margin * PT,
      y: (s.margin + 1) * PT,
      size: 2.6 * PT,
      font,
      color: rgb(0.33, 0.33, 0.33),
    });
    onProgress?.((i + 1) / plan.sheets.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
