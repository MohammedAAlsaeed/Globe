/**
 * Stamp Tool settings, and how they turn into placed stamps.
 *
 *   look       how a placed stamp looks (size, rotation, flips, colors,
 *              filters, shadow) — the same fields as MMStamp, so the panel
 *              edits new stamps and selected stamps with the same controls.
 *   placement  single (one per click), multiple (scattered along a drag),
 *              or auto (a click places one, a drag scatters).
 *   variety    random variant / size / rotation / flip / tone per stamp, so
 *              a forest never looks like copies of one tree.
 *
 * Three kinds of values, never mixed up:
 *   factory    a set's own defaults (factoryLook) — what "Reset" returns to;
 *   tool       the look the next stamps get; each set remembers its own, so
 *              switching from trees to castles and back keeps both;
 *   placed     every stamp on the map keeps its own values.
 * Placement, scatter and variety settings are shared by all sets.
 */
import { mulberry32 } from "../brush/noise";
import { DEFAULT_SOURCE } from "../brush/presets";
import type { BlendMode, MMStamp, PaintSource, Point, ShadowSettings, StampClip, StampPivot } from "../types";
import { builtinKey, stampSet, type StampSet } from "./catalog";
import { DEFAULT_SHADOW } from "./render";

export type StampPlacement = "single" | "multiple" | "auto";

export type StampLook = Pick<
  MMStamp,
  "size" | "rotation" | "flipX" | "flipY" | "ink" | "fill" | "opacity" | "hue" | "saturation" | "brightness" | "contrast" | "shadow"
> & {
  customShadow: ShadowSettings;
  blend: BlendMode;
  clip: StampClip;
  clipSource: PaintSource;
  pivot: StampPivot;
  stretch: number;
};

/** What a set remembers of how you last used it. */
interface SetMemory {
  look: StampLook;
  rotationJitter: number;
  randomFlip: boolean;
}

export interface StampToolState {
  /** Selected set, and its selected variant (when not random). */
  set: string;
  variant: number;
  placement: StampPlacement;
  /** Select a stamp right after placing it, so the panel edits it. */
  autoSelect: boolean;
  randomVariant: boolean;
  /** 0..1: up to ±50% size change per stamp. */
  sizeJitter: number;
  /** 0..180 degrees either way. */
  rotationJitter: number;
  randomFlip: boolean;
  /** 0..1: small hue/brightness changes per stamp. */
  toneJitter: number;
  /** Multiple: distance between stamps, in stamp widths. */
  spacing: number;
  /** Multiple: how far stamps stray from the stroke, in stamp widths. */
  spread: number;
  /** Multiple: stamps lower on the map are drawn in front. */
  depthSort: boolean;
  look: StampLook;
  /** Each set's last look and variety habits (see selectSet). */
  memory: Record<string, SetMemory>;
}

const BASE_LOOK: StampLook = {
  size: 0.07,
  rotation: 0,
  flipX: false,
  flipY: false,
  ink: "#3a2e22",
  fill: "#e6d8b8",
  opacity: 1,
  hue: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
  shadow: "default",
  customShadow: DEFAULT_SHADOW,
  blend: "normal",
  clip: "none",
  clipSource: DEFAULT_SOURCE,
  pivot: "base",
  stretch: 1,
};

/** A set's own look: what its stamps start with, and what Reset returns to. */
export function factoryLook(set: StampSet | undefined): StampLook {
  return set ? { ...BASE_LOOK, ink: set.ink, fill: set.fill, size: set.size, pivot: set.pivot } : BASE_LOOK;
}
/** A stamp's size as a scale of its set's default size (1 = 100%). */
export function scaleOf(size: number, set: StampSet | undefined) {
  return size / (set?.size ?? BASE_LOOK.size);
}

/**
 * Switching set: the set comes back as you last used it (else with its own
 * defaults), and the set you leave remembers your settings. Placement,
 * scatter and variety stay as they are.
 */
export function selectSet(s: StampToolState, set: StampSet, variant = 0): StampToolState {
  const memory = s.set === set.id ? s.memory : { ...s.memory, [s.set]: { look: s.look, rotationJitter: s.rotationJitter, randomFlip: s.randomFlip } },
    back = memory[set.id];
  return {
    ...s,
    memory,
    set: set.id,
    variant: Math.min(variant, set.assets.length - 1),
    rotationJitter: back?.rotationJitter ?? set.rotationJitter,
    randomFlip: back?.randomFlip ?? set.randomFlip,
    look: back ? { ...factoryLook(set), ...back.look } : factoryLook(set),
  };
}

export function initialStampState(): StampToolState {
  const base: StampToolState = {
    set: "mountain",
    variant: 0,
    placement: "auto",
    autoSelect: false,
    randomVariant: true,
    sizeJitter: 0.25,
    rotationJitter: 0,
    randomFlip: true,
    toneJitter: 0.2,
    spacing: 0.8,
    spread: 0.6,
    depthSort: true,
    look: BASE_LOOK,
    memory: {},
  };
  const set = stampSet(base.set);
  return set ? selectSet(base, set) : base;
}

