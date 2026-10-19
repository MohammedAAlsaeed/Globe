"use client";
/**
 * The image the globe is made from: the source itself when it is already
 * 2:1 (or a Mercator map), else a 2:1 version of it — the map kept in
 * proportion on its sea, or stretched (see ../domain/fit).
 */
import { useEffect, useRef, useState } from "react";
import { fitRect, needsFit } from "../domain/fit";
import { maxCanvasPixels } from "../../../lib/canvasLimits";
import type { GlobeSettings } from "../domain/types";
import type { SourceState } from "./useSource";

async function fitted(source: SourceState, mode: "contain" | "stretch", fill: string): Promise<SourceState> {
  const image = await createImageBitmap(source.blob),
    // 2:1, so width² / 2 pixels: kept within what this device can draw.
    r = fitRect(image.width, image.height, mode, Math.min(16384, Math.floor(Math.sqrt(2 * maxCanvasPixels())))),
    canvas = document.createElement("canvas");
  canvas.width = r.canvas.width;
  canvas.height = r.canvas.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, r.map.x, r.map.y, r.map.width, r.map.height);
  image.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("errorImage"))), "image/png"));
  canvas.width = canvas.height = 0;
  return { blob, url: URL.createObjectURL(blob), filename: source.filename, width: r.canvas.width, height: r.canvas.height };
}

export function useGlobeSource(source: SourceState | null, globe: GlobeSettings) {
  const mode = globe.fit ?? "contain",
    fill = globe.fill ?? "#2c5678",
    applies = !!source && globe.sourceProjection === "equirectangular" && needsFit(source.width, source.height),
    key = applies ? `${source!.url}|${mode}|${fill}` : "";
  const [result, setResult] = useState<{ key: string; source: SourceState } | null>(null);
  // The image on screen. It is released only once its replacement is shown
  // (or the page closes) — never on a timer, which could pull it out from
  // under the preview while a large map is still being fitted.
  const shown = useRef<SourceState | null>(null);
  useEffect(() => {
    if (!applies || !source) return;
    let live = true;
    // A short pause: picking a colour fires many changes.
    const timer = setTimeout(() => {
      fitted(source, mode, fill).then(
        (s) => {
          if (!live) return URL.revokeObjectURL(s.url);
          const old = shown.current;
          shown.current = s;
          setResult({ key, source: s });
          // The preview switches to the new image on the next render.
          if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1000);
        },
        () => {},
      );
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [applies, source, mode, fill, key]);
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current.url);
    },
    [],
  );
  if (!source) return { source: null, pending: false, fitted: false };
  if (!applies) return { source, pending: false, fitted: false };
  return result && result.key === key ? { source: result.source, pending: false, fitted: true } : { source: result?.source ?? null, pending: true, fitted: true };
}
