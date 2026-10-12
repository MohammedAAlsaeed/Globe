/**
 * Maps saved before the Stamp Tool used "icon" objects (24×24 line-art
 * symbols). They open as stamps from the Classic pack, placed, sized and
 * colored exactly as before.
 */
import type { MMIcon, MMObject, MMProject, MMStamp } from "../types";
import { classicKey } from "./state";

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

/** The project with any legacy icons converted (the same object if none). */
export function migrateProject(p: MMProject): MMProject {
  const isIcon = (o: MMObject | MMIcon): o is MMIcon => o.kind === "icon";
  if (!p.layers.some((l) => (l.objects as (MMObject | MMIcon)[]).some(isIcon))) return p;
  return {
    ...p,
    layers: p.layers.map((l) => ({
      ...l,
      objects: (l.objects as (MMObject | MMIcon)[]).map((o) => (isIcon(o) ? iconToStamp(o) : o)),
    })),
  };
}
