/**
 * Text Tool settings, styles and resets.
 *
 * Three levels of values, never mixed up (as for stamps and lines):
 *   system   FACTORY_TEXT_LOOK, or the look of the style a text was made
 *            with — what "Reset" returns to;
 *   tool     the look the *next* text gets (TextToolState.look): the panel
 *            changes it while nothing is selected; remembered per browser;
 *   object   every text keeps its own look; editing a selected text changes
 *            that text only — "Use for new text" copies it to the tool.
 *
 * A *style* is a named look: the built-in presets below (Kingdom title,
 * Ocean, City…), the person's own (saved to their account) and official
 * ones from the atelier (see ./remote).
 */
import type { MMText, TextLook, TextPath } from "../types";
import { DEFAULT_PROFILE } from "./fonts";
import { validLook } from "./validate";

export const FACTORY_TEXT_LOOK: TextLook = {
  profile: DEFAULT_PROFILE,
  font: null,
  size: 0.02,
  weight: 400,
  italic: false,
  caps: false,
  letterSpacing: 0,
  wordSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  direction: "auto",
  lang: "",
  features: {},
  kashida: 0,
  fill: "#3b2a1a",
  fillOpacity: 1,
  opacity: 1,
  outline: {
    enabled: false,
    color: "#f3e7c9",
    width: 0.08,
    opacity: 0.9,
    join: "round",
    position: "outside",
  },
  shadow: {
    enabled: false,
    color: "#000000",
    opacity: 0.45,
    blur: 0.12,
    offsetX: 0.04,
    offsetY: 0.06,
  },
  curveMode: "straight",
  curve: 0,
  letters: "auto",
};

export const DEFAULT_TEXT_PATH: Omit<TextPath, "nodes"> = {
  reverse: false,
  align: "center",
  offset: 0,
  side: "above",
  baseline: 0,
  smooth: true,
};

// ---- presets ------------------------------------------------------------------------------------
export interface TextStyle {
  id: string;
  source: "builtin" | "own" | "official";
  /** Built-in: i18n key (txStyle_<id>); library: its name. */
  labelKey?: string;
  name?: string;
  look: TextLook;
  locked?: boolean;
}

type Partial2<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};
function preset(id: string, p: Partial2<TextLook>): TextStyle {
  const f = FACTORY_TEXT_LOOK;
  return {
    id: `t:${id}`,
    source: "builtin",
    labelKey: `txStyle_${id}`,
    look: {
      ...f,
      ...p,
      outline: { ...f.outline, ...p.outline },
      shadow: { ...f.shadow, ...p.shadow },
      features: { ...(p.features ?? {}) },
    } as TextLook,
  };
}
const halo = (color = "#f3e7c9", width = 0.1, opacity = 0.85) => ({
  enabled: true,
  color,
  width,
  opacity,
});

/** Ready-made looks for the usual names on a map (each is just values, all editable). */
export const BUILTIN_TEXT_STYLES: TextStyle[] = [
  preset("kingdomTitle", {
    profile: "royal-kingdom",
    size: 0.05,
    weight: 600,
    caps: true,
    letterSpacing: 0.18,
    fill: "#5a1f12",
    outline: halo("#f3e7c9", 0.06, 0.7),
    shadow: { enabled: true, opacity: 0.3, blur: 0.18 },
  }),
  preset("empire", {
    profile: "geometric-empire",
    size: 0.065,
    weight: 700,
    caps: true,
    letterSpacing: 0.35,
    fill: "#3b2a1a",
    opacity: 0.8,
    blend: "multiply",
  }),
  preset("cartouche", {
    profile: "ancient-manuscript",
    size: 0.07,
    weight: 600,
    letterSpacing: 0.04,
    fill: "#3b2a1a",
    shadow: {
      enabled: true,
      opacity: 0.35,
      blur: 0.15,
      offsetX: 0.03,
      offsetY: 0.05,
    },
  }),
  preset("ocean", {
    profile: "old-atlas",
    size: 0.04,
    italic: true,
    letterSpacing: 0.25,
    fill: "#2f5f7a",
    fillOpacity: 0.8,
    curveMode: "arc",
    curve: 16,
  }),
  preset("sea", {
    profile: "old-atlas",
    size: 0.026,
    italic: true,
    letterSpacing: 0.12,
    fill: "#355f78",
    fillOpacity: 0.85,
  }),
  preset("river", {
    profile: "old-atlas",
    size: 0.016,
    italic: true,
    letterSpacing: 0.06,
    fill: "#2e5d80",
  }),
  preset("mountains", {
    profile: "ancient-manuscript",
    size: 0.024,
    caps: true,
    letterSpacing: 0.3,
    fill: "#4a3523",
    curveMode: "arc",
    curve: 10,
  }),
  preset("region", {
    profile: "explorers-chart",
    size: 0.032,
    caps: true,
    letterSpacing: 0.45,
    fill: "#5b4636",
    fillOpacity: 0.75,
    blend: "multiply",
  }),
  preset("capital", {
    profile: "royal-kingdom",
    size: 0.022,
    weight: 700,
    caps: true,
    letterSpacing: 0.08,
    fill: "#5a1f12",
    outline: halo(),
  }),
  preset("city", {
    profile: "universal-classical",
    size: 0.016,
    weight: 500,
    fill: "#2b1d12",
    outline: halo("#f5ecd6", 0.12, 0.85),
  }),
  preset("village", {
    profile: "universal-classical",
    size: 0.012,
    fill: "#3b2a1a",
    outline: halo("#f5ecd6", 0.1, 0.75),
  }),
  preset("forest", {
    profile: "old-atlas",
    size: 0.02,
    italic: true,
    letterSpacing: 0.1,
    fill: "#2f4a2a",
  }),
  preset("island", {
    profile: "old-atlas",
    size: 0.022,
    fill: "#3b2a1a",
    outline: halo("#e9dcc0", 0.08, 0.8),
  }),
  preset("note", {
    profile: "historical-notes",
    size: 0.013,
    align: "start",
    lineHeight: 1.3,
    fill: "#3a2a1d",
  }),
  preset("legend", {
    profile: "enchanted-realm",
    size: 0.045,
    letterSpacing: 0.06,
    fill: "#40204a",
    outline: halo("#efe2c4", 0.07, 0.7),
    shadow: { enabled: true, opacity: 0.3 },
  }),
  preset("gothic", {
    profile: "gothic-chronicle",
    size: 0.03,
    fill: "#2a1a12",
  }),
];

