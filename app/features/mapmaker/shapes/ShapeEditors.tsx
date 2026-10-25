"use client";
/**
 * On-canvas editors of one shape (drawn above the map, never printed):
 *
 *   ShapePartsEditor  every path of the shape outlined; click one to pick
 *                     it, then reshape it with the Line Tool's node editor
 *                     (drag nodes and handles, click the outline to add a
 *                     node, double-click a node: corner ⇄ smooth), or drag
 *                     its move handle to slide the whole part (a hole, a
 *                     tower) — the outline is worked out again live
 *   ShapeDoorsEditor  the shape's doors: drag one along its wall (or onto
 *                     another wall), drag its ends to widen it, click to
 *                     select it (Delete removes it)
 *
 * Both preview imperatively (onPreview) and commit one undo step when a
 * drag ends (onCommit). Handle sizes are screen-constant.
 */
import { useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Line, Rect, Shape } from "react-konva";
import type { MMLine, MMShape, ShapePath, ShapePortal } from "../types";
import { LineNodeEditor } from "../lines/LineNodeEditor";
import { tracePath } from "../lines/render";
import type { LineNode, Vec } from "../lines/geometry";
import {
  findPath,
  nearestPath,
  paths,
  portalPoint,
  type ShapeOutline,
} from "./geometry";

const ACCENT = "#f2a65a",
  INK = "#1b1f24",
  SOFT = "rgba(242,166,90,0.55)";

const raw = (c: unknown) =>
  (c as { _context: CanvasRenderingContext2D })._context;
const cursor = (e: Konva.KonvaEventObject<MouseEvent>, c: string) => {
  const s = e.target.getStage()?.container();
  if (s) s.style.cursor = c;
};

/** The nodes' centre (pixels), where a part's move handle sits. */
function centre(nodes: LineNode[], w: number, h: number): Vec {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x * w);
    x1 = Math.max(x1, n.x * w);
    y0 = Math.min(y0, n.y * h);
    y1 = Math.max(y1, n.y * h);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

