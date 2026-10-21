// Saving maps as images, fitting maps on the globe, and laying out posters.
import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeTiff,
  exportSizes,
  fileName,
  jpegWithDpi,
  pngWithDpi,
  printSizeCm,
} from "../features/mapmaker/export/imageFormats.ts";
import { coverage, fitRect, needsFit } from "../features/studio/domain/fit.ts";
import {
  artworkAt,
  heightPerWidth,
  planPoster,
  sheetName,
  trimCorners,
  posterPpi,
  PAGE_LIMIT,
} from "../features/studio/poster/layout.ts";
import { cropMarks, overlapGuides } from "../features/studio/poster/sheets.ts";
import {
  DEFAULT_POSTER,
  validPoster,
} from "../features/studio/poster/types.ts";
import { validateDocument } from "../features/studio/domain/validation.ts";
import { DEFAULT_DOCUMENT } from "../features/studio/domain/types.ts";

test("export sizes: quarter to double, those above the plan locked", () => {
  const sizes = exportSizes(2048, 1536, 2048);
  assert.deepEqual(
    sizes.map((s) => [s.scale, s.width, s.height, s.locked]),
    [
      [0.25, 512, 384, false],
      [0.5, 1024, 768, false],
      [1, 2048, 1536, false],
      [2, 4096, 3072, true],
    ],
  );
  // Canvases browsers can't make are never offered.
  assert.ok(!exportSizes(16384, 16384, 99999).some((s) => s.scale === 2));
  assert.equal(printSizeCm(2048, 300), 17.3);
  assert.equal(
    fileName("  My map: the North!  ", "png"),
    "My-map-the-North!.png",
  );
  assert.equal(fileName("", "tif"), "map.tif");
});

test("TIFF: a valid little-endian RGB file with its DPI", () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]);
  const tif = encodeTiff(rgba, 2, 1, 300),
    v = new DataView(tif.buffer);
  assert.equal(String.fromCharCode(tif[0], tif[1]), "II");
  assert.equal(v.getUint16(2, true), 42);
  const ifd = v.getUint32(4, true),
    tags = new Map();
  for (let i = 0; i < v.getUint16(ifd, true); i++) {
    const p = ifd + 2 + i * 12;
    tags.set(
      v.getUint16(p, true),
      v.getUint16(p + 2, true) === 3
        ? v.getUint16(p + 8, true)
        : v.getUint32(p + 8, true),
    );
  }
  assert.equal(tags.get(256), 2);
  assert.equal(tags.get(257), 1);
  assert.equal(tags.get(277), 3);
  assert.equal(v.getUint32(tags.get(282), true), 300);
  const data = tags.get(273);
  assert.deepEqual([...tif.slice(data, data + 6)], [255, 0, 0, 127, 255, 127]); // half-transparent green on white
});

test("JPEG and PNG carry the DPI", () => {
  const jfif = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  ]);
  const out = jpegWithDpi(jfif, 300);
  assert.equal(out[13], 1);
  assert.equal((out[14] << 8) | out[15], 300);
  const png = new Uint8Array(40);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const withDpi = pngWithDpi(png, 300);
  assert.equal(withDpi.length, 61);
  assert.equal(String.fromCharCode(...withDpi.slice(37, 41)), "pHYs");
  assert.equal(
    new DataView(withDpi.buffer).getUint32(41),
    Math.round(300 / 0.0254),
  );
});

test("maps that aren't 2:1 are fitted: kept in proportion, or stretched", () => {
  assert.ok(!needsFit(4096, 2048));
  assert.ok(needsFit(2048, 1536));
  // 4:3 kept in proportion: full height, centred, sea on both sides.
  const c = fitRect(2048, 1536, "contain");
  assert.deepEqual(c.canvas, { width: 3072, height: 1536 });
  assert.deepEqual(c.map, { x: 512, y: 0, width: 2048, height: 1536 });
  // 3:1 kept in proportion: full width, the poles left as sea.
  const w = fitRect(3000, 1000, "contain");
  assert.equal(w.map.width, w.canvas.width);
  assert.ok(w.map.y > 0);
  assert.deepEqual(fitRect(2048, 1536, "stretch").map, {
    x: 0,
    y: 0,
    width: 3072,
    height: 1536,
  });
  assert.deepEqual(coverage(2048, 1536), { kind: "longitudes", degrees: 240 });
  assert.deepEqual(coverage(3000, 1000), {
    kind: "latitudes",
    north: 60,
    south: 60,
  });
});

test("poster artwork: border and title band scale with the width", () => {
  const plain = artworkAt(400, 4 / 3, DEFAULT_POSTER);
  assert.equal(plain.border, 0);
  assert.equal(plain.height, 300);
  const framed = {
    ...DEFAULT_POSTER,
    frame: "double",
    title: "Andalor",
    subtitle: "2026",
  };
  const a = artworkAt(400, 4 / 3, framed);
  assert.ok(a.border > 0 && a.title);
  assert.ok(Math.abs(a.height - 400 * heightPerWidth(4 / 3, framed)) < 1e-9);
  assert.ok(a.title.y > a.map.y + a.map.height);
});

