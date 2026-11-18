// The Stamp Catalog: built-in and server stamps as catalog entries — packs,
// Stamp Sets and their variants, searching and filtering — plus the looks
// kept for "Recently used" and favourites.
import test from "node:test";
import assert from "node:assert/strict";
import {
  allSets,
  registerRemoteSets,
  stampSet,
} from "../features/mapmaker/stamps/catalog.ts";
import {
  catalogStamps,
  stampPacks,
} from "../features/mapmaker/stamps/stampCatalog.ts";
import { librarySets } from "../features/mapmaker/stamps/librarySets.ts";
import {
  EMPTY_QUERY,
  groupItems,
  hierarchyCounts,
  queryItems,
} from "../features/mapmaker/brush/textureCatalog.ts";

const names = (key) => [key];
const ctx = { used: new Set(), now: Date.parse("2026-11-19") };
const find = (list, text, q = {}) =>
  queryItems(list, { ...EMPTY_QUERY, ...q, text }, ctx).map((x) => x.item.id);

const LIBRARY = {
  packs: [
    {
      id: "P1",
      name: "Castles of the Maghreb",
      style: "Idrisi",
      official: true,
      mine: false,
      tier: 0,
      published: true,
      locked: false,
      created_at: "2026-11-10T00:00:00Z",
    },
    {
      id: "P2",
      name: "Sea monsters",
      style: "Idrisi",
      official: true,
      mine: false,
      tier: 2,
      published: true,
      locked: true,
      created_at: "2026-11-11T00:00:00Z",
    },
    {
      id: "P3",
      name: "My stamps",
      style: null,
      official: false,
      mine: true,
      tier: 0,
      published: false,
      locked: false,
      created_at: "2026-11-12T00:00:00Z",
    },
  ],
  stamps: [
    ...["Kasbah", "Ribat", "Qasr"].map((name, i) => ({
      id: `A${i}`,
      pack_id: "P1",
      name,
      set_key: "forts",
      category: "settlements",
      tags: i === 0 ? ["قلعة", "fort"] : ["fort"],
      width: 100,
      height: 80,
      color: "#a08060",
      meta: { pivot: "base", size: 0.06 },
      thumb_url: `https://x/${i}.thumb.webp`,
      url: `https://x/${i}.webp`,
      created_at: "2026-11-10T00:00:00Z",
    })),
    {
      id: "B0",
      pack_id: "P2",
      name: "Kraken",
      set_key: null,
      category: "creatures",
      tags: ["monster"],
      width: 200,
      height: 200,
      color: null,
      meta: {},
      thumb_url: "https://x/kraken.thumb.webp",
      url: null,
      created_at: "2026-11-11T00:00:00Z",
    },
    {
      id: "C0",
      pack_id: "P3",
      name: "My tower",
      set_key: null,
      category: null,
      tags: [],
      width: 50,
      height: 100,
      color: null,
      meta: {},
      thumb_url: "https://x/tower.thumb.webp",
      url: "https://x/tower.webp",
      created_at: "2026-11-18T00:00:00Z",
    },
  ],
};

test("server stamps become sets: variants, defaults, locks", () => {
  const sets = librarySets(LIBRARY);
  assert.equal(sets.length, 3);
  const forts = sets.find((x) => x.set.id === "s:P1:forts").set;
  assert.equal(forts.assets.length, 3);
  assert.deepEqual(forts.variantNames, ["Kasbah", "Ribat", "Qasr"]);
  assert.equal(forts.category, "settlements");
  assert.equal(forts.pivot, "base");
  assert.equal(forts.size, 0.06);
  assert.equal(forts.creator, "official");
  assert.equal(forts.style, "Idrisi");
  assert.deepEqual(forts.tags.sort(), ["fort", "قلعة"].sort());
  const kraken = sets.find((x) => x.set.id === "s:P2:one-B0");
  assert.equal(kraken.set.locked, true);
  // A locked stamp carries only its preview.
  assert.equal(kraken.assets[0].url, "https://x/kraken.thumb.webp");
  const mine = sets.find((x) => x.set.id === "s:P3:one-C0").set;
  assert.equal(mine.creator, "me");
  assert.equal(mine.category, "custom");
  assert.equal(mine.pivot, "center");
});

