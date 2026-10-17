"use client";
/**
 * Edit Nodes: reshape a line without redrawing it.
 *
 *   drag a node            move it (with any other selected nodes); its two
 *                          pieces follow
 *   click a node           select it (Shift: add to the selection) and show
 *                          its Bézier handles
 *   drag a handle          bend the curve; on a smooth node the opposite
 *                          handle turns with it — Alt breaks the pair (corner)
 *   double-click a node    corner ⇄ smooth
 *   click the path         add a node there (the curve keeps its shape)
 *   Delete / Backspace     remove the selected nodes (the editor's shortcut)
 *
 * The line's own canvas node is updated live while dragging (through
 * `onPreview`, no React render of the editor); the change is committed as one
 * undo step when the drag ends. Handle and node sizes are screen-constant.
 */
import { useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Line, Rect, Shape } from "react-konva";
import type { MMLine } from "../types";
import { insertNode, moveHandle, nearest, toggleNodeType, type LineNode, type Vec } from "./geometry";
import { tracePath } from "./render";

const ACCENT = "#f2a65a",
  INK = "#1b1f24";

export function LineNodeEditor({
  line,
  W,
  H,
  selected,
  onSelect,
  onPreview,
  onCommit,
  snap,
}: {
  line: MMLine;
  W: number;
  H: number;
  selected: number[];
  onSelect: (nodes: number[]) => void;
  /** Live update while dragging (the line's canvas node only). */
  onPreview: (nodes: LineNode[]) => void;
  /** The finished edit (one undo step). */
  onCommit: (nodes: LineNode[]) => void;
  /** Snaps a dragged node (pixels → pixels): grid, other lines' ends. */
  snap: (p: Vec, nodeIndex: number) => Vec;
}) {
  // The draft belongs to one version of the line: a new version (undo, a
  // panel edit, the committed drag) drops it.
  const [draftOf, setDraftOf] = useState<{ line: MMLine; nodes: LineNode[] } | null>(null);
  const draft = draftOf && draftOf.line === line ? draftOf.nodes : null;
  const nodes = draft ?? line.nodes;
  // Where the drag began (written only by event handlers).
  const dragStart = useRef<{ nodes: LineNode[]; at: Vec } | null>(null);
  const sel = useMemo(() => new Set(selected.filter((i) => i < nodes.length)), [selected, nodes.length]);
  const single = sel.size === 1 ? [...sel][0] : -1;

  const update = (next: LineNode[]) => {
    setDraftOf({ line, nodes: next });
    onPreview(next);
  };
  const commit = (next: LineNode[]) => {
    dragStart.current = null;
    onCommit(next);
  };

  // ---- nodes ----------------------------------------------------------------------
  const nodeDragStart = (i: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const add = e.evt.shiftKey;
    const nextSel = sel.has(i) ? [...sel] : add ? [...sel, i] : [i];
    if (!sel.has(i)) onSelect(nextSel);
    dragStart.current = { nodes, at: { x: nodes[i].x * W, y: nodes[i].y * H } };
  };
  const nodeDragMove = (i: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const start = dragStart.current;
    if (!start) return;
    const target = snap({ x: e.target.x(), y: e.target.y() }, i);
    e.target.position(target);
    const dx = (target.x - start.at.x) / W,
      dy = (target.y - start.at.y) / H,
      moving = sel.has(i) ? sel : new Set([i]);
    update(start.nodes.map((nd, k) => (moving.has(k) ? { ...nd, x: nd.x + dx, y: nd.y + dy } : nd)));
  };

  // ---- handles ----------------------------------------------------------------------
  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    dragStart.current = { nodes, at: { x: e.target.x(), y: e.target.y() } };
  };
  const dragEnd = () => {
    if (draft) commit(draft);
  };
  const handleDragMove = (i: number, which: "hi" | "ho", e: Konva.KonvaEventObject<DragEvent>) => {
    const nd = nodes[i],
      rel = { x: e.target.x() / W - nd.x, y: e.target.y() / H - nd.y };
    update(nodes.map((n, k) => (k === i ? moveHandle(n, which, rel, W, H, e.evt.altKey) : n)));
  };

  // ---- the path: click to add a node ---------------------------------------------------
  const onPathDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (e.evt.button !== 0) return;
    e.cancelBubble = true;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const hit = nearest(nodes, line.closed, W, H, pos);
    if (!hit || hit.d > 14) return;
    const next = insertNode(nodes, line.closed, hit.seg, hit.t, W, H);
    onSelect([hit.seg + 1]);
    commit(next);
  };

  const r = 4.5,
    hr = 3.6;
  return (
    <Group name="lineNodeEditor">
      <Shape
        sceneFunc={(ctx) => {
          const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
          c.beginPath();
          tracePath(c, nodes, line.closed, W, H);
          c.lineWidth = 1.2;
          c.strokeStyle = ACCENT;
          c.setLineDash([5, 3]);
          c.stroke();
        }}
        hitFunc={(ctx, shape) => {
          const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
          c.beginPath();
          tracePath(c, nodes, line.closed, W, H);
          c.lineWidth = 12;
          c.strokeStyle = shape.colorKey;
          c.stroke();
        }}
        onPointerDown={onPathDown}
        onMouseEnter={(e) => {
          const s = e.target.getStage()?.container();
          if (s) s.style.cursor = "copy";
        }}
        onMouseLeave={(e) => {
          const s = e.target.getStage()?.container();
          if (s) s.style.cursor = "";
        }}
      />
      {single >= 0 &&
        (["hi", "ho"] as const).map((which) => {
          const nd = nodes[single],
            h = nd[which];
          // Only handles that exist (double-click a corner to give it some);
          // an end of an open line has none on its outer side.
          if (!h || (Math.abs(h.x) < 1e-9 && Math.abs(h.y) < 1e-9)) return null;
          if (!line.closed && ((which === "hi" && single === 0) || (which === "ho" && single === nodes.length - 1))) return null;
          const hx = (nd.x + (h?.x ?? 0)) * W,
            hy = (nd.y + (h?.y ?? 0)) * H,
            nx = nd.x * W,
            ny = nd.y * H;
          return (
            <Group key={which}>
              <Line points={[nx, ny, hx, hy]} stroke={ACCENT} strokeWidth={1} listening={false} />
              <Circle
                x={hx}
                y={hy}
                radius={hr}
                fill={INK}
                stroke={ACCENT}
                strokeWidth={1.5}
                hitStrokeWidth={10}
                draggable
                onDragStart={handleDragStart}
                onDragMove={(e) => handleDragMove(single, which, e)}
                onDragEnd={dragEnd}
                onMouseEnter={(e) => {
                  const s = e.target.getStage()?.container();
                  if (s) s.style.cursor = "pointer";
                }}
                onMouseLeave={(e) => {
                  const s = e.target.getStage()?.container();
                  if (s) s.style.cursor = "";
                }}
              />
            </Group>
          );
        })}
      {nodes.map((nd, i) => {
        const x = nd.x * W,
          y = nd.y * H,
          on = sel.has(i),
          common = {
            x,
            y,
            fill: on ? ACCENT : "#fff",
            stroke: INK,
            strokeWidth: 1.4,
            hitStrokeWidth: 10,
            draggable: true,
            onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => {
              e.cancelBubble = true;
              if (e.evt.button !== 0) return;
              if (e.evt.shiftKey) onSelect(on ? [...sel].filter((k) => k !== i) : [...sel, i]);
              else if (!on) onSelect([i]);
            },
            onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
              e.cancelBubble = true;
              commit(toggleNodeType(nodes, i, line.closed, W, H));
            },
            onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => nodeDragStart(i, e),
            onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => nodeDragMove(i, e),
            onDragEnd: dragEnd,
            onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
              const s = e.target.getStage()?.container();
              if (s) s.style.cursor = "move";
            },
            onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
              const s = e.target.getStage()?.container();
              if (s) s.style.cursor = "";
            },
          };
          // Smooth nodes are round, corners square (as in vector editors);
          // the first node is a little larger, to show where the line starts.
          const size = i === 0 ? r * 1.25 : r;
          return nd.t === "smooth" ? (
            <Circle key={i} {...common} radius={size} />
          ) : (
            <Rect key={i} {...common} width={size * 2} height={size * 2} offsetX={size} offsetY={size} />
          );
        })}
    </Group>
  );
}