export function ShapePartsEditor({
  shape,
  W,
  H,
  part,
  onPickPart,
  nodeSel,
  onSelectNodes,
  onPreview,
  onCommit,
  snap,
}: {
  shape: MMShape;
  W: number;
  H: number;
  /** The path being reshaped (null: pick one). */
  part: string | null;
  onPickPart: (id: string) => void;
  nodeSel: number[];
  onSelectNodes: (sel: number[]) => void;
  /** Live: the path's nodes while dragging. */
  onPreview: (pathId: string, nodes: LineNode[]) => void;
  /** Done: one undo step. */
  onCommit: (pathId: string, nodes: LineNode[]) => void;
  snap: (p: Vec) => Vec;
}) {
  const all = useMemo(() => paths(shape.parts), [shape.parts]);
  const picked = part ? findPath(shape.parts, part) : null;
  // The node editor works on lines: a picked path, seen as a closed line.
  const asLine = useMemo(
    () =>
      picked
        ? ({
            id: picked.id,
            kind: "line",
            nodes: picked.nodes,
            closed: true,
          } as MMLine)
        : null,
    [picked],
  );
  const move = useRef<{ start: Vec; nodes: LineNode[] } | null>(null);
  const [moving, setMoving] = useState<{
    id: string;
    nodes: LineNode[];
  } | null>(null);
  const shown = (p: ShapePath) =>
    moving && moving.id === p.id ? moving.nodes : p.nodes;
  return (
    <Group name="shapePartsEditor">
      {/* Every path, thin and dashed; click one to pick it. */}
      {all.map((p) => (
        <Shape
          key={p.id}
          sceneFunc={(ctx) => {
            const c = raw(ctx);
            c.beginPath();
            tracePath(c, shown(p), true, W, H);
            c.lineWidth = p.id === part ? 1.4 : 1;
            c.strokeStyle = p.id === part ? ACCENT : SOFT;
            c.setLineDash(p.op === "add" ? [5, 3] : [2, 3]);
            c.stroke();
          }}
          hitFunc={(ctx, s) => {
            if (p.id === part) return;
            const c = raw(ctx);
            c.beginPath();
            tracePath(c, p.nodes, true, W, H);
            c.lineWidth = 12;
            c.strokeStyle = s.colorKey;
            c.stroke();
          }}
          onPointerDown={(e) => {
            if (e.evt.button !== 0) return;
            e.cancelBubble = true;
            onPickPart(p.id);
          }}
          onMouseEnter={(e) => p.id !== part && cursor(e, "pointer")}
          onMouseLeave={(e) => cursor(e, "")}
        />
      ))}
      {asLine && picked && (
        <>
          <LineNodeEditor
            line={asLine}
            W={W}
            H={H}
            selected={nodeSel}
            onSelect={onSelectNodes}
            onPreview={(nodes) => onPreview(picked.id, nodes)}
            onCommit={(nodes) => onCommit(picked.id, nodes)}
            snap={(p) => snap(p)}
          />
          {/* The part's move handle: drag to slide the whole part. */}
          {all.length > 1 && (
            <Group
              {...(() => {
                const c = centre(shown(picked), W, H);
                return { x: c.x, y: c.y };
              })()}
              draggable
              onPointerDown={(e) => {
                e.cancelBubble = true;
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
                move.current = {
                  start: { x: e.target.x(), y: e.target.y() },
                  nodes: picked.nodes,
                };
              }}
              onDragMove={(e) => {
                const m = move.current;
                if (!m) return;
                const at = snap({ x: e.target.x(), y: e.target.y() });
                e.target.position(at);
                const dx = (at.x - m.start.x) / W,
                  dy = (at.y - m.start.y) / H,
                  nodes = m.nodes.map((n) => ({
                    ...n,
                    x: n.x + dx,
                    y: n.y + dy,
                  }));
                setMoving({ id: picked.id, nodes });
                onPreview(picked.id, nodes);
              }}
              onDragEnd={() => {
                const m = moving;
                move.current = null;
                setMoving(null);
                if (m) onCommit(m.id, m.nodes);
              }}
              onMouseEnter={(e) => cursor(e, "move")}
              onMouseLeave={(e) => cursor(e, "")}
            >
              <Circle
                radius={9}
                fill={INK}
                stroke={ACCENT}
                strokeWidth={1.5}
                opacity={0.9}
              />
              <Line
                points={[-5, 0, 5, 0]}
                stroke={ACCENT}
                strokeWidth={1.4}
                listening={false}
              />
              <Line
                points={[0, -5, 0, 5]}
                stroke={ACCENT}
                strokeWidth={1.4}
                listening={false}
              />
            </Group>
          )}
        </>
      )}
    </Group>
  );
}

/** How far (screen px) a door's end handles stay from its middle at least,
 * so a narrow door can still be dragged by its middle. */
const END_MIN_PX = 14;
/** A door's gap drawn along its wall (pixels): the two ends and its middle. */
function doorEnds(shape: MMShape, portal: ShapePortal, w: number, h: number) {
  const at = portalPoint(shape.parts, portal, w, h);
  if (!at) return null;
  const half = Math.max(END_MIN_PX, (portal.width * w) / 2),
    ux = Math.cos(at.angle),
    uy = Math.sin(at.angle);
  return {
    mid: at,
    a: { x: at.x - ux * half, y: at.y - uy * half },
    b: { x: at.x + ux * half, y: at.y + uy * half },
    angle: at.angle,
  };
}

