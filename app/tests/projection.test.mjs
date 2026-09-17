import test from "node:test";
import assert from "node:assert/strict";
import {
  geometry,
  latitudeAt,
  renderGores,
  pngWithDpi,
} from "../lib/projection.ts";
const base = {
  height: 150,
  width: 150,
  gores: 12,
  gap: 3,
  offset: 0,
  guides: false,
  grid: false,
};
test("sphere has the correct physical meridian length and equatorial circumference", () => {
  const g = geometry(base);
  assert.ok(Math.abs(g.goreHeight - Math.PI * 75) < 1e-9);
  assert.ok(Math.abs(g.goreWidth * 12 - Math.PI * 150) < 1e-9);
  assert.ok(Math.abs(g.sheetWidth - (Math.PI * 150 + 33 + 10)) < 1e-9);
  assert.ok(Math.abs(latitudeAt(g.goreHeight / 2, g.arcs)) < 1e-12);
  assert.equal(latitudeAt(0, g.arcs), Math.PI / 2);
  assert.equal(latitudeAt(g.goreHeight, g.arcs), -Math.PI / 2);
});
test("ellipsoid preserves equator width while meridian length follows height", () => {
  const sphere = geometry(base),
    tall = geometry({ ...base, height: 240 });
  assert.equal(tall.goreWidth, sphere.goreWidth);
  assert.ok(tall.goreHeight > sphere.goreHeight);
  assert.ok(tall.goreHeight < Math.PI * 120);
  assert.ok(Math.abs(latitudeAt(tall.goreHeight / 2, tall.arcs)) < 1e-12);
});
test("offset wraps source pixels and the render uses the requested physical scale", () => {
  let calls = 0;
  const ctx = {
    drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
      calls++;
      assert.ok(sx >= 0 && sx + sw <= image.naturalWidth + 1e-8);
      assert.ok(sy >= 0 && sy + sh <= image.naturalHeight);
      assert.ok(dw > 0 && dh > 0);
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
  };
  const canvas = { getContext: () => ctx };
  const s = { ...base, offset: 179 };
  const g = renderGores(
    canvas,
    { naturalWidth: 2048, naturalHeight: 1024 },
    s,
    2,
  );
  assert.equal(canvas.width, Math.ceil(g.sheetWidth * 2));
  assert.equal(canvas.height, Math.ceil(g.sheetHeight * 2));
  assert.ok(calls > 12 * Math.ceil(g.goreHeight * 2));
});
test("PNG embeds a valid 300 DPI physical resolution chunk", async () => {
  const input = Uint8Array.from({ length: 45 }, (_, i) => i);
  const blob = await pngWithDpi({ toBlob: (cb) => cb(new Blob([input])) }, 300);
  const bytes = new Uint8Array(await blob.arrayBuffer()),
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
