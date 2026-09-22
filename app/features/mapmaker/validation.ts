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
import type { MMLayer, MMObject, MMProject } from "./types";

const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hexColor = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const PATH_KINDS = ["river", "road", "border"];
const BIOMES = ["forest", "mountains", "desert", "water", "grass", "swamp"];
const ALIGNS = ["start", "center", "end"];
const RESOLUTION_TIERS = ["low", "medium", "high", "ultra"];
const ASPECTS = ["landscape", "portrait", "square", "custom"];

function validPoints(points: unknown, min: number, max: number): points is Array<{ x: number; y: number }> {
  return (
    Array.isArray(points) &&
    points.length >= min &&
    points.length <= max &&
    points.every((p) => p && typeof p === "object" && finite((p as { x?: unknown }).x, -1, 2) && finite((p as { y?: unknown }).y, -1, 2))
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
      (obj.rotation === undefined || finite(obj.rotation, -3600, 3600))
    );
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
