/**
 * Converts objects of older maps when a map opens:
 *
 *   icon  (before the Stamp Tool, 24×24 line-art symbols) → a stamp from
 *         the Classic pack, placed, sized and colored exactly as before;
 *   path  (before the Line Tool, freehand river/road/border strokes) → a
 *         Line with the same curve, color, width, opacity and softness, now
 *         with editable nodes;
 *   label (before the Text Tool, one Georgia line per label) → a Text with
 *         the same words, size, colour and turn, at the same place on the
 *         map (its anchor moved from the old top edge to the text's middle).
 */
import type { MMIcon, MMLabel, MMLine, MMObject, MMPath, MMProject, MMStamp, MMText } from "../types";
import { FACTORY_TEXT_LOOK } from "../text/state";
import { classicKey } from "./state";
import { nodesFromTension } from "../lines/geometry";
import { FACTORY_STROKE, factoryStamp } from "../lines/state";

/** An icon at scale 1 was this fraction of the map width. */
const ICON_BASE = 0.05;

function iconToStamp(o: MMIcon): MMStamp {
  return {
    id: o.id,
    kind: "stamp",
    asset: classicKey(o.icon),
    x: o.x,
    y: o.y,
    size: o.scale * ICON_BASE,
    rotation: o.rotation,
    flipX: false,
    flipY: false,
    ink: o.color,
    fill: null,
    opacity: 1,
    hue: 0,
    saturation: 0,
    brightness: 0,
    contrast: 0,
    shadow: "none",
  };
}

const PATH_STYLE: Record<MMPath["pathKind"], string> = { river: "p:river", road: "p:dirtRoad", border: "p:regionBorder" };

/** The old Path tool drew Konva lines with tension 0.4 and a glow of
 * `softness × 24 px` at a 900 px wide view. */
export function pathToLine(o: MMPath, w: number, h: number): MMLine {
  const blurPx = o.softness * 24 * (w / 900),
    widthPx = Math.max(0.5, o.width * w);
  const line: MMLine = {
    id: o.id,
    kind: "line",
    closed: false,
    nodes: nodesFromTension(o.points, 0.4, w, h),
    mode: "color",
    stroke: {
      ...FACTORY_STROKE,
      color: o.color,
      width: Math.max(0.0002, Math.min(0.2, o.width)),
      blur: Math.max(0, Math.min(1, blurPx / (widthPx * 0.9))),
    },
    stamp: factoryStamp(),
    opacity: o.opacity,
    styleId: PATH_STYLE[o.pathKind] ?? null,
  };
  for (const k of ["group", "locked", "hidden"] as const) if (o[k] !== undefined) (line as unknown as Record<string, unknown>)[k] = o[k];
  return line;
}

/** Width of a line of old label text, in em (Georgia). */
export type MeasureEm = (line: string) => number;
const roughEm: MeasureEm = (line) => [...line].length * 0.52;
let georgia: CanvasRenderingContext2D | null | undefined;
/** The old labels' own font, measured by the browser (a rough estimate elsewhere). */
export const measureGeorgia: MeasureEm = (line) => {
  if (georgia === undefined) georgia = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!georgia) return roughEm(line);
  georgia.font = '100px Georgia, "Times New Roman", serif';
  return georgia.measureText(line).width / 100;
};

/** An old label as a Text Tool text, where it was. `w`, `h`: the map's size. */
export function labelToText(o: MMLabel, w: number, h: number, measure: MeasureEm = roughEm): MMText {
  const lines = o.text.split("\n");
  const fontPx = Math.max(1, o.size * w),
    r = ((o.rotation ?? 0) * Math.PI) / 180,
    cos = Math.cos(r),
    sin = Math.sin(r);
  const physical = o.align === "center" ? "center" : (o.align === "end") !== o.rtl ? "right" : "left";
  // Old (x, y): the alignment edge (anchored) or the left edge (older labels), at the top.
  let along = 0;
  if (!o.anchored) {
    const width = Math.max(...lines.map((l) => measure(l))) * fontPx;
    along = physical === "center" ? width / 2 : physical === "right" ? width : 0;
  }
  const down = (lines.length * fontPx) / 2;
  const x = o.x + (cos * along - sin * down) / w,
    y = o.y + (sin * along + cos * down) / h;
  const text: MMText = {
    ...FACTORY_TEXT_LOOK,
    id: o.id,
    kind: "text",
    text: o.text,
    x,
    y,
    rotation: o.rotation ?? 0,
    boxWidth: null,
    size: o.size,
    fill: o.color,
    align: o.align,
    direction: "auto",
    styleId: null,
  };
  for (const k of ["group", "locked", "hidden"] as const) if (o[k] !== undefined) (text as unknown as Record<string, unknown>)[k] = o[k];
  return text;
}

type Legacy = MMObject | MMIcon | MMPath | MMLabel;

/** One object of an older map, converted (null: nothing left to keep). */
const serverShaped = (o: MMText) => o.lang == null || Array.isArray(o.features);

export function migrateObject(o: Legacy, w: number, h: number, measure: MeasureEm = roughEm): MMObject | null {
  if (o.kind === "icon") return iconToStamp(o);
  if (o.kind === "path") return o.points.length >= 2 ? pathToLine(o, w, h) : null;
  if (o.kind === "label") return o.text.trim() ? labelToText(o, w, h, measure) : null;
  // Saved on the server, "" comes back as null and {} as [].
  if (o.kind === "text" && serverShaped(o)) return { ...o, lang: o.lang ?? "", features: Array.isArray(o.features) ? {} : o.features };
  return o;
}

/** The project with legacy icons, paths and labels converted (the same object if none). */
export function migrateProject(p: MMProject, measure: MeasureEm = roughEm): MMProject {
  const legacy = (o: Legacy) => o.kind === "icon" || o.kind === "path" || o.kind === "label" || (o.kind === "text" && serverShaped(o));
  if (!p.layers.some((l) => (l.objects as Legacy[]).some(legacy))) return p;
  return {
    ...p,
    layers: p.layers.map((l) => ({
      ...l,
      objects: (l.objects as Legacy[]).map((o) => migrateObject(o, p.width, p.height, measure)).filter((o): o is MMObject => !!o),
    })),
  };
}