const STORAGE_KEY = "mapmaker-stamp-tool";
/** The Stamp tool as last used in this browser (else the defaults). */
export function loadStampState(): StampToolState {
  const base = initialStampState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StampToolState> | null;
    if (!saved || typeof saved !== "object") return base;
    // Uploaded sets may not be loaded yet: fall back to a built-in one.
    const merged = { ...base, ...saved, look: { ...base.look, ...saved.look }, memory: saved.memory ?? {} };
    return stampSet(merged.set) ? merged : { ...merged, set: base.set, variant: 0 };
  } catch {
    return base;
  }
}
export function saveStampState(s: StampToolState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

/** The look of a placed stamp (to show it in the panel). */
export function lookOf(o: MMStamp): StampLook {
  return {
    size: o.size,
    rotation: o.rotation,
    flipX: o.flipX,
    flipY: o.flipY,
    ink: o.ink,
    fill: o.fill,
    opacity: o.opacity,
    hue: o.hue,
    saturation: o.saturation,
    brightness: o.brightness,
    contrast: o.contrast,
    shadow: o.shadow,
    customShadow: o.customShadow ?? DEFAULT_SHADOW,
    blend: o.blend ?? "normal",
    clip: o.clip ?? "none",
    clipSource: o.clipSource ?? DEFAULT_SOURCE,
    pivot: o.pivot ?? "center",
    stretch: o.stretch ?? 1,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** One new stamp at `at` (fractions of the map), with the tool's variety. */
export function makeStamp(s: StampToolState, at: Point, rand: () => number): MMStamp | null {
  const set = stampSet(s.set);
  if (!set || set.locked || !set.assets.length) return null;
  const r = () => rand() * 2 - 1,
    asset = s.randomVariant ? set.assets[Math.floor(rand() * set.assets.length)] : (set.assets[s.variant] ?? set.assets[0]),
    l = s.look,
    flip = s.randomFlip && rand() < 0.5;
  return {
    id: crypto.randomUUID(),
    kind: "stamp",
    asset,
    x: at.x,
    y: at.y,
    size: clamp(l.size * (1 + r() * s.sizeJitter * 0.5), 0.002, 0.8),
    rotation: l.rotation + r() * s.rotationJitter,
    flipX: l.flipX !== flip,
    flipY: l.flipY,
    ink: l.ink,
    fill: l.fill,
    opacity: l.opacity,
    hue: clamp(l.hue + r() * s.toneJitter * 14, -180, 180),
    saturation: l.saturation,
    brightness: clamp(l.brightness + r() * s.toneJitter * 0.12, -1, 1),
    contrast: l.contrast,
    shadow: l.shadow,
    ...(l.shadow === "custom" ? { customShadow: l.customShadow } : {}),
    ...(l.blend !== "normal" ? { blend: l.blend } : {}),
    ...(l.clip !== "none" ? { clip: l.clip } : {}),
    ...(l.clip === "texture" ? { clipSource: l.clipSource } : {}),
    pivot: l.pivot,
    ...(l.stretch !== 1 ? { stretch: l.stretch } : {}),
  };
}

/**
 * Multiple placement: stamps dropped along a drag, one every `spacing`
 * stamp widths, each pushed up to `spread` widths off the stroke.
 * Positions are in stage pixels (w × h); stamps come out in map fractions.
 */
export class Scatter {
  private rand: () => number;
  private last: { x: number; y: number } | null = null;
  private travelled = 0;
  constructor(
    private s: StampToolState,
    private w: number,
    private h: number,
    seed: number,
  ) {
    this.rand = mulberry32(seed);
  }
  private get step() {
    return Math.max(2, this.s.spacing * this.s.look.size * this.w);
  }
  private drop(x: number, y: number): MMStamp | null {
    const radius = (this.s.spread * this.s.look.size * this.w) / 2,
      a = this.rand() * Math.PI * 2,
      d = Math.sqrt(this.rand()) * radius;
    return makeStamp(this.s, { x: clamp((x + Math.cos(a) * d) / this.w, 0, 1), y: clamp((y + Math.sin(a) * d) / this.h, 0, 1) }, this.rand);
  }
  /** Stamps placed by moving the pointer to (x, y). */
  feed(x: number, y: number): MMStamp[] {
    const out: MMStamp[] = [];
    if (!this.last) {
      this.last = { x, y };
      const first = this.drop(x, y);
      if (first) out.push(first);
      return out;
    }
    let { x: lx, y: ly } = this.last;
    let dist = Math.hypot(x - lx, y - ly);
    while (this.travelled + dist >= this.step) {
      const t = (this.step - this.travelled) / dist;
      lx += (x - lx) * t;
      ly += (y - ly) * t;
      dist = Math.hypot(x - lx, y - ly);
      this.travelled = 0;
      const st = this.drop(lx, ly);
      if (st) out.push(st);
    }
    this.travelled += dist;
    this.last = { x, y };
    return out;
  }
}

/** Classic symbols keep their own key format (see migrate). */
export const classicKey = (icon: string) => builtinKey(`classic-${icon}`, 0);
