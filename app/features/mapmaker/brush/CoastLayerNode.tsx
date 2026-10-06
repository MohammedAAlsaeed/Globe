"use client";
/**
 * Renders a layer's paint through the coast effect: one shared coastline
 * around everything painted in the layer, with its water effects.
 *
 * The effect is rebuilt in a worker whenever the layer's paint or coast
 * settings change. Until it's ready, paint objects that aren't in the current
 * coast image yet are drawn as-is on top (erasers erase through the image
 * too), so a new stroke appears instantly and nothing ever blinks out.
 */
import { memo, useEffect, useRef, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import { PaintNode } from "./PaintNode";
import { COAST_QUICK, coastScreenSize, renderCoastLayer } from "./coastLayer";
import type { CoastEffect, MMPaint } from "../types";

type Result = { canvas: HTMLCanvasElement | null; ids: Set<string> };

function sameRefs(a: MMPaint[], b: MMPaint[]) {
  return a.length === b.length && a.every((o, i) => o === b[i]);
}

export const CoastLayerNode = memo(function CoastLayerNode({
  layerId,
  paints,
  fx,
  seed,
  W,
  H,
  projectW,
  projectH,
  onBusyChange,
}: {
  layerId: string;
  paints: MMPaint[];
  fx: CoastEffect;
  seed: number;
  /** Display size. */
  W: number;
  H: number;
  projectW: number;
  projectH: number;
  onBusyChange?: (layerId: string, busy: boolean) => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const last = useRef<{ paints: MMPaint[]; fx: CoastEffect } | null>(null),
    token = useRef(0);

  useEffect(() => {
    const prev = last.current;
    if (prev && sameRefs(prev.paints, paints) && prev.fx === fx) return;
    const settingsOnly = !!prev && sameRefs(prev.paints, paints);
    last.current = { paints, fx };
    const my = ++token.current;
    // Paint edits rebuild right away; slider drags are debounced a little.
    const timer = setTimeout(
      async () => {
        onBusyChange?.(layerId, true);
        const ids = new Set(paints.map((o) => o.id)),
          sharp = coastScreenSize(projectW, projectH),
          quick = coastScreenSize(projectW, projectH, COAST_QUICK);
        try {
          // Quick pass first, so the new coast shows almost immediately…
          if (quick.W < sharp.W) {
            const canvas = await renderCoastLayer(
              paints,
              fx,
              seed,
              quick.W,
              quick.H,
            );
            if (my !== token.current) return;
            setResult({ canvas, ids });
          }
          // …then the sharp one replaces it.
          const canvas = await renderCoastLayer(
            paints,
            fx,
            seed,
            sharp.W,
            sharp.H,
          );
          if (my === token.current) setResult({ canvas, ids });
        } finally {
          if (my === token.current) onBusyChange?.(layerId, false);
        }
      },
      settingsOnly ? 140 : 30,
    );
    return () => clearTimeout(timer);
  }, [paints, fx, seed, projectW, projectH, layerId, onBusyChange]);

  // Make sure a busy flag never outlives the layer.
  useEffect(
    () => () => onBusyChange?.(layerId, false),
    [layerId, onBusyChange],
  );

  const pendingPaint = result
    ? paints.filter((o) => !result.ids.has(o.id))
    : paints;
  return (
    <>
      <KonvaImage
        id={`coast-${layerId}`}
        name="mm-coast"
        image={result?.canvas ?? undefined}
        visible={!!result?.canvas}
        width={W}
        height={H}
        listening={false}
        perfectDrawEnabled={false}
      />
      {pendingPaint.map((o) => (
        <PaintNode key={o.id} o={o} W={W} H={H} plain />
      ))}
    </>
  );
});