test("one sheet: the poster is as large as the paper allows, centred", () => {
  const plan = planPoster(4 / 3, { ...DEFAULT_POSTER, paper: "A4" });
  assert.equal(plan.sheets.length, 1);
  // A4 landscape fits a 4:3 map best: 297 − 2×8 wide is the limit… or the height.
  assert.equal(plan.paper.width, 297);
  const s = plan.sheets[0];
  assert.ok(s.clip.x >= 8 && s.clip.x + s.clip.width <= 297 - 8 + 1e-9);
  assert.ok(Math.abs(s.clip.x - (297 - s.clip.width) / 2) < 1e-9);
});

test("a large poster is tiled with overlap, fewest sheets first", () => {
  const s = {
    ...DEFAULT_POSTER,
    paper: "A4",
    size: "custom",
    printWidth: 900,
    overlap: 10,
  };
  const plan = planPoster(4 / 3, s);
  assert.ok(plan.sheets.length > 1);
  assert.equal(plan.cols * plan.rows, plan.sheets.length);
  // Neighbours overlap by exactly `overlap`; together they cover the whole canvas.
  const [a, b] = plan.sheets;
  assert.ok(
    Math.abs(b.sourceX - (a.sourceX + a.clip.width - s.overlap)) < 1e-9,
  );
  const last = plan.sheets.at(-1);
  assert.ok(
    Math.abs(last.sourceX + last.clip.width - plan.canvas.width) < 1e-6,
  );
  assert.ok(
    Math.abs(last.sourceY + last.clip.height - plan.canvas.height) < 1e-6,
  );
  assert.equal(sheetName(plan.sheets[0]), "A1");
  assert.equal(sheetName({ row: 1, col: 2 }), "B3");
  assert.equal(sheetName({ row: 26, col: 0 }), "AA1");
  // Overlap guides only on edges that have a neighbour.
  assert.equal(overlapGuides(plan, plan.sheets[0], s).length, 2);
  assert.equal(overlapGuides(plan, last, s).length, 0);
});

test("crop marks sit at the trim corners, outside the artwork", () => {
  const s = { ...DEFAULT_POSTER, paper: "A3", bleed: 3 };
  const plan = planPoster(1.5, s),
    sheet = plan.sheets[0];
  const corners = trimCorners(plan, sheet);
  assert.equal(corners.length, 4);
  assert.ok(Math.abs(corners[0].x - (sheet.clip.x + 3)) < 1e-9);
  for (const [x1, y1, x2, y2] of cropMarks(plan, sheet)) {
    // Each mark is outside the trim box.
    const insideX = (x) =>
        x > sheet.clip.x + 3 + 1e-9 &&
        x < sheet.clip.x + 3 + plan.artwork.width - 1e-9,
      insideY = (y) =>
        y > sheet.clip.y + 3 + 1e-9 &&
        y < sheet.clip.y + 3 + plan.artwork.height - 1e-9;
    assert.ok(!(insideX(x1) && insideY(y1)) && !(insideX(x2) && insideY(y2)));
  }
});

test("too many sheets is refused; print resolution is reported", () => {
  const huge = planPoster(1, {
    ...DEFAULT_POSTER,
    paper: "A5",
    size: "custom",
    printWidth: 5000,
  });
  assert.equal(huge.error, "pageLimit");
  assert.ok(huge.cols * huge.rows > PAGE_LIMIT);
  const plan = planPoster(4 / 3, {
    ...DEFAULT_POSTER,
    size: "custom",
    printWidth: 254,
  });
  assert.ok(Math.abs(posterPpi(plan, 3000) - 300) < 1);
});

test("poster and fit settings are validated in saved projects", () => {
  assert.ok(validPoster(DEFAULT_POSTER));
  assert.ok(!validPoster({ ...DEFAULT_POSTER, bleed: 50 }));
  assert.ok(!validPoster({ ...DEFAULT_POSTER, frame: "neon" }));
  const doc = validateDocument({
    ...DEFAULT_DOCUMENT,
    mode: "poster",
    poster: DEFAULT_POSTER,
    globe: { ...DEFAULT_DOCUMENT.globe, fit: "stretch", fill: "#123456" },
    print: { ...DEFAULT_DOCUMENT.print, paper: "A2" },
  });
  assert.equal(doc.mode, "poster");
  assert.throws(() =>
    validateDocument({
      ...DEFAULT_DOCUMENT,
      globe: { ...DEFAULT_DOCUMENT.globe, fit: "zoom" },
    }),
  );
  assert.throws(() =>
    validateDocument({
      ...DEFAULT_DOCUMENT,
      poster: { ...DEFAULT_POSTER, title: "x".repeat(500) },
    }),
  );
});

