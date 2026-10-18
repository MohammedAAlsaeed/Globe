// Typing slider values by hand, and the rule that every slider can be typed
// into and reset.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { editParts, firstNumber, settleValue, valueFromDisplay } from "../components/ui/valueInput.ts";

test("numbers are read the way people type them", () => {
  assert.equal(firstNumber("160 px"), 160);
  assert.equal(firstNumber("−30°"), -30);
  assert.equal(firstNumber("+25"), 25);
  assert.equal(firstNumber("×1.50"), 1.5);
  assert.equal(firstNumber("1,5"), 1.5);
  assert.equal(firstNumber("1,200 px"), 1200);
  assert.equal(firstNumber("١٢٫٥"), 12.5);
  assert.equal(firstNumber("۴۵"), 45);
  assert.equal(firstNumber("122% · 65 px"), 122);
  assert.ok(Number.isNaN(firstNumber("abc")));
});

test("a number in the units shown becomes the slider's value", () => {
  const W = 2048;
  const px = (v) => `${Math.max(0, Math.round(v * W))} px`;
  assert.ok(Math.abs(valueFromDisplay(160, 0.005, 0.15, px) - 160 / W) < 1e-9);
  const pct = (v) => `${Math.round(v * 100)}%`;
  assert.ok(Math.abs(valueFromDisplay(35, 0, 1, pct) - 0.35) < 1e-9);
  const signed = (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;
  assert.ok(Math.abs(valueFromDisplay(-40, -1, 1, signed) + 0.4) < 1e-9);
  assert.equal(valueFromDisplay(45, -180, 180, (v) => `${v}°`), 45);
  // No format: the number is the value.
  assert.equal(valueFromDisplay(12, 6, 72), 12);
  // The Line panel: px to 0.1, at least 1 px, a word at zero — on several map sizes.
  for (const w of [1024, 2048, 3000, 4096, 8192]) {
    const fine = (v) => `${Math.max(1, Math.round(v * w * 10) / 10)} px`;
    const casing = (v) => (v ? fine(v) : "None");
    assert.ok(Math.abs(valueFromDisplay(10, 0, 0.01, casing) * w - 10) < 1e-6, `casing on ${w}`);
    assert.ok(Math.abs(valueFromDisplay(6.5, 0.0005, 0.2, fine) * w - 6.5) < 1e-6, `width on ${w}`);
  }
  // A non-whole factor (stamp size as a % of the set's own size) still converts closely.
  const rel = (v) => `${Math.round((v / 0.037) * 100)}% · ${px(v)}`;
  assert.ok(Math.abs(valueFromDisplay(150, 0.0037, 0.185, rel) - 0.0555) < 0.0005);
});

test("typed values stay in range; whole-number steps stay on their step", () => {
  assert.equal(settleValue(5, 0, 1, 0.01), 1);
  assert.equal(settleValue(-3, 0, 1, 0.01), 0);
  assert.equal(settleValue(0.333, 0, 1, 0.01), 0.333);
  assert.equal(settleValue(13, 6, 72, 2), 14);
  assert.equal(settleValue(12.4, -180, 180, 1), 12);
  assert.equal(settleValue(0.1 + 0.2, 0, 1, 0.01), 0.3);
});

test("the box shows the bare number, with a short unit beside it", () => {
  assert.deepEqual(editParts("160 px"), { number: "160", prefix: "", suffix: "px" });
  assert.deepEqual(editParts("×1.50"), { number: "1.50", prefix: "×", suffix: "" });
  assert.deepEqual(editParts("−30°"), { number: "-30", prefix: "", suffix: "°" });
  assert.deepEqual(editParts("+25"), { number: "25", prefix: "", suffix: "" });
  assert.equal(editParts("122% · 65 px").number, "122");
});

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

test("every slider can be typed into and reset", () => {
  const files = sources(new URL("../features", import.meta.url).pathname);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/<(Slider|RangeField)\b([\s\S]*?)\/>/g))
      assert.match(m[2], /defaultValue=/, `${file}: a ${m[1]} without defaultValue`);
    // Bare range inputs would skip typing and reset: use Slider / RangeField
    // (the Slider itself, and the gore count's custom row, pair theirs with
    // ValueEditor and ResetButton).
    if (/type="range"/.test(src)) assert.match(src, /<ValueEditor[\s\S]*?<ResetButton|<ResetButton[\s\S]*?<ValueEditor|ResetButton[\s\S]*ValueEditor/, `${file}: a bare range input`);
  }
});

test("brush resets return to the brush it started from", async () => {
  const { brushBase, applyPreset, DEFAULT_BRUSH_STATE } = await import("../features/mapmaker/brush/state.ts");
  const { PRESETS } = await import("../features/mapmaker/brush/presets.ts");
  const soft = PRESETS.find((p) => p.id === "soft-round") ?? PRESETS[1];
  // Pick a preset, then edit it: the edit clears presetId but keeps the base.
  const picked = applyPreset(DEFAULT_BRUSH_STATE, soft);
  const edited = { ...picked, presetId: null, brush: { ...picked.brush, size: 0.2 }, source: { ...picked.source, texture: "sand", hue: 40 } };
  const base = brushBase(edited, []);
  assert.equal(base.brush.size, picked.brush.size);
  assert.equal(base.presetId, soft.id);
  // The paint chosen stays; its adjustments reset.
  assert.equal(base.source.texture, "sand");
  assert.equal(base.source.hue, 0);
  // A favorite comes back as saved.
  const fav = { id: "f1", name: "Mine", brush: { ...picked.brush, size: 0.07 }, opacity: 0.4, blend: "multiply", source: { ...picked.source, texture: "snow" } };
  const fromFav = brushBase({ ...edited, baseId: "f1" }, [fav]);
  assert.equal(fromFav.brush.size, 0.07);
  assert.equal(fromFav.opacity, 0.4);
  assert.equal(fromFav.source.texture, "snow");
  // Nothing to go back to: the factory brush.
  assert.equal(brushBase({ ...edited, baseId: null }, []).brush.size, DEFAULT_BRUSH_STATE.brush.size);
});

test("coast resets return to the style it was edited from", async () => {
  const { coastBase, coastStyle } = await import("../features/mapmaker/brush/coastStyles.ts");
  const tropical = coastStyle("tropical");
  const edited = { ...tropical, roughness: 0.9, style: null, baseStyle: "tropical" };
  assert.equal(coastBase(edited).glowWidth, tropical.glowWidth);
  assert.equal(coastBase(edited).style, "tropical");
  assert.equal(coastBase({ ...edited, baseStyle: undefined }).style, "classic");
});
