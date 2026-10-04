import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
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
  closePath,
  stroke,
} from "pdf-lib";
import { edgePoints, goreBox, latitudeLines } from "../domain/geometry";
import type {
  GlobeSettings,
  PrintSettings,
  PrintPlan,
  GoreAsset,
  Placement,
  Point,
} from "../domain/types";
const PT = 72 / 25.4,
  ink = rgb(0.2, 0.28, 0.22);
function transformed(
  pt: Point,
  item: Placement,
  s: GlobeSettings,
  p: PrintSettings,
): Point {
  const g = goreBox(s),
    x = item.rotated ? g.height - pt.y : pt.x,
    y = item.rotated ? pt.x : pt.y;
  return {
    x: item.x - item.cropX + x * p.calibrationX,
    y: item.y - item.cropY + y * p.calibrationY,
  };
}
/** Same placements as the on-screen SVG. Images remain raster; guides are PDF vectors. */
export async function makePrintPdf(
  plan: PrintPlan,
  s: GlobeSettings,
  p: PrintSettings,
  assets: GoreAsset[],
  signal?: AbortSignal,
  onProgress?: (n: number) => void,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Al-Idrisi - Globe print plates");
  pdf.setCreator("Al-Idrisi Atelier");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const images = new Map<number, Awaited<ReturnType<typeof pdf.embedPng>>>();
  for (let i = 0; i < plan.pages.length; i++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const spec = plan.pages[i],
      page = pdf.addPage([spec.width * PT, spec.height * PT]);
    for (const item of spec.items) {
      page.pushOperators(
        pushGraphicsState(),
        rectangle(
          item.x * PT,
          (spec.height - item.y - item.height) * PT,
          item.width * PT,
          item.height * PT,
        ),
        clip(),
        endPath(),
      );
      if (!p.outline) {
        let image = images.get(item.gore);
        if (!image) {
          image = await pdf.embedPng(
            await assets[item.gore].blob.arrayBuffer(),
          );
          images.set(item.gore, image);
        }
        const ox = (item.x - item.cropX) * PT,
          oy = item.y - item.cropY;
        if (item.rotated)
          page.drawImage(image, {
            x: ox,
            y: (spec.height - oy) * PT,
            width: item.fullHeight * PT,
            height: item.fullWidth * PT,
            rotate: degrees(-90),
          });
        else
          page.drawImage(image, {
            x: ox,
            y: (spec.height - oy - item.fullHeight) * PT,
            width: item.fullWidth * PT,
            height: item.fullHeight * PT,
          });
      }
      const line = (points: Point[], dashed = false, closed = false) => {
        const pts = points.map((pt) => transformed(pt, item, s, p));
        if (closed) pts.push(pts[0]);
        page.pushOperators(
          pushGraphicsState(),
          setLineWidth(0.15 * PT),
          setStrokingRgbColor(0.2, 0.28, 0.22),
          setDashPattern(dashed ? [1.2 * PT, 0.8 * PT] : [], 0),
          moveTo(pts[0].x * PT, (spec.height - pts[0].y) * PT),
          ...pts
            .slice(1)
            .map((pt) => lineTo(pt.x * PT, (spec.height - pt.y) * PT)),
          ...(closed ? [closePath()] : []),
          stroke(),
          popGraphicsState(),
        );
      };
      if (s.guides || p.outline)
        line(
          [...edgePoints(s, -1), ...edgePoints(s, 1, true).reverse()],
          false,
          true,
        );
      if (s.tab > 0) line(edgePoints(s, 1), true);
      if (s.grid) latitudeLines(s).forEach((pts) => line(pts, true));
      if (s.labels) {
        const g = goreBox(s),
          pos = transformed({ x: g.width / 2, y: g.height - 1.5 }, item, s, p),
          label = `${String(item.gore + 1).padStart(2, "0")} / ${s.gores} - N`;
        const size = 2.8 * PT * Math.min(p.calibrationX, p.calibrationY),
          length = font.widthOfTextAtSize(label, size);
        page.drawText(label, {
          x: pos.x * PT - (item.rotated ? 0 : length / 2),
          y: (spec.height - pos.y) * PT + (item.rotated ? length / 2 : 0),
          size,
          font,
          color: ink,
          rotate: degrees(item.rotated ? -90 : 0),
        });
      }
      page.pushOperators(popGraphicsState());
      if (p.marks)
        for (const [x, y] of [
          [item.x, item.y],
          [item.x + item.width, item.y],
          [item.x, item.y + item.height],
          [item.x + item.width, item.y + item.height],
        ]) {
          page.drawLine({
            start: { x: (x - 1.5) * PT, y: (spec.height - y) * PT },
            end: { x: (x + 1.5) * PT, y: (spec.height - y) * PT },
            thickness: 0.15 * PT,
            color: ink,
          });
          page.drawLine({
            start: { x: x * PT, y: (spec.height - y - 1.5) * PT },
            end: { x: x * PT, y: (spec.height - y + 1.5) * PT },
            thickness: 0.15 * PT,
            color: ink,
          });
        }
    }
    page.drawText(
      `AL-IDRISI | ${i + 1}/${plan.pages.length} | 100%${spec.items[0]?.tile ? ` | G${spec.items[0].gore + 1} | Tile ${spec.items[0].tile}` : ""}`,
      {
        x: p.margin * PT,
        y: (p.margin + 1) * PT,
        size: 2.6 * PT,
        font,
        color: ink,
      },
    );
    onProgress?.((i + 1) / plan.pages.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
export async function calibrationPdf() {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([210 * PT, 297 * PT]),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("AL-IDRISI / PRINTER CALIBRATION", {
    x: 25 * PT,
    y: 265 * PT,
    font,
    size: 14,
    color: ink,
  });
  page.drawText("Print at actual size (100%). Disable fit-to-page.", {
    x: 25 * PT,
    y: 252 * PT,
    font,
    size: 10,
    color: ink,
  });
  page.drawRectangle({
    x: 40.075 * PT,
    y: 100.075 * PT,
    width: 99.85 * PT,
    height: 99.85 * PT,
    borderColor: ink,
    borderWidth: 0.15 * PT,
  });
  page.drawText("100 x 100 mm", {
    x: 65 * PT,
    y: 145 * PT,
    font,
    size: 14,
    color: ink,
  });
  page.drawText(
    "Measure both outside edges; enter width and height in the studio.",
    { x: 25 * PT, y: 80 * PT, font, size: 9, color: ink },
  );
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
