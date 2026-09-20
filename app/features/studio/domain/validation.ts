import { DEFAULT_DOCUMENT, type StudioDocument, type MapObject } from "./types";
import { ICON_IDS } from "./icons";
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hexColor = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const PATH_KINDS = ["river", "road", "border"];
const BIOMES = ["forest", "mountains", "desert", "water", "grass", "swamp"];
const ALIGNS = ["start", "center", "end"];
function validPoints(points: unknown, min: number, max: number): points is Array<{ x: number; y: number }> {
  return (
    Array.isArray(points) &&
    points.length >= min &&
    points.length <= max &&
    points.every(
      (p) =>
        p && typeof p === "object" && finite(p.x, 0, 1) && finite(p.y, 0, 1),
    )
  );
}
/** New map-object kinds (icons, paths, regions, labels) added alongside strokes. */
function validObject(o: unknown): o is MapObject {
  if (!o || typeof o !== "object") return false;
  const obj = o as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (obj.kind === "icon")
    return (
      ICON_IDS.includes(obj.icon as (typeof ICON_IDS)[number]) &&
      finite(obj.x, 0, 1) &&
      finite(obj.y, 0, 1) &&
      finite(obj.rotation, -3600, 3600) &&
      finite(obj.scale, 0.1, 8) &&
      hexColor(obj.color)
    );
  if (obj.kind === "path")
    return (
      PATH_KINDS.includes(obj.pathKind as string) &&
      validPoints(obj.points, 2, 4000) &&
      finite(obj.width, 0.001, 0.08) &&
      hexColor(obj.color)
    );
  if (obj.kind === "region")
    return (
      BIOMES.includes(obj.biome as string) &&
      validPoints(obj.points, 3, 2000) &&
      finite(obj.opacity, 0, 1)
    );
  if (obj.kind === "label")
    return (
      typeof obj.text === "string" &&
      obj.text.length > 0 &&
      obj.text.length <= 200 &&
      finite(obj.x, 0, 1) &&
      finite(obj.y, 0, 1) &&
      finite(obj.size, 0.005, 0.25) &&
      hexColor(obj.color) &&
      ALIGNS.includes(obj.align as string) &&
      typeof obj.rtl === "boolean"
    );
  return false;
}
/** Imported projects are untrusted. Reject incompatible versions and unsafe allocations. */
export function validateDocument(value: unknown): StudioDocument {
  if (!value || typeof value !== "object") throw new Error("invalidProject");
  const d = value as StudioDocument,
    g = d.globe,
    p = d.print;
  if (
    typeof d.name !== "string" ||
    d.name.length > 100 ||
    !g ||
    !p ||
    !Array.isArray(d.layers)
  )
    throw new Error("invalidProject");
  for (const key of ["height", "width"] as const)
    if (!finite(g[key], 20, 1000)) throw new Error("invalidProject");
  if (
    !finite(g.gores, 6, 72) ||
    g.gores % 2 ||
    !finite(g.offset, -180, 180) ||
    !finite(g.gap, 0, 30) ||
    !finite(g.tab, 0, 15) ||
    !finite(g.bleed, 0, 5)
  )
    throw new Error("invalidProject");
  if (
    !["equirectangular", "mercator"].includes(g.sourceProjection) ||
    !["bilinear", "bicubic", "lanczos"].includes(g.resampling) ||
    !finite(g.north, 1, 89) ||
    !finite(g.south, -89, -1)
  )
    throw new Error("invalidProject");
  for (const key of ["guides", "grid", "labels"] as const)
    if (typeof g[key] !== "boolean") throw new Error("invalidProject");
  if (
    !["A4", "A3", "Letter", "custom"].includes(p.paper) ||
    !["auto", "portrait", "landscape"].includes(p.orientation) ||
    !finite(p.width, 50, 1500) ||
    !finite(p.height, 50, 1500) ||
    !finite(p.margin, 0, 100) ||
    !finite(p.overlap, 0, 50) ||
    !finite(p.calibrationX, 0.8, 1.2) ||
    !finite(p.calibrationY, 0.8, 1.2) ||
    typeof p.marks !== "boolean" ||
    typeof p.outline !== "boolean" ||
    ![150, 300, 600].includes(d.dpi)
  )
    throw new Error("invalidProject");
  let points = 0;
  if (d.layers.length > 20) throw new Error("invalidProject");
  for (const l of d.layers) {
    if (
      typeof l.id !== "string" ||
      typeof l.name !== "string" ||
      l.name.length > 60 ||
      typeof l.visible !== "boolean" ||
      !finite(l.opacity, 0, 1) ||
      !Array.isArray(l.strokes) ||
      l.strokes.length > 5000 ||
      (l.objects !== undefined &&
        (!Array.isArray(l.objects) || l.objects.length > 2000))
    )
      throw new Error("invalidProject");
    for (const s of l.strokes) {
      if (
        typeof s.id !== "string" ||
        !["brush", "symbol"].includes(s.kind) ||
        !/^#[0-9a-f]{6}$/i.test(s.color) ||
        !finite(s.size, 0.001, 0.1) ||
        !Array.isArray(s.points) ||
        s.points.length < 1 ||
        s.points.some((pt) => !finite(pt.x, 0, 1) || !finite(pt.y, 0, 1)) ||
        (s.kind === "symbol" &&
          !["mountain", "city", "star"].includes(s.symbol ?? ""))
      )
        throw new Error("invalidProject");
      points += s.points.length;
    }
    for (const o of l.objects ?? []) {
      if (!validObject(o)) throw new Error("invalidProject");
      if (o.kind === "path" || o.kind === "region") points += o.points.length;
    }
  }
  if (points > 200000) throw new Error("invalidProject");
  return structuredClone({
    ...DEFAULT_DOCUMENT,
    ...d,
    layers: d.layers.map((l) => ({ ...l, objects: l.objects ?? [] })),
  });
}
