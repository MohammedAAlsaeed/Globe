import test from "node:test";
import assert from "node:assert/strict";
import {
  globeGeometry,
  latitudeAt,
  goreBox,
  edgePoints,
  sourceY,
  recommendGores,
} from "../features/studio/domain/geometry.ts";
import { DEFAULT_GLOBE as base } from "../features/studio/domain/types.ts";
import { samplePixel } from "../features/studio/rendering/sampling.ts";
import { pngWithDpi } from "../features/studio/export/png.ts";
test("sphere dimensions match analytic circumference and meridian length", () => {
  const g = globeGeometry(base);
  assert.ok(Math.abs(g.goreHeight - Math.PI * 75) < 1e-9);
  assert.ok(Math.abs(g.goreWidth * 12 - Math.PI * 150) < 1e-9);
  assert.ok(Math.abs(latitudeAt(g.goreHeight / 2, g.arcs)) < 1e-12);
  assert.equal(latitudeAt(0, g.arcs), Math.PI / 2);
  assert.equal(latitudeAt(g.goreHeight, g.arcs), -Math.PI / 2);
});
test("ellipsoid integration preserves symmetry and equatorial width", () => {
  const sphere = globeGeometry(base),
    tall = globeGeometry({ ...base, height: 240 });
  assert.equal(tall.goreWidth, sphere.goreWidth);
  assert.ok(tall.goreHeight > sphere.goreHeight);
  assert.ok(tall.goreHeight < Math.PI * 120);
  assert.ok(Math.abs(latitudeAt(tall.goreHeight / 2, tall.arcs)) < 1e-12);
});
test("glue tabs taper to zero at poles and reach requested width at equator", () => {
  const edge = edgePoints(base, 1),
    tab = edgePoints(base, 1, true);
  assert.ok(Math.abs(tab[0].x - edge[0].x) < 1e-9);
  assert.ok(Math.abs(tab[128].x - edge[128].x - base.tab) < 1e-9);
  assert.ok(Math.abs(tab[256].x - edge[256].x) < 1e-9);
  assert.equal(
    goreBox(base).width,
    globeGeometry(base).goreWidth + base.tab + 2 * base.bleed,
  );
});
test("Mercator coverage is explicit and missing poles remain missing", () => {
  const s = { ...base, sourceProjection: "mercator" };
  assert.equal(sourceY(Math.PI / 2, s), null);
  assert.equal(sourceY(-Math.PI / 2, s), null);
  assert.ok(Math.abs(sourceY(0, s) - 0.5) < 1e-9);
  assert.ok(Math.abs(sourceY((s.north * Math.PI) / 180, s)) < 1e-8);
});
test("recommendation returns even counts bounded by supported settings", () => {
  assert.equal(recommendGores(150, 40), 12);
  assert.equal(recommendGores(1000, 5), 72);
  assert.equal(recommendGores(20, 200), 6);
});
test("all sampling filters preserve constant colors across the longitude seam", () => {
  const input = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < input.length; i += 4) input.set([90, 120, 180, 255], i);
  for (const method of ["bilinear", "bicubic", "lanczos"]) {
    const out = new Uint8ClampedArray(4);
    samplePixel(input, 4, 4, -0.35, 1.3, method, out, 0);
    assert.deepEqual([...out], [90, 120, 180, 255]);
  }
});
test("alpha-aware interpolation does not bleed transparent black into color", () => {
  const out = new Uint8ClampedArray(4);
  samplePixel(
    new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
    2,
    1,
    0.5,
    0,
    "bilinear",
    out,
    0,
  );
  assert.deepEqual([...out], [255, 0, 0, 128]);
});
test("PNG embeds a valid 300 DPI physical-resolution chunk", async () => {
  const input = Uint8Array.from({ length: 45 }, (_, i) => i),
    blob = await pngWithDpi({ toBlob: (cb) => cb(new Blob([input])) }, 300),
    bytes = new Uint8Array(await blob.arrayBuffer()),
    view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(37, 41)), "pHYs");
  assert.equal(view.getUint32(41), 11811);
  assert.equal(view.getUint32(45), 11811);
  assert.equal(bytes[49], 1);
  let crc = 0xffffffff;
  for (const b of bytes.slice(37, 50)) {
    crc ^= b;
    for (let i = 0; i < 8; i++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  assert.equal(view.getUint32(50), (crc ^ 0xffffffff) >>> 0);
  assert.deepEqual(bytes.slice(54), input.slice(33));
});

test("Mercator source PPI accounts for its nonuniform vertical density", async () => {
  const { effectivePpi } =
    await import("../features/studio/domain/geometry.ts");
  const s = { ...base, sourceProjection: "mercator" };
  const value = effectivePpi(4800, 2400, s);
  assert.ok(value > 129 && value < 130);
  assert.ok(effectivePpi(4800, 2400, base) > 258);
});
test("rounded bleed covers both the tip and the equatorial cut edge", async () => {
  const { bleedBounds } = await import("../features/studio/domain/geometry.ts"),
    g = goreBox(base);
  const tip = bleedBounds(-base.bleed / 2, base, g);
  assert.ok(tip.left < 0 && tip.right > 0);
  const middle = bleedBounds(g.goreHeight / 2, base, g);
  assert.ok(Math.abs(middle.left + g.goreWidth / 2 + base.bleed) < 1e-8);
  assert.ok(
    Math.abs(middle.right - g.goreWidth / 2 - base.tab - base.bleed) < 1e-8,
  );
});
