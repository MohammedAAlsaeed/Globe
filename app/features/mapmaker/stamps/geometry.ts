/**
 * Where a stamp sits: its size on the stage, its center, and moving its
 * pivot without moving the stamp. Pure math (no canvas), shared by the
 * canvas node, clip-mask textures and the panel.
 *
 * (x, y) is the stamp's pivot: its base or its center (MMStamp.pivot). The
 * picture is drawn upward from a base pivot — mirrored upside down, below it.
 */
import type { MMStamp, StampPivot } from "../types";
import { assetSize, stampAsset } from "./catalog";

/** Height / width of an asset (1 when it's unknown). */
export function stampAspect(assetKey: string) {
  const a = stampAsset(assetKey);
  if (!a) return 1;
  const { w, h } = assetSize(a);
  return w > 0 ? h / w : 1;
}

/** Width and height on a stage W px wide. */
export function stampExtent(
  o: Pick<MMStamp, "asset" | "size" | "stretch">,
  W: number,
) {
  const w = Math.max(1, o.size * W);
  return { w, h: w * stampAspect(o.asset) * (o.stretch ?? 1) };
}

/** From the pivot to the picture's center, in stage px (rotation applied). */
function pivotToCenter(
  o: Pick<
    MMStamp,
    "asset" | "size" | "stretch" | "rotation" | "flipY" | "pivot"
  >,
  W: number,
) {
  if ((o.pivot ?? "center") === "center") return { dx: 0, dy: 0 };
  const { h } = stampExtent(o, W),
    up = (o.flipY ? 1 : -1) * (h / 2),
    a = (o.rotation * Math.PI) / 180;
  // Konva turns clockwise (y down): (0, up) rotated by a.
  return { dx: -up * Math.sin(a), dy: up * Math.cos(a) };
}

/** The picture's center on a W × H stage. */
export function stampCenter(o: MMStamp, W: number, H: number) {
  const d = pivotToCenter(o, W);
  return { x: o.x * W + d.dx, y: o.y * H + d.dy };
}

/** The same stamp, anchored at another pivot (it doesn't move on the map). */
export function repivot(
  o: MMStamp,
  pivot: StampPivot,
  W: number,
  H: number,
): Pick<MMStamp, "x" | "y" | "pivot"> {
  if ((o.pivot ?? "center") === pivot) return { x: o.x, y: o.y, pivot };
  const from = pivotToCenter(o, W),
    to = pivotToCenter({ ...o, pivot }, W);
  return {
    x: o.x + (from.dx - to.dx) / W,
    y: o.y + (from.dy - to.dy) / H,
    pivot,
  };
}
