/**
 * How the map editor answers the mouse, the trackpad, touch, the pen and
 * the keyboard's view keys — the person's settings, and the small pure
 * rules every input goes through.
 *
 * One idea runs through it: whatever the device, the same few commands
 * move the view (pan, zoom at a point, fit, actual size). A middle-button
 * drag, Space + drag, two fingers on a trackpad and two fingers on a
 * screen all end in `panBy`; a wheel notch, a trackpad pinch, a screen
 * pinch and Ctrl + "+" all end in `zoomAt` (see MapCreatorEditor). This
 * file decides which command an event means.
 *
 * The settings live on this device (`CONTROLS_KEY`) and, when signed in,
 * in the account (./controlsSync), so they follow the person.
 */
import { useSyncExternalStore } from "react";

/** What the scroll wheel / two-finger scroll does over the map. */
export type WheelMode =
  /** Guess per gesture: a mouse wheel zooms, a trackpad's two fingers pan. */
  | "auto"
  /** The wheel zooms (Shift + wheel scrolls sideways). */
  | "mouse"
  /** Two fingers pan, pinching zooms. */
  | "trackpad";

export type PressureCurve = "soft" | "linear" | "firm";

export interface ControlSettings {
  wheel: WheelMode;
  /** Zoom speed, 1 = normal (0.25–3). */
  zoomSpeed: number;
  /** Wheel up zooms out instead of in. */
  invertZoom: boolean;
  /** Zoom at the pointer (else at the middle of the view). */
  zoomToCursor: boolean;
  /** Glide to each new zoom instead of jumping (off when the system asks for less motion). */
  smoothZoom: boolean;
  /** Ctrl/⌘ + wheel while placing or with stamps selected: zoom, or turn them. */
  ctrlWheel: "zoom" | "rotate";
  /** Dragging with the middle button (the wheel). */
  middleButton: "pan" | "none";
  /** Holding Space makes a drag move the view. */
  spacePan: boolean;
  /** Arrow keys with nothing selected move the view this far (screen px; ×4 with Shift). */
  panStep: number;
  /** Stamp turn keys (< >), degrees a press (Alt: 1°). */
  rotateStep: number;
  touch: {
    /** One finger draws with the current tool (off: one finger moves the view, for pen users). */
    fingerDraws: boolean;
    /** Two fingers pinch to zoom (they always pan). */
    pinchZoom: boolean;
    /** Touch and hold opens the context menu. */
    longPress: boolean;
    /** How long a hold is, ms. */
    longPressMs: number;
  };
  pen: {
    /** Pen pressure changes the brush size. */
    pressure: boolean;
    curve: PressureCurve;
    /** While the pen is near or on the screen, a resting hand doesn't draw. */
    palmRejection: boolean;
    /** The pen's side (barrel) button. */
    sideButton: "pan" | "menu" | "none";
  };
}

export const DEFAULT_CONTROLS: ControlSettings = {
  wheel: "auto",
  zoomSpeed: 1,
  invertZoom: false,
  zoomToCursor: true,
  smoothZoom: true,
  ctrlWheel: "zoom",
  middleButton: "pan",
  spacePan: true,
  panStep: 80,
  rotateStep: 15,
  touch: {
    fingerDraws: true,
    pinchZoom: true,
    longPress: true,
    longPressMs: 550,
  },
  pen: {
    pressure: true,
    curve: "linear",
    palmRejection: true,
    sideButton: "pan",
  },
};

/** The zoom range, as a multiple of "fit to screen". */
export const ZOOM_MIN = 0.25,
  ZOOM_MAX = 4;

// ---- reading settings safely (storage, files, the account) ---------------------------------
const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** Any value → valid settings (unknown or broken fields take their defaults). */
export function sanitizeControls(value: unknown): ControlSettings {
  const v = rec(value),
    t = rec(v.touch),
    p = rec(v.pen),
    d = DEFAULT_CONTROLS;
  return {
    wheel: pick(v.wheel, ["auto", "mouse", "trackpad"] as const, d.wheel),
    zoomSpeed: num(v.zoomSpeed, 0.25, 3, d.zoomSpeed),
    invertZoom: bool(v.invertZoom, d.invertZoom),
    zoomToCursor: bool(v.zoomToCursor, d.zoomToCursor),
    smoothZoom: bool(v.smoothZoom, d.smoothZoom),
    ctrlWheel: pick(v.ctrlWheel, ["zoom", "rotate"] as const, d.ctrlWheel),
    middleButton: pick(
      v.middleButton,
      ["pan", "none"] as const,
      d.middleButton,
    ),
    spacePan: bool(v.spacePan, d.spacePan),
    panStep: Math.round(num(v.panStep, 10, 600, d.panStep)),
    rotateStep: Math.round(num(v.rotateStep, 1, 90, d.rotateStep)),
    touch: {
      fingerDraws: bool(t.fingerDraws, d.touch.fingerDraws),
      pinchZoom: bool(t.pinchZoom, d.touch.pinchZoom),
      longPress: bool(t.longPress, d.touch.longPress),
      longPressMs: Math.round(
        num(t.longPressMs, 300, 1500, d.touch.longPressMs),
      ),
    },
    pen: {
      pressure: bool(p.pressure, d.pen.pressure),
      curve: pick(p.curve, ["soft", "linear", "firm"] as const, d.pen.curve),
      palmRejection: bool(p.palmRejection, d.pen.palmRejection),
      sideButton: pick(
        p.sideButton,
        ["pan", "menu", "none"] as const,
        d.pen.sideButton,
      ),
    },
  };
}

// ---- the rules ----------------------------------------------------------------------------
export type WheelKind = "mouse" | "trackpad";
/** The last wheel event seen, so one trackpad gesture isn't split between guesses. */
export interface WheelMemory {
  kind: WheelKind;
  time: number;
}

