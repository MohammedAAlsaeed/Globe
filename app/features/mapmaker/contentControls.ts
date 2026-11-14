/**
 * What staff hid from the editor's catalogs (/admin/content): built-in
 * stamp sets, line art, line / text / shape styles, textures and templates.
 *
 * The art itself stays in the app's code and keeps drawing wherever a map
 * already uses it — hiding only takes an item out of the lists people pick
 * from. The list is public (guests draw too), fetched once per page, and
 * remembered on the device so the catalogs are right from the first paint
 * and when the server can't be reached.
 */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";

export const CONTROL_KINDS = [
  "stamp_set",
  "line_art",
  "line_style",
  "text_style",
  "shape_style",
  "texture",
  "template",
] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];
export type HiddenContent = Record<ControlKind, string[]>;

const STORE_KEY = "idrisi.content.hidden.v1";

const hidden = new Map<ControlKind, Set<string>>();
const listeners = new Set<() => void>();
let version = 0;

function apply(data: unknown): boolean {
  const next = new Map<ControlKind, Set<string>>();
  const o =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  let changed = false;
  for (const kind of CONTROL_KINDS) {
    const list = Array.isArray(o[kind])
      ? (o[kind] as unknown[]).filter((k): k is string => typeof k === "string")
      : [];
    const set = new Set(list),
      old = hidden.get(kind);
    if (!old || old.size !== set.size || list.some((k) => !old.has(k)))
      changed = true;
    next.set(kind, set);
  }
  if (!changed) return false;
  for (const [k, v] of next) hidden.set(k, v);
  return true;
}

// The device's copy, read before anything draws a catalog.
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) apply(JSON.parse(raw));
  } catch {
    // no storage, or an unreadable copy: start with nothing hidden
  }
}

/** Whether staff hid this built-in item from the catalogs. */
export function isHidden(kind: ControlKind, key: string) {
  return hidden.get(kind)?.has(key) ?? false;
}

/** The hidden keys by kind, as plain lists. */
export function hiddenContent(): HiddenContent {
  return Object.fromEntries(
    CONTROL_KINDS.map((k) => [k, [...(hidden.get(k) ?? [])]]),
  ) as HiddenContent;
}

/** Takes a fresh list (from the server, or the admin panel after a change). */
export function setHiddenContent(data: unknown) {
  if (!apply(data)) return;
  version++;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(hiddenContent()));
    } catch {
      // storage full or blocked: the list still holds for this page
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeContentControls(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const contentControlsVersion = () => version;

let loading: Promise<void> | null = null;
/** Asks the server once per page; a failure keeps the device's copy. */
export function loadContentControls(): Promise<void> {
  loading ??= api
    .get<{ data: { hidden: HiddenContent } }>("content/controls")
    .then((r) => setHiddenContent(r.data.hidden))
    .catch(() => {
      // offline or the API is down: try again on the next page
      loading = null;
    });
  return loading;
}

/** Re-renders when the hidden list changes, and makes sure it was asked for. */
export function useContentControls() {
  useEffect(() => {
    void loadContentControls();
  }, []);
  return useSyncExternalStore(
    subscribeContentControls,
    contentControlsVersion,
    () => 0,
  );
}
