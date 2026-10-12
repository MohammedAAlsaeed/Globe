/**
 * Arranging objects: groups, alignment and even spacing, and moving objects
 * by an offset. Pure functions (no React, no Konva), shared by the editor's
 * toolbar, Edit menu, context menu and shortcuts.
 */
import type { MMObject, MMPatch, MMStamp } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };
export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type Delta = { dx: number; dy: number };

/** Objects that can be picked on the canvas (not hidden, not locked). */
export const pickable = (o: MMObject) => !o.hidden && !o.locked;

/**
 * A selection grown to whole groups: picking one member of a group picks
 * all of it (within the same layer's objects).
 */
export function withGroups(ids: string[], objects: MMObject[]): string[] {
  const groups = new Set(objects.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group!));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const o of objects) if (o.group && groups.has(o.group) && !o.hidden) out.add(o.id);
  return [...out];
}

/** Moves of each object so their boxes line up (px, like the boxes). The
 * selection's own outer box is the reference, as in design tools. */
export function alignDeltas(rects: Map<string, Rect>, mode: AlignMode): Map<string, Delta> {
  const all = [...rects.values()],
    left = Math.min(...all.map((r) => r.x)),
    top = Math.min(...all.map((r) => r.y)),
    right = Math.max(...all.map((r) => r.x + r.width)),
    bottom = Math.max(...all.map((r) => r.y + r.height));
  const out = new Map<string, Delta>();
  for (const [id, r] of rects) {
    const d: Delta = { dx: 0, dy: 0 };
    if (mode === "left") d.dx = left - r.x;
    else if (mode === "right") d.dx = right - (r.x + r.width);
    else if (mode === "centerX") d.dx = (left + right) / 2 - (r.x + r.width / 2);
    else if (mode === "top") d.dy = top - r.y;
    else if (mode === "bottom") d.dy = bottom - (r.y + r.height);
    else d.dy = (top + bottom) / 2 - (r.y + r.height / 2);
    out.set(id, d);
  }
  return out;
}

/** Moves that space objects evenly between the first and the last (by their
 * centers) along one axis; needs at least three. */
export function distributeDeltas(rects: Map<string, Rect>, axis: "x" | "y"): Map<string, Delta> {
  const out = new Map<string, Delta>();
  const center = (r: Rect) => (axis === "x" ? r.x + r.width / 2 : r.y + r.height / 2);
  const sorted = [...rects].sort((a, b) => center(a[1]) - center(b[1]));
  if (sorted.length < 3) return out;
  const first = center(sorted[0][1]),
    step = (center(sorted[sorted.length - 1][1]) - first) / (sorted.length - 1);
  sorted.forEach(([id, r], i) => {
    const d = first + step * i - center(r);
    out.set(id, axis === "x" ? { dx: d, dy: 0 } : { dx: 0, dy: d });
  });
  return out;
}

/** The patch that moves an object by (dx, dy) — fractions of the map. */
export function shiftPatch(o: MMObject, dx: number, dy: number): MMPatch | Partial<MMStamp> {
  if (o.kind === "stamp" || o.kind === "label") return { x: o.x + dx, y: o.y + dy };
  if (o.kind === "paint" || o.kind === "land") return {};
  return { points: o.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}
