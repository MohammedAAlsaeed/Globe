/**
 * Every keyboard shortcut of the map editor, in one place.
 *
 * The editor never compares keys itself: it asks `pressed(e, id)` whether an
 * event triggers an action, and every label shown to people (tooltips, the
 * shortcut menu, panel hints) comes from `shortcutLabel(id)`. So changing a
 * default here changes the editor and all its texts together, and the same
 * table can drive what's planned next:
 *
 *   custom shortcuts  `setShortcutOverrides({ "tool.line": ["KeyI"] })` —
 *                     stored on this device today (see `OVERRIDES_KEY`), and
 *                     the shape is plain JSON, ready to sync to the account;
 *                     `shortcutConflicts()` says what a change would clash
 *                     with, `customizable` which actions may be remapped;
 *   tutorials         `SHORTCUTS` (with `group`, `labelKey` and `contexts`)
 *                     lists every action and when it applies, and
 *                     `shortcutLabel()` names the person's current key.
 *
 * Bindings are physical keys (`KeyboardEvent.code`: "KeyN", "Digit5",
 * "BracketRight"…) with optional modifiers: "Mod+Shift+KeyZ". Mod is Ctrl,
 * or ⌘ on a Mac. Physical keys mean the shortcuts work the same with an
 * Arabic (or any other) keyboard layout active, without switching to English.
 */
import { useSyncExternalStore } from "react";

export type ShortcutContext =
  /** Anywhere in the editor. */
  | "global"
  /** The Brush tool. */
  | "brush"
  /** The Land tool. */
  | "land"
  /** The Line tool, or lines selected. */
  | "line"
  /** The Stamp tool, or stamps selected. */
  | "stamp"
  /** The Text tool, or texts selected (never while typing: typed keys are text). */
  | "text";

export type ShortcutGroup = "tools" | "edit" | "view" | "line" | "paint" | "stamp" | "text";

export interface ShortcutDef {
  id: string;
  group: ShortcutGroup;
  /** What the action does (an i18n key), for menus, settings and tutorials. */
  labelKey: string;
  /** Where it applies; shortcuts only clash when their contexts meet. */
  contexts: ShortcutContext[];
  /** Default bindings; the first is the one shown in short hints. */
  keys: string[];
  /** Modifiers that refine the action (Alt: fine steps…) and so don't stop a match. */
  allow?: ("Alt" | "Shift")[];
  /** Fixed keys (Escape, Delete, Enter…) aren't offered for remapping. */
  customizable: boolean;
}

const tool = (name: string, labelKey: string, keys: string[]): ShortcutDef => ({
  id: `tool.${name}`,
  group: "tools",
  labelKey,
  contexts: ["global"],
  keys,
  customizable: true,
});

