import { DEFAULT_DOCUMENT, type StudioDocument } from "./types";
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
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
      l.strokes.length > 5000
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
  }
  if (points > 200000) throw new Error("invalidProject");
  return structuredClone({ ...DEFAULT_DOCUMENT, ...d });
}
