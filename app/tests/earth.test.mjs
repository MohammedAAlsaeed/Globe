import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EARTH_DEFAULT_SHOWN,
  buildEarthProject,
  decodePath,
  earthDetail,
} from "../features/mapmaker/templates/earth.ts";
import { validateProject } from "../features/mapmaker/validation.ts";

const data = (detail) =>
  JSON.parse(
    readFileSync(
      new URL(`../public/templates/earth-${detail}.json`, import.meta.url),
      "utf8",
    ),
  );
const names = {
  water: "Water",
  land: "Land",
  rivers: "Rivers",
  borders: "Borders",
  graticule: "Graticule",
  names: "Names",
  continents: "Continents",
  capitals: "Capitals",
};
const build = (detail, tier, extra = {}) =>
  buildEarthProject(data(detail), {
    name: "Earth",
    resolutionTier: tier,
    lang: "ar",
    pov: null,
    shown: EARTH_DEFAULT_SHOWN,
    layerNames: names,
    ...extra,
  });

test("the Earth template makes a valid 2:1 map at every resolution", () => {
  for (const tier of ["low", "medium", "high", "ultra"]) {
    const p = build(earthDetail(tier), tier);
    assert.equal(p.width, p.height * 2);
    assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(p))));
    const bytes = JSON.stringify(p).length;
    assert.ok(bytes < 6 * 1024 * 1024, `${tier}: ${bytes} bytes`);
  }
});

test("geography lands where it belongs (equirectangular)", () => {
  const d = data("50m");
  // every land point is on the map, and the seam is shared exactly
  let atLeft = 0,
    atRight = 0;
  for (const r of d.land)
    for (const p of decodePath(r, d.scale)) {
      assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
      if (p.x === 0) atLeft++;
      if (p.x === 1) atRight++;
    }
  assert.ok(atLeft > 0 && atRight > 0);
  // Riyadh (46.7°E, 24.6°N) is a capital, in the right place
  const riyadh = d.labels.find((l) => l.t === "capital" && l.en === "Riyadh");
  assert.ok(riyadh);
  assert.ok(Math.abs(riyadh.x / d.scale - (46.72 + 180) / 360) < 0.002);
  assert.ok(Math.abs(riyadh.y / d.scale - (90 - 24.64) / 180) < 0.002);
});

test("names follow the language and the point of view", () => {
  const en = build("50m", "medium", {
      lang: "en",
      shown: { ...EARTH_DEFAULT_SHOWN, capitals: true },
    }),
    texts = (p, layer) =>
      p.layers
        .find((l) => l.name === layer)
        .objects.filter((o) => o.kind === "text")
        .map((o) => o.text);
  assert.ok(texts(en, "Names").includes("Saudi Arabia"));
  assert.ok(texts(build("50m", "medium"), "Names").includes("السعودية"));
  const d = data("50m"),
    pov = d.povs.find((p) => d.labels.some((l) => l.v && l.v[p] !== undefined));
  assert.ok(pov, "some point of view differs from the default");
  const hidden = d.labels.find(
    (l) => l.t === "country" && l.v && l.v[pov] === 0,
  );
  if (hidden) {
    assert.ok(texts(en, "Names").includes(hidden.en));
    assert.ok(
      !texts(build("50m", "medium", { lang: "en", pov }), "Names").includes(
        hidden.en,
      ),
    );
  }
  // capitals: a dot and a name that follows it
  const caps = en.layers.find((l) => l.name === "Capitals").objects,
    t = caps.find((o) => o.kind === "text");
  assert.ok(caps.some((o) => o.kind === "stamp" && o.id === t.attach.to));
});

test("a seamless map's coast runs across its left and right edges", async () => {
  const { buildCoastShape } =
    await import("../features/mapmaker/brush/coastfx.ts");
  const { DEFAULT_COAST } =
    await import("../features/mapmaker/brush/coastStyles.ts");
  const w = 400,
    h = 200,
    mask = new Uint8Array(w * h);
  // land touching the left edge only
  for (let y = 60; y < 140; y++)
    for (let x = 0; x < 30; x++) mask[y * w + x] = 255;
  const fx = { ...DEFAULT_COAST, roughness: 0 },
    flat = buildCoastShape(mask, w, h, fx, 1, false),
    round = buildCoastShape(mask, w, h, fx, 1, true),
    at = (s, x) => s.S[100 * w + x];
  // without the seam the right edge is far out at sea…
  assert.ok(at(flat, w - 1) < -300);
  // …with it, half a pixel from the land just across
  assert.ok(Math.abs(at(round, w - 1) + 0.5) < 1.01, String(at(round, w - 1)));
  // and the far side mirrors the near side of the coast
  for (const d of [3, 10, 20])
    assert.ok(Math.abs(at(round, w - d) - at(round, 30 + d - 1)) < 1.5);
});
