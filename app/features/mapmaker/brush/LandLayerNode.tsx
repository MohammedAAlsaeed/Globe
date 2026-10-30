"use client";
/**
 * Renders a land layer: its land shapes, textured and wrapped in one shared
 * coastline with its water effects (see ./landLayer.ts).
 *
 * The layer image is rebuilt in a worker whenever the layer's land, texture
 * or coast settings change — first a quick pass, then a sharp one. Until an
 * edit is part of the image, it is drawn on top straight away, so nothing
 * ever lags or blinks:
 *  - new land: its shape in the base texture (removed land cuts through);
 *  - new texture paint: clipped to the current land, erasers restoring the
 *    base texture.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import { colorize, makeCanvas } from "./engine";
import {
  LAND_QUICK,
  drawTexturePaint,
  landScreenSize,
  rasterAt,
  renderLandLayer,
  type LandLayerImage,
} from "./landLayer";
import { gpuAvailable } from "./gl/glContext";
import { GpuLandLayerNode, type StageView } from "./gl/GpuLandLayerNode";
import type { CoastEffect, MMLand, MMPaint, PaintSource } from "../types";

type Result = LandLayerImage & { ids: Set<string> };

function sameRefs<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every((o, i) => o === b[i]);
}

/** Node name shared by the not-yet-merged overlays (hidden when printing). */
export const LAND_PENDING_NAME = "mm-land-pending";
/** Id of the layer image node (swapped for a full-size image when printing). */
export const landImageId = (layerId: string) => `land-${layerId}`;

type NodeProps = {
  layerId: string;
  lands: MMLand[];
  paints: MMPaint[];
  base: PaintSource;
  fx: CoastEffect;
  seed: number;
  /** Display size. */
  W: number;
  H: number;
  projectW: number;
  projectH: number;
  /** The map's left and right edges meet (MMProject.seamless). */
  wrap?: boolean;
  onBusyChange?: (layerId: string, busy: boolean) => void;
  /** The current land coverage (alpha canvas), or null when there's no land. */
  onLandChange?: (layerId: string, land: HTMLCanvasElement | null) => void;
};

/** Whether land layers are drawn by the GPU engine (live coast, sharp at
 * every zoom); false where WebGL2 is missing or the GPU engine failed. */
let gpuFailed = false;
export function landOnGpu() {
  return !gpuFailed && gpuAvailable();
}

/**
 * A land layer: drawn by the GPU engine where WebGL2 is available, else by
 * the CPU coast worker.
 */
export const LandLayerNode = memo(function LandLayerNode(
  props: NodeProps & { stage: StageView },
) {
  const [gpu, setGpu] = useState(landOnGpu);
  const onFail = useCallback(() => {
    gpuFailed = true;
    setGpu(false);
  }, []);
  if (gpu) return <GpuLandLayerNode {...props} onFail={onFail} />;
  return <CpuLandLayerNode {...props} />;
});

