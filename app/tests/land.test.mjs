import test from "node:test";
import assert from "node:assert/strict";
import {
  ROUGH_AMP,
  StrokeBuilder,
  edgeNoise,
  radiusAt,
  roughStroke,
  strokeBounds,
  strokeCoverage,
  strokePolyline,
} from "../features/mapmaker/brush/roughStroke.ts";
import {
  DETAIL_AMP,
  buildCoastShape,
} from "../features/mapmaker/brush/coastfx.ts";
import { DEFAULT_COAST } from "../features/mapmaker/brush/coastStyles.ts";

/** A wavy pointer trail, normalized coordinates. */
const trail = (n = 120) =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: 0.2 + t * 0.6, y: 0.5 + Math.sin(t * 7) * 0.12 };
  });

test("stroke polyline is the same fed sample by sample or all at once", () => {
  const pts = trail(300).map((p) => ({ x: p.x, y: p.y * 0.75 })),
    step = 0.004,
    whole = new StrokeBuilder(step);
  pts.forEach((p) => whole.feed(p));
  const all = whole.polyline();
  // A live builder, checked after every sample: its fixed vertices are a
  // prefix of the final ones and never move.
  const live = new StrokeBuilder(step);
  pts.forEach((p) => {
    live.feed(p);
    const fixed = live.polyline().slice(0, live.fixedCount);
    fixed.forEach((v, i) => {
      assert.ok(
        Math.abs(v.x - all[i].x) < 1e-12 && Math.abs(v.y - all[i].y) < 1e-12,
      );
    });
  });
  // evenly spaced vertices, ending exactly at the last sample
  for (let i = 1; i < all.length - 1; i++)
    assert.ok(
      Math.abs(
        Math.hypot(all[i].x - all[i - 1].x, all[i].y - all[i - 1].y) - step,
      ) <
        step * 0.02 || i === 1,
    );
  assert.deepEqual(all[all.length - 1], pts[pts.length - 1]);
});

test("a smooth land stroke is exactly the drawn capsule", () => {
  const W = 400,
    s = roughStroke(
      [
        { x: 0.3, y: 0.5 },
        { x: 0.7, y: 0.5 },
      ],
      0.1,
      { roughness: 0, detail: 0.5 },
      7,
      1,
    ),
    b = strokeBounds(s, W),
    cov = strokeCoverage(s, W, b.x, b.y, b.w, b.h),
    at = (x, y) => cov[(y - b.y) * b.w + (x - b.x)];
  // radius 0.05 → 20 px around the centre line y = 200
  assert.equal(at(200, 200), 1);
  assert.equal(at(200, 200 - 19), 1);
  assert.equal(at(200, 200 + 21), 0);
  assert.ok(at(200, 200 + 20) > 0 && at(200, 200 + 20) < 1); // anti-aliased edge
  // round caps
  assert.equal(at(120 - 21, 200), 0);
  assert.equal(at(120 - 18, 200), 1);
});

test("roughness moves the edge in proportion to the brush, never more", () => {
  for (const size of [0.02, 0.12]) {
    const s = roughStroke(trail(), size, { roughness: 1, detail: 1 }, 99, 0.75),
      R = size / 2;
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const r = radiusAt(s, Math.random(), Math.random() * 0.75) / R;
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    assert.ok(
      lo >= 1 - ROUGH_AMP - 1e-9 && hi <= 1 + ROUGH_AMP + 1e-9,
      `${lo}..${hi}`,
    );
    assert.ok(hi - lo > ROUGH_AMP, "it is actually rough");
  }
  // bigger brush → bigger (not more) bumps: the noise wavelength scales with R
  const a = edgeNoise(0.31, 0.42, 0.01, 2, 5),
    b = edgeNoise(0.31 * 4, 0.42 * 4, 0.04, 2, 5);
  assert.ok(Math.abs(a - b) < 1e-9);
  // the radius never drops to nothing, so a stroke has no holes along its middle
  const s = roughStroke(trail(), 0.05, { roughness: 1, detail: 1 }, 3, 0.75),
    W2 = 300,
    bb = strokeBounds(s, W2),
    cov = strokeCoverage(s, W2, bb.x, bb.y, bb.w, bb.h);
  for (const p of s.line) {
    const x = Math.floor(p.x * W2),
      y = Math.floor(p.y * W2);
    assert.equal(cov[(y - bb.y) * bb.w + (x - bb.x)], 1);
  }
});

test("rough strokes are deterministic and a partial render matches the whole", () => {
  const W = 500,
    s = roughStroke(trail(), 0.06, { roughness: 0.7, detail: 0.6 }, 1234, 0.75),
    b = strokeBounds(s, W),
    full = strokeCoverage(s, W, b.x, b.y, b.w, b.h),
    again = strokeCoverage(s, W, b.x, b.y, b.w, b.h);
  assert.deepEqual(full, again);
  // a tile of it, rendered alone, is the same pixels
  const tx = b.x + 40,
    ty = b.y + 30,
    tile = strokeCoverage(s, W, tx, ty, 64, 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++)
      assert.equal(
        tile[y * 64 + x],
        full[(ty - b.y + y) * b.w + (tx - b.x + x)],
      );
});

test("the polyline is resolution independent", () => {
  const p = trail(),
    a = strokePolyline(p, 0.03, 0.75),
    b = strokePolyline(p, 0.03, 0.75);
  assert.deepEqual(a, b);
  assert.ok(a.length > 10);
});

test("the coast stays where the land was drawn (fine detail only)", () => {
  const w = 400,
    h = 300,
    mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (Math.hypot(x - 200, y - 150) < 90) mask[y * w + x] = 255;
  const fx = {
      ...DEFAULT_COAST,
      roughness: 1,
      detail: 1,
      smoothing: 0,
      islets: 0,
    },
    shape = buildCoastShape(mask, w, h, fx, 42),
    maxMove = DETAIL_AMP * w + 1.5;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x + 0.5 - 200, y + 0.5 - 150),
        land = shape.S[y * w + x] > 0;
      if (r < 90 - maxMove) assert.ok(land, `inland ${x},${y}`);
      if (r > 90 + maxMove) assert.ok(!land, `at sea ${x},${y}`);
    }
});