test("built-in and server stamps are browsed together", () => {
  registerRemoteSets(librarySets(LIBRARY), true);
  const sets = allSets(),
    entries = catalogStamps(sets, names),
    packs = stampPacks(sets, LIBRARY.packs);
  // Every set once; built-in ones belong to the atelier.
  assert.equal(new Set(entries.map((x) => x.id)).size, entries.length);
  assert.equal(entries.find((x) => x.id === "mountain").creator, "atelier");
  assert.equal(
    entries.find((x) => x.id === "mountain").packId,
    "builtin:terrain",
  );
  assert.ok(packs.some((p) => p.id === "builtin:classic"));
  assert.equal(packs.find((p) => p.id === "P3").creator, "me");

  // Names, variant names, tags (any language), packs, categories.
  assert.ok(find(entries, "ribat").includes("s:P1:forts"));
  assert.ok(find(entries, "قلعة").includes("s:P1:forts"));
  assert.ok(find(entries, "maghreb castl").includes("s:P1:forts"));
  assert.ok(find(entries, "peak").includes("mountain"));
  assert.deepEqual(find(entries, "kraken"), ["s:P2:one-B0"]);

  // Filters: creator, pack, category as a tag, new, used.
  assert.deepEqual(find(entries, "", { creators: ["me"] }), ["s:P3:one-C0"]);
  assert.ok(
    find(entries, "", { tags: ["creatures"] }).every(
      (id) =>
        ["s:P2:one-B0"].includes(id) || stampSet(id).category === "creatures",
    ),
  );
  assert.deepEqual(
    find(entries, "", { newOnly: true, creators: ["official", "me"] }).sort(),
    ["s:P1:forts", "s:P2:one-B0", "s:P3:one-C0"],
  );
  const used = queryItems(
    entries,
    { ...EMPTY_QUERY, usedOnly: true },
    { ...ctx, used: new Set(["pine"]) },
  ).map((x) => x.item.id);
  assert.deepEqual(used, ["pine"]);

  // Counts per creator and pack; grouping by pack.
  const counts = hierarchyCounts(entries);
  assert.equal(counts.get("c:official"), 2);
  assert.equal(counts.get("p:P1"), 1);
  const groups = groupItems(entries, "pack");
  assert.ok(groups.some((g) => g.key === "builtin:classic"));

  registerRemoteSets([], true);
  assert.equal(stampSet("s:P1:forts"), undefined);
});

test("looks are kept and compared to a hair", async () => {
  const { savedLook, sameLook, stampUsage } =
    await import("../features/mapmaker/stamps/stampLooks.ts");
  const { factoryLook, lookOf } =
    await import("../features/mapmaker/stamps/state.ts");
  const look = savedLook(factoryLook(stampSet("mountain")));
  assert.ok(sameLook(look, { ...look, size: look.size + 1e-5 }));
  assert.ok(!sameLook(look, { ...look, rotation: 15 }));
  assert.equal(look.shadow, "default");

  // Recently used: newest first, one per set (its last look).
  const stamp = (id, asset, extra = {}) => ({
    id,
    kind: "stamp",
    asset,
    x: 0.5,
    y: 0.5,
    ...factoryLook(stampSet(asset.split(":")[1])),
    ...extra,
  });
  const layers = [
    {
      id: "L",
      objects: [
        stamp("1", "b:mountain:0"),
        stamp("2", "b:pine:2"),
        stamp("3", "b:mountain:3"),
        stamp("4", "b:mountain:1", { size: 0.2 }),
      ],
    },
  ];
  const usage = stampUsage(layers);
  assert.deepEqual(
    usage.recent.map((r) => [r.set, r.variant]),
    [
      ["mountain", 1],
      ["pine", 2],
    ],
  );
  assert.ok(usage.used.has("pine"));
  assert.equal(typeof lookOf, "function");
});