/** The CPU path: the coast worker (see ./landLayer.ts). */
const CpuLandLayerNode = memo(function CpuLandLayerNode({
  layerId,
  lands,
  paints,
  base,
  fx,
  seed,
  W,
  H,
  projectW,
  projectH,
  wrap = false,
  onBusyChange,
  onLandChange,
}: {
  layerId: string;
  lands: MMLand[];
  paints: MMPaint[];
  base: PaintSource;
  fx: CoastEffect;
  seed: number;
  /** Display size. */
  W: number;
  H: number;
  projectW: number;
  projectH: number;
  wrap?: boolean;
  onBusyChange?: (layerId: string, busy: boolean) => void;
  /** The current land coverage (alpha canvas), or null when there's no land. */
  onLandChange?: (layerId: string, land: HTMLCanvasElement | null) => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const last = useRef<{
      lands: MMLand[];
      paints: MMPaint[];
      base: PaintSource;
      fx: CoastEffect;
      wrap: boolean;
    } | null>(null),
    token = useRef(0),
    timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The rebuild is scheduled once per real change. Its timer lives in a
  // ref, not in the effect's cleanup: a re-render that changes nothing
  // (new array, same objects) must not cancel a rebuild still waiting.
  useEffect(() => {
    const prev = last.current;
    const sameLand = !!prev && sameRefs(prev.lands, lands),
      samePaint = !!prev && sameRefs(prev.paints, paints);
    if (
      prev &&
      sameLand &&
      samePaint &&
      prev.base === base &&
      prev.fx === fx &&
      prev.wrap === wrap
    )
      return;
    // Drawing rebuilds right away; slider drags are debounced a little.
    const settingsOnly = sameLand && samePaint;
    last.current = { lands, paints, base, fx, wrap };
    const my = ++token.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      async () => {
        onBusyChange?.(layerId, true);
        const input = { layerId, lands, paints, base, fx, seed, wrap },
          ids = new Set([...lands, ...paints].map((o) => o.id)),
          sharp = landScreenSize(projectW, projectH),
          quick = landScreenSize(projectW, projectH, LAND_QUICK);
        try {
          // Quick pass first, so the new coast shows almost immediately…
          if (quick.W < sharp.W) {
            const img = await renderLandLayer(input, quick.W, quick.H);
            if (my !== token.current) return;
            setResult(img && { ...img, ids });
          }
          // …then the sharp one replaces it.
          const img = await renderLandLayer(input, sharp.W, sharp.H);
          if (my === token.current) setResult(img && { ...img, ids });
        } finally {
          if (my === token.current) onBusyChange?.(layerId, false);
        }
      },
      settingsOnly ? 140 : 30,
    );
  }, [
    lands,
    paints,
    base,
    fx,
    seed,
    projectW,
    projectH,
    wrap,
    layerId,
    onBusyChange,
  ]);

  useEffect(() => {
    onLandChange?.(layerId, result?.land ?? null);
  }, [result, layerId, onLandChange]);
  // Make sure no busy flag or land mask outlives the layer.
  useEffect(
    () => () => {
      // Unmounted (or, in development, unmounted and mounted again): the
      // next mount must schedule its own rebuild.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      last.current = null;
    },
    [],
  );
  useEffect(
    () => () => {
      onBusyChange?.(layerId, false);
      onLandChange?.(layerId, null);
    },
    [layerId, onBusyChange, onLandChange],
  );

  const pendingLands = useMemo(
    () => (result ? lands.filter((o) => !result.ids.has(o.id)) : lands),
    [result, lands],
  );
  // New land in the base texture; removed land as a cut-out.
  const landOverlays = useMemo(
    () =>
      pendingLands.flatMap((o) => {
        const r = rasterAt(o, W, H);
        if (!r) return [];
        const image = o.erase
          ? r.canvas
          : colorize(r.canvas, base, W, r.x, r.y);
        return [{ o, r, image }];
      }),
    [pendingLands, base, W, H],
  );
  const pendingPaints = useMemo(
    () => (result ? paints.filter((o) => !result.ids.has(o.id)) : []),
    [result, paints],
  );
  // New texture paint, composited over the land texture and clipped to the
  // land as it currently is.
  const paintOverlay = useMemo(() => {
    if (!result || !pendingPaints.length) return null;
    const c = makeCanvas(W, H),
      ctx = c.getContext("2d")!;
    drawTexturePaint(ctx, pendingPaints, base, W, H);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(result.land, 0, 0, W, H);
    return c;
  }, [result, pendingPaints, base, W, H]);

  return (
    <>
      <KonvaImage
        id={landImageId(layerId)}
        name="mm-land"
        image={result?.image}
        visible={!!result}
        width={W}
        height={H}
        listening={false}
        perfectDrawEnabled={false}
      />
      {paintOverlay && (
        <KonvaImage
          name={LAND_PENDING_NAME}
          image={paintOverlay}
          width={W}
          height={H}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {landOverlays.map(({ o, r, image }) => (
        <KonvaImage
          key={o.id}
          name={LAND_PENDING_NAME}
          image={image}
          x={r.x}
          y={r.y}
          globalCompositeOperation={o.erase ? "destination-out" : "source-over"}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
});
