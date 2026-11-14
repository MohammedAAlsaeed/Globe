// What staff hide in /admin/content leaves the editor's catalogs, while the
// art itself keeps drawing in maps that already use it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_KINDS,
  contentControlsVersion,
  hiddenContent,
  isHidden,
  setHiddenContent,
  subscribeContentControls,
} from "../features/mapmaker/contentControls.ts";
import {
  allSets,
  builtinKey,
  catalogVersion,
  stampAsset,
  stampSet,
} from "../features/mapmaker/stamps/catalog.ts";
import {
  allLineSets,
  builtinLineSets,
  lineSet,
  shownLineSets,
} from "../features/mapmaker/lines/catalog.ts";

const none = () => Object.fromEntries(CONTROL_KINDS.map((k) => [k, []]));

test("a hidden built-in stamp set leaves the catalog but still draws", () => {
  setHiddenContent(none());
  const before = allSets(),
    victim = before.find((s) => s.pack === "atelier");
  assert.ok(victim);
  const version = catalogVersion();
  let told = 0;
  const off = subscribeContentControls(() => told++);

  setHiddenContent({ ...none(), stamp_set: [victim.id] });
  assert.equal(told, 1);
  assert.ok(isHidden("stamp_set", victim.id));
  assert.ok(catalogVersion() > version, "the catalog announces the change");
  assert.equal(allSets().length, before.length - 1);
  assert.ok(!allSets().some((s) => s.id === victim.id));
  // Maps that placed it are not broken: the set and its art are still there.
  assert.equal(stampSet(victim.id)?.id, victim.id);
  assert.equal(stampAsset(builtinKey(victim.id, 0))?.kind, "vector");
  // …and it is not offered as line art either.
  assert.ok(!allLineSets().some((s) => s.id === `ls:${victim.id}`));

  // The same list again changes nothing (no needless redraws).
  const v = contentControlsVersion();
  setHiddenContent({ ...none(), stamp_set: [victim.id] });
  assert.equal(contentControlsVersion(), v);
  assert.equal(told, 1);

  setHiddenContent(none());
  assert.equal(allSets().length, before.length);
  off();
});

test("hidden line art is not listed, yet a line that uses it finds it", () => {
  setHiddenContent(none());
  const first = builtinLineSets()[0];
  setHiddenContent({ ...none(), line_art: [first.id] });
  assert.ok(!shownLineSets().some((s) => s.id === first.id));
  assert.ok(!allLineSets().some((s) => s.id === first.id));
  assert.equal(lineSet(first.id)?.id, first.id);
  setHiddenContent(none());
  assert.ok(allLineSets().some((s) => s.id === first.id));
});

test("the list survives odd input", () => {
  setHiddenContent({ texture: ["lava", 7, null], nonsense: ["x"] });
  assert.deepEqual(hiddenContent().texture, ["lava"]);
  assert.ok(isHidden("texture", "lava"));
  assert.ok(!isHidden("texture", "grass"));
  assert.deepEqual(hiddenContent().stamp_set, []);
  setHiddenContent(null);
  assert.ok(!isHidden("texture", "lava"));
});
