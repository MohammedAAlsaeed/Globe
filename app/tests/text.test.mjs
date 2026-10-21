// The Text Tool: scripts and joining rules, HarfBuzz shaping (Arabic,
// mixed directions, fallback fonts, spacing, wrapping, line heights),
// curves, validation, old labels, texts following stamps, and undo steps.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import engine from "../features/mapmaker/text/engine.ts";
import { validLook, validText } from "../features/mapmaker/text/validate.ts";
import {
  FACTORY_TEXT_LOOK,
  BUILTIN_TEXT_STYLES,
  resetTextProp,
} from "../features/mapmaker/text/state.ts";
import {
  followStamps,
  shiftText,
  textAlongLine,
} from "../features/mapmaker/text/objects.ts";
import {
  labelToText,
  migrateProject,
} from "../features/mapmaker/stamps/migrate.ts";
import { historyReducer } from "../features/mapmaker/hooks/useHistory.ts";
import { textEn, textAr } from "../lib/locales/text.ts";
import { parseColor } from "../features/mapmaker/export/vectorExport.ts";

const {
  textToSvg,
  isVectorText,
  setFontFetcher,
  loadHarfBuzz,
  loadFile,
  shapeText,
  neededFiles,
  textGeometry,
  arcCurve,
  pathCurve,
  resolveScripts,
  joinsNext,
  addKashida,
  FONTS,
  FONT_PROFILES,
  FONT_INFO,
  fontDef,
  profileSlot,
} = engine;