export function ShapeDoorsEditor({
  shape,
  W,
  H,
  selected,
  onSelect,
  onPreview,
  onCommit,
  thickness,
}: {
  shape: MMShape;
  W: number;
  H: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPreview: (portals: ShapePortal[]) => void;
  onCommit: (portals: ShapePortal[]) => void;
  /** How thick the gap is drawn (the stroke's thickness, pixels). */
  thickness: number;
}) {
  const [draft, setDraft] = useState<{
    of: MMShape;
    portals: ShapePortal[];
  } | null>(null);
  const portals = draft && draft.of === shape ? draft.portals : shape.portals;
  const live = { ...shape, portals };
  const update = (next: ShapePortal[]) => {
    setDraft({ of: shape, portals: next });
    onPreview(next);
  };
  const done = () => {
    if (draft && draft.of === shape) onCommit(draft.portals);
    setDraft(null);
  };
  const band = Math.max(8, thickness);
  const endDrag = useRef<{ half: number; d: number } | null>(null);
  return (
    <Group name="shapeDoorsEditor">
      {portals.map((pt) => {
        const g = doorEnds(live, pt, W, H);
        if (!g) return null;
        const on = pt.id === selected,
          deg = (g.angle * 180) / Math.PI;
        return (
          <Group key={pt.id}>
            {/* The opening: drag it along the walls. */}
            <Rect
              x={g.mid.x}
              y={g.mid.y}
              width={pt.width * W}
              height={band}
              offsetX={(pt.width * W) / 2}
              offsetY={band / 2}
              rotation={deg}
              fill={on ? "rgba(242,166,90,0.45)" : "rgba(242,166,90,0.25)"}
              stroke={ACCENT}
              strokeWidth={on ? 1.6 : 1}
              dash={[4, 2]}
              draggable
              onPointerDown={(e) => {
                e.cancelBubble = true;
                onSelect(pt.id);
              }}
              onDragMove={(e) => {
                const hit = nearestPath(
                  shape.parts,
                  { x: e.target.x(), y: e.target.y() },
                  W,
                  H,
                );
                if (!hit) return;
                const next = portals.map((p) =>
                  p.id === pt.id
                    ? { ...p, part: hit.path.id, seg: hit.seg, t: hit.t }
                    : p,
                );
                const g2 = doorEnds(
                  { ...shape, portals: next },
                  next.find((p) => p.id === pt.id)!,
                  W,
                  H,
                );
                if (g2) {
                  e.target.position(g2.mid);
                  e.target.rotation((g2.angle * 180) / Math.PI);
                }
                update(next);
              }}
              onDragEnd={done}
              onMouseEnter={(e) => cursor(e, "move")}
              onMouseLeave={(e) => cursor(e, "")}
            />
            {/* Its two ends: drag to widen or narrow it. */}
            {on &&
              ([g.a, g.b] as const).map((end, i) => (
                <Circle
                  key={i}
                  x={end.x}
                  y={end.y}
                  radius={4.5}
                  fill="#fff"
                  stroke={INK}
                  strokeWidth={1.4}
                  hitStrokeWidth={10}
                  draggable
                  onPointerDown={(e) => {
                    e.cancelBubble = true;
                  }}
                  onDragStart={(e) => {
                    endDrag.current = {
                      half: (pt.width * W) / 2,
                      d: Math.hypot(
                        e.target.x() - g.mid.x,
                        e.target.y() - g.mid.y,
                      ),
                    };
                  }}
                  onDragMove={(e) => {
                    // Relative to where the drag began (a narrow door's
                    // handles sit further out than its real ends).
                    const d = Math.hypot(
                        e.target.x() - g.mid.x,
                        e.target.y() - g.mid.y,
                      ),
                      start = endDrag.current ?? {
                        half: (pt.width * W) / 2,
                        d,
                      },
                      half = Math.max(0.5, start.half + d - start.d),
                      width = Math.max(0.0005, Math.min(0.5, (half * 2) / W));
                    const next = portals.map((p) =>
                      p.id === pt.id ? { ...p, width } : p,
                    );
                    const g2 = doorEnds(
                      { ...shape, portals: next },
                      next.find((p) => p.id === pt.id)!,
                      W,
                      H,
                    );
                    if (g2) e.target.position(i === 0 ? g2.a : g2.b);
                    update(next);
                  }}
                  onDragEnd={() => {
                    endDrag.current = null;
                    done();
                  }}
                  onMouseEnter={(e) => cursor(e, "ew-resize")}
                  onMouseLeave={(e) => cursor(e, "")}
                />
              ))}
          </Group>
        );
      })}
    </Group>
  );
}

/** Dashed outlines of shapes (masks of the active layer, the combine target). */
export function ShapeGuides({ outlines }: { outlines: ShapeOutline[] }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const c = raw(ctx);
        c.save();
        c.lineWidth = 1.2;
        c.strokeStyle = ACCENT;
        c.setLineDash([6, 4]);
        outlines.forEach((o) => {
          c.beginPath();
          for (const k of o.contours) {
            const n = k.xy.length / 2;
            c.moveTo(k.xy[0], k.xy[1]);
            for (let i = 1; i < n; i++) c.lineTo(k.xy[i * 2], k.xy[i * 2 + 1]);
            c.closePath();
          }
          c.stroke();
        });
        c.restore();
      }}
    />
  );
}
