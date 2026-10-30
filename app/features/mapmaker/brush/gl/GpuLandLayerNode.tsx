"use client";
/**
 * A land layer drawn by the GPU engine (./landGpu.ts).
 *
 * Only the part of the map on screen is composed — at screen resolution, so
 * the coast is sharp at every zoom — into one Konva image placed over that
 * part (with a margin, so a little scrolling needs no redraw). The object
 * being drawn with the Land tool comes through `liveLand` (not props: it
 * changes on every pointer move) and is drawn into the land itself, coast
 * and all, as the pointer moves.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import { makeCanvas } from "../engine";
import { onGlLost } from "./glContext";
import { GpuLandLayer, type LiveLand } from "./landGpu";
import type { CoastEffect, MMLand, MMPaint, PaintSource } from "../../types";

// ---- the object being drawn ---------------------------------------------------------
type Listener = () => void;
/** The Land tool's draft: which layer it is on, the object (mutated while
 * drawing) and a revision bumped on every change. */
export const liveLand = {
  layerId: null as string | null,
  obj: null as MMLand | null,
  rev: 0,
  listeners: new Set<Listener>(),
  set(layerId: string | null, obj: MMLand | null) {
    this.layerId = obj ? layerId : null;
    this.obj = obj;
    this.rev++;
    this.listeners.forEach((l) => l());
  },
  bump() {
    this.rev++;
    this.listeners.forEach((l) => l());
  },
  of(layerId: string): LiveLand | null {
    return this.layerId === layerId && this.obj
      ? { obj: this.obj, rev: this.rev }
      : null;
  },
};

// ---- registry (exports render through the same engine) ---------------------------------
const engines = new Map<
  string,
  { layer: GpuLandLayer; input: () => EngineInput }
>();
type EngineInput = {
  lands: MMLand[];
  paints: MMPaint[];
  base: PaintSource;
  fx: CoastEffect;
  seed: number;
};

/** The finished land layer at outW × outH from its GPU engine, or undefined
 * when the layer has none (the caller falls back to the CPU). */
export function exportGpuLand(
  layerId: string,
  outW: number,
  outH: number,
): HTMLCanvasElement | null | undefined {
  const e = engines.get(layerId);
  if (!e || !e.layer.alive) return undefined;
  const input = e.input();
  e.layer.update({ ...input, live: liveLand.of(layerId) });
  return e.layer.exportImage(outW, outH, input.base, input.paints);
}

/** The whole land layer, small (thumbnails), from its GPU engine; undefined
 * when the layer has none. */
export function snapshotGpuLand(
  layerId: string,
  w: number,
  h: number,
): HTMLCanvasElement | null | undefined {
  const e = engines.get(layerId);
  if (!e || !e.layer.alive) return undefined;
  if (e.layer.empty) return null;
  const src = e.layer.render({ x: 0, y: 0, w: 1, h: h / w }, w, h),
    out = makeCanvas(w, h);
  out.getContext("2d")!.drawImage(src, 0, 0);
  return out;
}

export interface StageView {
  /** The scrolling element the stage sits in, and the stage's box. */
  container: React.RefObject<HTMLElement | null>;
  box: React.RefObject<HTMLElement | null>;
}

/** Extra area composed around the visible part (fraction of its size). */
const OVERSCAN = 0.2;
/** Largest composed image side (device px). */
const MAX_OUT = 4096;

