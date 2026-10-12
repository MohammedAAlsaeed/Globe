// Stamp Tool logic that needs no canvas: the catalog, placement (single
// and scattered), and converting older maps' icons into stamps.
import test from "node:test";
import assert from "node:assert/strict";
import { allSets, builtinKey, searchSets, stampAsset, stampSet } from "../features/mapmaker/stamps/catalog.ts";
import { Scatter, initialStampState, makeStamp, selectSet } from "../features/mapmaker/stamps/state.ts";
import { migrateProject } from "../features/mapmaker/stamps/migrate.ts";
import { mulberry32 } from "../features/mapmaker/brush/noise.ts";

test("every built-in variant draws a tight, non-empty picture", () => {
  for (const set of allSets()) {
    assert.ok(set.assets.length >= 1, set.id);
    for (const key of set.assets) {
      const a = stampAsset(key);
      assert.equal(a.kind, "vector");
      const art = a.art();
      assert.ok(art.w > 0 && art.h > 0 && art.parts.length > 0, key);
      for (const p of art.parts) assert.match(p.d, /^M/, key);
    }
  }
});

test("variants of a set are different drawings, and stable", () => {
  const [a, b] = stampSet("pine").assets.map((k) => stampAsset(k).art());
  assert.notDeepEqual(a.parts, b.parts);
  assert.deepEqual(stampAsset(builtinKey("pine", 0)).art(), a);
});

test("search finds sets by name first, then by tag", () => {
  const label = (s) => s.id;
  const found = searchSets("pine", label, "all").map((s) => s.id);
  assert.equal(found[0], "pine"); // before "snowMountain" (tagged "alpine")
  assert.ok(found.includes("snowMountain"));
  assert.deepEqual(searchSets("", label, "water").map((s) => s.category), searchSets("", label, "water").map(() => "water"));
});

test("a placed stamp takes the tool's look and stays in range", () => {
  const s = { ...selectSet(initialStampState(), stampSet("tree")), sizeJitter: 1, rotationJitter: 30, toneJitter: 1 };
  const rand = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const st = makeStamp(s, { x: 0.5, y: 0.5 }, rand);
    assert.ok(stampSet("tree").assets.includes(st.asset));
    assert.ok(st.size >= s.look.size * 0.5 - 1e-9 && st.size <= s.look.size * 1.5 + 1e-9);
    assert.ok(Math.abs(st.rotation) <= 30);
    assert.ok(Math.abs(st.hue) <= 14 && Math.abs(st.brightness) <= 0.12 + 1e-9);
    assert.equal(st.ink, s.look.ink);
  }
});

test("a chosen variant is used when variants aren't random", () => {
  const s = { ...selectSet(initialStampState(), stampSet("house"), 3), randomVariant: false };
  assert.equal(makeStamp(s, { x: 0, y: 0 }, Math.random).asset, builtinKey("house", 3));
});

test("scattering drops one stamp per spacing along the stroke", () => {
  const s = { ...initialStampState(), spacing: 1, spread: 0 };
  const W = 1000,
    step = s.look.size * W; // one stamp width
  const sc = new Scatter(s, W, 500, 1);
  const placed = [...sc.feed(0, 250)];
  for (let x = 10; x <= step * 5; x += 10) placed.push(...sc.feed(x, 250));
  assert.equal(placed.length, 6); // the start + one every stamp width
  placed.forEach((p, i) => assert.ok(Math.abs(p.x * W - i * step) < 1e-6, `stamp ${i} at ${p.x * W}`));
  assert.ok(placed.every((p) => p.y === 0.5));
});

test("older maps' icons open as Classic stamps", () => {
  const icon = { id: "i1", kind: "icon", icon: "castle", x: 0.2, y: 0.3, rotation: 15, scale: 2, color: "#112233" };
  const project = { layers: [{ id: "l", objects: [icon] }] };
  const out = migrateProject(project);
  const st = out.layers[0].objects[0];
  assert.equal(st.kind, "stamp");
  assert.equal(st.asset, "b:classic-castle:0");
  assert.ok(Math.abs(st.size - 0.1) < 1e-12);
  assert.equal(st.ink, "#112233");
  assert.equal(st.fill, null);
  assert.equal(st.rotation, 15);
  assert.ok(stampAsset(st.asset));
  const clean = { layers: [{ id: "l", objects: [st] }] };
  assert.equal(migrateProject(clean), clean);
});
