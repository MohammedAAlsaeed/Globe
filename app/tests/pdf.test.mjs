import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { makePrintPdf, calibrationPdf } from "../features/studio/export/pdf.ts";
import {
  DEFAULT_GLOBE as globe,
  DEFAULT_PRINT as print,
} from "../features/studio/domain/types.ts";
import { planPrint } from "../features/studio/domain/layout.ts";
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const t = Buffer.from(name),
    len = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, sum]);
}
// Asymmetric corners make rotation and reflection errors visible in rendered QA.
function fixturePng() {
  const w = 120,
    h = 480,
    header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      const color =
        y < h / 2
          ? x < w / 2
            ? [170, 110, 60]
            : [220, 190, 110]
          : x < w / 2
            ? [70, 110, 90]
            : [120, 155, 170];
      row.set([...color, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test("print PDFs retain paper sizes, page counts and rotated placements", async () => {
  await mkdir("tmp/pdfs", { recursive: true });
  const image = fixturePng(),
    assets = Array.from({ length: 12 }, (_, index) => ({
      index,
      url: "",
      blob: new Blob([image], { type: "image/png" }),
      width: 120,
      height: 480,
    }));
  const settings = { ...globe, grid: true };
  for (const [name, p] of [
    ["sample", print],
    [
      "rotated",
      {
        ...print,
        paper: "custom",
        width: 280,
        height: 70,
        margin: 5,
        orientation: "landscape",
        calibrationX: 1.02,
        calibrationY: 0.99,
      },
    ],
  ]) {
    const plan = planPrint(settings, p),
      blob = await makePrintPdf(plan, settings, p, assets);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(`tmp/pdfs/${name}.pdf`, bytes);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), plan.pages.length);
    for (let i = 0; i < pdf.getPageCount(); i++) {
      assert.ok(
        Math.abs(
          pdf.getPage(i).getWidth() - (plan.pages[i].width * 72) / 25.4,
        ) < 1e-8,
      );
      assert.ok(
        Math.abs(
          pdf.getPage(i).getHeight() - (plan.pages[i].height * 72) / 25.4,
        ) < 1e-8,
      );
    }
  }
});
test("calibration sheet is A4 and can be opened independently", async () => {
  const blob = await calibrationPdf(),
    bytes = new Uint8Array(await blob.arrayBuffer());
  await mkdir("tmp/pdfs", { recursive: true });
  await writeFile("tmp/pdfs/calibration.pdf", bytes);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - (210 * 72) / 25.4) < 1e-8);
});
test("PDF generation can be cancelled before any page is built", async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    () => makePrintPdf(planPrint(globe, print), globe, print, [], abort.signal),
    { name: "AbortError" },
  );
});