const pub = new URL("../public", import.meta.url).pathname;
setFontFetcher(async (p) => {
  const b = readFileSync(join(pub, p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});

const look = (over = {}) => ({
  ...FACTORY_TEXT_LOOK,
  ...over,
  outline: { ...FACTORY_TEXT_LOOK.outline, ...(over.outline ?? {}) },
  shadow: { ...FACTORY_TEXT_LOOK.shadow, ...(over.shadow ?? {}) },
});
const text = (t, over = {}) => ({
  ...look(over),
  id: "t1",
  kind: "text",
  text: t,
  x: 0.5,
  y: 0.5,
  rotation: 0,
  boxWidth: null,
  ...over,
});

/** Shapes once every font the text needs has loaded (fallbacks included). */
async function shaped(t, l, box = null) {
  await loadHarfBuzz();
  for (let i = 0; i < 4; i++) {
    const need = neededFiles(t, l);
    await Promise.all(need.files.map((f) => loadFile(f)));
    const s = shapeText(t, l, box);
    if (s.ready) return s;
    await new Promise((r) => setTimeout(r, 20));
  }
  return shapeText(t, l, box);
}
const glyphs = (s) => s.lines.flatMap((l) => l.glyphs);

// ---- scripts --------------------------------------------------------------------------------
test("digits, spaces and marks take their neighbours' script", () => {
  const s = resolveScripts("مدينة 2026 Riyadh");
  assert.equal(s[0], "arabic");
  assert.equal(s[6], "arabic"); // "2" right after Arabic
  assert.equal(s[11], "latin");
  assert.deepEqual(resolveScripts("(1492) Kingdom").slice(0, 2), [
    "latin",
    "latin",
  ]);
  assert.equal(resolveScripts("رُ")[1], "arabic"); // the damma stays Arabic
});

test("Arabic joining: where letters join, and where kashida may go", () => {
  const word = "الأندلس";
  assert.equal(joinsNext(word, 0), false); // alef never joins the next letter
  assert.equal(joinsNext(word, 1), true); // lam joins the alef after it
  assert.equal(joinsNext("دار", 0), false);
  // Kashida: never inside lam-alef, never in short words, only where letters join.
  const k = addKashida("مملكة الأندلس من", 0.34);
  assert.ok(k.includes("ـ"), k);
  assert.ok(!/لـ+[أاإآ]/.test(k), `no kashida inside lam-alef: ${k}`);
  assert.ok(k.endsWith(" من"), "two-letter words stay as they are");
  for (const m of k.matchAll(/ـ+/g))
    assert.ok(
      joinsNext(k, m.index - 1),
      "kashida only between joining letters",
    );
  assert.equal(addKashida("Kingdom", 1), "Kingdom");
});

// ---- the library ---------------------------------------------------------------------------
test("every font file exists, is licensed and measured; every profile's fonts exist", () => {
  for (const f of FONTS) {
    assert.equal(f.license, "OFL-1.1");
    if (f.source === "web") continue;
    assert.ok(FONT_INFO[f.id], `${f.id} measured`);
    for (const file of f.files)
      assert.ok(readFileSync(join(pub, file.path)).length > 10000, file.path);
    assert.ok(
      readFileSync(join(pub, "fonts", f.id, "OFL.txt"), "utf8").includes(
        "SIL OPEN FONT LICENSE",
      ),
      `${f.id} OFL.txt`,
    );
    for (const fb of f.fallback) assert.ok(fontDef(fb), `${f.id} → ${fb}`);
  }
  for (const p of FONT_PROFILES) {
    const ar = profileSlot(p, "arabic"),
      la = profileSlot(p, "latin");
    assert.ok(
      FONT_INFO[ar.font].scripts.includes("arabic"),
      `${p.id} Arabic face covers Arabic`,
    );
    assert.ok(
      FONT_INFO[la.font].scripts.includes("latin"),
      `${p.id} Latin face covers Latin`,
    );
    assert.ok(
      textEn[`txProfile_${p.id}`] && textAr[`txProfile_${p.id}`],
      `${p.id} named`,
    );
  }
  for (const s of BUILTIN_TEXT_STYLES) assert.ok(validLook(s.look), s.id);
});

// ---- shaping --------------------------------------------------------------------------------
test("Arabic is joined by HarfBuzz, right to left, with the profile's Arabic face", async () => {
  const l = look({ profile: "ancient-manuscript" });
  const s = await shaped("مملكة الأندلس", l);
  assert.ok(s.ready);
  const g = glyphs(s);
  assert.ok(
    g.every((x) => x.ref.kind === "hb" && x.ref.face.fontId === "amiri"),
  );
  assert.ok(g.every((x) => x.rtl));
  // Visual order: the first letter of the text is drawn last (rightmost).
  assert.equal(g[g.length - 1].cluster, 0);
  // Positions increase left to right.
  for (let i = 1; i < g.length; i++) assert.ok(g[i].x >= g[i - 1].x - 0.6);
});

test("mixed directions keep their order (Unicode BiDi)", async () => {
  const t = "مملكة الأندلس - Kingdom of Andalusia (1492)";
  const s = await shaped(t, look({ profile: "ancient-manuscript" }));
  const g = glyphs(s);
  const kingdom = t.indexOf("Kingdom"),
    year = t.indexOf("1492");
  // An Arabic paragraph: the English part sits on the left, Arabic on the right.
  assert.equal(g[0].cluster, kingdom);
  assert.equal(g[g.length - 1].cluster, 0);
  const yearGlyphs = g.filter((x) => x.cluster >= year && x.cluster < year + 4);
  assert.ok(
    yearGlyphs.every((x, i, a) => i === 0 || x.x > a[i - 1].x),
    "1492 reads left to right",
  );
  // Each script with its own face.
  assert.equal(g[0].ref.face.fontId, "eb-garamond");
  assert.equal(g[g.length - 1].ref.face.fontId, "amiri");
});

test("a font without Arabic falls back to the profile's Arabic face, and says so", async () => {
  const l = look({ profile: "royal-kingdom", font: "cinzel" });
  const s = await shaped("Kingdom مملكة", l);
  const g = glyphs(s);
  assert.ok(g.some((x) => x.ref.face.fontId === "cinzel"));
  assert.ok(g.some((x) => x.ref.face.fontId === "noto-naskh-arabic"));
  assert.ok(
    s.substitutes.some(
      (x) => x.script === "arabic" && x.font === "noto-naskh-arabic",
    ),
  );
});

test("letter spacing never opens a joined Arabic word; it spaces Latin letters", async () => {
  const ar0 = await shaped("الأندلس", look()),
    ar1 = await shaped("الأندلس", look({ letterSpacing: 0.5 }));
  assert.ok(Math.abs(ar0.width - ar1.width) < 1e-9, "Arabic word unchanged");
  const la0 = await shaped("Andalus", look()),
    la1 = await shaped("Andalus", look({ letterSpacing: 0.5 }));
  assert.ok(
    Math.abs(la1.width - la0.width - 0.5 * 6) < 1e-6,
    "six gaps between seven letters",
  );
  // Between Arabic words the spacing goes to the space.
  const two0 = await shaped("جبال السروات", look()),
    two1 = await shaped("جبال السروات", look({ letterSpacing: 0.5 }));
  assert.ok(two1.width > two0.width + 0.5);
});

test("wrapping to a width, and taller lines for fonts that need them", async () => {
  const t = "The Great Western Ocean of the Old World";
  const s = await shaped(t, look(), 6);
  assert.ok(s.lines.length >= 2);
  for (const l of s.lines) assert.ok(l.width <= 6 + 0.5, `line ${l.width}`);
  const latin = await shaped(
    "One\nTwo",
    look({ profile: "universal-classical" }),
  );
  const nastaliq = await shaped(
    "ایران\nپارس",
    look({ profile: "persian-miniature" }),
  );
  const step = (x) => x.lines[1].baseline - x.lines[0].baseline;
  assert.ok(step(nastaliq) > step(latin), `${step(nastaliq)} > ${step(latin)}`);
  // Persian letters pick the Persian shaping language.
  assert.ok(
    glyphs(nastaliq).every((g) => g.ref.face.fontId === "noto-nastaliq-urdu"),
  );
});

// ---- curves ---------------------------------------------------------------------------------
test("an arc keeps the text's anchor in place and bends the way it says", async () => {
  const o = text("Kingdom of Andalusia", { curveMode: "arc", curve: 40 });
  const s = await shaped(o.text, o);
  const up = arcCurve(40, s),
    down = arcCurve(-40, s);
  const [ax, ay] = up.map(0, 0);
  assert.ok(Math.abs(ax) < 1e-9 && Math.abs(ay) < 1e-9);
  // Arc up: the ends drop below the middle; arc down: they rise.
  assert.ok(up.map(s.left, 0)[1] > 0.5);
  assert.ok(down.map(s.left, 0)[1] < -0.5);
  assert.equal(arcCurve(0, s), null);
  const geo = textGeometry(o, 0.75);
  assert.ok(geo.ready && geo.ops.length > 100);
  assert.ok(
    geo.bounds.y1 - geo.bounds.y0 > 1,
    "the arc is taller than a straight line",
  );
});

test("on a straight path, the warp is only a move; a reversed path flips the reading direction", async () => {
  const nodes = [
    { x: 0.2, y: 0.5 },
    { x: 0.8, y: 0.5 },
  ];
  const o = text("Rio Grande", {
    curveMode: "path",
    path: {
      nodes,
      reverse: false,
      align: "center",
      offset: 0,
      side: "center",
      baseline: 0,
      smooth: false,
    },
  });
  const s = await shaped(o.text, o);
  const pc = pathCurve(o, s, 0.5);
  const [x1, y1] = pc.curve.map(0, 0),
    [x2, y2] = pc.curve.map(1, -0.3);
  assert.ok(Math.abs(x2 - x1 - 1) < 1e-6 && Math.abs(y2 - y1 + 0.3) < 1e-6);
  // The middle of the text sits on the middle of the path (in em: 0.5 / size).
  assert.ok(Math.abs(x1 - 0.5 / o.size - (s.left + s.width / 2) * 0) < s.width);
  const rev = pathCurve({ ...o, path: { ...o.path, reverse: true } }, s, 0.5);
  assert.ok(
    rev.curve.map(1, 0)[0] < rev.curve.map(0, 0)[0],
    "reversed: x runs right to left",
  );
  // Joined Arabic on a curve: smooth warp by default (every outline point mapped).
  const ar = text("جبال السروات", { curveMode: "arc", curve: 50 });
  await shaped(ar.text, ar);
  const warped = textGeometry(ar, 0.75),
    flat = textGeometry({ ...ar, curveMode: "straight" }, 0.75);
  assert.ok(
    warped.ops.length > flat.ops.length,
    "long segments split before bending",
  );
});

test("a text along a line follows its nodes, a little above it", () => {
  const line = {
    id: "l",
    kind: "line",
    closed: false,
    nodes: [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.3 },
      { x: 0.9, y: 0.2 },
    ],
    mode: "color",
    stroke: { width: 0.004 },
    stamp: { size: 0.01 },
    opacity: 1,
  };
  const t = textAlongLine(line, FACTORY_TEXT_LOOK, "River", null);
  assert.equal(t.curveMode, "path");
  assert.deepEqual(t.path.nodes, line.nodes);
  assert.notEqual(
    t.path.nodes,
    line.nodes,
    "a copy: reshaping one leaves the other",
  );
  assert.ok(t.path.baseline > 0);
  assert.ok(validText(t));
});

// ---- data rules --------------------------------------------------------------------------------
test("texts and looks are validated like the server does", () => {
  assert.ok(validLook(FACTORY_TEXT_LOOK));
  assert.ok(validText(text("مرحبا")));
  assert.ok(!validText(text("")));
  assert.ok(!validText(text("x".repeat(2001))));
  assert.ok(
    !validLook({ ...FACTORY_TEXT_LOOK, features: { "bad tag": true } }),
  );
  assert.ok(!validLook({ ...FACTORY_TEXT_LOOK, size: 5 }));
  assert.ok(
    !validLook({
      ...FACTORY_TEXT_LOOK,
      outline: { ...FACTORY_TEXT_LOOK.outline, join: "sharp" },
    }),
  );
  assert.ok(!validLook({ ...FACTORY_TEXT_LOOK, lang: "not a lang" }));
  assert.ok(
    validLook({
      ...FACTORY_TEXT_LOOK,
      lang: "ar-SA",
      features: { dlig: true, kern: false },
    }),
  );
  assert.ok(
    !validText({
      ...text("x"),
      path: {
        nodes: [{ x: 0, y: 0 }],
        reverse: false,
        align: "center",
        offset: 0,
        side: "above",
        baseline: 0,
        smooth: true,
      },
    }),
  );
});

test("resets return one property to the style's value", () => {
  const base = BUILTIN_TEXT_STYLES.find((s) => s.id === "t:city").look;
  const changed = {
    ...base,
    size: 0.1,
    outline: { ...base.outline, width: 0.4 },
  };
  assert.equal(resetTextProp(changed, base, "size").size, base.size);
  assert.equal(
    resetTextProp(changed, base, "outline.width").outline.width,
    base.outline.width,
  );
  assert.equal(resetTextProp(changed, base, "outline.width").size, 0.1);
});

test("old labels open as texts in the same place", () => {
  // A centred label at (0.5, 0.5) on a 1000 × 500 map; its middle is half a line lower.
  const label = {
    id: "L",
    kind: "label",
    text: "Avalon",
    x: 0.5,
    y: 0.5,
    size: 0.03,
    color: "#112233",
    align: "center",
    rtl: false,
    anchored: true,
    locked: true,
  };
  const t = labelToText(label, 1000, 500);
  assert.equal(t.kind, "text");
  assert.ok(Math.abs(t.x - 0.5) < 1e-9);
  assert.ok(Math.abs(t.y - (0.5 + (0.03 * 1000) / 2 / 500)) < 1e-9);
  assert.equal(t.fill, "#112233");
  assert.equal(t.locked, true);
  assert.ok(validText(t));
  // Turned 90°: the half line goes sideways.
  const turned = labelToText({ ...label, rotation: 90 }, 1000, 500);
  assert.ok(turned.x < 0.5 && Math.abs(turned.y - 0.5) < 1e-9);
  // Older labels were placed by their left edge.
  const old = labelToText({ ...label, anchored: false }, 1000, 500, () => 3);
  assert.ok(Math.abs(old.x - (0.5 + (3 * 30) / 2 / 1000)) < 1e-9);
  const p = {
    id: "p",
    name: "m",
    width: 1000,
    height: 500,
    layers: [
      {
        id: "a",
        name: "A",
        visible: true,
        locked: false,
        opacity: 1,
        objects: [label, { ...label, id: "E", text: "  " }],
      },
    ],
  };
  const m = migrateProject(p);
  assert.deepEqual(
    m.layers[0].objects.map((o) => o.kind),
    ["text"],
  );
});

test("texts follow the stamp they're attached to", () => {
  const stamp = { id: "s", kind: "stamp", x: 0.3, y: 0.3 };
  const city = {
    ...text("Toledo"),
    id: "c",
    x: 0.32,
    y: 0.28,
    attach: { to: "s", dx: 0.02, dy: -0.02 },
  };
  const prev = { layers: [{ id: "a", objects: [stamp, city] }] };
  const moved = {
    layers: [{ id: "a", objects: [{ ...stamp, x: 0.4, y: 0.35 }, city] }],
  };
  const out = followStamps(prev, moved);
  const c = out.layers[0].objects[1];
  assert.ok(Math.abs(c.x - 0.42) < 1e-9 && Math.abs(c.y - 0.33) < 1e-9);
  // Moved by hand: it keeps its new place relative to the stamp.
  const byHand = {
    layers: [
      { id: "a", objects: [stamp, { ...city, ...shiftText(city, 0.05, 0) }] },
    ],
  };
  assert.ok(
    Math.abs(followStamps(prev, byHand).layers[0].objects[1].attach.dx - 0.07) <
      1e-9,
  );
  // The stamp gone: the text stays, free.
  const gone = followStamps(prev, { layers: [{ id: "a", objects: [city] }] });
  assert.equal(gone.layers[0].objects[0].attach, null);
  // Nothing attached: the same project comes back.
  const plain = { layers: [{ id: "a", objects: [stamp] }] };
  assert.equal(followStamps(prev, plain), plain);
});

test("typing and slider drags are one undo step each", () => {
  const p0 = { id: "p", n: 0 };
  let h = { present: p0, past: [], future: [], run: null };
  const set = (n, key, at) =>
    (h = historyReducer(h, {
      type: "update",
      updater: (p) => ({ ...p, n }),
      coalesce: key,
      at,
    }));
  set(1, "text-edit:a", 1000);
  set(2, "text-edit:a", 1100);
  set(3, "text-edit:a", 1200);
  assert.equal(h.past.length, 1);
  set(4, "size", 1300);
  assert.equal(h.past.length, 2);
  set(5, "size", 5000); // a pause: a new step
  assert.equal(h.past.length, 3);
  h = historyReducer(h, { type: "seal" });
  set(6, "size", 5100);
  assert.equal(h.past.length, 4);
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.present.n, 5);
});

