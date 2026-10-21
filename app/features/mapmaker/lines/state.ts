/**
 * Line Tool settings and styles.
 *
 * Three kinds of values, never mixed up (the same rule as the Stamp Tool):
 *   factory  FACTORY_LOOK, or the look of the style a line was drawn with —
 *            what "Reset" returns to;
 *   tool     the look the *next* line gets (LineToolState.look), changed by
 *            the panel when nothing is selected, remembered per browser;
 *   object   every line on the map keeps its own look; editing a selected
 *            line changes that line only, never the tool.
 *
 * A *style* is a named look: the built-in ones below, the person's own
 * (saved to their account) and official ones published by admins (see
 * ./remote). Applying a style copies its look into the tool or a line.
 */
import { newSeed } from "../brush/noise";
import type { LineColorStroke, LineLook, LineStampStroke } from "../types";
import {
  builtinLineSets,
  lineSet,
  defaultLineSet,
  stampLineSet,
  type LineArtSet,
} from "./catalog";
import { stampSet } from "../stamps/catalog";
import { validLook } from "./validate";

export type LineDrawMode = "free" | "pen" | "edit";

export interface LineToolState {
  draw: LineDrawMode;
  /** Free Draw: 0 follows the hand closely … 1 very smooth. */
  smoothing: number;
  /** Shift: angle steps in degrees. */
  angleStep: number;
  /** Snap new nodes to the ends of other lines. */
  snapEnds: boolean;
  look: LineLook;
  /** The style the look came from (null once changed by hand). */
  styleId: string | null;
}

export const FACTORY_STROKE: LineColorStroke = {
  color: "#7a5a3a",
  width: 0.004,
  pattern: "solid",
  dash: 3,
  gap: 2,
  cap: "round",
  join: "round",
  blur: 0,
  casing: 0,
  casingColor: "#3a2e22",
};

/** A Stamp Stroke using a line set, with the set's own defaults. */
export function stampFromSet(
  set: LineArtSet,
  keep?: Partial<LineStampStroke>,
): LineStampStroke {
  return {
    set: set.id,
    parts: set.parts,
    rotation: 0,
    offset: 0,
    flip: false,
    seed: keep?.seed ?? newSeed(),
    ...set.defaults,
  };
}

export function factoryStamp(): LineStampStroke {
  return { ...stampFromSet(defaultLineSet()), seed: 1 };
}
export function factoryLook(): LineLook {
  return {
    mode: "color",
    stroke: FACTORY_STROKE,
    stamp: factoryStamp(),
    opacity: 1,
  };
}

// ---- built-in styles -------------------------------------------------------------------
export interface LineStyle {
  id: string;
  source: "builtin" | "own" | "official";
  labelKey?: string;
  name?: string;
  look: LineLook;
  /** Official styles above the person's plan: listed, not usable. */
  locked?: boolean;
}

const color = (
  id: string,
  stroke: Partial<LineColorStroke>,
  opacity = 1,
): LineStyle => ({
  id: `p:${id}`,
  source: "builtin",
  labelKey: `lnStyle_${id}`,
  look: {
    mode: "color",
    stroke: { ...FACTORY_STROKE, ...stroke },
    stamp: factoryStamp(),
    opacity,
  },
});
const stamp = (id: string, set: LineArtSet | undefined): LineStyle | null =>
  set
    ? {
        id: `p:${id}`,
        source: "builtin",
        labelKey: `lnStyle_${id}`,
        look: {
          mode: "stamp",
          stroke: FACTORY_STROKE,
          stamp: { ...stampFromSet(set), seed: 7 },
          opacity: 1,
        },
      }
    : null;

