import {
  cutPath,
  seamPath,
  goreBox,
  latitudeLines,
  pathFromPoints,
} from "../domain/geometry";
import type {
  GlobeSettings,
  PrintSettings,
  PrintPage,
  GoreAsset,
} from "../domain/types";
export const xml = (v: string) =>
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
export function goreMarkup(
  s: GlobeSettings,
  index: number,
  imageUrl: string,
  outline = false,
) {
  const g = goreBox(s);
  return `${!outline ? `<image href="${xml(imageUrl)}" width="${g.width}" height="${g.height}"/>` : ""}<g id="cut-lines" fill="none" stroke="#354738" stroke-width="0.15">${s.guides || outline ? `<path d="${cutPath(s)}"/>` : ""}${s.tab > 0 ? `<path d="${seamPath(s)}" stroke-dasharray="1.2 .8"/>` : ""}${
    s.grid
      ? latitudeLines(s)
          .map(
            (pts) =>
              `<path d="${pathFromPoints(pts)}" stroke-dasharray="1 1" opacity=".6"/>`,
          )
          .join("")
      : ""
  }</g>${s.labels ? `<text x="${g.width / 2}" y="${g.height - 1.5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="2.8" fill="#354738">${String(index + 1).padStart(2, "0")} / ${s.gores} · N ↑</text>` : ""}`;
}
export function goreSvg(
  s: GlobeSettings,
  index: number,
  imageUrl: string,
  outline = false,
) {
  const g = goreBox(s);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}mm" height="${g.height}mm" viewBox="0 0 ${g.width} ${g.height}">${goreMarkup(s, index, imageUrl, outline)}</svg>`;
}
export function pageSvg(
  page: PrintPage,
  s: GlobeSettings,
  p: PrintSettings,
  assets: GoreAsset[],
  pageIndex: number,
  total: number,
) {
  const g = goreBox(s);
  const items = page.items
    .map((item, i) => {
      const sx = p.calibrationX,
        sy = p.calibrationY,
        transform = `translate(${item.x - item.cropX} ${item.y - item.cropY}) scale(${sx} ${sy}) ${item.rotated ? `translate(${g.height} 0) rotate(90)` : ""}`;
      const marks = p.marks
        ? [
            [item.x, item.y],
            [item.x + item.width, item.y],
            [item.x, item.y + item.height],
            [item.x + item.width, item.y + item.height],
          ]
            .map(
              ([x, y]) =>
                `<path d="M${x - 1.5} ${y}h3M${x} ${y - 1.5}v3" fill="none" stroke="#354738" stroke-width=".15"/>`,
            )
            .join("")
        : "";
      return `<defs><clipPath id="page-${pageIndex}-tile-${i}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}"/></clipPath></defs><g clip-path="url(#page-${pageIndex}-tile-${i})"><g transform="${transform}">${goreMarkup(s, item.gore, assets[item.gore]?.url ?? "", p.outline)}</g></g>${marks}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}"><rect width="100%" height="100%" fill="white"/>${items}<text x="${p.margin}" y="${page.height - p.margin - 1}" font-family="Arial,sans-serif" font-size="2.6" fill="#596451">AL-IDRISI · ${pageIndex + 1}/${total} · 100%${page.items[0]?.tile ? ` · G${page.items[0].gore + 1} · ${page.items[0].tile}` : ""}</text></svg>`;
}
export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/** A real printable HTML document avoids reliance on an embedded PDF plug-in. */
export async function printHtml(
  pages: PrintPage[],
  s: GlobeSettings,
  p: PrintSettings,
  assets: GoreAsset[],
) {
  const embedded = await Promise.all(
    assets.map(async (a) => ({ ...a, url: await blobDataUrl(a.blob) })),
  );
  const first = pages[0];
  if (!first) throw new Error("layoutError");
  const sheets = pages
    .map(
      (page, i) =>
        `<section class="sheet">${pageSvg(page, s, p, embedded, i, pages.length)}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Al-Idrisi - Print plates</title><style>@page{size:${first.width}mm ${first.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#e6eadd}.sheet{width:100%;max-width:${first.width}mm;background:white;margin:12px auto}svg{display:block;width:100%;height:auto}@media print{html,body{background:white;print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${first.width}mm;height:${first.height}mm;max-width:none;margin:0;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}}</style></head><body>${sheets}</body></html>`;
}
