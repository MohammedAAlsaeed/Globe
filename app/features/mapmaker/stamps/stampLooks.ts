/**
 * Stamps to reuse without browsing: "Recently used" (this map's own stamps,
 * newest first, each with the way it was placed) and "Favourites" (stamps
 * the person starred, with their look, kept on the device and with the
 * account so every map and device has them).
 *
 * A look here is the part of a stamp's settings worth keeping: size, turn,
 * flips, colours, colour filters, opacity, shadow, stretch and anchor.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import { stamps as stampsApi } from "../../account/api";
import type { MMLayer, MMStamp } from "../types";
import { setOfAsset } from "./catalog";
import { lookOf, type StampLook } from "./state";

/** The kept part of a look (plain JSON, stored and synced). */
export type SavedLook = Pick<
  StampLook,
  | "size"
  | "rotation"
  | "flipX"
  | "flipY"
  | "ink"
  | "fill"
  | "opacity"
  | "hue"
  | "saturation"
  | "brightness"
  | "contrast"
  | "shadow"
  | "stretch"
  | "pivot"
>;
export function savedLook(l: StampLook): SavedLook {
  return {
    size: l.size,
    rotation: l.rotation,
    flipX: l.flipX,
    flipY: l.flipY,
    ink: l.ink,
    fill: l.fill,
    opacity: l.opacity,
    hue: l.hue,
    saturation: l.saturation,
    brightness: l.brightness,
    contrast: l.contrast,
    shadow: l.shadow === "custom" ? "default" : l.shadow,
    stretch: l.stretch,
    pivot: l.pivot,
  };
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Whether two looks are the same (to a hair). */
export function sameLook(a: SavedLook, b: SavedLook) {
  return (
    r3(a.size) === r3(b.size) &&
    Math.round(a.rotation) === Math.round(b.rotation) &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY &&
    a.ink === b.ink &&
    a.fill === b.fill &&
    r3(a.opacity) === r3(b.opacity) &&
    Math.round(a.hue) === Math.round(b.hue) &&
    r3(a.saturation) === r3(b.saturation) &&
    r3(a.brightness) === r3(b.brightness) &&
    r3(a.contrast) === r3(b.contrast) &&
    a.shadow === b.shadow &&
    r3(a.stretch) === r3(b.stretch) &&
    a.pivot === b.pivot
  );
}

/** A stamp to place again: a set, a variant (null: any) and its look. */
export interface StampLookEntry {
  set: string;
  variant: number | null;
  look: SavedLook;
}
export const sameEntry = (a: StampLookEntry, b: StampLookEntry) =>
  a.set === b.set && a.variant === b.variant && sameLook(a.look, b.look);

// ---- recently used (from the map) -------------------------------------------------------
export interface StampUsage {
  /** This map's stamps (set, variant, look), newest first. */
  recent: StampLookEntry[];
  /** Every set this map uses. */
  used: ReadonlySet<string>;
}
export const NO_STAMP_USAGE: StampUsage = { recent: [], used: new Set() };
export const StampUsageContext = createContext<StampUsage>(NO_STAMP_USAGE);
export const useStampUsage = () => useContext(StampUsageContext);

/** A map's stamp usage (see StampUsage). Later objects are newer. */
export function stampUsage(layers: MMLayer[], max = 10): StampUsage {
  const used = new Set<string>(),
    recent: StampLookEntry[] = [];
  const all = layers.flatMap((l) =>
    l.objects.filter((o): o is MMStamp => o.kind === "stamp"),
  );
  for (const o of all) {
    const set = setOfAsset(o.asset);
    if (set) used.add(set.id);
  }
  for (let i = all.length - 1; i >= 0 && recent.length < max; i--) {
    const o = all[i],
      set = setOfAsset(o.asset);
    if (!set || set.hidden) continue;
    const entry: StampLookEntry = {
      set: set.id,
      variant: Math.max(0, set.assets.indexOf(o.asset)),
      look: savedLook(lookOf(o)),
    };
    // One entry per set (variety makes every placed stamp a little
    // different): the look and variant it was placed with last.
    if (!recent.some((r) => r.set === entry.set)) recent.push(entry);
  }
  return { recent, used };
}

// ---- favourites --------------------------------------------------------------------------
export interface StampFavorite extends StampLookEntry {
  id: string;
}
const FAV_KEY = "idrisi.stamps.favorites.v1";
const MAX_FAVORITES = 60;
let favorites: { items: StampFavorite[]; updatedAt: number } = {
  items: [],
  updatedAt: 0,
};
const listeners = new Set<() => void>();
const valid = (x: StampFavorite) =>
  !!x &&
  typeof x.id === "string" &&
  typeof x.set === "string" &&
  (x.variant === null || typeof x.variant === "number") &&
  !!x.look &&
  typeof x.look.size === "number";
if (typeof window !== "undefined") {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "null");
    if (raw && Array.isArray(raw.items))
      favorites = {
        items: raw.items.filter(valid),
        updatedAt: Number(raw.updatedAt) || 0,
      };
  } catch {
    // unreadable: start with none
  }
}
function setFavorites(items: StampFavorite[], updatedAt = Date.now()) {
  favorites = { items: items.slice(0, MAX_FAVORITES), updatedAt };
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  } catch {
    // storage full or blocked: kept for this page
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function useStampFavorites() {
  return useSyncExternalStore(
    subscribe,
    () => favorites.items,
    () => [] as StampFavorite[],
  );
}
export const isFavorite = (e: StampLookEntry) =>
  favorites.items.some((f) => sameEntry(f, e));
/** Stars (or un-stars) a stamp with its look. */
export function toggleFavorite(e: StampLookEntry) {
  const hit = favorites.items.find((f) => sameEntry(f, e));
  setFavorites(
    hit
      ? favorites.items.filter((f) => f !== hit)
      : [
          {
            id: `f${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
            set: e.set,
            variant: e.variant,
            look: { ...e.look },
          },
          ...favorites.items,
        ],
  );
  schedulePush();
}
export function removeFavorite(id: string) {
  setFavorites(favorites.items.filter((f) => f.id !== id));
  schedulePush();
}

// ---- with the account -----------------------------------------------------------------------
let signedIn = false,
  pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (!signedIn) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void stampsApi
      .saveFavorites({
        items: favorites.items.map((f) => ({
          id: f.id,
          set: f.set,
          variant: f.variant,
          look: { ...f.look },
        })),
        updated_at: favorites.updatedAt,
      })
      .catch(() => {
        // kept on this device; sent again with the next change
      });
  }, 800);
}
/** Signed in: the newer copy (this device or the account) wins. */
export async function syncStampFavorites(isSignedIn: boolean) {
  signedIn = isSignedIn;
  if (!isSignedIn) return;
  try {
    const remote = await stampsApi.favorites();
    if (remote.updated_at > favorites.updatedAt)
      setFavorites(
        (remote.items as unknown as StampFavorite[]).filter(valid),
        remote.updated_at,
      );
    else if (favorites.updatedAt > remote.updated_at) schedulePush();
  } catch {
    // offline: the device's copy stands
  }
}