test("canvases stay within what the device draws (iPhone and iPad: about 16 MP)", async () => {
  const {
    canvasPixelsFor,
    isAppleMobile,
    canvasFits,
    APPLE_MOBILE_CANVAS_PIXELS,
  } = await import("../lib/canvasLimits.ts");
  assert.ok(
    isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),
  );
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  assert.ok(
    isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5),
  );
  assert.ok(
    !isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0),
  );
  assert.equal(
    canvasPixelsFor("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
    APPLE_MOBILE_CANVAS_PIXELS,
  );
  assert.ok(!canvasFits(40000, 100, 1e9));
  // An 8192 × 4096 map: double size is offered on a computer, never on an iPhone.
  const desktop = exportSizes(8192, 4096, 99999),
    phone = exportSizes(8192, 4096, 99999, APPLE_MOBILE_CANVAS_PIXELS);
  assert.ok(desktop.some((s) => s.scale === 1));
  assert.ok(
    !phone.some((s) => s.width * s.height > APPLE_MOBILE_CANVAS_PIXELS),
  );
  assert.deepEqual(
    phone.map((s) => s.scale),
    [0.25, 0.5],
  );
});

test("poster print canvas is capped for the device, and the PPI shown is the one printed", async () => {
  const { printScale, printedPpi } =
    await import("../features/studio/poster/render.ts");
  const plan = planPoster(2, {
    ...DEFAULT_POSTER,
    size: "custom",
    printWidth: 1500,
    paper: "A3",
  });
  const phone = 16e6,
    k = printScale(plan, 20000, 300, phone);
  assert.ok(plan.canvas.width * k * plan.canvas.height * k <= phone + 1);
  // A 20000 px map on a 1.5 m poster would be ~339 PPI; capped to 300, and lower on a phone.
  assert.ok(Math.abs(printedPpi(plan, 20000, 1e12) - 300) < 1e-6);
  assert.ok(printedPpi(plan, 20000, phone) < 100);
  // Even a vast poster never asks a phone for a larger canvas.
  const vast = planPoster(1, {
      ...DEFAULT_POSTER,
      size: "custom",
      printWidth: 5000,
      paper: "A0",
    }),
    kv = printScale(vast, 100, 300, phone);
  assert.ok(vast.canvas.width * kv * vast.canvas.height * kv <= phone + 1);
});

test("PDF images are compressed natively, with a soft mask only when needed", async () => {
  const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
  const { embedPixels, decodePng } = await import("../lib/pdfImage.ts");
  const { inflateSync, deflateSync } = await import("node:zlib");
  const w = 300,
    h = 200,
    rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++)
    rgba.set([i % 256, (i >> 8) % 256, 77, 255], i * 4);
  const pdf = await PDFDocument.create(),
    image = await embedPixels(pdf, {
      width: w,
      height: h,
      read: (y, rows) => rgba.subarray(y * w * 4, (y + rows) * w * 4),
    });
  image.draw(pdf.addPage([w, h]), { x: 0, y: 0, width: w, height: h });
  const loaded = await PDFDocument.load(await pdf.save());
  const streams = loaded.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter(
      (o) =>
        o instanceof PDFRawStream &&
        o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    );
  assert.equal(streams.length, 1, "opaque: no soft mask");
  const px = inflateSync(streams[0].contents);
  assert.equal(px.length, w * h * 3);
  assert.deepEqual([...px.subarray(3 * 301, 3 * 301 + 3)], [301 % 256, 1, 77]);

  // A transparent PNG (as a canvas makes it) gets its mask; every filter type is undone.
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(5, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  const pixels = [];
  for (let y = 0; y < 5; y++) {
    const row = [];
    for (let x = 0; x < 4; x++)
      row.push(x * 40 + y, y * 30, 200 - x * 10, x === 0 ? 0 : 255);
    pixels.push(row);
  }
  // Encode each row with filter = y % 5.
  for (let y = 0; y < 5; y++) {
    const cur = pixels[y],
      up = y ? pixels[y - 1] : new Array(16).fill(0),
      out = [y % 5];
    for (let i = 0; i < 16; i++) {
      const a = i >= 4 ? cur[i - 4] : 0,
        b = up[i],
        c = i >= 4 ? up[i - 4] : 0;
      const pa = Math.abs(b - c),
        pb = Math.abs(a - c),
        pc = Math.abs(a + b - 2 * c);
      const pred = [
        0,
        a,
        b,
        (a + b) >> 1,
        pa <= pb && pa <= pc ? a : pb <= pc ? b : c,
      ][y % 5];
      out.push((cur[i] - pred) & 255);
    }
    rows.push(Buffer.from(out));
  }
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const t = Buffer.from(name),
      len = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, sum]);
  };
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const decoded = await decodePng(new Uint8Array(png));
  assert.deepEqual([...decoded.rgba], pixels.flat());
  const { embedPngFast } = await import("../lib/pdfImage.ts");
  const pdf2 = await PDFDocument.create();
  (await embedPngFast(pdf2, new Uint8Array(png))).draw(pdf2.addPage([4, 5]), {
    x: 0,
    y: 0,
    width: 4,
    height: 5,
  });
  const l2 = await PDFDocument.load(await pdf2.save());
  const imgs = l2.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter(
      (o) =>
        o instanceof PDFRawStream &&
        o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    );
  assert.equal(imgs.length, 2, "colour + soft mask");
  assert.ok(imgs.some((o) => o.dict.get(PDFName.of("SMask"))));
});