export function factoryTextStyle(): TextStyle {
  return {
    id: "t:default",
    source: "builtin",
    labelKey: "txStyle_default",
    look: FACTORY_TEXT_LOOK,
  };
}

/** What Reset returns to: the style the text (or the tool) came from, else the system default. */
export function baseTextLook(
  styleId: string | null | undefined,
  library: TextStyle[],
): TextLook {
  const s = styleId
    ? (BUILTIN_TEXT_STYLES.find((x) => x.id === styleId) ??
      library.find((x) => x.id === styleId))
    : undefined;
  return s?.look ?? FACTORY_TEXT_LOOK;
}

/** Resets one property path ("size", "outline.width", "shadow"…). */
export function resetTextProp(
  look: TextLook,
  base: TextLook,
  path: string,
): TextLook {
  const [group, key] = path.split(".") as [keyof TextLook, string | undefined];
  if (!key) return { ...look, [group]: base[group] } as TextLook;
  if (group === "outline")
    return {
      ...look,
      outline: {
        ...look.outline,
        [key]: base.outline[key as keyof TextLook["outline"]],
      },
    };
  if (group === "shadow")
    return {
      ...look,
      shadow: {
        ...look.shadow,
        [key]: base.shadow[key as keyof TextLook["shadow"]],
      },
    };
  return look;
}

/** The look fields of a text (what a style holds). */
export function lookOfText(o: MMText): TextLook {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(FACTORY_TEXT_LOOK) as (keyof TextLook)[])
    out[k] = o[k];
  if (o.blend) out.blend = o.blend;
  return out as unknown as TextLook;
}
/** A look without the optional blend when it's normal (kept tidy in saved maps). */
export function tidyLook(look: TextLook): TextLook {
  const { blend, ...rest } = look;
  return blend && blend !== "normal" ? { ...rest, blend } : (rest as TextLook);
}

// ---- tool state (per browser) ------------------------------------------------------------------
export interface TextToolState {
  look: TextLook;
  /** The style the look came from (null once changed by hand). */
  styleId: string | null;
  /** The text a new label starts with. */
  sample: string;
}

export function defaultTextTool(): TextToolState {
  return { look: FACTORY_TEXT_LOOK, styleId: null, sample: "" };
}
const KEY = "mapmaker-text-tool";
export function loadTextTool(): TextToolState {
  const fallback = defaultTextTool();
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<TextToolState>;
    return {
      look: validLook(v.look)
        ? { ...FACTORY_TEXT_LOOK, ...(v.look as TextLook) }
        : fallback.look,
      styleId: typeof v.styleId === "string" ? v.styleId : null,
      sample: typeof v.sample === "string" ? v.sample.slice(0, 200) : "",
    };
  } catch {
    return fallback;
  }
}
export function saveTextTool(s: TextToolState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** A new text at (x, y) with the tool's look. */
export function makeText(
  tool: TextToolState,
  x: number,
  y: number,
  text: string,
): MMText {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text,
    x,
    y,
    rotation: 0,
    boxWidth: null,
    ...tidyLook(tool.look),
    styleId: tool.styleId,
  };
}

/** Colours that suit old maps (inks, pigments, paper). */
export const HISTORIC_COLORS: { key: string; color: string }[] = [
  { key: "ink", color: "#1f1a17" },
  { key: "sepia", color: "#3b2a1a" },
  { key: "umber", color: "#5b4636" },
  { key: "gold", color: "#a67c2e" },
  { key: "crimson", color: "#8b1e2a" },
  { key: "vermilion", color: "#b5432a" },
  { key: "navy", color: "#22405e" },
  { key: "sea", color: "#2f5f7a" },
  { key: "verdigris", color: "#3d6b5a" },
  { key: "ivory", color: "#f3e7c9" },
];