let builtinStyles: LineStyle[] | null = null;
export function builtinLineStyles(): LineStyle[] {
  if (builtinStyles) return builtinStyles;
  const sets = builtinLineSets(),
    bySet = (id: string) => sets.find((s) => s.id === `lb:${id}`),
    tree = stampSet("tree"),
    rock = stampSet("rock");
  builtinStyles = [
    color("dirtRoad", { color: "#8f6d45", width: 0.0045, blur: 0.2 }),
    color("pavedRoad", {
      color: "#e6d6b0",
      width: 0.005,
      casing: 0.0012,
      casingColor: "#5e4630",
    }),
    color("tradeRoute", {
      color: "#5b3d23",
      width: 0.0024,
      pattern: "dashed",
      dash: 2.5,
      gap: 1.8,
      cap: "butt",
    }),
    color("footpath", {
      color: "#4a3a2a",
      width: 0.0028,
      pattern: "dotted",
      gap: 1.6,
    }),
    color("river", { color: "#4f86b0", width: 0.0065, blur: 0.3 }),
    color("stream", { color: "#6d9fc3", width: 0.0025, blur: 0.15 }),
    color(
      "seaLane",
      {
        color: "#2c5a78",
        width: 0.002,
        pattern: "dashed",
        dash: 3,
        gap: 2.5,
        cap: "butt",
      },
      0.85,
    ),
    color(
      "kingdomBorder",
      {
        color: "#8b2e2e",
        width: 0.0032,
        pattern: "dashdot",
        dash: 4,
        gap: 1.5,
        cap: "butt",
      },
      0.9,
    ),
    color(
      "regionBorder",
      {
        color: "#3a2e22",
        width: 0.0018,
        pattern: "dashed",
        dash: 2,
        gap: 1.5,
        cap: "butt",
      },
      0.8,
    ),
    ...[
      stamp("stoneWall", bySet("stoneWall")),
      stamp("castleWall", bySet("castleWall")),
      stamp("palisade", bySet("palisade")),
      stamp("woodenFence", bySet("woodenFence")),
      stamp("hedge", bySet("hedge")),
      stamp("railway", bySet("railway")),
      stamp("footprints", bySet("footprints")),
      stamp("chevrons", bySet("chevrons")),
      stamp("cliff", bySet("cliff")),
      stamp("ridge", bySet("ridge")),
      stamp("waveLine", bySet("waveLine")),
      stamp("treeLine", tree ? stampLineSet(tree) : undefined),
      stamp("rockLine", rock ? stampLineSet(rock) : undefined),
    ].filter((s): s is LineStyle => !!s),
  ];
  return builtinStyles;
}

export function defaultToolState(): LineToolState {
  const first = builtinLineStyles()[0];
  return {
    draw: "pen",
    smoothing: 0.5,
    angleStep: 45,
    snapEnds: true,
    look: first.look,
    styleId: first.id,
  };
}

// ---- persistence (per browser) ---------------------------------------------------------------
const KEY = "mapmaker-line-tool";
export function loadLineTool(): LineToolState {
  const fallback = defaultToolState();
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<LineToolState>;
    return {
      draw:
        v.draw === "free" || v.draw === "pen" || v.draw === "edit"
          ? v.draw
          : fallback.draw,
      smoothing:
        typeof v.smoothing === "number" && v.smoothing >= 0 && v.smoothing <= 1
          ? v.smoothing
          : fallback.smoothing,
      angleStep:
        v.angleStep === 15 ||
        v.angleStep === 30 ||
        v.angleStep === 45 ||
        v.angleStep === 90
          ? v.angleStep
          : 45,
      snapEnds: typeof v.snapEnds === "boolean" ? v.snapEnds : true,
      look: validLook(v.look) ? (v.look as LineLook) : fallback.look,
      styleId: typeof v.styleId === "string" ? v.styleId : null,
    };
  } catch {
    return fallback;
  }
}
export function saveLineTool(s: LineToolState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// ---- resets ---------------------------------------------------------------------------------
/**
 * What "Reset" returns to: the look of the style `styleId` names (when
 * known), else the factory look. `styles` are the library styles in view.
 */
export function baseLook(
  styleId: string | null | undefined,
  styles: LineStyle[],
): LineLook {
  const s = styleId
    ? (builtinLineStyles().find((x) => x.id === styleId) ??
      styles.find((x) => x.id === styleId))
    : undefined;
  return s?.look ?? factoryLook();
}

/** Resets one property path ("stroke.width", "stamp.spacing", "opacity"…). */
export function resetProp(
  look: LineLook,
  base: LineLook,
  path: string,
): LineLook {
  const [group, key] = path.split(".") as [keyof LineLook, string | undefined];
  if (!key) return { ...look, [group]: base[group] };
  if (group === "stroke")
    return {
      ...look,
      stroke: {
        ...look.stroke,
        [key]: base.stroke[key as keyof LineColorStroke],
      },
    };
  if (group === "stamp") {
    // The pieces' own defaults come from the line's current set when it's
    // not the base style's set (reset width of a wall to *that* wall's width).
    const set =
        look.stamp.set !== base.stamp.set ? lineSet(look.stamp.set) : undefined,
      from = set ? stampFromSet(set, look.stamp) : base.stamp;
    return {
      ...look,
      stamp: { ...look.stamp, [key]: from[key as keyof LineStampStroke] },
    };
  }
  return look;
}

/** Switching the Stamp Stroke's art: the new set's defaults, keeping the seed. */
export function withSet(look: LineLook, set: LineArtSet): LineLook {
  return { ...look, mode: "stamp", stamp: stampFromSet(set, look.stamp) };
}