/** The editor's shortcuts, in the order a cheat sheet would list them. */
export const SHORTCUTS = [
  // ---- tools: a letter, and the tool's number on the rail ----
  tool("select", "mmToolSelect", ["KeyV", "Digit1", "Numpad1"]),
  tool("brush", "mmToolBrush", ["KeyB", "Digit2", "Numpad2"]),
  tool("land", "mmToolLand", ["KeyL", "Digit3", "Numpad3"]),
  tool("stamp", "mmToolStamp", ["Digit4", "Numpad4"]),
  tool("line", "mmToolLine", ["KeyN", "Digit5", "Numpad5"]),
  tool("region", "mmToolRegion", ["Digit6", "Numpad6"]),
  tool("text", "mmToolText", ["KeyT", "Digit7", "Numpad7"]),

  // ---- editing ----
  { id: "edit.undo", group: "edit", labelKey: "undo", contexts: ["global"], keys: ["Mod+KeyZ"], customizable: true },
  { id: "edit.redo", group: "edit", labelKey: "redo", contexts: ["global"], keys: ["Mod+Shift+KeyZ", "Mod+KeyY"], customizable: true },
  { id: "file.save", group: "edit", labelKey: "kbSave", contexts: ["global"], keys: ["Mod+KeyS"], customizable: true },
  { id: "edit.copy", group: "edit", labelKey: "mmCopyObject", contexts: ["global"], keys: ["Mod+KeyC"], customizable: true },
  { id: "edit.paste", group: "edit", labelKey: "mmPasteObject", contexts: ["global"], keys: ["Mod+KeyV"], customizable: true },
  { id: "edit.duplicate", group: "edit", labelKey: "mmDuplicateObject", contexts: ["global"], keys: ["Mod+KeyD"], customizable: true },
  { id: "edit.group", group: "edit", labelKey: "mmGroup", contexts: ["global"], keys: ["Mod+KeyG"], customizable: true },
  { id: "edit.ungroup", group: "edit", labelKey: "mmUngroup", contexts: ["global"], keys: ["Mod+Shift+KeyG"], customizable: true },
  { id: "arrange.front", group: "edit", labelKey: "mmBringToFront", contexts: ["global"], keys: ["Mod+BracketRight"], customizable: true },
  { id: "arrange.back", group: "edit", labelKey: "mmSendToBack", contexts: ["global"], keys: ["Mod+BracketLeft"], customizable: true },
  { id: "edit.delete", group: "edit", labelKey: "mmDeleteObject", contexts: ["global"], keys: ["Delete", "Backspace"], customizable: false },
  { id: "edit.cancel", group: "edit", labelKey: "mmCancelDraft", contexts: ["global"], keys: ["Escape"], customizable: false },
  { id: "edit.selectAll", group: "edit", labelKey: "kbSelectAll", contexts: ["global"], keys: ["Mod+KeyA"], customizable: true },
  // Moving the selection: one map pixel, ten with Shift.
  { id: "edit.nudgeLeft", group: "edit", labelKey: "kbNudgeLeft", contexts: ["global"], keys: ["ArrowLeft"], allow: ["Shift"], customizable: false },
  { id: "edit.nudgeRight", group: "edit", labelKey: "kbNudgeRight", contexts: ["global"], keys: ["ArrowRight"], allow: ["Shift"], customizable: false },
  { id: "edit.nudgeUp", group: "edit", labelKey: "kbNudgeUp", contexts: ["global"], keys: ["ArrowUp"], allow: ["Shift"], customizable: false },
  { id: "edit.nudgeDown", group: "edit", labelKey: "kbNudgeDown", contexts: ["global"], keys: ["ArrowDown"], allow: ["Shift"], customizable: false },

  // ---- view ----
  { id: "view.pan", group: "view", labelKey: "mmPan", contexts: ["global"], keys: ["Space"], customizable: false },

  // ---- Line tool ----
  // With one line selected: edit its nodes; in the Line tool: the Edit Nodes mode.
  { id: "line.editNodes", group: "line", labelKey: "lnEditNodes", contexts: ["global"], keys: ["KeyA"], customizable: true },
  { id: "line.free", group: "line", labelKey: "lnDrawFree", contexts: ["line"], keys: ["KeyF"], customizable: true },
  { id: "line.pen", group: "line", labelKey: "lnDrawPen", contexts: ["line"], keys: ["KeyP"], customizable: true },
  { id: "line.finish", group: "line", labelKey: "kbLineFinish", contexts: ["line"], keys: ["Enter"], customizable: false },
  { id: "line.removeLast", group: "line", labelKey: "kbLineRemoveLast", contexts: ["line"], keys: ["Backspace", "Delete"], customizable: false },
  { id: "line.wider", group: "line", labelKey: "kbLineWider", contexts: ["line"], keys: ["Equal", "NumpadAdd", "BracketRight"], allow: ["Alt", "Shift"], customizable: true },
  { id: "line.thinner", group: "line", labelKey: "kbLineThinner", contexts: ["line"], keys: ["Minus", "NumpadSubtract", "BracketLeft"], allow: ["Alt", "Shift"], customizable: true },

  // ---- Brush and Land ----
  { id: "paint.erase", group: "paint", labelKey: "kbPaintErase", contexts: ["brush", "land"], keys: ["KeyE"], customizable: true },
  { id: "paint.bigger", group: "paint", labelKey: "kbPaintBigger", contexts: ["brush", "land"], keys: ["BracketRight"], customizable: true },
  { id: "paint.smaller", group: "paint", labelKey: "kbPaintSmaller", contexts: ["brush", "land"], keys: ["BracketLeft"], customizable: true },
  { id: "paint.finishShape", group: "paint", labelKey: "kbPaintFinishShape", contexts: ["brush", "land"], keys: ["Enter"], customizable: false },

  // ---- Text Tool (T selects it; typing is never taken for shortcuts) ----
  { id: "text.edit", group: "text", labelKey: "kbTextEdit", contexts: ["text"], keys: ["Enter", "F2"], customizable: false },
  { id: "text.finish", group: "text", labelKey: "kbTextFinish", contexts: ["text"], keys: ["Mod+Enter"], customizable: false },

  // ---- Stamps (Alt: fine steps) ----
  { id: "stamp.bigger", group: "stamp", labelKey: "kbStampBigger", contexts: ["stamp"], keys: ["KeyW", "BracketRight"], allow: ["Alt"], customizable: true },
  { id: "stamp.smaller", group: "stamp", labelKey: "kbStampSmaller", contexts: ["stamp"], keys: ["KeyS", "BracketLeft"], allow: ["Alt"], customizable: true },
  { id: "stamp.turnLeft", group: "stamp", labelKey: "kbStampTurnLeft", contexts: ["stamp"], keys: ["Comma"], allow: ["Alt"], customizable: true },
  { id: "stamp.turnRight", group: "stamp", labelKey: "kbStampTurnRight", contexts: ["stamp"], keys: ["Period"], allow: ["Alt"], customizable: true },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];
