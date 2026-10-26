"use client";
/**
 * Shows the area a Remove-land draft covers while it is being drawn.
 *
 * Adding land needs no help: the land appears as you draw. Removing it only
 * opens water where land already is, so over the sea — or wherever the
 * shape reaches past the coast — you can't see what the draft covers. This
 * overlay draws it: a red tint over the exact area (the same geometry the
 * land engine uses, natural edge included) and a contrasting dashed outline
 * that reads on land and on water.
 *
 * The draft comes through `landDraft` (it changes on every pointer move);
 * the overlay redraws itself without re-rendering React.
 */
import { memo, useEffect, useRef } from "react";
import { Shape } from "react-konva";
import type Konva from "konva";
import { shapePolygons } from "./engine";
import { landStroke } from "./land";
import type { MMLand } from "../types";

type Listener = () => void;
/** The Remove-land draft being drawn (mutated while drawing) and a revision
 * bumped on every change. */
export const landDraft = {
  obj: null as MMLand | null,
  rev: 0,
  listeners: new Set<Listener>(),
  set(obj: MMLand | null) {
    if (!obj && !this.obj) return;
    this.obj = obj;
    this.rev++;
    this.listeners.forEach((l) => l());
  },
  bump() {
    if (!this.obj) return;
    this.rev++;
    this.listeners.forEach((l) => l());
  },
};

const TINT = "rgba(232, 64, 64, 0.26)",
  HALO = "rgba(20, 22, 26, 0.75)",
  INK = "#ffffff",
  ACCENT = "#ff5a5a";

type Geometry =
  | { kind: "polys"; polys: { x: number; y: number }[][] }
  | { kind: "stroke"; line: { x: number; y: number }[]; radius: number };

function geometry(o: MMLand, aspect: number): Geometry | null {
  if (o.mode === "free") {
    if (!o.size || !o.points.length) return null;
    const s = landStroke(o, aspect);
    return { kind: "stroke", line: s.line, radius: s.radius };
  }
  const polys = shapePolygons(o, aspect, true).filter((p) => p.length >= 3);
  return polys.length ? { kind: "polys", polys } : null;
}

export const LandDraftOutline = memo(function LandDraftOutline({
  W,
  H,
}: {
  /** Stage (display) size. */
  W: number;
  H: number;
}) {
  const shapeRef = useRef<Konva.Shape>(null),
    cache = useRef<{ rev: number; aspect: number; g: Geometry | null }>({
      rev: -1,
      aspect: 0,
      g: null,
    });

  useEffect(() => {
    let frame = 0;
    const redraw = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = shapeRef.current;
        if (!node) return;
        node.visible(!!landDraft.obj);
        node.getLayer()?.batchDraw();
      });
    };
    landDraft.listeners.add(redraw);
    redraw();
    return () => {
      landDraft.listeners.delete(redraw);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Shape
      ref={shapeRef}
      listening={false}
      perfectDrawEnabled={false}
      visible={false}
      sceneFunc={(kctx) => {
        const o = landDraft.obj;
        if (!o) return;
        const aspect = H / W,
          c = cache.current;
        if (c.rev !== landDraft.rev || c.aspect !== aspect) {
          c.rev = landDraft.rev;
          c.aspect = aspect;
          c.g = geometry(o, aspect);
        }
        const g = c.g;
        if (!g) return;
        const ctx = kctx._context;
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        if (g.kind === "polys") {
          ctx.beginPath();
          for (const poly of g.polys) {
            ctx.moveTo(poly[0].x * W, poly[0].y * W);
            for (let i = 1; i < poly.length; i++)
              ctx.lineTo(poly[i].x * W, poly[i].y * W);
            ctx.closePath();
          }
          ctx.fillStyle = TINT;
          ctx.fill("evenodd");
          ctx.lineWidth = 3;
          ctx.strokeStyle = HALO;
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = INK;
          ctx.stroke();
          ctx.lineDashOffset = 6;
          ctx.setLineDash([4, 6]);
          ctx.strokeStyle = ACCENT;
          ctx.stroke();
        } else {
          // The brush trail: a band as wide as the brush.
          const line = g.line.length === 1 ? [g.line[0], g.line[0]] : g.line;
          ctx.beginPath();
          ctx.moveTo(line[0].x * W, line[0].y * W);
          for (let i = 1; i < line.length; i++)
            ctx.lineTo(line[i].x * W, line[i].y * W);
          ctx.lineWidth = Math.max(1, g.radius * 2 * W);
          ctx.strokeStyle = TINT;
          ctx.stroke();
        }
        ctx.restore();
      }}
    />
  );
});
