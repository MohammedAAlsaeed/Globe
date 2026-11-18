"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs and signed URLs */
/**
 * A stamp's preview for panels and the catalog. Uploaded stamps show their
 * small preview picture (never the full picture, so a catalog of thousands
 * stays light); built-in vector art is drawn once at the size asked for, in
 * the given colours.
 */
import { useReducer } from "react";
import { stampAsset } from "./catalog";
import { stampThumb } from "./render";

export function StampThumb({
  asset,
  ink,
  fill,
  size = 128,
  full = false,
}: {
  asset: string;
  ink?: string;
  fill?: string | null;
  /** Vector art: the raster's size (px). */
  size?: number;
  /** Uploaded stamps: the picture itself, not its preview (a large view). */
  full?: boolean;
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const a = stampAsset(asset);
  if (a?.kind === "image") {
    const src = full ? a.url : (a.thumbUrl ?? a.url);
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        crossOrigin="anonymous"
      />
    );
  }
  const url = stampThumb(asset, ink, fill, redraw, size);
  return url ? (
    <img src={url} alt="" draggable={false} />
  ) : (
    <span className="mm-st-thumb-wait" />
  );
}
