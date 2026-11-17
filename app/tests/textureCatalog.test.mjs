// The Texture Catalog: searching (English and Arabic), filtering, sorting,
// grouping and counting — and which texture references a map may hold.
import test from "node:test";
import assert from "node:assert/strict";
import {
  indexFor,
  labelMatches,
  matchScore,
  plainWord,
} from "../features/mapmaker/brush/textureSearch.ts";
import {
  builtinCatalog,
  EMPTY_QUERY,
  groupTextures,
  hierarchyCounts,
  queryTextures,
  sortTextures,
  styleKey,
  suggestions,
  UNTAGGED,
} from "../features/mapmaker/brush/textureCatalog.ts";
import {
  isTextureId,
  isUploadedTexture,
  textureMatrix,
} from "../features/mapmaker/brush/textures.ts";

const NAMES = {
  mmTexSand: ["Sand", "رمل"],
  mmTexDunes: ["Dunes", "كثبان"],
  mmTexParchment: ["Parchment", "رق"],
  mmTexGrass: ["Grass", "عشب"],
};
const builtin = builtinCatalog((key) => NAMES[key] ?? [key]);

function tex(id, over = {}) {
  return {
    id,
    name: id,
    creator: "official",
    style: "Idrisi",
    packId: "p1",
    category: null,
    tags: [],
    createdAt: 0,
    color: null,
    locked: false,
    tile: true,
    defaultScale: null,
    index: indexFor({ names: [over.name ?? id], other: over.tags ?? [] }),
    ...over,
  };
}
const ctx = { used: new Set(), now: Date.UTC(2026, 10, 18) };

test("plain words: English endings and Arabic letter forms", () => {
  assert.equal(plainWord("Dunes"), "dune");
  assert.equal(plainWord("cracked"), "crack");
  assert.equal(plainWord("Tiling"), "til");
  assert.equal(plainWord("cliffs"), "cliff");
  assert.equal(plainWord("glass"), "glass");
  assert.equal(plainWord("الأرض"), "ارض");
  assert.equal(plainWord("أرض"), "ارض");
  assert.equal(plainWord("الصحراء"), "صحراء");
  assert.equal(plainWord("مخطوطة"), "مخطوطه");
  assert.equal(plainWord("بالرمال"), "رمال");
  assert.equal(plainWord("رَمْل"), "رمل");
});

test("search: any word order, word starts, both languages", () => {
  const i = indexFor({
    names: ["Old Parchment", "رق قديم"],
    other: ["paper", "ورق"],
  });
  assert.ok(matchScore(i, "parchment old") > 0);
  assert.ok(matchScore(i, "parch") > 0);
  assert.ok(matchScore(i, "PAPERS") > 0);
  assert.ok(matchScore(i, "القديم") > 0);
  assert.ok(matchScore(i, "ورق") > 0);
  assert.equal(matchScore(i, "sand"), 0);
  assert.equal(matchScore(i, "old sand"), 0, "every word must match");
  // A name match outranks a tag match.
  assert.ok(matchScore(i, "parchment") > matchScore(i, "paper"));
  assert.equal(matchScore(i, "  "), 1);
  assert.ok(labelMatches("Desert & Sand", "sand"));
  assert.ok(!labelMatches("Desert", "sand"));
});

test("the built-in textures are filed, tagged and findable in Arabic", () => {
  assert.equal(builtin.textures.length, 29);
  const sand = builtin.textures.find((t) => t.id === "sand");
  assert.equal(sand.category, "desert");
  assert.equal(sand.packId, "builtin:desert");
  assert.ok(builtin.packs.some((p) => p.id === "builtin:paper"));
  const hits = (text) =>
    queryTextures(builtin.textures, { ...EMPTY_QUERY, text }, ctx).map(
      (x) => x.texture.id,
    );
  assert.ok(hits("رمل").includes("sand"));
  assert.ok(hits("صحراء").includes("dunes"));
  assert.ok(hits("beach").includes("sand"));
  assert.deepEqual(hits("zzz"), []);
});

