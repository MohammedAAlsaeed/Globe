// The editor's shortcut table: defaults, matching, labels, custom shortcuts
// and clashes.
import test from "node:test";
import assert from "node:assert/strict";
import {
  SHORTCUTS,
  formatBinding,
  normalizeBinding,
  pressed,
  resolveBindings,
  shortcutConflicts,
  shortcutLabel,
  shortcutLabels,
} from "../features/mapmaker/shortcuts.ts";
import { mapmakerEn } from "../lib/locales/mapmaker.en.ts";
import { mapmakerAr } from "../lib/locales/mapmaker.ar.ts";
import { linesEn, linesAr } from "../lib/locales/lines.ts";
import { shortcutsEn, shortcutsAr } from "../lib/locales/shortcuts.ts";
import { textEn } from "../lib/locales/text.ts";
import { en } from "../lib/locales/en.ts";

const key = (code, mods = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const defaults = resolveBindings();

test("the Text Tool's keys: T text, V select, Ctrl+A, arrows (Shift: 10 px)", () => {
  assert.ok(pressed(key("KeyT"), "tool.text", defaults));
  assert.ok(pressed(key("KeyV"), "tool.select", defaults));
  assert.ok(!pressed(key("KeyV", { ctrlKey: true }), "tool.select", defaults));
  assert.ok(
    pressed(key("KeyA", { ctrlKey: true }), "edit.selectAll", defaults),
  );
  assert.ok(
    !pressed(key("KeyA", { ctrlKey: true }), "line.editNodes", defaults),
  );
  assert.ok(pressed(key("ArrowLeft"), "edit.nudgeLeft", defaults));
  assert.ok(
    pressed(key("ArrowLeft", { shiftKey: true }), "edit.nudgeLeft", defaults),
  );
  assert.ok(pressed(key("Enter", { ctrlKey: true }), "text.finish", defaults));
  assert.ok(!pressed(key("Enter", { ctrlKey: true }), "text.edit", defaults));
});

test("the default keys: N line, L land, A edit nodes", () => {
  assert.ok(pressed(key("KeyN"), "tool.line", defaults));
  assert.ok(pressed(key("Digit5"), "tool.line", defaults));
  assert.ok(pressed(key("KeyL"), "tool.land", defaults));
  assert.ok(pressed(key("KeyB"), "tool.brush", defaults));
  assert.ok(pressed(key("KeyA"), "line.editNodes", defaults));
  assert.ok(!pressed(key("KeyN"), "line.editNodes", defaults));
  assert.ok(!pressed(key("KeyG"), "tool.land", defaults));
});

test("modifiers must match, except the ones an action refines with", () => {
  assert.ok(pressed(key("KeyZ", { ctrlKey: true }), "edit.undo", defaults));
  assert.ok(pressed(key("KeyZ", { metaKey: true }), "edit.undo", defaults));
  assert.ok(
    !pressed(
      key("KeyZ", { ctrlKey: true, shiftKey: true }),
      "edit.undo",
      defaults,
    ),
  );
  assert.ok(
    pressed(
      key("KeyZ", { ctrlKey: true, shiftKey: true }),
      "edit.redo",
      defaults,
    ),
  );
  assert.ok(pressed(key("KeyY", { ctrlKey: true }), "edit.redo", defaults));
  // Ctrl+N is the browser's, never the Line tool; Ctrl+G groups.
  assert.ok(!pressed(key("KeyN", { ctrlKey: true }), "tool.line", defaults));
  assert.ok(!pressed(key("KeyL", { altKey: true }), "tool.land", defaults));
  // Alt = fine steps, Shift = big steps: still the same action.
  assert.ok(pressed(key("Equal", { altKey: true }), "line.wider", defaults));
  assert.ok(pressed(key("Equal", { shiftKey: true }), "line.wider", defaults));
  assert.ok(pressed(key("KeyW", { altKey: true }), "stamp.bigger", defaults));
  assert.ok(!pressed(key("Equal", { ctrlKey: true }), "line.wider", defaults));
});

test("the defaults have no clashes", () => {
  assert.deepEqual(shortcutConflicts(defaults), []);
  // Every action has a unique id and at least one valid key.
  assert.equal(new Set(SHORTCUTS.map((s) => s.id)).size, SHORTCUTS.length);
  for (const s of SHORTCUTS)
    for (const k of s.keys) assert.ok(normalizeBinding(k), `${s.id}: ${k}`);
});

test("custom shortcuts replace defaults; invalid and fixed ones are ignored", () => {
  const b = resolveBindings({
    "tool.line": ["KeyI"],
    "tool.brush": ["Nope"],
    "edit.cancel": ["KeyQ"],
    "tool.region": [],
  });
  assert.ok(pressed(key("KeyI"), "tool.line", b));
  assert.ok(!pressed(key("KeyN"), "tool.line", b));
  assert.ok(pressed(key("KeyB"), "tool.brush", b));
  assert.ok(pressed(key("Escape"), "edit.cancel", b));
  assert.ok(!pressed(key("KeyQ"), "edit.cancel", b));
  assert.equal(shortcutLabel("tool.region", b), "");
  assert.deepEqual(
    resolveBindings({ "edit.undo": ["Shift+Mod+KeyZ"] })["edit.undo"],
    ["Mod+Shift+KeyZ"],
  );
});

test("clashes are found where the actions meet", () => {
  // N for both the Line tool and the Brush: clash (both work everywhere).
  const both = resolveBindings({ "tool.brush": ["KeyN"] });
  assert.deepEqual(
    shortcutConflicts(both).map((c) => [c.a, c.b, c.key]),
    [["tool.brush", "tool.line", "KeyN"]],
  );
  // F for the Brush clashes with Free Draw only inside the Line tool… still a clash.
  assert.equal(
    shortcutConflicts(resolveBindings({ "tool.brush": ["KeyF"] })).length,
    1,
  );
  // W in the Line tool and W for stamps never meet.
  assert.deepEqual(
    shortcutConflicts(resolveBindings({ "line.free": ["KeyW"] })),
    [],
  );
  // Ctrl+W isn't W.
  assert.deepEqual(
    shortcutConflicts(resolveBindings({ "edit.copy": ["Mod+KeyW"] })),
    [],
  );
  // Alt+W is still "bigger stamps" (Alt refines it), so it clashes.
  assert.equal(
    shortcutConflicts(resolveBindings({ "stamp.turnLeft": ["Alt+KeyW"] }))
      .length,
    1,
  );
});

test("labels follow the platform and leave out number-pad twins", () => {
  assert.equal(formatBinding("Mod+Shift+KeyZ", false), "Ctrl+Shift+Z");
  assert.equal(formatBinding("Mod+Shift+KeyZ", true), "⇧⌘Z");
  assert.equal(formatBinding("BracketRight", false), "]");
  assert.equal(shortcutLabels("tool.line", defaults), "N / 5");
  assert.equal(shortcutLabels("tool.select", defaults), "V / 1");
  assert.equal(shortcutLabels("tool.text", defaults), "T / 7");
  assert.equal(formatBinding("ArrowLeft", false), "←");
  assert.equal(shortcutLabels("line.wider", defaults), "+ / ]");
  assert.equal(shortcutLabel("line.editNodes", defaults), "A");
});

test("every action has a name, and texts name keys only through placeholders", () => {
  const all = { ...en, ...mapmakerEn, ...linesEn, ...shortcutsEn, ...textEn };
  for (const s of SHORTCUTS)
    assert.ok(
      all[s.labelKey] || s.labelKey === "undo" || s.labelKey === "redo",
      `${s.id}: ${s.labelKey}`,
    );
  for (const g of new Set(SHORTCUTS.map((s) => s.group)))
    assert.ok(shortcutsEn[`kbGroup_${g}`] && shortcutsAr[`kbGroup_${g}`]);
  for (const dict of [mapmakerEn, mapmakerAr, linesEn, linesAr]) {
    assert.match(dict.mmBrushShortcuts ?? dict.lnKeysDraw, /\{\{/);
    assert.doesNotMatch(dict.lnEditNodesHint ?? "", /\(N\)/);
  }
});
