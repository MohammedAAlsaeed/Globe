/**
 * Shape Tool settings and styles.
 *
 * The same three kinds of values as the Line and Stamp tools, never mixed:
 *   factory  FACTORY_SHAPE_LOOK, or the look of the style a shape was made
 *            with — what "Reset" returns to;
 *   tool     how the *next* shape is drawn and looks (ShapeToolState),
 *            changed by the panel when nothing is selected, remembered per
 *            browser;
 *   object   every shape keeps its own look; editing a selected shape
 *            changes that shape only, never the tool.
 *
 * A *style* is a named look: the built-in ones below (rooms, keeps, halls,
 * lakes, fields, zones, masks), the person's own (saved to their account)
 * and official ones published by admins (see ./remote).
 */
import { newSeed } from "../brush/noise";
import { DEFAULT_SOURCE } from "../brush/presets";
import type {
  LineColorStroke,
  LineStampStroke,
  MMShape,
  PaintSource,
  ShapeFill,
  ShapeLook,
  ShapeOp,
  ShapeStroke,
} from "../types";
import { builtinLineSets, type LineArtSet } from "../lines/catalog";
import { FACTORY_STROKE, factoryStamp, stampFromSet } from "../lines/state";
import { validShapeLook } from "./validate";

/** How the next part is drawn. */
export type ShapeDrawMode =
  "rect" | "ellipse" | "polygon" | "pen" | "free" | "edit" | "doors";
/** new: a shape of its own · or how it joins the selected shape. */
export type ShapeCombine = "new" | ShapeOp;

export interface ShapeToolState {
  draw: ShapeDrawMode;
  combine: ShapeCombine;
  /** Rectangle corner radius, fraction of the shorter side (0..0.5). */
  radius: number;
  /** Polygon corners, or star points. */
  sides: number;
  star: boolean;
  /** Star inner radius, fraction of the outer one. */
  inner: number;
  /** Free shape: 0 follows the hand … 1 very smooth. */
  smoothing: number;
  /** Shift: angle steps of the pen, degrees. */
  angleStep: number;
  /** Width of new doors, fraction of the map width. */
  portalWidth: number;
  look: ShapeLook;
  /** The style the look came from (null once changed by hand). */
  styleId: string | null;
}

export const FACTORY_SHAPE_STROKE: LineColorStroke = {
  ...FACTORY_STROKE,
  color: "#3a2e22",
  width: 0.0025,
  join: "miter",
  cap: "butt",
};
export const FACTORY_FILL_SOURCE: PaintSource = {
  ...DEFAULT_SOURCE,
  type: "color",
  color: "#cdb98f",
  texture: "parchment",
};
export function factoryShapeStroke(): ShapeStroke {
  return {
    mode: "color",
    color: FACTORY_SHAPE_STROKE,
    stamp: factoryStamp(),
    align: "center",
    opacity: 1,
  };
}
export function factoryShapeFill(): ShapeFill {
  return {
    type: "color",
    source: FACTORY_FILL_SOURCE,
    pattern: "forest",
    opacity: 0.85,
    anchor: "map",
    invert: false,
    feather: 0,
  };
}
export function factoryShapeLook(): ShapeLook {
  return {
    stroke: factoryShapeStroke(),
    fill: factoryShapeFill(),
    opacity: 1,
  };
}

/** A shape's look (the fields a style holds). */
export function shapeLookOf(o: MMShape): ShapeLook {
  return {
    stroke: o.stroke,
    fill: o.fill,
    opacity: o.opacity,
    ...(o.blend ? { blend: o.blend } : {}),
  };
}

// ---- built-in styles -------------------------------------------------------------------
export interface ShapeStyle {
  id: string;
  source: "builtin" | "own" | "official";
  labelKey?: string;
  name?: string;
  look: ShapeLook;
  /** Official styles above the person's plan: listed, not usable. */
  locked?: boolean;
}

const walls = (set: LineArtSet | undefined, size?: number): LineStampStroke =>
  set
    ? { ...stampFromSet(set), seed: 7, ...(size ? { size } : {}) }
    : factoryStamp();

