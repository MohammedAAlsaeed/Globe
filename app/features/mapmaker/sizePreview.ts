/**
 * Helpers for the size preview — the brush ring or stamp ghost shown on the
 * map while the size is changed from off the map (the panel slider, the
 * wheel, the keyboard), so its size against the map is clear. The preview
 * sits at the centre of the visible map. The editor (MapCreatorEditor) wires
 * the Konva nodes and the readout to these.
 *
 * Pure, so the arithmetic is tested on its own (tests/sizePreview.test.mjs).
 */

export type Pt = { x: number; y: number };

/** Clamp a point onto the map, in stage pixels. */
export function clampToMap(p: Pt, size: { w: number; h: number }): Pt {
  return {
    x: Math.max(0, Math.min(size.w, p.x)),
    y: Math.max(0, Math.min(size.h, p.y)),
  };
}

/** The readout numbers for a size given as a fraction of the map width. */
export function sizeReadout(
  sizeNorm: number,
  mapWidthPx: number,
): { px: number; pct: number } {
  return {
    px: Math.max(1, Math.round(sizeNorm * mapWidthPx)),
    pct: Math.max(1, Math.round(sizeNorm * 100)),
  };
}