export type Bindings = Record<ShortcutId, readonly string[]>;
/** Only the person's changes; everything else keeps its default. */
export type ShortcutOverrides = Partial<Record<ShortcutId, string[]>>;

const BY_ID = new Map<string, ShortcutDef>(SHORTCUTS.map((s) => [s.id, s]));
export function shortcutDef(id: ShortcutId): ShortcutDef {
  return BY_ID.get(id)!;
}

// ---- bindings ---------------------------------------------------------------------------
const MODS = ["Mod", "Shift", "Alt"] as const;
type Mod = (typeof MODS)[number];
/** A binding's parts; null when it isn't a valid binding. */
export function parseBinding(binding: string): { mods: Set<Mod>; code: string } | null {
  const parts = binding.split("+"),
    code = parts.pop() ?? "";
  if (!/^(Key[A-Z]|Digit\d|Numpad(\d|Add|Subtract)|F\d{1,2}|BracketLeft|BracketRight|Equal|Minus|Comma|Period|Slash|Semicolon|Quote|Backquote|Backslash|Delete|Backspace|Enter|Escape|Space|Tab|ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(code)) return null;
  const mods = new Set<Mod>();
  for (const p of parts) {
    if (!MODS.includes(p as Mod) || mods.has(p as Mod)) return null;
    mods.add(p as Mod);
  }
  return { mods, code };
}
/** The same binding written in one canonical order (Mod, Shift, Alt). */
export function normalizeBinding(binding: string): string | null {
  const b = parseBinding(binding);
  return b ? [...MODS.filter((m) => b.mods.has(m)), b.code].join("+") : null;
}

/** Defaults plus the person's changes (invalid or fixed ones are ignored). */
export function resolveBindings(overrides: ShortcutOverrides = {}): Bindings {
  const out = {} as Record<ShortcutId, readonly string[]>;
  for (const s of SHORTCUTS) {
    const own = overrides[s.id];
    const valid = s.customizable && Array.isArray(own) ? own.map((k) => (typeof k === "string" ? normalizeBinding(k) : null)) : null;
    // An empty list is allowed: it turns the shortcut off.
    out[s.id] = valid && valid.every((k) => k !== null) ? (valid as string[]) : s.keys;
  }
  return out;
}

/** Whether the event is one of the action's keys. */
export function pressed(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, id: ShortcutId, bindings: Bindings = currentBindings()): boolean {
  const allow = shortcutDef(id).allow ?? [];
  return bindings[id].some((binding) => {
    const b = parseBinding(binding);
    if (!b || b.code !== e.code) return false;
    const mod = e.ctrlKey || e.metaKey;
    return (
      mod === b.mods.has("Mod") &&
      (e.shiftKey === b.mods.has("Shift") || (allow as string[]).includes("Shift")) &&
      (e.altKey === b.mods.has("Alt") || (allow as string[]).includes("Alt"))
    );
  });
}

/** Contexts meet when they share one, or either applies everywhere. */
function contextsMeet(a: readonly ShortcutContext[], b: readonly ShortcutContext[]) {
  return a.includes("global") || b.includes("global") || a.some((c) => b.includes(c));
}
/** Every key combination a binding answers to (its allowed modifiers added). */
function variants(binding: string, allow: readonly string[] = []): string[] {
  const out = [binding];
  for (const m of allow) for (const v of [...out]) out.push(normalizeBinding(`${m}+${v}`) ?? v);
  return [...new Set(out)];
}

/**
 * Pairs of actions that would answer to the same key in the same place.
 * Fixed keys are left out when both sides are fixed (the editor resolves
 * those itself — Delete removes a Pen node before it removes objects).
 */
export function shortcutConflicts(bindings: Bindings = resolveBindings()): { a: ShortcutId; b: ShortcutId; key: string }[] {
  const out: { a: ShortcutId; b: ShortcutId; key: string }[] = [];
  for (let i = 0; i < SHORTCUTS.length; i++)
    for (let j = i + 1; j < SHORTCUTS.length; j++) {
      const a: ShortcutDef = SHORTCUTS[i],
        b: ShortcutDef = SHORTCUTS[j];
      if ((!a.customizable && !b.customizable) || !contextsMeet(a.contexts, b.contexts)) continue;
      const keysA = new Set(bindings[a.id as ShortcutId].flatMap((k) => variants(k, a.allow)));
      const hit = bindings[b.id as ShortcutId].flatMap((k) => variants(k, b.allow)).find((k) => keysA.has(k));
      if (hit) out.push({ a: a.id as ShortcutId, b: b.id as ShortcutId, key: hit });
    }
  return out;
}

// ---- labels -------------------------------------------------------------------------------
function isMac() {
  if (typeof navigator === "undefined") return false;
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad/i.test(p);
}
const CODE_LABEL: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "+",
  Minus: "−",
  NumpadAdd: "+",
  NumpadSubtract: "−",
  Comma: "<",
  Period: ">",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
  Delete: "Del",
  Backspace: "⌫",
  Enter: "Enter",
  Escape: "Esc",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "Space",
  Tab: "Tab",
};
/** "Mod+Shift+KeyZ" → "Ctrl+Shift+Z" (or "⇧⌘Z" on a Mac). */
export function formatBinding(binding: string, mac = isMac()): string {
  const b = parseBinding(binding);
  if (!b) return binding;
  const key = CODE_LABEL[b.code] ?? b.code.replace(/^(Key|Digit|Numpad)/, "");
  if (mac) return `${b.mods.has("Alt") ? "⌥" : ""}${b.mods.has("Shift") ? "⇧" : ""}${b.mods.has("Mod") ? "⌘" : ""}${key}`;
  return [...(b.mods.has("Mod") ? ["Ctrl"] : []), ...(b.mods.has("Shift") ? ["Shift"] : []), ...(b.mods.has("Alt") ? ["Alt"] : []), key].join("+");
}
/** The action's main key, for short hints ("" when it has none). */
export function shortcutLabel(id: ShortcutId, bindings: Bindings = currentBindings()): string {
  const first = bindings[id][0];
  return first ? formatBinding(first) : "";
}
/** All of the action's keys ("N / 5"); number-pad twins of top-row keys are left out. */
export function shortcutLabels(id: ShortcutId, bindings: Bindings = currentBindings(), joiner = " / "): string {
  const keys = bindings[id];
  const shown = keys.filter((k) => {
    const pad = /^Numpad(\d|Add|Subtract)$/.exec(k);
    return !pad || !keys.some((o) => o === `Digit${pad[1]}` || (pad[1] === "Add" && o === "Equal") || (pad[1] === "Subtract" && o === "Minus"));
  });
  return [...new Set(shown.map((k) => formatBinding(k)))].join(joiner);
}

// ---- the person's shortcuts (this device for now) --------------------------------------
/** localStorage key holding the person's changes (JSON `ShortcutOverrides`). */
export const OVERRIDES_KEY = "mm-shortcuts-v1";

function readOverrides(): ShortcutOverrides {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(OVERRIDES_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ShortcutOverrides) : {};
  } catch {
    return {};
  }
}

let overrides: ShortcutOverrides | null = null,
  bindings: Bindings | null = null;
const listeners = new Set<() => void>();

export function shortcutOverrides(): ShortcutOverrides {
  overrides ??= readOverrides();
  return overrides;
}
export function currentBindings(): Bindings {
  bindings ??= resolveBindings(shortcutOverrides());
  return bindings;
}
/** Replaces the person's changes (an empty object restores every default). */
export function setShortcutOverrides(next: ShortcutOverrides) {
  overrides = next;
  bindings = resolveBindings(next);
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full: the change still applies until reload.
  }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const DEFAULTS = resolveBindings();
/** The current bindings; components re-render when they change. */
export function useShortcuts(): Bindings {
  return useSyncExternalStore(subscribe, currentBindings, () => DEFAULTS);
}