let builtins: ShapeStyle[] | null = null;
export function builtinShapeStyles(): ShapeStyle[] {
  if (builtins) return builtins;
  const sets = builtinLineSets(),
    set = (id: string) => sets.find((s) => s.id === `lb:${id}`);
  const style = (
    id: string,
    stroke: Omit<Partial<ShapeStroke>, "color"> & {
      color?: Partial<LineColorStroke>;
    },
    fill: Omit<Partial<ShapeFill>, "source"> & {
      source?: Partial<PaintSource>;
    },
    opacity = 1,
  ): ShapeStyle => {
    const baseStroke = factoryShapeStroke(),
      baseFill = factoryShapeFill();
    return {
      id: `p:${id}`,
      source: "builtin",
      labelKey: `shStyle_${id}`,
      look: {
        stroke: {
          ...baseStroke,
          ...stroke,
          color: { ...baseStroke.color, ...stroke.color },
        },
        fill: {
          ...baseFill,
          ...fill,
          source: { ...baseFill.source, ...fill.source },
        },
        opacity,
      },
    };
  };
  builtins = [
    style("plain", {}, {}),
    style(
      "stoneRoom",
      { mode: "stamp", stamp: walls(set("stoneWall")), align: "inside" },
      {
        type: "texture",
        opacity: 1,
        source: { type: "texture", texture: "flagstone", textureScale: 0.6 },
      },
    ),
    style(
      "castleKeep",
      { mode: "stamp", stamp: walls(set("castleWall")), align: "inside" },
      {
        type: "texture",
        opacity: 1,
        source: { type: "texture", texture: "cobblestone", textureScale: 0.8 },
      },
    ),
    style(
      "woodenHall",
      { mode: "stamp", stamp: walls(set("palisade")), align: "inside" },
      {
        type: "texture",
        opacity: 1,
        anchor: "shape",
        source: { type: "texture", texture: "planks", textureScale: 0.7 },
      },
    ),
    style(
      "stoneFloor",
      { color: { color: "#2e2a26", width: 0.004 }, align: "inside" },
      {
        type: "texture",
        opacity: 1,
        source: { type: "texture", texture: "flagstone", textureScale: 0.6 },
      },
    ),
    style(
      "lake",
      {
        color: {
          color: "#2f5f80",
          width: 0.0022,
          blur: 0.35,
          join: "round",
          cap: "round",
        },
      },
      {
        type: "texture",
        opacity: 0.95,
        source: { type: "texture", texture: "shallows", textureScale: 1 },
      },
    ),
    style(
      "field",
      { mode: "stamp", stamp: walls(set("hedge")) },
      {
        type: "texture",
        opacity: 1,
        source: { type: "texture", texture: "farmland", textureScale: 1.4 },
      },
    ),
    style(
      "forest",
      { mode: "none" },
      {
        type: "pattern",
        pattern: "forest",
        opacity: 0.85,
        source: { textureScale: 1, textureRotation: 0 },
      },
    ),
    style(
      "kingdom",
      {
        color: {
          color: "#8b2e2e",
          width: 0.0032,
          pattern: "dashdot",
          dash: 4,
          gap: 1.5,
        },
        opacity: 0.9,
      },
      { type: "color", opacity: 0.22, source: { color: "#b8483f" } },
    ),
    style(
      "zone",
      {
        color: {
          color: "#3a2e22",
          width: 0.0018,
          pattern: "dashed",
          dash: 2,
          gap: 1.5,
        },
      },
      { type: "none" },
    ),
    style(
      "maskShow",
      { mode: "none" },
      { type: "mask", invert: false, feather: 0.004 },
    ),
    style(
      "maskHide",
      { mode: "none" },
      { type: "mask", invert: true, feather: 0.004 },
    ),
  ];
  return builtins;
}

export function defaultShapeToolState(): ShapeToolState {
  const first = builtinShapeStyles()[0];
  return {
    draw: "rect",
    combine: "new",
    radius: 0,
    sides: 6,
    star: false,
    inner: 0.5,
    smoothing: 0.5,
    angleStep: 45,
    portalWidth: 0.012,
    look: first.look,
    styleId: first.id,
  };
}