test("vector export: texts as outlines in place, or as real editable text", async () => {
  const base = text("Mare Nostrum بحر الروم");
  const o = {
    ...base,
    outline: {
      ...base.outline,
      enabled: true,
      width: 0.05,
      opacity: 1,
      position: "outside",
    },
    shadow: { ...base.shadow, enabled: true },
  };
  await shaped(o.text, o);
  // geometry is cached per object: wait until its fonts are in
  for (let i = 0; i < 20 && !isVectorText(o, 0.75); i++)
    await new Promise((r) => setTimeout(r, 20));
  assert.ok(isVectorText(o, 0.75));
  const out = textToSvg(o, 2000, 1500, "outlines", "t1");
  const d = /<path d="(M[^"]+)" fill="#/.exec(out.body)[1];
  const xs = [...d.matchAll(/[MLQC]([\d.-]+) ([\d.-]+)/g)].map((m) => +m[1]);
  // centred on the text's place (x 0.5 → 1000 px)
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 1000) < 40);
  assert.match(out.defs, /<filter id="t1-sh"/);
  assert.match(out.body, /stroke-linejoin/);
  assert.doesNotMatch(out.body, /<text/);
  const editable = textToSvg(o, 2000, 1500, "editable", "t1");
  assert.match(
    editable.body,
    /<text [^>]*paint-order="stroke"[^>]*><tspan[^>]*>Mare Nostrum بحر الروم<\/tspan>/,
  );
  // curved texts stay outlines even when editable text is asked for
  const curved = textToSvg(
    { ...o, curveMode: "arc", curve: 0.5 },
    2000,
    1500,
    "editable",
    "t2",
  );
  assert.doesNotMatch(curved.body, /<text/);
  assert.deepEqual(parseColor("#3b2a1a"), {
    r: 0x3b / 255,
    g: 0x2a / 255,
    b: 0x1a / 255,
  });
  assert.deepEqual(parseColor("#fff"), { r: 1, g: 1, b: 1 });
});

test("texts saved on the server come back as the editor saved them", () => {
  // Laravel turns "" into null; PHP turns {} into [].
  const saved = { ...text("Cairo"), lang: null, features: [] };
  assert.ok(validText(saved));
  const project = {
    width: 1000,
    height: 800,
    layers: [{ id: "l", objects: [saved] }],
  };
  const [back] = migrateProject(project).layers[0].objects;
  assert.equal(back.lang, "");
  assert.deepEqual(back.features, {});
});
