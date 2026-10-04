import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLOBE as g,
  DEFAULT_PRINT as p,
  DEFAULT_DOCUMENT as doc,
} from "../features/studio/domain/types.ts";
import { planPrint } from "../features/studio/domain/layout.ts";
import { goreBox } from "../features/studio/domain/geometry.ts";
import { validateDocument } from "../features/studio/domain/validation.ts";
test("default layout packs twelve unscaled gores onto three A4 sheets", () => {
  const plan = planPrint(g, p);
  assert.equal(plan.pages.length, 3);
  assert.equal(plan.tiled, false);
  const all = plan.pages.flatMap((p) => p.items);
  assert.deepEqual(
    all.map((i) => i.gore),
    Array.from({ length: 12 }, (_, i) => i),
  );
  for (const page of plan.pages)
    for (const item of page.items) {
      assert.ok(item.x >= p.margin);
      assert.ok(item.y >= p.margin);
      assert.ok(item.x + item.width <= page.width - p.margin + 1e-8);
      assert.ok(item.y + item.height <= page.height - p.margin - 7 + 1e-8);
      assert.equal(
        item.fullWidth,
        item.rotated ? goreBox(g).height : goreBox(g).width,
      );
    }
});
test("oversize gores are covered by overlapping tiles without scaling", () => {
  const big = { ...g, width: 600, height: 600 };
  const plan = planPrint(big, p);
  assert.ok(plan.tiled);
  for (let n = 0; n < big.gores; n++) {
    const items = plan.pages
      .flatMap((p) => p.items)
      .filter((i) => i.gore === n);
    assert.ok(items.length > 1);
    assert.equal(Math.min(...items.map((i) => i.cropX)), 0);
    assert.equal(Math.min(...items.map((i) => i.cropY)), 0);
    assert.ok(
      Math.abs(
        Math.max(...items.map((i) => i.cropX + i.width)) - items[0].fullWidth,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        Math.max(...items.map((i) => i.cropY + i.height)) - items[0].fullHeight,
      ) < 1e-8,
    );
    const ys = [...new Set(items.map((i) => i.cropY))].sort((a, b) => a - b);
    for (let j = 1; j < ys.length; j++) {
      const prev = items.find((i) => i.cropY === ys[j - 1]);
      assert.ok(Math.abs(prev.cropY + prev.height - ys[j] - p.overlap) < 1e-8);
    }
  }
});
test("calibration is applied before placement and paper margins remain respected", () => {
  const config = { ...p, calibrationX: 1.02, calibrationY: 0.99 };
  const plan = planPrint(g, config),
    item = plan.pages[0].items[0],
    box = goreBox(g);
  assert.ok(
    Math.abs(item.fullWidth - (item.rotated ? box.height : box.width) * 1.02) <
      1e-8,
  );
  assert.ok(
    Math.abs(item.fullHeight - (item.rotated ? box.width : box.height) * 0.99) <
      1e-8,
  );
});
test("rotated packing uses custom paper without resizing the gore", () => {
  const plan = planPrint(g, {
    ...p,
    paper: "custom",
    width: 280,
    height: 70,
    margin: 5,
    orientation: "landscape",
  });
  assert.equal(plan.tiled, false);
  assert.equal(plan.pages[0].items[0].rotated, true);
});
test("invalid printable areas and excessive page counts fail safely", () => {
  assert.equal(planPrint(g, { ...p, margin: 110 }).error, "layoutError");
  assert.equal(
    planPrint(
      { ...g, width: 1000, height: 1000, gores: 72 },
      { ...p, paper: "custom", width: 50, height: 50 },
    ).error,
    "pageLimit",
  );
});
test("project validation rejects unsafe settings and executable color content", () => {
  assert.deepEqual(validateDocument(doc), doc);
  assert.throws(() =>
    validateDocument({ ...doc, globe: { ...g, width: Infinity } }),
  );
  assert.throws(() =>
    validateDocument({ ...doc, print: { ...p, calibrationX: 100 } }),
  );
  assert.throws(() =>
    validateDocument({
      ...doc,
      layers: [
        {
          id: "x",
          name: "x",
          visible: true,
          opacity: 1,
          strokes: [
            {
              id: "s",
              kind: "brush",
              size: 0.01,
              color: "url(http://example.com)",
              points: [{ x: 0, y: 0 }],
            },
          ],
        },
      ],
    }),
  );
});
