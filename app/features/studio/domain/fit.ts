/**
 * Putting a map that isn't 2:1 on the globe. The globe needs an
 * equirectangular image (2:1): a map of another shape is either kept in
 * proportion — centred, with the rest of the sphere filled with its sea —
 * or stretched over the whole sphere. Pure geometry (unit tested).
 */

/** Ratios this close to 2:1 are used as they are. */
export const RATIO_TOLERANCE = 0.02;

export function needsFit(width: number, height: number): boolean {
  return Math.abs(width / height / 2 - 1) > RATIO_TOLERANCE;
}

/** The 2:1 canvas for a source, and where the map goes in it (pixels). */
export function fitRect(
  width: number,
  height: number,
  mode: "contain" | "stretch",
  maxWidth = 16384,
): { canvas: { width: number; height: number }; map: { x: number; y: number; width: number; height: number } } {
  // Keep the source's detail: the canvas is as wide as needed to hold it unscaled.
  let cw = Math.max(width, height * 2);
  cw = Math.min(cw, maxWidth);
  cw = Math.max(2, Math.round(cw / 2) * 2);
  const ch = cw / 2;
  if (mode === "stretch") return { canvas: { width: cw, height: ch }, map: { x: 0, y: 0, width: cw, height: ch } };
  const scale = Math.min(cw / width, ch / height),
    w = width * scale,
    h = height * scale;
  return { canvas: { width: cw, height: ch }, map: { x: (cw - w) / 2, y: (ch - h) / 2, width: w, height: h } };
}

/**
 * What a contained map covers on the sphere: a wide map (wider than 2:1)
 * spans every longitude but not the poles; a narrower one spans pole to pole
 * but only part of the way around.
 */
export function coverage(width: number, height: number): { kind: "latitudes"; north: number; south: number } | { kind: "longitudes"; degrees: number } {
  const r = fitRect(width, height, "contain");
  if (r.map.width >= r.canvas.width - 1) {
    const top = r.map.y / r.canvas.height,
      bottom = (r.map.y + r.map.height) / r.canvas.height;
    return { kind: "latitudes", north: Math.round(90 - top * 180), south: Math.round(bottom * 180 - 90) };
  }
  return { kind: "longitudes", degrees: Math.round((r.map.width / r.canvas.width) * 360) };
}