// ---- persistence (per browser) ---------------------------------------------------------------
const KEY = "mapmaker-shape-tool";
const DRAWS: ShapeDrawMode[] = [
  "rect",
  "ellipse",
  "polygon",
  "pen",
  "free",
  "edit",
  "doors",
];
const COMBINES: ShapeCombine[] = [
  "new",
  "add",
  "subtract",
  "intersect",
  "exclude",
];
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi
    ? v
    : fallback;

export function loadShapeTool(): ShapeToolState {
  const fallback = defaultShapeToolState();
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<ShapeToolState>;
    return {
      draw: DRAWS.includes(v.draw as ShapeDrawMode)
        ? (v.draw as ShapeDrawMode)
        : fallback.draw,
      // Combining starts fresh each time (it depends on the selection).
      combine: "new",
      radius: num(v.radius, 0, 0.5, fallback.radius),
      sides: Math.round(num(v.sides, 3, 64, fallback.sides)),
      star: typeof v.star === "boolean" ? v.star : false,
      inner: num(v.inner, 0.05, 0.95, fallback.inner),
      smoothing: num(v.smoothing, 0, 1, fallback.smoothing),
      angleStep: [15, 30, 45, 90].includes(v.angleStep as number)
        ? (v.angleStep as number)
        : 45,
      portalWidth: num(v.portalWidth, 0.001, 0.2, fallback.portalWidth),
      look: validShapeLook(v.look) ? (v.look as ShapeLook) : fallback.look,
      styleId: typeof v.styleId === "string" ? v.styleId : null,
    };
  } catch {
    return fallback;
  }
}
export function saveShapeTool(s: ShapeToolState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
export const SHAPE_COMBINES = COMBINES;

// ---- resets ---------------------------------------------------------------------------------
/** What "Reset" returns to: the look of the style `styleId` names, else the
 * factory look. `styles` are the library styles in view. */
export function baseShapeLook(
  styleId: string | null | undefined,
  styles: ShapeStyle[],
): ShapeLook {
  const s = styleId
    ? (builtinShapeStyles().find((x) => x.id === styleId) ??
      styles.find((x) => x.id === styleId))
    : undefined;
  return s?.look ?? factoryShapeLook();
}

/** Resets one property path ("stroke.color.width", "fill.opacity",
 * "stroke", "opacity"…) to the base look's value. */
export function resetShapeProp(
  look: ShapeLook,
  base: ShapeLook,
  path: string,
): ShapeLook {
  const [group, key, sub] = path.split(".");
  if (group === "opacity") return { ...look, opacity: base.opacity };
  if (group === "blend") return { ...look, blend: base.blend };
  if (group === "stroke") {
    if (!key) return { ...look, stroke: base.stroke };
    if (key === "color" || key === "stamp") {
      const cur = look.stroke[key] as unknown as Record<string, unknown>,
        from = base.stroke[key] as unknown as Record<string, unknown>;
      return {
        ...look,
        stroke: {
          ...look.stroke,
          [key]: sub ? { ...cur, [sub]: from[sub] } : from,
        },
      };
    }
    return {
      ...look,
      stroke: {
        ...look.stroke,
        [key]: base.stroke[key as keyof ShapeStroke],
      },
    };
  }
  if (group === "fill") {
    if (!key) return { ...look, fill: base.fill };
    if (key === "source" && sub)
      return {
        ...look,
        fill: {
          ...look.fill,
          source: {
            ...look.fill.source,
            [sub]: base.fill.source[sub as keyof PaintSource],
          },
        },
      };
    return {
      ...look,
      fill: { ...look.fill, [key]: base.fill[key as keyof ShapeFill] },
    };
  }
  return look;
}

/** A style's look with a fresh seed for its wall pieces (no repeats). */
export function freshLook(look: ShapeLook): ShapeLook {
  return {
    ...look,
    stroke: {
      ...look.stroke,
      stamp: { ...look.stroke.stamp, seed: newSeed() },
    },
  };
}