test("filters: OR within a kind, AND across kinds; hierarchy and counts", () => {
  const list = [
    tex("u:a", { tags: ["sand"], packId: "p1", category: "desert" }),
    tex("u:b", {
      tags: ["sand", "rock"],
      packId: "p2",
      creator: "me",
      style: "",
    }),
    tex("u:c", {
      tags: [],
      packId: "p2",
      creator: "me",
      style: "",
      createdAt: ctx.now - 3 * 86_400_000,
    }),
  ];
  const q = (over) =>
    queryTextures(list, { ...EMPTY_QUERY, ...over }, ctx).map(
      (x) => x.texture.id,
    );
  assert.deepEqual(q({ packs: ["p1", "p2"] }), ["u:a", "u:b", "u:c"]);
  assert.deepEqual(q({ packs: ["p2"], tags: ["sand"] }), ["u:b"]);
  assert.deepEqual(q({ tags: [UNTAGGED] }), ["u:c"]);
  assert.deepEqual(
    q({ tags: ["desert"] }),
    ["u:a"],
    "categories count as tags",
  );
  assert.deepEqual(q({ creators: ["me"] }), ["u:b", "u:c"]);
  assert.deepEqual(q({ styles: [styleKey("official", "Idrisi")] }), ["u:a"]);
  assert.deepEqual(q({ newOnly: true }), ["u:c"]);
  assert.deepEqual(
    queryTextures(
      list,
      { ...EMPTY_QUERY, usedOnly: true },
      { ...ctx, used: new Set(["u:b"]) },
    ).map((x) => x.texture.id),
    ["u:b"],
  );
  assert.deepEqual(q({ node: { kind: "packs", packs: ["p1"] } }), ["u:a"]);
  assert.deepEqual(q({ node: { kind: "creator", creator: "me" } }), [
    "u:b",
    "u:c",
  ]);
  assert.deepEqual(
    q({ node: { kind: "style", creator: "official", style: "Idrisi" } }),
    ["u:a"],
  );

  const counts = hierarchyCounts(list);
  assert.equal(counts.get("c:me"), 2);
  assert.equal(counts.get("p:p2"), 2);
  assert.equal(counts.get(`s:${styleKey("official", "Idrisi")}`), 1);
});

test("sorting, grouping and suggestions", () => {
  const list = [
    { texture: tex("u:b", { name: "Basalt", createdAt: 5 }), score: 2 },
    { texture: tex("u:a", { name: "Ash", createdAt: 9 }), score: 1 },
  ];
  const label = (t) => t.name;
  assert.deepEqual(
    sortTextures(list, "title", label).map((x) => x.texture.id),
    ["u:a", "u:b"],
  );
  assert.deepEqual(
    sortTextures(list, "newest", label).map((x) => x.texture.id),
    ["u:a", "u:b"],
  );
  assert.deepEqual(
    sortTextures(list, "relevance", label).map((x) => x.texture.id),
    ["u:b", "u:a"],
  );

  const g = groupTextures(
    [tex("u:a", { tags: ["sand", "rock"] }), tex("u:b", { tags: [] })],
    "tag",
  );
  assert.deepEqual(
    g.map((x) => [x.key, x.items.length]),
    [
      ["sand", 1],
      ["rock", 1],
      [UNTAGGED, 1],
    ],
  );
  assert.equal(groupTextures([tex("u:a")], "none")[0].items.length, 1);

  const s = suggestions(
    "sand",
    [{ id: "p9", label: "Sands of the South" }],
    ["sand", "snow"],
  );
  assert.deepEqual(
    s.map((x) => x.kind + ":" + x.key),
    ["pack:p9", "tag:sand"],
  );
  assert.deepEqual(suggestions("s", [], ["sand"]), []);
});

/** Just enough of DOMMatrix (2-D) for textureMatrix, outside a browser. */
class Matrix2D {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    Object.assign(this, { a, b, c, d, e, f });
  }
  multiply(m) {
    return new Matrix2D(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    );
  }
  translate(x = 0, y = 0) {
    return this.multiply(new Matrix2D(1, 0, 0, 1, x, y));
  }
  scale(sx = 1, sy = sx) {
    return this.multiply(new Matrix2D(sx, 0, 0, sy, 0, 0));
  }
  rotate(deg = 0) {
    const r = (deg * Math.PI) / 180;
    return this.multiply(
      new Matrix2D(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0),
    );
  }
}
globalThis.DOMMatrix ??= Matrix2D;

test("texture references and offsets", () => {
  assert.ok(isTextureId("grass"));
  assert.ok(isTextureId("u:01JC0000000000000000000000"));
  assert.ok(!isTextureId("u:nope"));
  assert.ok(!isTextureId("marble"));
  assert.ok(isUploadedTexture("u:01JC0000000000000000000000"));
  assert.ok(!isUploadedTexture("grass"));
  // Offsets shift the pattern by a fraction of one tile.
  const m = textureMatrix(
    { textureRotation: 0, textureOffsetX: 0.5, textureOffsetY: 0.25 },
    { width: 256, height: 128 },
    512,
  );
  assert.equal(m.e, 256);
  assert.equal(m.f, 64);
  const plain = textureMatrix(
    { textureRotation: 0 },
    { width: 256, height: 256 },
    256,
    10,
    20,
  );
  assert.equal(plain.e, -10);
  assert.equal(plain.f, -20);
});
