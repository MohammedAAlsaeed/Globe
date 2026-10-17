/**
 * Converts objects of older maps when a map opens:
 *
 *   icon  (before the Stamp Tool, 24×24 line-art symbols) → a stamp from
 *         the Classic pack, placed, sized and colored exactly as before;
 *   path  (before the Line Tool, freehand river/road/border strokes) → a
 *         Line with the same curve, color, width, opacity and softness, now
 *         with editable nodes.
 */
import type { MMIcon, MMLine, MMObject, MMPath, MMProject, MMStamp } from "../types";
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

type Legacy = MMObject | MMIcon | MMPath;

/** The project with legacy icons and paths converted (the same object if none). */
export function migrateProject(p: MMProject): MMProject {
  const legacy = (o: Legacy) => o.kind === "icon" || o.kind === "path";
  if (!p.layers.some((l) => (l.objects as Legacy[]).some(legacy))) return p;
  const convert = (o: Legacy): MMObject => {
    if (o.kind === "icon") return iconToStamp(o);
    if (o.kind === "path") return o.points.length >= 2 ? pathToLine(o, p.width, p.height) : (null as unknown as MMObject);
    return o;
  };
  return {
    ...p,
    layers: p.layers.map((l) => ({
      ...l,
      objects: (l.objects as Legacy[]).map(convert).filter(Boolean),
    })),
  };
}
