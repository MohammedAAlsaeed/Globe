import test from "node:test";
import assert from "node:assert/strict";
import { clampToMap, sizeReadout } from "../features/mapmaker/sizePreview.ts";

const size = { w: 1000, h: 800 };

test("clampToMap keeps a point inside the map", () => {
  assert.deepEqual(clampToMap({ x: 200, y: 150 }, size), { x: 200, y: 150 });
  assert.deepEqual(clampToMap({ x: -40, y: 150 }, size), { x: 0, y: 150 });
  assert.deepEqual(clampToMap({ x: 2000, y: 900 }, size), { x: 1000, y: 800 });
});

test("the readout is pixels and a whole percent of the map width", () => {
  assert.deepEqual(sizeReadout(0.08, 2048), { px: 164, pct: 8 });
  // Never below 1, so a tiny brush still reads sensibly.
  assert.deepEqual(sizeReadout(0.0001, 2048), { px: 1, pct: 1 });
});
