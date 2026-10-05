import test from "node:test";
import assert from "node:assert/strict";
import {
  gradientNoise,
  mulberry32,
  fbm,
} from "../features/mapmaker/brush/noise.ts";
import {
  coastline,
  hexCellAt,
  hexCorners,
  polygonArea,
  resampleClosed,
} from "../features/mapmaker/brush/coast.ts";
import { TEXTURES, filterRgb } from "../features/mapmaker/brush/textures.ts";
import { DabWalker } from "../features/mapmaker/brush/engine.ts";
import {
  DEFAULT_BRUSH,
  DEFAULT_EDGE_SETTINGS,
  DEFAULT_SOURCE,
} from "../features/mapmaker/brush/presets.ts";
import { validateProject } from "../features/mapmaker/validation.ts";

const circle = (cx, cy, r, n = 120, upTo = 1) =>
  Array.from({ length: Math.round(n * upTo) }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

test("seeded PRNG is deterministic", () => {
  const a = mulberry32(42),
    b = mulberry32(42);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test("periodic noise wraps exactly at its period (seamless tiles)", () => {
  for (const [x, y] of [
    [0.3, 0.7],
    [2.9, 4.1],
    [5.5, 0.05],
  ]) {
    assert.ok(
      Math.abs(gradientNoise(x, y, 7, 6) - gradientNoise(x + 6, y, 7, 6)) <
        1e-12,
    );
    assert.ok(
      Math.abs(gradientNoise(x, y, 7, 6) - gradientNoise(x, y + 6, 7, 6)) <
        1e-12,
    );
    assert.ok(
      Math.abs(fbm(x, y, 3, 4, 6) - fbm(x + 6, y + 6, 3, 4, 6)) < 1e-12,
    );
  }
});

test("every catalog texture tiles seamlessly across its edges", () => {
  const eps = 1e-4;
  for (const t of TEXTURES) {
    let worst = 0;
    for (let k = 0; k < 24; k++) {
      const v = (k + 0.5) / 24;
      const left = t.gen(eps, v),
        right = t.gen(1 - eps, v),
        top = t.gen(v, eps),
        bottom = t.gen(v, 1 - eps);
      for (let c = 0; c < 3; c++)
        worst = Math.max(
          worst,
          Math.abs(left[c] - right[c]),
          Math.abs(top[c] - bottom[c]),
        );
    }
    // Hard features (cracks, field edges, grain) may straddle the seam, but a
    // real seam would show as a systematic jump far larger than this.
    assert.ok(worst < 90, `${t.id} seam difference ${worst.toFixed(1)}`);
  }
});

test("color filters: neutral is identity, hue rotation preserves lightness", () => {
  const same = filterRgb(120, 80, 40, {
    hue: 0,
    saturation: 0,
    brightness: 0,
    contrast: 0,
  });
  assert.deepEqual(same.map(Math.round), [120, 80, 40]);
  const rotated = filterRgb(200, 60, 60, {
    hue: 120,
    saturation: 0,
    brightness: 0,
    contrast: 0,
  });
  assert.ok(
    rotated[1] > rotated[0] && rotated[1] > rotated[2],
    "red rotated by 120° becomes green",
  );
  const darker = filterRgb(200, 200, 200, {
    hue: 0,
    saturation: 0,
    brightness: -0.5,
    contrast: 0,
  });
  assert.ok(darker[0] < 120);
});

test("coastline is deterministic, follows the drawn outline and keeps its size", () => {
  const outline = circle(0.5, 0.4, 0.15);
  const opts = { roughness: 0.6, detail: 0.8, seed: 99 };
  const a = coastline(outline, opts),
    b = coastline(outline, opts),
    c = coastline(outline, { ...opts, seed: 100 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.length > outline.length * 4, "fractal detail adds many points");
  const ratio = polygonArea(a) / polygonArea(outline);
  assert.ok(ratio > 0.75 && ratio < 1.25, `area ratio ${ratio}`);
  for (const p of a) {
    const d = Math.hypot(p.x - 0.5, p.y - 0.4);
    assert.ok(Math.abs(d - 0.15) < 0.07, "edge stays near the drawn outline");
  }
});

test("coastline already drawn stays put while the lasso keeps growing", () => {
  const opts = { roughness: 0.6, detail: 0.8, seed: 5 };
  const partial = coastline(circle(0.5, 0.5, 0.2, 200, 0.7), opts),
    fuller = coastline(circle(0.5, 0.5, 0.2, 200, 0.8), opts);
  // Points on the far side from both the start and the moving end (≈ 90°–180°)
  // must be identical in both versions.
  const inWindow = (p) => {
    const a = Math.atan2(p.y - 0.5, p.x - 0.5);
    return a > Math.PI * 0.55 && a < Math.PI * 0.95;
  };
  const key = (p) => `${p.x.toFixed(9)},${p.y.toFixed(9)}`;
  const fullerSet = new Set(fuller.map(key));
  const mid = partial.filter(inWindow);
  assert.ok(mid.length > 50);
  const kept = mid.filter((p) => fullerSet.has(key(p))).length;
  assert.ok(
    kept / mid.length > 0.97,
    `only ${kept}/${mid.length} points stable`,
  );
});

test("fixed-step resampling keeps spacing", () => {
  const pts = resampleClosed(circle(0, 0, 1, 400), 0.05);
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    assert.ok(Math.abs(d - 0.05) < 0.002);
  }
});

test("hex grid: a cell's centre maps back to the same cell", () => {
  const w = 0.03;
  for (let col = -3; col <= 6; col++)
    for (let row = -3; row <= 6; row++) {
      const corners = hexCorners(col, row, w),
        cx = corners.reduce((s, p) => s + p.x, 0) / 6,
        cy = corners.reduce((s, p) => s + p.y, 0) / 6;
      assert.deepEqual(hexCellAt(cx, cy, w), [col, row]);
    }
});

test("dab walker: even spacing, deterministic jitter, pressure scales size", () => {
  const brush = {
    ...DEFAULT_BRUSH,
    size: 0.02,
    spacing: 0.25,
    sizeJitter: 0.5,
    pen: { enabled: true, size: true, opacity: false, flow: false },
  };
  const walk = (seed, p) => {
    const w = new DabWalker(brush, seed, 1),
      dabs = [];
    for (let i = 0; i <= 100; i++)
      dabs.push(...w.feed({ x: 0.1 + i * 0.004, y: 0.5, p }));
    return dabs;
  };
  const a = walk(3, 1),
    b = walk(3, 1),
    light = walk(3, 0.2);
  assert.deepEqual(a, b);
  // 0.4 long line, dab every 0.25 × 0.02 = 0.005 → ~81 dabs
  assert.ok(Math.abs(a.length - 81) <= 2, `got ${a.length} dabs`);
  const avg = (ds) => ds.reduce((s, d) => s + d.size, 0) / ds.length;
  assert.ok(avg(light) < avg(a) * 0.5, "light pressure paints thinner");
});

test("project validation accepts paint objects and rejects malformed ones", () => {
  const paint = {
    id: "p1",
    kind: "paint",
    mode: "edge",
    erase: false,
    blend: "normal",
    opacity: 0.9,
    source: DEFAULT_SOURCE,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.1 },
      { x: 0.2, y: 0.3 },
    ],
    edge: DEFAULT_EDGE_SETTINGS,
    seed: 12,
  };
  const project = (objects) => ({
    id: "x",
    name: "t",
    width: 2048,
    height: 1536,
    tileCols: 40,
    tileRows: 30,
    resolutionTier: "medium",
    aspect: "landscape",
    background: "#2c5678",
    snapToGrid: false,
    layers: [
      {
        id: "l",
        name: "Land",
        role: "land",
        visible: true,
        locked: false,
        opacity: 1,
        objects,
      },
    ],
    updatedAt: 1,
  });
  assert.doesNotThrow(() => validateProject(project([paint])));
  assert.throws(() =>
    validateProject(project([{ ...paint, blend: "explode" }])),
  );
  assert.throws(() =>
    validateProject(
      project([{ ...paint, source: { ...DEFAULT_SOURCE, texture: "nope" } }]),
    ),
  );
  assert.throws(() =>
    validateProject(project([{ ...paint, mode: "free", brush: undefined }])),
  );
});
