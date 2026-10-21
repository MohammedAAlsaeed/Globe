/**
 * Text objects on the map: moving them, giving them a path, putting them
 * along a line, and keeping a city's name with its city (attached texts).
 * Pure functions on the map data (no React, no canvas).
 */
import type { MMLine, MMObject, MMProject, MMText, TextLook } from "../types";
import { shiftNodes, type LineNode } from "../lines/geometry";
import { DEFAULT_TEXT_PATH, tidyLook } from "./state";

/** The patch that moves a text by (dx, dy) map fractions (its path too). */
export function shiftText(o: MMText, dx: number, dy: number): Partial<MMText> {
  return { x: o.x + dx, y: o.y + dy, ...(o.path ? { path: { ...o.path, nodes: shiftNodes(o.path.nodes, dx, dy) } } : {}) };
}

/**
 * A gentle curve for a text that has none yet: through its anchor, as wide
 * as the text, turned like it (map fractions). `widthEm` is the text's
 * width in em; `aspect` the map's height / width.
 */
export function defaultTextPath(o: MMText, widthEm: number, aspect: number): LineNode[] {
  const half = Math.max(0.03, (widthEm * o.size) / 2) * 1.15;
  const r = (o.rotation * Math.PI) / 180,
    cos = Math.cos(r),
    sin = Math.sin(r);
  const bow = half * 0.35;
  // Local points (map-width units), then into map fractions.
  const at = (u: number, v: number) => ({ x: o.x + u * cos - v * sin, y: o.y + (u * sin + v * cos) / aspect });
  const a = at(-half, bow * 0.4),
    m = at(0, -bow * 0.6),
    b = at(half, bow * 0.4);
  const hx = (half / 2) * cos,
    hy = ((half / 2) * sin) / aspect;
  return [
    { x: a.x, y: a.y },
    { x: m.x, y: m.y, t: "smooth", hi: { x: -hx, y: -hy }, ho: { x: hx, y: hy } },
    { x: b.x, y: b.y },
  ];
}

/** The middle of a path (its anchor), map fractions. */
export function pathMiddle(nodes: LineNode[]) {
  const n = nodes[Math.floor(nodes.length / 2)];
  if (nodes.length % 2 === 1) return { x: n.x, y: n.y };
  const a = nodes[nodes.length / 2 - 1];
  return { x: (a.x + n.x) / 2, y: (a.y + n.y) / 2 };
}

/** A new text following a line (a river's name along the river). The line stays. */
export function textAlongLine(line: MMLine, look: TextLook, text: string, styleId: string | null): MMText {
  const nodes = line.nodes.map((n) => ({ ...n }));
  const mid = pathMiddle(nodes);
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text,
    x: mid.x,
    y: mid.y,
    rotation: 0,
    boxWidth: null,
    ...tidyLook(look),
    curveMode: "path",
    path: { ...DEFAULT_TEXT_PATH, nodes, side: "above", baseline: 0.15 + (line.mode === "color" ? line.stroke.width / 2 / look.size : line.stamp.size / 2 / look.size) },
    styleId,
  };
}

/** Where a text sits relative to a stamp, for attaching it. */
export function attachTo(text: MMText, stampId: string, stamp: { x: number; y: number }): MMText["attach"] {
  return { to: stampId, dx: text.x - stamp.x, dy: text.y - stamp.y };
}

/**
 * After a change: texts attached to a stamp that moved move with it (by the
 * same amount), unless they moved themselves in the same change; texts whose
 * stamp is gone are let go. Returns `next` itself when nothing follows.
 */
export function followStamps(prev: MMProject, next: MMProject): MMProject {
  if (prev === next) return next;
  const before = new Map<string, MMObject>();
  for (const l of prev.layers) for (const o of l.objects) before.set(o.id, o);
  const stamps = new Map<string, { x: number; y: number }>();
  let anyAttached = false;
  for (const l of next.layers)
    for (const o of l.objects) {
      if (o.kind === "stamp") stamps.set(o.id, o);
      else if (o.kind === "text" && o.attach) anyAttached = true;
    }
  if (!anyAttached) return next;
  let changed = false;
  const layers = next.layers.map((l) => {
    let layerChanged = false;
    const objects = l.objects.map((o) => {
      if (o.kind !== "text" || !o.attach) return o;
      const stamp = stamps.get(o.attach.to);
      if (!stamp) {
        layerChanged = true;
        return { ...o, attach: null };
      }
      const old = before.get(o.id);
      const textMoved = !old || old.kind !== "text" || old.x !== o.x || old.y !== o.y;
      const wantX = stamp.x + o.attach.dx,
        wantY = stamp.y + o.attach.dy;
      if (textMoved) {
        // Moved by hand: keep the new place relative to the stamp.
        if (old && old.kind === "text" && (Math.abs(o.x - wantX) > 1e-9 || Math.abs(o.y - wantY) > 1e-9)) {
          layerChanged = true;
          return { ...o, attach: { to: o.attach.to, dx: o.x - stamp.x, dy: o.y - stamp.y } };
        }
        return o;
      }
      if (Math.abs(o.x - wantX) < 1e-9 && Math.abs(o.y - wantY) < 1e-9) return o;
      layerChanged = true;
      return { ...o, ...shiftText(o, wantX - o.x, wantY - o.y) };
    });
    if (!layerChanged) return l;
    changed = true;
    return { ...l, objects };
  });
  return changed ? { ...next, layers } : next;
}

/** Copies of attached texts follow the copy of their stamp, or nothing. */
export function remapAttachments(clones: MMObject[], idMap: Map<string, string>): MMObject[] {
  return clones.map((c) => {
    if (c.kind !== "text" || !c.attach) return c;
    const to = idMap.get(c.attach.to);
    return { ...c, attach: to ? { ...c.attach, to } : null };
  });
}

/** A short name for a text (Objects list, search). */
export function textTitle(o: MMText): string {
  if (o.name) return o.name;
  const first = o.text.split("\n")[0].trim();
  return first.length > 48 ? `${first.slice(0, 47)}…` : first;
}
