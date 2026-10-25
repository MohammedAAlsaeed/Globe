/**
 * Validation of shape data from outside the editor: imported map files,
 * cloud documents, saved styles and the browser's remembered tool settings.
 * Every number is range-checked and every option checked against its list,
 * and the geometry is bounded (paths, nesting, nodes, portals), so malformed
 * or hostile data never reaches the renderer. The API checks the same rules
 * (api/app/Support/ShapeRules.php) — keep the two in step.
 */
import { TEXTURE_IDS } from "../brush/textures";
import { validNodes, validStamp, validStroke } from "../lines/validate";
import { SHAPE_LIMITS } from "./geometry";

const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const bool = (v: unknown) => typeof v === "boolean";
const rec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown) =>
  typeof v === "string" && v.length >= 1 && v.length <= 64;

const BIOMES = ["forest", "mountains", "desert", "water", "grass", "swamp"];
const BLENDS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "hue",
  "saturation",
  "color",
  "luminosity",
];
const OPS = ["add", "subtract", "intersect", "exclude"];
const PRIMS = ["rect", "ellipse", "polygon", "star"];
const FILLS = ["none", "color", "texture", "pattern", "mask"];

function validSource(v: unknown) {
  return (
    rec(v) &&
    (v.type === "color" || v.type === "texture") &&
    hex(v.color) &&
    TEXTURE_IDS.includes(v.texture as string) &&
    finite(v.textureScale, 0.05, 20) &&
    finite(v.textureRotation, -3600, 3600) &&
    finite(v.hue, -360, 360) &&
    finite(v.saturation, -1, 1) &&
    finite(v.brightness, -1, 1) &&
    finite(v.contrast, -1, 1)
  );
}

export function validShapeStroke(v: unknown) {
  return (
    rec(v) &&
    (v.mode === "none" || v.mode === "color" || v.mode === "stamp") &&
    validStroke(v.color) &&
    validStamp(v.stamp) &&
    (v.align === "center" || v.align === "inside" || v.align === "outside") &&
    finite(v.opacity, 0, 1)
  );
}
export function validShapeFill(v: unknown) {
  return (
    rec(v) &&
    FILLS.includes(v.type as string) &&
    validSource(v.source) &&
    BIOMES.includes(v.pattern as string) &&
    finite(v.opacity, 0, 1) &&
    (v.anchor === "map" || v.anchor === "shape") &&
    bool(v.invert) &&
    finite(v.feather, 0, 0.2)
  );
}
/** A complete look (tool settings, a saved style, or a shape's own). */
export function validShapeLook(v: unknown) {
  return (
    rec(v) &&
    validShapeStroke(v.stroke) &&
    validShapeFill(v.fill) &&
    finite(v.opacity, 0, 1) &&
    (v.blend === undefined || BLENDS.includes(v.blend as string))
  );
}

function validPrim(v: unknown) {
  return (
    rec(v) &&
    PRIMS.includes(v.kind as string) &&
    finite(v.cx, -1, 2) &&
    finite(v.cy, -1, 2) &&
    finite(v.w, 0, 4) &&
    finite(v.h, 0, 4) &&
    finite(v.rot, -3600, 3600) &&
    (v.radius === undefined || finite(v.radius, 0, 0.5)) &&
    (v.sides === undefined ||
      (Number.isInteger(v.sides) && finite(v.sides, 3, 64))) &&
    (v.inner === undefined || finite(v.inner, 0.05, 0.95))
  );
}

/** Parts, recursively; counts paths and nodes into `tally`. */
function validParts(
  v: unknown,
  level: number,
  tally: { paths: number; nodes: number; ids: Set<string> },
): boolean {
  if (!Array.isArray(v) || v.length === 0 || level > SHAPE_LIMITS.maxDepth)
    return false;
  for (const p of v) {
    if (!rec(p) || !id(p.id) || !OPS.includes(p.op as string)) return false;
    if (tally.ids.has(p.id as string)) return false;
    tally.ids.add(p.id as string);
    if (Array.isArray(p.parts)) {
      if (p.nodes !== undefined || p.prim !== undefined) return false;
      if (!validParts(p.parts, level + 1, tally)) return false;
      continue;
    }
    if (!validNodes(p.nodes, true)) return false;
    if (p.prim !== undefined && !validPrim(p.prim)) return false;
    tally.paths++;
    tally.nodes += (p.nodes as unknown[]).length;
    if (
      tally.paths > SHAPE_LIMITS.maxPaths ||
      tally.nodes > SHAPE_LIMITS.maxTotalNodes
    )
      return false;
  }
  return true;
}

/** A shape object (its id and the shared flags are checked by the caller). */
export function validShape(o: Record<string, unknown>) {
  const tally = { paths: 0, nodes: 0, ids: new Set<string>() };
  if (!validParts(o.parts, 0, tally)) return false;
  const pathIds = new Set<string>();
  const collect = (list: unknown[]) => {
    for (const p of list as Record<string, unknown>[]) {
      if (Array.isArray(p.parts)) collect(p.parts);
      else pathIds.add(p.id as string);
    }
  };
  collect(o.parts as unknown[]);
  return (
    Array.isArray(o.portals) &&
    o.portals.length <= SHAPE_LIMITS.maxPortals &&
    o.portals.every(
      (pt) =>
        rec(pt) &&
        id(pt.id) &&
        typeof pt.part === "string" &&
        pathIds.has(pt.part) &&
        Number.isInteger(pt.seg) &&
        finite(pt.seg, 0, SHAPE_LIMITS.maxNodes) &&
        finite(pt.t, 0, 1) &&
        finite(pt.width, 0.0005, 0.5),
    ) &&
    rec(o.frame) &&
    finite(o.frame.x, -4, 5) &&
    finite(o.frame.y, -4, 5) &&
    finite(o.frame.rot, -3600, 3600) &&
    finite(o.frame.scale, 0.01, 100) &&
    validShapeLook(o) &&
    (o.name === undefined ||
      o.name === null ||
      (typeof o.name === "string" && o.name.length <= 80)) &&
    (o.styleId === undefined ||
      o.styleId === null ||
      (typeof o.styleId === "string" && o.styleId.length <= 64))
  );
}
