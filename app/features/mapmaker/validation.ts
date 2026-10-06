/**
 * Validates a project file being imported (see storage.ts's
 * exportProjectToFile/parseProjectFile). Imported data is untrusted —
 * hand-edited, from an older/newer version of the app, or simply the wrong
 * file — so every field is checked before it's allowed anywhere near the
 * editor's state. Mirrors features/studio/domain/validation.ts's own
 * approach (throw Error("invalidProject") on any mismatch) since that file
 * solves the exact same problem for the print studio's document format.
 */
import { ICON_IDS } from "../studio/domain/icons";
import { TEXTURE_IDS } from "./brush/textures";
import { TIP_LIST } from "./brush/tips";
import type { MMLayer, MMObject, MMProject } from "./types";

const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hexColor = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const PATH_KINDS = ["river", "road", "border"];
const BIOMES = ["forest", "mountains", "desert", "water", "grass", "swamp"];
const ALIGNS = ["start", "center", "end"];
const RESOLUTION_TIERS = ["low", "medium", "high", "ultra"];
const PAINT_MODES = ["free", "edge", "grid", "rect", "ellipse", "polygon"];
const BLEND_MODES = [
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
const LAYER_ROLES = ["land", "water", "custom"];
const bool = (v: unknown) => typeof v === "boolean";
const rec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function validSource(v: unknown) {
  return (
    rec(v) &&
    (v.type === "color" || v.type === "texture") &&
    hexColor(v.color) &&
    TEXTURE_IDS.includes(v.texture as string) &&
    finite(v.textureScale, 0.05, 20) &&
    finite(v.textureRotation, -3600, 3600) &&
    finite(v.hue, -360, 360) &&
    finite(v.saturation, -1, 1) &&
    finite(v.brightness, -1, 1) &&
    finite(v.contrast, -1, 1)
  );
}
function validBrush(v: unknown) {
  const tipOk = (t: unknown) =>
    typeof t === "string" &&
    (TIP_LIST.some((x) => x.key === t) ||
      (t.startsWith("stamp:") &&
        ICON_IDS.includes(t.slice(6) as (typeof ICON_IDS)[number])));
  return (
    rec(v) &&
    tipOk(v.tip) &&
    finite(v.size, 0.0001, 0.5) &&
    finite(v.flow, 0, 1) &&
    finite(v.softness, 0, 1) &&
    finite(v.spacing, 0.01, 5) &&
    finite(v.rotation, -3600, 3600) &&
    finite(v.sizeJitter, 0, 1) &&
    finite(v.opacityJitter, 0, 1) &&
    finite(v.rotationJitter, 0, 1) &&
    finite(v.scatter, 0, 5) &&
    rec(v.pen) &&
    bool(v.pen.enabled) &&
    bool(v.pen.size) &&
    bool(v.pen.opacity) &&
    bool(v.pen.flow)
  );
}
function validEdge(v: unknown) {
  return (
    rec(v) &&
    finite(v.roughness, 0, 1) &&
    finite(v.detail, 0, 1) &&
    finite(v.feather, 0, 0.2) &&
    finite(v.outlineWidth, 0, 0.05) &&
    hexColor(v.outlineColor) &&
    finite(v.ripples, 0, 12) &&
    finite(v.rippleSpacing, 0, 0.1) &&
    hexColor(v.rippleColor) &&
    finite(v.rippleOpacity, 0, 1) &&
    finite(v.innerShade, -1, 1) &&
    finite(v.innerShadeWidth, 0, 0.2) &&
    (v.shoreColor === "" || hexColor(v.shoreColor)) &&
    finite(v.shoreStrength, 0, 1) &&
    finite(v.shoreWidth, 0, 0.2) &&
    hexColor(v.glowColor) &&
    finite(v.glowWidth, 0, 0.2) &&
    finite(v.glowOpacity, 0, 1) &&
    finite(v.islets, 0, 1)
  );
}
function validCoast(v: unknown) {
  if (!rec(v)) return false;
  const nums: [string, number, number][] = [
    ["roughness", 0, 1],
    ["detail", 0, 1],
    ["smoothing", 0, 1],
    ["islets", 0, 1],
    ["outlineWidth", 0, 0.05],
    ["shoreWidth", 0, 0.2],
    ["shoreStrength", 0, 1],
    ["landShade", -1, 1],
    ["landShadeWidth", 0, 0.2],
    ["glowWidth", 0, 0.2],
    ["glowOpacity", 0, 1],
    ["waves", 0, 20],
    ["waveSpacing", 0, 0.2],
    ["waveOffset", 0, 0.2],
    ["waveWidth", 0, 0.05],
    ["waveOpacity", 0, 1],
    ["waveFade", 0, 1],
    ["waveBreakup", 0, 1],
    ["depthStrength", 0, 1],
    ["depthDistance", 0, 1],
  ];
  return (
    bool(v.enabled) &&
    (v.style === null || typeof v.style === "string") &&
    nums.every(([k, lo, hi]) => finite(v[k], lo, hi)) &&
    [
      "outlineColor",
      "shoreColor",
      "glowColor",
      "waveColor",
      "depthColor",
    ].every((k) => hexColor(v[k]))
  );
}
function validPaintPoints(points: unknown) {
  return (
    Array.isArray(points) &&
    points.length <= 20000 &&
    points.every(
      (p) =>
        rec(p) &&
        finite(p.x, -1, 2) &&
        finite(p.y, -1, 2) &&
        (p.p === undefined || finite(p.p, 0, 1)),
    )
  );
}
function validPaint(obj: Record<string, unknown>) {
  const mode = obj.mode as string;
  if (
    !PAINT_MODES.includes(mode) ||
    !bool(obj.erase) ||
    !BLEND_MODES.includes(obj.blend as string) ||
    !finite(obj.opacity, 0, 1) ||
    !validSource(obj.source) ||
    !validPaintPoints(obj.points) ||
    !finite(obj.seed, 0, 2 ** 32)
  )
    return false;
  if (mode === "free") return validBrush(obj.brush);
  if (!validEdge(obj.edge)) return false;
  if (mode === "grid")
    return (
      rec(obj.grid) &&
      (obj.grid.type === "square" || obj.grid.type === "hex") &&
      finite(obj.grid.cell, 0.001, 1) &&
      Array.isArray(obj.cells) &&
      obj.cells.length <= 20000 &&
      obj.cells.every(
        (c) =>
          Array.isArray(c) &&
          c.length === 2 &&
          Number.isInteger(c[0]) &&
          Number.isInteger(c[1]),
      )
    );
  return obj.rough === undefined || bool(obj.rough);
}
const ASPECTS = ["landscape", "portrait", "square", "custom"];

function validPoints(
  points: unknown,
  min: number,
  max: number,
): points is Array<{ x: number; y: number }> {
  return (
    Array.isArray(points) &&
    points.length >= min &&
    points.length <= max &&
    points.every(
      (p) =>
        p &&
        typeof p === "object" &&
        finite((p as { x?: unknown }).x, -1, 2) &&
        finite((p as { y?: unknown }).y, -1, 2),
    )
  );
}

function validObject(o: unknown): o is MMObject {
  if (!o || typeof o !== "object") return false;
  const obj = o as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (obj.kind === "icon")
    return (
      ICON_IDS.includes(obj.icon as (typeof ICON_IDS)[number]) &&
      finite(obj.x, -1, 2) &&
      finite(obj.y, -1, 2) &&
      finite(obj.rotation, -3600, 3600) &&
      finite(obj.scale, 0.1, 8) &&
      hexColor(obj.color)
    );
  if (obj.kind === "path")
    return (
      PATH_KINDS.includes(obj.pathKind as string) &&
      validPoints(obj.points, 2, 4000) &&
      finite(obj.width, 0.0005, 0.1) &&
      hexColor(obj.color) &&
      finite(obj.opacity, 0, 1) &&
      finite(obj.softness, 0, 1)
    );
  if (obj.kind === "region")
    return (
      BIOMES.includes(obj.biome as string) &&
      validPoints(obj.points, 3, 2000) &&
      finite(obj.opacity, 0, 1) &&
      finite(obj.textureScale, 0.1, 8) &&
      finite(obj.textureRotation, -3600, 3600)
    );
  if (obj.kind === "label")
    return (
      typeof obj.text === "string" &&
      obj.text.length > 0 &&
      obj.text.length <= 200 &&
      finite(obj.x, -1, 2) &&
      finite(obj.y, -1, 2) &&
      finite(obj.size, 0.001, 0.5) &&
      hexColor(obj.color) &&
      ALIGNS.includes(obj.align as string) &&
      typeof obj.rtl === "boolean" &&
      (obj.rotation === undefined || finite(obj.rotation, -3600, 3600)) &&
      (obj.anchored === undefined || typeof obj.anchored === "boolean")
    );
  if (obj.kind === "paint") return validPaint(obj);
  if (obj.kind === "brush")
    return (
      validPoints(obj.points, 1, 20000) &&
      hexColor(obj.color) &&
      finite(obj.size, 0.0005, 0.2) &&
      finite(obj.opacity, 0, 1) &&
      finite(obj.softness, 0, 1)
    );
  return false;
}

function validLayer(l: unknown): l is MMLayer {
  if (!l || typeof l !== "object") return false;
  const layer = l as Record<string, unknown>;
  return (
    typeof layer.id === "string" &&
    typeof layer.name === "string" &&
    layer.name.length <= 60 &&
    typeof layer.visible === "boolean" &&
    typeof layer.locked === "boolean" &&
    finite(layer.opacity, 0, 1) &&
    (layer.role === undefined || LAYER_ROLES.includes(layer.role as string)) &&
    (layer.coast === undefined || validCoast(layer.coast)) &&
    Array.isArray(layer.objects) &&
    layer.objects.length <= 5000 &&
    layer.objects.every(validObject)
  );
}

/** Imported projects are untrusted. Reject incompatible or malformed files
 * rather than letting broken data reach the editor's state/Konva stage. */
export function validateProject(value: unknown): MMProject {
  if (!value || typeof value !== "object") throw new Error("invalidProject");
  const p = value as Record<string, unknown>;
  if (
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !finite(p.width, 64, 20000) ||
    !finite(p.height, 64, 20000) ||
    !finite(p.tileCols, 1, 2000) ||
    !finite(p.tileRows, 1, 2000) ||
    !RESOLUTION_TIERS.includes(p.resolutionTier as string) ||
    !ASPECTS.includes(p.aspect as string) ||
    !hexColor(p.background) ||
    typeof p.snapToGrid !== "boolean" ||
    !Array.isArray(p.layers) ||
    p.layers.length === 0 ||
    p.layers.length > 40 ||
    !p.layers.every(validLayer)
  )
    throw new Error("invalidProject");
  return value as MMProject;
}
