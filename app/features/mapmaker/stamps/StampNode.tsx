"use client";
/**
 * One placed stamp on the canvas: its picture as a Konva.Image, centered on
 * (x, y), rotated, flipped, faded and shadowed.
 *
 * The picture is a shared raster from ./render, sized for the current zoom
 * and screen; printing swaps in a full-resolution one (see the editor's
 * renderMapCanvas). The shadow is the canvas's own drop shadow: it falls
 * the same way however the stamp is rotated, like real light.
 */
import { memo, useEffect, useReducer, useSyncExternalStore } from "react";
import { Group, Image as KonvaImage, Rect } from "react-konva";
import type Konva from "konva";
import type { MMStamp, ShadowSettings } from "../types";
import { catalogVersion, subscribeCatalog } from "./catalog";
import { stampExtent } from "./geometry";
import { stampPicture, stampRaster } from "./render";

type Handlers = {
  id: string;
  listening: boolean;
  draggable: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
  onDragStart: () => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
};

/** Name of the picture node inside a stamp's group (print swaps its image). */
export const STAMP_IMAGE = "stampImage";

/** Device pixels per CSS pixel, capped (sharp on retina, not wasteful). */
const dpr = () => (typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1));

export const StampNode = memo(function StampNode({
  o,
  W,
  H,
  shadow,
  op,
  handlers,
}: {
  o: MMStamp;
  W: number;
  H: number;
  shadow: ShadowSettings | null;
  /** How it's composited in its layer (see stampCompositeOp). */
  op?: GlobalCompositeOperation;
  /** Selection and dragging (omitted for the live scatter preview). */
  handlers?: Handlers;
}) {
  const [, loaded] = useReducer((n: number) => n + 1, 0);
  // Uploaded stamps appear once the server's library has been loaded.
  useSyncExternalStore(subscribeCatalog, catalogVersion, catalogVersion);
  const { w, h } = stampExtent(o, W),
    image = stampPicture(o, w * dpr(), W, H);
  // An uploaded image may still be loading: draw again once it arrives.
  useEffect(() => {
    if (!image) stampRaster(o, w * dpr(), loaded);
  }, [image, o, w]);

  // The group sits at the pivot and carries rotation and the Transformer's
  // resizing; the flips live on the picture inside it, so the selection box
  // (and its rotate handle) always stays upright. A base pivot draws the
  // picture upward from (x, y), so it grows and turns standing on the ground.
  const flip = {
    width: w,
    height: h,
    offsetX: w / 2,
    offsetY: o.pivot === "base" ? h : h / 2,
    scaleX: o.flipX ? -1 : 1,
    scaleY: o.flipY ? -1 : 1,
  };
  // The canvas shadow is in screen space; a flipped picture would mirror it.
  const a = ((shadow?.angle ?? 0) * Math.PI) / 180,
    d = (shadow?.distance ?? 0) * w;
  return (
    <Group {...handlers} listening={handlers?.listening ?? false} x={o.x * W} y={o.y * H} rotation={o.rotation}>
      {image ? (
        <KonvaImage
          {...flip}
          name={STAMP_IMAGE}
          image={image}
          opacity={o.opacity}
          globalCompositeOperation={op}
          shadowEnabled={!!shadow && op !== "destination-out"}
          shadowColor={shadow?.color}
          shadowOpacity={shadow?.opacity}
          shadowBlur={(shadow?.blur ?? 0) * w}
          shadowOffsetX={Math.cos(a) * d * (o.flipX ? -1 : 1)}
          shadowOffsetY={Math.sin(a) * d * (o.flipY ? -1 : 1)}
          perfectDrawEnabled={false}
        />
      ) : (
        // Missing or still loading: a faint box, so it can still be selected.
        <Rect {...flip} stroke="rgba(255,255,255,0.5)" dash={[4, 3]} strokeWidth={1} fill="rgba(255,255,255,0.05)" />
      )}
    </Group>
  );
});