/**
 * Whether a wheel event comes from a mouse wheel or a trackpad. Browsers
 * don't say, so this is a guess from what the deltas look like: line or
 * page steps, or big whole-number steps with no sideways part, are a
 * wheel; fractions, sideways movement and small steps are fingers. Events
 * close together keep the kind of the gesture they belong to. The setting
 * can always force one or the other.
 */
export function classifyWheel(
  e: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "timeStamp">,
  last: WheelMemory | null,
): WheelKind {
  if (e.deltaMode !== 0) return "mouse";
  if (last && e.timeStamp - last.time < 120) return last.kind;
  if (e.deltaX !== 0 || !Number.isInteger(e.deltaY)) return "trackpad";
  return Math.abs(e.deltaY) >= 50 ? "mouse" : "trackpad";
}

/** What a wheel event does to the view. */
export type WheelAction =
  | { kind: "zoom"; factor: number }
  | { kind: "pan"; dx: number; dy: number };

/** Wheel deltas in pixels (some mice report lines or pages). */
function pixels(delta: number, mode: number) {
  return mode === 1 ? delta * 16 : mode === 2 ? delta * 400 : delta;
}

/**
 * The view action for a wheel event (stamp steps and other tool uses of the
 * wheel come first, in the editor). `kind` is the device, after the
 * setting: Ctrl/⌘ (which a trackpad pinch also sends) always zooms.
 */
export function wheelAction(
  e: Pick<
    WheelEvent,
    "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
  kind: WheelKind,
  s: Pick<ControlSettings, "zoomSpeed" | "invertZoom">,
): WheelAction {
  const dx = pixels(e.deltaX, e.deltaMode),
    dy = pixels(e.deltaY, e.deltaMode);
  const zoom = (d: number) => {
    // A pinch sends small deltas; scale them up so pinching feels as quick as a wheel.
    const k = (e.ctrlKey && kind === "trackpad" ? 0.01 : 0.0022) * s.zoomSpeed;
    return {
      kind: "zoom" as const,
      factor: Math.exp((s.invertZoom ? d : -d) * k),
    };
  };
  if (e.ctrlKey || e.metaKey) return zoom(dy);
  if (kind === "trackpad") return { kind: "pan", dx, dy };
  // A mouse wheel: Shift scrolls sideways (macOS already swaps the axes).
  if (e.shiftKey) return { kind: "pan", dx: dx || dy, dy: 0 };
  return zoom(dy);
}

export function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Pen pressure (0–1) after the person's curve. */
export function applyPressure(p: number, curve: PressureCurve): number {
  const x = Math.min(1, Math.max(0, p));
  return curve === "soft"
    ? Math.pow(x, 0.6)
    : curve === "firm"
      ? Math.pow(x, 1.7)
      : x;
}

/** Two touches: their middle and their distance. */
export function pinchState(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    d: Math.hypot(a.x - b.x, a.y - b.y),
  };
}

// ---- the person's settings (this device; the account via ./controlsSync) -------------------------
/** localStorage key for `ControlSettings` (JSON). */
export const CONTROLS_KEY = "mm-controls-v1";
/** When the settings (or the shortcuts) last changed here, for syncing with the account. */
export const CONTROLS_CHANGED_KEY = "mm-controls-changed";
/** The old per-browser Ctrl + wheel choice, carried over once. */
const LEGACY_CTRL_WHEEL_KEY = "mapmaker-ctrl-wheel";

function read(): ControlSettings {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_CONTROLS;
    const raw = localStorage.getItem(CONTROLS_KEY);
    if (raw) return sanitizeControls(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_CTRL_WHEEL_KEY);
    return legacy === "rotate"
      ? { ...DEFAULT_CONTROLS, ctrlWheel: "rotate" }
      : DEFAULT_CONTROLS;
  } catch {
    return DEFAULT_CONTROLS;
  }
}

let current: ControlSettings | null = null;
const listeners = new Set<() => void>();

export function controls(): ControlSettings {
  current ??= read();
  return current;
}
/** When this device's controls last changed (0: never). */
export function controlsChangedAt(): number {
  try {
    return Number(localStorage.getItem(CONTROLS_CHANGED_KEY)) || 0;
  } catch {
    return 0;
  }
}
export function markControlsChanged(at = Date.now()) {
  try {
    localStorage.setItem(CONTROLS_CHANGED_KEY, String(at));
  } catch {}
}

/**
 * Replaces the settings. `remote`: they came from the account (keep their
 * time, so they aren't sent straight back).
 */
export function setControls(
  next: ControlSettings,
  opts: { remote?: number } = {},
) {
  current = sanitizeControls(next);
  try {
    localStorage.setItem(CONTROLS_KEY, JSON.stringify(current));
  } catch {
    // Private mode or full storage: the change still applies until reload.
  }
  markControlsChanged(opts.remote ?? Date.now());
  listeners.forEach((l) => l());
}
/** Changes some settings (a shallow merge, nested groups merged too). */
export function updateControls(
  patch: Partial<Omit<ControlSettings, "touch" | "pen">> & {
    touch?: Partial<ControlSettings["touch"]>;
    pen?: Partial<ControlSettings["pen"]>;
  },
) {
  const c = controls();
  setControls({
    ...c,
    ...patch,
    touch: { ...c.touch, ...patch.touch },
    pen: { ...c.pen, ...patch.pen },
  });
}
export function subscribeControls(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** The current settings; components re-render when they change. */
export function useControls(): ControlSettings {
  return useSyncExternalStore(
    subscribeControls,
    controls,
    () => DEFAULT_CONTROLS,
  );
}

/** Whether the system asks for less motion (then zoom never glides). */
export function prefersReducedMotion() {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