export const GpuLandLayerNode = memo(function GpuLandLayerNode({
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
  stage,
  onLandChange,
  onFail,
}: {
  layerId: string;
  lands: MMLand[];
  paints: MMPaint[];
  base: PaintSource;
  fx: CoastEffect;
  seed: number;
  /** Stage (display) size. */
  W: number;
  H: number;
  projectW: number;
  projectH: number;
  /** The map's left and right edges meet (MMProject.seamless). */
  wrap?: boolean;
  stage: StageView;
  onLandChange?: (layerId: string, land: HTMLCanvasElement | null) => void;
  /** The GPU engine can't run (lost context, out of memory): use the CPU. */
  onFail: () => void;
}) {
  const nodeRef = useRef<Konva.Image>(null),
    engineRef = useRef<GpuLandLayer | null>(null),
    canvasRef = useRef<HTMLCanvasElement | null>(null),
    shownRef = useRef<{
      x: number;
      y: number;
      w: number;
      h: number;
      W: number;
      px: number;
    } | null>(null),
    frameRef = useRef(0),
    coverTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    propsRef = useRef({ lands, paints, base, fx, seed, W, H });
  useLayoutEffect(() => {
    propsRef.current = { lands, paints, base, fx, seed, W, H };
  });

  const engine = useCallback(() => {
    let e = engineRef.current;
    if (e && !e.alive) e = engineRef.current = null;
    if (!e) {
      try {
        e = engineRef.current = new GpuLandLayer(projectW, projectH, wrap);
      } catch {
        onFail();
        return null;
      }
      engines.set(layerId, {
        layer: e,
        input: () => {
          const p = propsRef.current;
          return {
            lands: p.lands,
            paints: p.paints,
            base: p.base,
            fx: p.fx,
            seed: p.seed,
          };
        },
      });
    }
    return e;
  }, [projectW, projectH, wrap, layerId, onFail]);

  /** The part of the stage to compose (stage px), visible area + margin. */
  const visibleRect = useCallback(() => {
    const { W: sw, H: sh } = propsRef.current,
      c = stage.container.current,
      b = stage.box.current;
    if (!c || !b) return { x: 0, y: 0, w: sw, h: sh };
    const cr = c.getBoundingClientRect(),
      br = b.getBoundingClientRect(),
      x0 = Math.max(0, cr.left - br.left),
      y0 = Math.max(0, cr.top - br.top),
      x1 = Math.min(sw, cr.right - br.left),
      y1 = Math.min(sh, cr.bottom - br.top);
    if (x1 <= x0 || y1 <= y0) return null;
    const mx = (x1 - x0) * OVERSCAN,
      my = (y1 - y0) * OVERSCAN;
    const x = Math.max(0, Math.floor(x0 - mx)),
      y = Math.max(0, Math.floor(y0 - my));
    return {
      x,
      y,
      w: Math.min(sw, Math.ceil(x1 + mx)) - x,
      h: Math.min(sh, Math.ceil(y1 + my)) - y,
      vis: { x0, y0, x1, y1 },
    };
  }, [stage]);

  /** Composes the visible part into the node's canvas. */
  const draw = useCallback(
    (force: boolean) => {
      const e = engineRef.current,
        node = nodeRef.current;
      if (!e || !node) return;
      const { W: sw } = propsRef.current,
        r = visibleRect();
      if (!r) return;
      const shown = shownRef.current,
        px0 = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      // Still inside what was composed at this zoom: nothing to do.
      if (
        !force &&
        shown &&
        shown.W === sw &&
        "vis" in r &&
        r.vis &&
        r.vis.x0 >= shown.x &&
        r.vis.y0 >= shown.y &&
        r.vis.x1 <= shown.x + shown.w &&
        r.vis.y1 <= shown.y + shown.h
      )
        return;
      if (e.empty) {
        node.visible(false);
        node.getLayer()?.batchDraw();
        shownRef.current = null;
        return;
      }
      const px = Math.min(px0, MAX_OUT / r.w, MAX_OUT / r.h),
        ow = Math.max(1, Math.round(r.w * px)),
        oh = Math.max(1, Math.round(r.h * px));
      const src = e.render(
        { x: r.x / sw, y: r.y / sw, w: r.w / sw, h: r.h / sw },
        ow,
        oh,
      );
      let c = canvasRef.current;
      if (!c || c.width !== ow || c.height !== oh)
        c = canvasRef.current = makeCanvas(ow, oh);
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      node.setAttrs({
        image: c,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        visible: true,
      });
      node.getLayer()?.batchDraw();
      shownRef.current = { x: r.x, y: r.y, w: r.w, h: r.h, W: sw, px };
    },
    [visibleRect],
  );

  /** The land coverage for paint previews (after a quiet moment). */
  const publishCoverage = useCallback(() => {
    if (coverTimer.current) clearTimeout(coverTimer.current);
    coverTimer.current = setTimeout(() => {
      const e = engineRef.current;
      if (e?.alive) onLandChange?.(layerId, e.coverage());
    }, 120);
  }, [layerId, onLandChange]);

  /** Updates the engine from the latest props and the live draft, then
   * redraws (at most once per frame). */
  const schedule = useCallback(
    (publish: boolean) => {
      if (frameRef.current) {
        if (publish) publishCoverage();
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const e = engine();
        if (!e) return;
        const p = propsRef.current;
        let changed: boolean;
        try {
          changed = e.update({
            lands: p.lands,
            paints: p.paints,
            base: p.base,
            fx: p.fx,
            seed: p.seed,
            live: liveLand.of(layerId),
          });
        } catch {
          engineRef.current = null;
          onFail();
          return;
        }
        draw(changed);
      });
      if (publish) publishCoverage();
    },
    [engine, draw, layerId, onFail, publishCoverage],
  );

  // props changed → update (and publish the new land coverage)
  useLayoutEffect(() => {
    schedule(true);
  }, [lands, paints, base, fx, seed, schedule]);
  // zoom changed → recompose
  useLayoutEffect(() => {
    shownRef.current = null;
    schedule(false);
  }, [W, H, schedule]);
  // live drawing, scrolling, resizing
  useEffect(() => {
    const onLive = () => {
      if (liveLand.layerId === layerId || shownRef.current) schedule(false);
    };
    liveLand.listeners.add(onLive);
    const onScroll = () => {
      if (!frameRef.current)
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0;
          draw(false);
        });
    };
    // The stage's own children mount before the elements around the stage
    // get their refs: wait a frame for them when they aren't there yet.
    // Watched: scrolling, the view's size, and the room around the map (it
    // changes with the view and moves the map without any scrolling).
    let c: HTMLElement | null = null,
      ro: ResizeObserver | null = null,
      wait = 0;
    const attach = () => {
      c = stage.container.current;
      if (!c) {
        wait = requestAnimationFrame(attach);
        return;
      }
      c.addEventListener("scroll", onScroll, { passive: true });
      ro = new ResizeObserver(onScroll);
      ro.observe(c);
      const room = stage.box.current?.parentElement;
      if (room) ro.observe(room);
      onScroll();
    };
    attach();
    const offLost = onGlLost(() => {
      engineRef.current = null;
      schedule(true);
    });
    return () => {
      cancelAnimationFrame(wait);
      liveLand.listeners.delete(onLive);
      c?.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      offLost();
    };
  }, [layerId, stage, schedule, draw]);
  // teardown
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      if (coverTimer.current) clearTimeout(coverTimer.current);
      engineRef.current?.dispose();
      engineRef.current = null;
      engines.delete(layerId);
      onLandChange?.(layerId, null);
    },
    [layerId, projectW, projectH, wrap, onLandChange],
  );

  return (
    <KonvaImage
      ref={nodeRef}
      image={undefined}
      id={`land-${layerId}`}
      name="mm-land"
      visible={false}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
});
