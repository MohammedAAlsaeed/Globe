"use client";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import Konva from "konva";
import {
  Stage,
  Layer,
  Rect,
  Line,
  Path as KonvaPath,
  Text as KonvaText,
  Circle,
  Group,
  Transformer,
} from "react-konva";
import "../../lib/i18n";
import { Glyph } from "./glyphs";
import { biomeTexture } from "./textures";
import {
  BIOME_LABEL_KEY,
  BIOME_LIST,
  PATH_KIND_LABEL_KEY,
  PATH_KIND_LIST,
  createLayer,
  pushRecent,
  resolutionBadge,
} from "./domain";
import { useHistory } from "./hooks/useHistory";
import { ColorControl, MenuHint, MenuRow, MultiSelectionBar, ObjectQuickBar, Slider } from "./components/EditorControls";
import { exportProjectToFile, saveProject } from "./storage";
import { CreateMapModal } from "./CreateMapModal";
import { MapGallery } from "./MapGallery";
import { ICONS, ICON_IDS, type IconId } from "../studio/domain/icons";
import { saveHandoff } from "../studio/storage/projects";
import { DEFAULT_DOCUMENT } from "../studio/domain/types";
import { SelectField } from "../../components/ui/fields";
import type {
  Biome,
  LabelAlign,
  MMLayer,
  MMObject,
  MMPatch,
  MMProject,
  PathKind,
  Point,
} from "./types";

type Tool = "select" | "brush" | "icon" | "path" | "region" | "label";
const TOOLS: { key: Tool; labelKey: string }[] = [
  { key: "select", labelKey: "mmToolSelect" },
  { key: "brush", labelKey: "mmToolBrush" },
  { key: "icon", labelKey: "mmToolStamp" },
  { key: "path", labelKey: "mmToolPath" },
  { key: "region", labelKey: "mmToolRegion" },
  { key: "label", labelKey: "mmToolLabel" },
];
const HINT_KEY: Record<Tool, string> = {
  select: "mmShortcutHintSelect",
  brush: "mmShortcutHintBrush",
  icon: "mmShortcutHintStamp",
  path: "mmShortcutHintPath",
  region: "mmShortcutHintRegion",
  label: "mmShortcutHintLabel",
};
// ---------------------------------------------------------------------------
// Local, editor-only constants/types. Shared, reusable pieces (the object
// model, resolution/aspect presets, storage, the small toolbar widgets) live
// in ./types.ts, ./domain.ts, ./storage.ts and ./components/EditorControls —
// this file is the standalone editor's own page-level orchestration, the
// same way features/studio/components/MapEditor.tsx stays one big component
// for the embedded editor rather than being split further.
// ---------------------------------------------------------------------------
const ARABIC_RANGE = /[؀-ۿ]/;

// =============================================================================
// The standalone map-creator page/editor
// =============================================================================
export function MapCreatorEditor({ initial }: { initial: MMProject }) {
  const { t, i18n } = useTranslation(),
    router = useRouter();

  // ---- Project state (undo/redo history) ----------------------------------
  const { project, updateProject, undo, redo, canUndo, canRedo } = useHistory(initial);
  const setProject = updateProject;

  // ---- UI state: active layer/tool/selection, panels, view ----------------
  const [activeLayerId, setActiveLayerId] = useState(
    initial.layers[initial.layers.length - 1]?.id ?? "",
  );
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [panelTab, setPanelTab] = useState<"objects" | "layers">("layers");
  const [objectSearch, setObjectSearch] = useState("");
  const [shortcutsVisible, setShortcutsVisible] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [printing, setPrinting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(900);
  const [showGallery, setShowGallery] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [color, setColor] = useState("#e7dcb8"),
    [recentColors, setRecentColors] = useState<string[]>([]),
    [brushSize, setBrushSize] = useState(0.006),
    [brushOpacity, setBrushOpacity] = useState(1),
    [brushSoftness, setBrushSoftness] = useState(0),
    [iconId, setIconId] = useState<IconId>("mountain"),
    [recentIcons, setRecentIcons] = useState<IconId[]>([]),
    [iconScale, setIconScale] = useState(1),
    [iconRotation, setIconRotation] = useState(0),
    [pathKind, setPathKind] = useState<PathKind>("river"),
    [pathWidth, setPathWidth] = useState(0.006),
    [pathOpacity, setPathOpacity] = useState(1),
    [pathSoftness, setPathSoftness] = useState(0),
    [biome, setBiome] = useState<Biome>("forest"),
    [textureScale, setTextureScale] = useState(1),
    [textureRotation, setTextureRotation] = useState(0),
    [fillOpacity, setFillOpacity] = useState(0.75),
    [labelSize, setLabelSize] = useState(0.03),
    [labelAlign, setLabelAlign] = useState<LabelAlign>("start"),
    [labelRtl, setLabelRtl] = useState(false),
    [labelText, setLabelText] = useState(""),
    [labelDraft, setLabelDraft] = useState<Point | null>(null);
  const [brushDraft, setBrushDraft] = useState<MMObject & { kind: "brush" } | null>(null),
    [pathDraft, setPathDraft] = useState<Point[] | null>(null),
    [regionDraft, setRegionDraft] = useState<Point[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<Konva.Stage>(null),
    transformerRef = useRef<Konva.Transformer>(null),
    clipboardRef = useRef<{ layerId: string; objs: MMObject[] } | null>(null),
    panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null),
    zoomAnchorRef = useRef<{ contentX: number; contentY: number; scaleRatio: number; clientX: number; clientY: number } | null>(null),
    editMenuRef = useRef<HTMLDivElement>(null),
    contextMenuRef = useRef<HTMLDivElement>(null),
    marqueeAdditiveRef = useRef(false),
    groupDragRef = useRef<{ ids: string[]; starts: Record<string, { x: number; y: number }> } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false),
    [panningActive, setPanningActive] = useState(false),
    [hasClipboard, setHasClipboard] = useState(false),
    [showEditMenu, setShowEditMenu] = useState(false),
    [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null),
    [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string | null } | null>(null);

  // ---- Derived values (recomputed from state each render, kept out of state itself) ----
  const active =
    project.layers.find((l) => l.id === activeLayerId) ??
    project.layers[project.layers.length - 1];
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedLayer = project.layers.find((l) =>
    l.objects.some((o) => selectedIdSet.has(o.id)),
  );
  const selectedObjs = selectedLayer
    ? selectedLayer.objects.filter((o) => selectedIdSet.has(o.id))
    : [];
  const selectedObj = selectedObjs.length === 1 ? selectedObjs[0] : undefined;

  // ---- Effects: language direction, responsive canvas width, autosave,
  // selection Transformer, zoom-to-cursor, Edit-menu outside-click, shortcuts ----
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setFitWidth(Math.max(200, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persist = useCallback((p: MMProject) => {
    setSaveStatus("saving");
    saveProject(p).then(() => setSaveStatus("saved"));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => persist(project), 700);
    return () => clearTimeout(timer);
  }, [project, persist]);

  const fitScale = fitWidth / project.width,
    displayScale = fitScale * zoom,
    W = Math.round(project.width * displayScale),
    H = Math.round(project.height * displayScale),
    tileW = W / project.tileCols,
    tileH = H / project.tileRows;

  useEffect(() => {
    const tr = transformerRef.current,
      stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes =
      tool === "select"
        ? selectedIds
            .map((id) => stage.findOne(`#${CSS.escape(id)}`))
            .filter((n): n is Konva.Node => !!n)
        : [];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [tool, selectedIds, project]);

  /** Keeps whatever content point was under the cursor fixed in place across
   * a Ctrl/Cmd+scroll (or trackpad-pinch) zoom, instead of zooming from a
   * fixed corner/center — this is what makes zoom feel right under the
   * pointer for both mouse and trackpad users. */
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current,
      el = containerRef.current;
    if (!anchor || !el) return;
    zoomAnchorRef.current = null;
    el.scrollLeft = anchor.contentX * anchor.scaleRatio - anchor.clientX;
    el.scrollTop = anchor.contentY * anchor.scaleRatio - anchor.clientY;
  }, [zoom]);

  useEffect(() => {
    if (!showEditMenu) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setShowEditMenu(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [showEditMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [contextMenu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space" && !spaceHeld) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "c" && selectedObjs.length) {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "v" && clipboardRef.current) {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && e.key === "]" && selectedIds.length) {
        e.preventDefault();
        reorderObjects(selectedIds, "front");
        return;
      }
      if (mod && e.key === "[" && selectedIds.length) {
        e.preventDefault();
        reorderObjects(selectedIds, "back");
        return;
      }
      if (
        tool === "select" &&
        selectedIds.length &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        removeObjects(selectedIds);
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedIds.length) {
        e.preventDefault();
        duplicateObjects(selectedIds);
        return;
      }
      if (e.key === "Escape") {
        cancelDrafts();
        setContextMenu(null);
        return;
      }
      const hotkeyIndex = TOOLS.findIndex((tl, i) => String(i + 1) === e.key);
      if (!mod && hotkeyIndex >= 0) {
        e.preventDefault();
        selectTool(TOOLS[hotkeyIndex].key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedIds, selectedObjs, undo, redo, spaceHeld]);

  // ---- Shared small helpers (used by keyboard shortcuts, the Edit menu and
  // the toolbars, so all three stay in sync with one implementation) ----
  function cancelDrafts() {
    setPathDraft(null);
    setRegionDraft(null);
    setLabelDraft(null);
  }
  function selectTool(next: Tool) {
    cancelDrafts();
    setTool(next);
  }
  function selectOnly(id: string) {
    setSelectedIds([id]);
  }
  function toggleSelect(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function clearSelection() {
    setSelectedIds([]);
  }
  function copySelection() {
    if (!selectedObjs.length) return;
    clipboardRef.current = {
      layerId: selectedLayer?.id ?? "",
      objs: selectedObjs.map((o) => structuredClone(o)),
    };
    setHasClipboard(true);
  }

  // ---- Layer & object CRUD ----
  function updateLayer(id: string, patch: Partial<MMLayer>) {
    setProject((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      updatedAt: Date.now(),
    }));
  }
  function addLayer() {
    if (project.layers.length >= 20) return;
    const layer = createLayer(`Layer ${project.layers.length + 1}`);
    setProject((p) => ({ ...p, layers: [...p.layers, layer], updatedAt: Date.now() }));
    setActiveLayerId(layer.id);
  }
  function removeLayer(id: string) {
    if (project.layers.length <= 1) return;
    setProject((p) => ({
      ...p,
      layers: p.layers.filter((l) => l.id !== id),
      updatedAt: Date.now(),
    }));
    if (activeLayerId === id) {
      const remaining = project.layers.filter((l) => l.id !== id);
      setActiveLayerId(remaining[remaining.length - 1]?.id ?? "");
    }
  }
  function moveLayer(id: string, delta: number) {
    const index = project.layers.findIndex((l) => l.id === id),
      to = index + delta;
    if (index < 0 || to < 0 || to >= project.layers.length) return;
    const next = [...project.layers];
    [next[index], next[to]] = [next[to], next[index]];
    setProject((p) => ({ ...p, layers: next, updatedAt: Date.now() }));
  }
  function addObject(o: MMObject) {
    if (!active || active.locked) return;
    if (active.objects.length >= 3000) return;
    updateLayer(active.id, { objects: [...active.objects, o] });
    setSelectedIds([o.id]);
    if (o.kind === "icon") setRecentIcons((r) => [o.icon, ...r.filter((i) => i !== o.icon)].slice(0, 10));
  }
  function updateObject(layerId: string, id: string, patch: MMPatch) {
    updateLayer(
      layerId,
      {
        objects: (project.layers.find((l) => l.id === layerId)?.objects ?? []).map(
          (o) => (o.id === id ? ({ ...o, ...patch } as MMObject) : o),
        ),
      },
    );
  }
  function removeObjects(ids: string[]) {
    const idSet = new Set(ids);
    const layer = project.layers.find((l) => l.objects.some((o) => idSet.has(o.id)));
    if (!layer) return;
    updateLayer(layer.id, { objects: layer.objects.filter((o) => !idSet.has(o.id)) });
    setSelectedIds((cur) => cur.filter((id) => !idSet.has(id)));
  }
  function removeObject(id: string) {
    removeObjects([id]);
  }
  function cloneWithOffset(o: MMObject): MMObject {
    const nid = crypto.randomUUID();
    if (o.kind === "icon" || o.kind === "label")
      return { ...o, id: nid, x: Math.min(1, o.x + 0.02), y: Math.min(1, o.y + 0.02) };
    return {
      ...o,
      id: nid,
      points: o.points.map((p) => ({ x: Math.min(1, p.x + 0.02), y: Math.min(1, p.y + 0.02) })),
    };
  }
  function duplicateObjects(ids: string[]) {
    const idSet = new Set(ids);
    const layer = project.layers.find((l) => l.objects.some((o) => idSet.has(o.id)));
    if (!layer) return;
    const clones = layer.objects.filter((o) => idSet.has(o.id)).map(cloneWithOffset);
    if (!clones.length) return;
    updateLayer(layer.id, { objects: [...layer.objects, ...clones] });
    setSelectedIds(clones.map((c) => c.id));
  }
  function duplicateObject(id: string) {
    duplicateObjects([id]);
  }
  function pasteClipboard() {
    const clip = clipboardRef.current;
    if (!clip || !clip.objs.length) return;
    const layer =
      active && !active.locked ? active : project.layers.find((l) => l.id === clip.layerId);
    if (!layer || layer.locked) return;
    const clones = clip.objs.map(cloneWithOffset);
    updateLayer(layer.id, { objects: [...layer.objects, ...clones] });
    setSelectedIds(clones.map((c) => c.id));
  }
  function reorderObject(id: string, dir: "front" | "back" | "forward" | "backward") {
    const layer = project.layers.find((l) => l.objects.some((o) => o.id === id));
    if (!layer) return;
    const idx = layer.objects.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const arr = [...layer.objects];
    const [obj] = arr.splice(idx, 1);
    if (dir === "front") arr.push(obj);
    else if (dir === "back") arr.unshift(obj);
    else if (dir === "forward") arr.splice(Math.min(arr.length, idx + 1), 0, obj);
    else arr.splice(Math.max(0, idx - 1), 0, obj);
    updateLayer(layer.id, { objects: arr });
  }
  /** Batched front/back for one or many objects at once (keyboard shortcut,
   * Edit menu, context menu, multi-select toolbar) — a single array rebuild
   * instead of calling reorderObject in a loop, since each call there would
   * otherwise read the same stale `project` closure and clobber the others. */
  function reorderObjects(ids: string[], dir: "front" | "back") {
    const idSet = new Set(ids);
    const layer = project.layers.find((l) => l.objects.some((o) => idSet.has(o.id)));
    if (!layer) return;
    const moving = layer.objects.filter((o) => idSet.has(o.id));
    const staying = layer.objects.filter((o) => !idSet.has(o.id));
    updateLayer(layer.id, { objects: dir === "front" ? [...staying, ...moving] : [...moving, ...staying] });
  }

  function commitColor(v: string) {
    setColor(v);
    setRecentColors((r) => pushRecent(r, v));
  }

  const snap = (p: Point): Point =>
    project.snapToGrid
      ? {
          x: Math.round(p.x * project.tileCols) / project.tileCols,
          y: Math.round(p.y * project.tileRows) / project.tileRows,
        }
      : p;
  const toNorm = (pos: { x: number; y: number }): Point => ({
    x: Math.max(0, Math.min(1, pos.x / W)),
    y: Math.max(0, Math.min(1, pos.y / H)),
  });
  /** Whole-shape dragging for brush/path/region: Konva moves the Line's own
   * x/y during the drag, so on release we bake that offset into the points
   * themselves and reset the node back to (0,0), keeping points canonical. */
  // ---- Konva shape transform helpers: bake a drag/resize/rotate on the
  // node into the object's normalized points, then reset the node itself ----
  function handleShapeDragEnd(
    layerId: string,
    id: string,
    points: Point[],
    node: Konva.Node,
  ) {
    const dx = node.x() / W,
      dy = node.y() / H;
    node.position({ x: 0, y: 0 });
    updateObject(
      layerId,
      id,
      { points: points.map((p) => ({ x: p.x + dx, y: p.y + dy })) },
    );
  }
  /** Whole-shape resize/rotate for brush/path/region via the Transformer: bake
   * the node's full transform matrix into the points, then reset the node so
   * points stay canonical (mirrors handleShapeDragEnd's approach). Returns the
   * uniform scale factor too, so callers can scale a stroke/fill width along. */
  function handleShapeTransformEnd(points: Point[], node: Konva.Node) {
    const transform = node.getTransform();
    const newPoints = points.map((p) => {
      const abs = transform.point({ x: p.x * W, y: p.y * H });
      return { x: abs.x / W, y: abs.y / H };
    });
    const scaleFactor = Math.sqrt(Math.abs(node.scaleX() * node.scaleY())) || 1;
    node.position({ x: 0, y: 0 });
    node.scale({ x: 1, y: 1 });
    node.rotation(0);
    return { points: newPoints, scaleFactor };
  }
  /** Multi-select group dragging: Konva only moves the one node the pointer
   * is actually dragging, so while several objects are selected we mirror
   * that node's live delta onto every other selected node's own position
   * (beginGroupDrag captures each one's starting position, syncGroupDrag
   * re-applies the delta on every move), then bake all of *their* final
   * positions into the data too once the drag ends — the dragged node keeps
   * baking itself via its own existing onDragEnd, exactly as with a single
   * selection. */
  function beginGroupDrag(e: Konva.KonvaEventObject<DragEvent>, id: string) {
    if (selectedIds.length < 2 || !selectedIds.includes(id)) {
      groupDragRef.current = null;
      return;
    }
    const stage = e.target.getStage();
    if (!stage) return;
    const starts: Record<string, { x: number; y: number }> = {};
    for (const sid of selectedIds) {
      const n = stage.findOne(`#${CSS.escape(sid)}`);
      if (n) starts[sid] = { x: n.x(), y: n.y() };
    }
    groupDragRef.current = { ids: selectedIds, starts };
  }
  function syncGroupDrag(e: Konva.KonvaEventObject<DragEvent>, id: string) {
    const g = groupDragRef.current;
    if (!g || !g.starts[id]) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const dx = e.target.x() - g.starts[id].x,
      dy = e.target.y() - g.starts[id].y;
    for (const sid of g.ids) {
      if (sid === id) continue;
      const n = stage.findOne(`#${CSS.escape(sid)}`),
        start = g.starts[sid];
      if (n && start) n.position({ x: start.x + dx, y: start.y + dy });
    }
    stage.batchDraw();
  }
  function finishGroupDrag(e: Konva.KonvaEventObject<DragEvent>, excludeId: string) {
    const g = groupDragRef.current;
    groupDragRef.current = null;
    if (!g) return;
    const stage = e.target.getStage();
    if (!stage) return;
    for (const sid of g.ids) {
      if (sid === excludeId) continue;
      const layer = project.layers.find((l) => l.objects.some((o) => o.id === sid));
      const obj = layer?.objects.find((o) => o.id === sid);
      const node = stage.findOne(`#${CSS.escape(sid)}`);
      if (!layer || !obj || !node) continue;
      if (obj.kind === "icon" || obj.kind === "label") {
        updateObject(layer.id, obj.id, { x: node.x() / W, y: node.y() / H });
      } else {
        handleShapeDragEnd(layer.id, obj.id, obj.points, node);
      }
    }
  }

  /** Space+drag or middle-click drag panning: scrolls the canvas wrapper
   * directly (no React state needed for the scroll itself), so it stays
   * smooth on both mouse and trackpad. Two-finger trackpad scroll and plain
   * mouse-wheel already pan natively via the wrapper's `overflow: auto`. */
  function startPan(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 1 && !(spaceHeld && e.button === 0)) return;
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    setPanningActive(true);
    el.setPointerCapture(e.pointerId);
  }
  function movePan(e: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current,
      el = containerRef.current;
    if (!pan || !el) return;
    el.scrollLeft = pan.scrollLeft - (e.clientX - pan.x);
    el.scrollTop = pan.scrollTop - (e.clientY - pan.y);
  }
  function endPan(e: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    panRef.current = null;
    setPanningActive(false);
    containerRef.current?.releasePointerCapture(e.pointerId);
  }

  /** Right-click context menu: walk up from whatever Konva node was clicked
   * (an icon's inner Path, say) to find the ancestor carrying the object's
   * own `id` (set on the Line/Group/Text root of each rendered object). */
  function findObjectId(node: Konva.Node, stage: Konva.Stage): string | null {
    let n: Konva.Node | null = node;
    while (n && n !== stage) {
      const id = n.id();
      if (id) return id;
      n = n.getParent();
    }
    return null;
  }
  function handleContextMenu(e: Konva.KonvaEventObject<PointerEvent>) {
    e.evt.preventDefault();
    if (tool !== "select") return;
    const stage = e.target.getStage();
    if (!stage) return;
    const targetId = findObjectId(e.target, stage);
    if (targetId && !selectedIds.includes(targetId)) selectOnly(targetId);
    else if (!targetId) clearSelection();
    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, targetId });
  }

  // ---- Drawing: one pointer-handler set per tool, shared across the Stage ----
  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    if (spaceHeld || e.evt.button !== 0) return;
    const stage = e.target.getStage();
    if (!stage) return;
    if (tool === "select") {
      if (e.target === stage) {
        const pos = stage.getPointerPosition();
        if (pos) {
          marqueeAdditiveRef.current = e.evt.shiftKey;
          setMarquee({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        }
      }
      return;
    }
    if (!active || active.locked) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const p = toNorm(pos);
    if (tool === "brush") {
      setBrushDraft({
        id: crypto.randomUUID(),
        kind: "brush",
        points: [p],
        color,
        size: brushSize,
        opacity: brushOpacity,
        softness: brushSoftness,
      });
    } else if (tool === "path") {
      setPathDraft([p]);
    } else if (tool === "icon") {
      addObject({
        id: crypto.randomUUID(),
        kind: "icon",
        icon: iconId,
        x: snap(p).x,
        y: snap(p).y,
        rotation: iconRotation,
        scale: iconScale,
        color,
      });
    } else if (tool === "region") {
      setRegionDraft((old) => {
        const sp = snap(p);
        if (!old) return [sp];
        const first = old[0],
          dx = (first.x - sp.x) * W,
          dy = (first.y - sp.y) * H;
        if (old.length >= 3 && Math.hypot(dx, dy) < 10) {
          addObject({
            id: crypto.randomUUID(),
            kind: "region",
            biome,
            points: old,
            opacity: fillOpacity,
            textureScale,
            textureRotation,
          });
          return null;
        }
        return old.length >= 300 ? old : [...old, sp];
      });
    } else if (tool === "label") {
      setLabelDraft(snap(p));
      setLabelText("");
    }
  }
  function handlePointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    if (marquee) {
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (pos) setMarquee((m) => (m ? { ...m, x1: pos.x, y1: pos.y } : m));
      return;
    }
    if (!brushDraft && !pathDraft) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const p = toNorm(pos);
    if (brushDraft && brushDraft.points.length < 6000)
      setBrushDraft((old) => (old ? { ...old, points: [...old.points, p] } : old));
    else if (pathDraft && pathDraft.length < 6000)
      setPathDraft((old) => (old ? [...old, p] : old));
  }
  function handlePointerUp(e: Konva.KonvaEventObject<PointerEvent>) {
    if (marquee) {
      const dx = Math.abs(marquee.x1 - marquee.x0),
        dy = Math.abs(marquee.y1 - marquee.y0);
      const stage = e.target.getStage();
      if (dx < 4 && dy < 4) {
        if (!marqueeAdditiveRef.current) clearSelection();
      } else if (stage && active) {
        const rx0 = Math.min(marquee.x0, marquee.x1),
          rx1 = Math.max(marquee.x0, marquee.x1),
          ry0 = Math.min(marquee.y0, marquee.y1),
          ry1 = Math.max(marquee.y0, marquee.y1);
        const hits: string[] = [];
        for (const o of active.objects) {
          const node = stage.findOne(`#${CSS.escape(o.id)}`);
          if (!node) continue;
          const r = node.getClientRect({ relativeTo: stage });
          if (r.x < rx1 && r.x + r.width > rx0 && r.y < ry1 && r.y + r.height > ry0) hits.push(o.id);
        }
        setSelectedIds((cur) => (marqueeAdditiveRef.current ? Array.from(new Set([...cur, ...hits])) : hits));
      }
      setMarquee(null);
      return;
    }
    if (brushDraft) {
      addObject(brushDraft);
      setBrushDraft(null);
    }
    if (pathDraft && pathDraft.length >= 2) {
      addObject({
        id: crypto.randomUUID(),
        kind: "path",
        pathKind,
        points: pathDraft,
        width: pathWidth,
        color,
        opacity: pathOpacity,
        softness: pathSoftness,
      });
    }
    setPathDraft(null);
  }
  function finishRegion() {
    if (regionDraft && regionDraft.length >= 3) {
      addObject({
        id: crypto.randomUUID(),
        kind: "region",
        biome,
        points: regionDraft,
        opacity: fillOpacity,
        textureScale,
        textureRotation,
      });
      setRegionDraft(null);
    }
  }
  function confirmLabel() {
    if (!labelDraft || !labelText.trim()) return;
    addObject({
      id: crypto.randomUUID(),
      kind: "label",
      text: labelText.trim().slice(0, 200),
      x: labelDraft.x,
      y: labelDraft.y,
      size: labelSize,
      color,
      align: labelAlign,
      rtl: labelRtl,
    });
    setLabelDraft(null);
    setLabelText("");
  }

  // ---- Handing the finished map off to the print pipeline ----
  async function handlePrint() {
    const stage = stageRef.current;
    if (!stage || printing) return;
    setPrinting(true);
    try {
      const ratio = project.width / W;
      const canvas = stage.toCanvas({ pixelRatio: ratio });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) return;
      await saveHandoff({
        document: { ...DEFAULT_DOCUMENT, name: project.name || "My map" },
        source: blob,
        filename: `${(project.name || "map").replace(/[^\w\-]+/g, "-")}.png`,
      });
      router.push("/print?handoff=1");
    } finally {
      setPrinting(false);
    }
  }

  // ---- Derived: the searchable, cross-layer Objects panel list ----
  const searchLower = objectSearch.trim().toLowerCase();
  const objectRows = useMemo(
    () =>
      project.layers.flatMap((layer) =>
        layer.objects.map((o) => ({ layer, o })),
      ).filter(({ o }) => {
        if (!searchLower) return true;
        const label =
          o.kind === "label"
            ? o.text
            : o.kind === "icon"
              ? t(ICONS[o.icon].labelKey)
              : o.kind === "region"
                ? t(BIOME_LABEL_KEY[o.biome])
                : o.kind === "path"
                  ? t(PATH_KIND_LABEL_KEY[o.pathKind])
                  : t("mmToolBrush");
        return label.toLowerCase().includes(searchLower);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.layers, searchLower, i18n.language],
  );

  // ---- Render ----
  return (
    <div className="mm-shell">
      <header className="mm-appbar">
        <Link href="/" className="mm-back" title={t("mmBackHome")}>
          <Glyph name="chevronLeft" />
        </Link>
        <button className="mm-back" title={t("mmMyMaps")} onClick={() => setShowGallery(true)}>
          <Glyph name="folder" size={16} />
        </button>
        <button className="mm-back" title={t("mmExportMap")} onClick={() => exportProjectToFile(project)}>
          <Glyph name="download" size={16} />
        </button>
        <input
          className="mm-title-input"
          value={project.name}
          maxLength={80}
          placeholder={t("mmUntitledMap")}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
        />
        <button className="mm-back" title={t("undo")} disabled={!canUndo} onClick={undo}>
          <Glyph name="undo" size={16} />
        </button>
        <button className="mm-back" title={t("redo")} disabled={!canRedo} onClick={redo}>
          <Glyph name="redo" size={16} />
        </button>
        <div className="mm-edit-menu-wrap" ref={editMenuRef}>
          <button className="mm-back" title={t("mmEditMenu")} onClick={() => setShowEditMenu((v) => !v)}>
            <Glyph name="keyboard" size={16} />
          </button>
          {showEditMenu && (
            <div className="mm-edit-menu">
              <div className="mm-menu-heading">{t("mmMenuTools")}</div>
              {TOOLS.map((tl, i) => (
                <MenuRow
                  key={tl.key}
                  label={t(tl.labelKey)}
                  shortcut={String(i + 1)}
                  onClick={() => {
                    selectTool(tl.key);
                    setShowEditMenu(false);
                  }}
                />
              ))}
              <div className="mm-menu-divider" />
              <div className="mm-menu-heading">{t("mmMenuEdit")}</div>
              <MenuRow label={t("undo")} shortcut="⌘Z" disabled={!canUndo} onClick={() => { undo(); setShowEditMenu(false); }} />
              <MenuRow label={t("redo")} shortcut="⌘⇧Z" disabled={!canRedo} onClick={() => { redo(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmDuplicateObject")} shortcut="⌘D" disabled={!selectedObjs.length} onClick={() => { duplicateObjects(selectedIds); setShowEditMenu(false); }} />
              <MenuRow label={t("mmCopyObject")} shortcut="⌘C" disabled={!selectedObjs.length} onClick={() => { copySelection(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmPasteObject")} shortcut="⌘V" disabled={!hasClipboard} onClick={() => { pasteClipboard(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmDeleteObject")} shortcut="⌫" disabled={!selectedObjs.length} onClick={() => { removeObjects(selectedIds); setShowEditMenu(false); }} />
              <MenuRow label={t("mmBringToFront")} shortcut="⌘]" disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "front"); setShowEditMenu(false); }} />
              <MenuRow label={t("mmBringForward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "forward"); setShowEditMenu(false); }} />
              <MenuRow label={t("mmSendBackward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "backward"); setShowEditMenu(false); }} />
              <MenuRow label={t("mmSendToBack")} shortcut="⌘[" disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "back"); setShowEditMenu(false); }} />
              <div className="mm-menu-divider" />
              <div className="mm-menu-heading">{t("mmMenuView")}</div>
              <MenuRow label={t("mmFitScreen")} onClick={() => { setZoom(1); setShowEditMenu(false); }} icon="fit" />
              <MenuHint label={t("mmZoom")} hint={t("mmZoomHint")} />
              <MenuHint label={t("mmPan")} hint={t("mmPanHint")} />
              <MenuHint label={t("mmCancelDraft")} hint={t("mmEscapeHint")} />
              <MenuHint label={t("mmMultiSelect")} hint={t("mmMultiSelectHint")} />
            </div>
          )}
        </div>
        <div className="mm-appbar-spacer" />
        <button className="mm-print-btn" disabled={printing} onClick={handlePrint}>
          <Glyph name="print" size={16} />
          {t("mmPrintAction")}
        </button>
      </header>
      <div className="mm-body">
        <nav className="mm-tool-rail">
          {TOOLS.map((tl) => (
            <button
              key={tl.key}
              className={`mm-rail-btn ${tool === tl.key ? "active" : ""}`}
              title={t(tl.labelKey)}
              onClick={() => selectTool(tl.key)}
            >
              <Glyph name={tl.key === "icon" ? "stamp" : tl.key} />
            </button>
          ))}
        </nav>
        <div className="mm-canvas-column">
          <div className="mm-top-toolbar">
            {tool === "select" && selectedObjs.length === 0 && (
              <span className="mm-toolbar-note">{t("mmNoSelection")}</span>
            )}
            {tool === "select" && selectedObjs.length > 1 && (
              <MultiSelectionBar
                count={selectedObjs.length}
                t={t}
                onDuplicate={() => duplicateObjects(selectedIds)}
                onDelete={() => removeObjects(selectedIds)}
                onCopy={copySelection}
                onFront={() => reorderObjects(selectedIds, "front")}
                onBack={() => reorderObjects(selectedIds, "back")}
                onClear={clearSelection}
              />
            )}
            {tool === "brush" && (
              <>
                <ColorControl color={color} recents={recentColors} onChange={commitColor} label={t("mmColor")} recentLabel={t("mmRecents")} />
                <Slider label={t("mmBrushSize")} value={brushSize} min={0.002} max={0.05} step={0.001} onChange={setBrushSize} />
                <Slider label={t("mmBrushOpacity")} value={brushOpacity} min={0.1} max={1} step={0.05} onChange={setBrushOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider label={t("mmBrushSoftness")} value={brushSoftness} min={0} max={1} step={0.05} onChange={setBrushSoftness} format={(v) => `${Math.round(v * 100)}%`} />
              </>
            )}
            {tool === "icon" && (
              <>
                <div className="mm-icon-picker">
                  {ICON_IDS.map((id) => (
                    <button
                      key={id}
                      className={`mm-icon-swatch ${iconId === id ? "selected" : ""}`}
                      title={t(ICONS[id].labelKey)}
                      onClick={() => setIconId(id)}
                    >
                      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
                        {ICONS[id].stroke && (
                          <path d={ICONS[id].stroke} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {ICONS[id].fill && <path d={ICONS[id].fill} fill="currentColor" />}
                      </svg>
                    </button>
                  ))}
                </div>
                {recentIcons.length > 0 && (
                  <div className="mm-recents-row">
                    <small>{t("mmRecents")}</small>
                    {recentIcons.map((id) => (
                      <button key={id} className="mm-icon-swatch small" onClick={() => setIconId(id)} title={t(ICONS[id].labelKey)}>
                        <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
                          {ICONS[id].stroke && <path d={ICONS[id].stroke} fill="none" stroke="currentColor" strokeWidth={1.8} />}
                          {ICONS[id].fill && <path d={ICONS[id].fill} fill="currentColor" />}
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
                <ColorControl color={color} recents={recentColors} onChange={commitColor} label={t("mmColor")} recentLabel={t("mmRecents")} />
                <Slider label={t("mmIconSize")} value={iconScale} min={0.3} max={4} step={0.1} onChange={setIconScale} />
                <Slider label={t("mmIconRotation")} value={iconRotation} min={-180} max={180} step={1} onChange={setIconRotation} format={(v) => `${v}°`} />
              </>
            )}
            {tool === "path" && (
              <>
                <div className="mm-swatch-row">
                  {PATH_KIND_LIST.map((k) => (
                    <button key={k} className={`mm-pill ${pathKind === k ? "selected" : ""}`} onClick={() => setPathKind(k)}>
                      {t(PATH_KIND_LABEL_KEY[k])}
                    </button>
                  ))}
                </div>
                <ColorControl color={color} recents={recentColors} onChange={commitColor} label={t("mmColor")} recentLabel={t("mmRecents")} />
                <Slider label={t("mmPathWidth")} value={pathWidth} min={0.002} max={0.03} step={0.001} onChange={setPathWidth} />
                <Slider label={t("mmPathOpacity")} value={pathOpacity} min={0.1} max={1} step={0.05} onChange={setPathOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider label={t("mmPathSoftness")} value={pathSoftness} min={0} max={1} step={0.05} onChange={setPathSoftness} format={(v) => `${Math.round(v * 100)}%`} />
              </>
            )}
            {tool === "region" && (
              <>
                <div className="mm-texture-picker">
                  {BIOME_LIST.map((b) => (
                    <button
                      key={b}
                      className={`mm-texture-swatch ${biome === b ? "selected" : ""}`}
                      title={t(BIOME_LABEL_KEY[b])}
                      style={{ backgroundImage: `url(${biomeTexture(b).toDataURL()})` }}
                      onClick={() => setBiome(b)}
                    />
                  ))}
                </div>
                <span className="mm-toolbar-note mm-texture-name">{t(BIOME_LABEL_KEY[biome])}</span>
                <Slider label={t("mmTextureScale")} value={textureScale} min={0.4} max={3} step={0.1} onChange={setTextureScale} />
                <Slider label={t("mmTextureRotation")} value={textureRotation} min={0} max={359} step={1} onChange={setTextureRotation} format={(v) => `${v}°`} />
                <Slider label={t("mmFillOpacity")} value={fillOpacity} min={0.1} max={1} step={0.05} onChange={setFillOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                {regionDraft && regionDraft.length >= 3 && (
                  <button className="secondary-button" onClick={finishRegion}>
                    {t("mmFinishShape")}
                  </button>
                )}
              </>
            )}
            {tool === "label" && !labelDraft && (
              <>
                <ColorControl color={color} recents={recentColors} onChange={commitColor} label={t("mmColor")} recentLabel={t("mmRecents")} />
                <Slider label={t("mmLabelSize")} value={labelSize} min={0.01} max={0.1} step={0.005} onChange={setLabelSize} />
                <SelectField label={t("mmLabelAlign")} value={labelAlign} onChange={(v) => setLabelAlign(v as LabelAlign)}>
                  <option value="start">{t("mmAlignStart")}</option>
                  <option value="center">{t("mmAlignCenter")}</option>
                  <option value="end">{t("mmAlignEnd")}</option>
                </SelectField>
              </>
            )}
            {tool === "label" && labelDraft && (
              <div className="mm-label-draft">
                <input
                  autoFocus
                  maxLength={200}
                  placeholder={t("mmLabelPlaceholder")}
                  value={labelText}
                  onChange={(e) => {
                    setLabelText(e.target.value);
                    setLabelRtl(ARABIC_RANGE.test(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmLabel();
                    if (e.key === "Escape") setLabelDraft(null);
                  }}
                />
                <button className="export-button" disabled={!labelText.trim()} onClick={confirmLabel}>
                  {t("mmAddLabel")}
                </button>
                <button className="secondary-button" onClick={() => setLabelDraft(null)}>
                  {t("mmCancelDraft")}
                </button>
              </div>
            )}
            {tool === "select" && selectedObj && (
              <ObjectQuickBar
                obj={selectedObj}
                layerId={selectedLayer!.id}
                t={t}
                onPatch={(patch) => updateObject(selectedLayer!.id, selectedObj.id, patch)}
                onDuplicate={() => duplicateObject(selectedObj.id)}
                onDelete={() => removeObject(selectedObj.id)}
                onReorder={(dir) => reorderObject(selectedObj.id, dir)}
              />
            )}
          </div>
          <div
            className="mm-canvas-wrap"
            ref={containerRef}
            style={{
              cursor: panningActive ? "grabbing" : spaceHeld ? "grab" : tool === "select" ? undefined : "crosshair",
            }}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              const el = containerRef.current;
              const nextZoom = Math.max(0.25, Math.min(4, zoom - e.deltaY * 0.0015));
              if (el) {
                const rect = el.getBoundingClientRect(),
                  clientX = e.clientX - rect.left,
                  clientY = e.clientY - rect.top;
                zoomAnchorRef.current = {
                  contentX: el.scrollLeft + clientX,
                  contentY: el.scrollTop + clientY,
                  scaleRatio: nextZoom / zoom,
                  clientX,
                  clientY,
                };
              }
              setZoom(nextZoom);
            }}
          >
            <Stage
              ref={stageRef}
              width={W}
              height={H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                setBrushDraft(null);
                setPathDraft(null);
                setMarquee(null);
              }}
              onDblClick={finishRegion}
              onContextMenu={handleContextMenu}
            >
              <Layer listening={false}>
                <Rect x={0} y={0} width={W} height={H} fill={project.background} />
                {project.snapToGrid &&
                  Array.from({ length: project.tileCols + 1 }, (_, i) => (
                    <Line key={`v${i}`} points={[i * tileW, 0, i * tileW, H]} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                  ))}
                {project.snapToGrid &&
                  Array.from({ length: project.tileRows + 1 }, (_, i) => (
                    <Line key={`h${i}`} points={[0, i * tileH, W, i * tileH]} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                  ))}
              </Layer>
              {project.layers.map((layer) => (
                <Layer key={layer.id} visible={layer.visible} opacity={layer.opacity} listening={layer.id === active?.id && !layer.locked}>
                  {layer.objects.map((o) => {
                    if (o.kind === "region")
                      return (
                        <Line
                          key={o.id}
                          id={o.id}
                          points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                          closed
                          tension={0.3}
                          fillPatternImage={biomeTexture(o.biome) as unknown as HTMLImageElement}
                          fillPatternScale={{ x: o.textureScale, y: o.textureScale }}
                          fillPatternRotation={o.textureRotation}
                          fillPriority="pattern"
                          opacity={o.opacity}
                          stroke={selectedIdSet.has(o.id) ? "#f2a65a" : undefined}
                          strokeWidth={selectedIdSet.has(o.id) ? 2 : 0}
                          draggable={tool === "select" && !layer.locked}
                          onClick={(e) => {
                            if (tool !== "select") return;
                            if (e.evt.shiftKey) toggleSelect(o.id);
                            else selectOnly(o.id);
                          }}
                          onTap={() => tool === "select" && selectOnly(o.id)}
                          onDragStart={(e) => beginGroupDrag(e, o.id)}
                          onDragMove={(e) => syncGroupDrag(e, o.id)}
                          onDragEnd={(e) => {
                            handleShapeDragEnd(layer.id, o.id, o.points, e.target);
                            finishGroupDrag(e, o.id);
                          }}
                          onTransformEnd={(e) => {
                            const { points } = handleShapeTransformEnd(o.points, e.target);
                            updateObject(layer.id, o.id, { points });
                          }}
                        />
                      );
                    if (o.kind === "brush")
                      return (
                        <Line
                          key={o.id}
                          id={o.id}
                          points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                          tension={0.4}
                          stroke={selectedIdSet.has(o.id) ? "#f2a65a" : o.color}
                          strokeWidth={Math.max(0.5, o.size * W)}
                          opacity={o.opacity}
                          shadowColor={o.color}
                          shadowBlur={o.softness * 30}
                          shadowOpacity={o.softness > 0 ? 0.9 : 0}
                          lineCap="round"
                          lineJoin="round"
                          draggable={tool === "select" && !layer.locked}
                          hitStrokeWidth={Math.max(12, o.size * W)}
                          onClick={(e) => {
                            if (tool !== "select") return;
                            if (e.evt.shiftKey) toggleSelect(o.id);
                            else selectOnly(o.id);
                          }}
                          onTap={() => tool === "select" && selectOnly(o.id)}
                          onDragStart={(e) => beginGroupDrag(e, o.id)}
                          onDragMove={(e) => syncGroupDrag(e, o.id)}
                          onDragEnd={(e) => {
                            handleShapeDragEnd(layer.id, o.id, o.points, e.target);
                            finishGroupDrag(e, o.id);
                          }}
                          onTransformEnd={(e) => {
                            const { points, scaleFactor } = handleShapeTransformEnd(o.points, e.target);
                            updateObject(layer.id, o.id, { points, size: Math.max(0.001, Math.min(0.08, o.size * scaleFactor)) });
                          }}
                        />
                      );
                    if (o.kind === "path") {
                      const w = Math.max(0.5, o.width * W);
                      return (
                        <Line
                          key={o.id}
                          id={o.id}
                          points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                          tension={0.4}
                          stroke={selectedIdSet.has(o.id) ? "#f2a65a" : o.color}
                          strokeWidth={w}
                          opacity={o.opacity}
                          shadowColor={o.color}
                          shadowBlur={o.softness * 24}
                          shadowOpacity={o.softness > 0 ? 0.9 : 0}
                          lineCap="round"
                          lineJoin="round"
                          draggable={tool === "select" && !layer.locked}
                          hitStrokeWidth={Math.max(12, w)}
                          onClick={(e) => {
                            if (tool !== "select") return;
                            if (e.evt.shiftKey) toggleSelect(o.id);
                            else selectOnly(o.id);
                          }}
                          onTap={() => tool === "select" && selectOnly(o.id)}
                          onDragStart={(e) => beginGroupDrag(e, o.id)}
                          onDragMove={(e) => syncGroupDrag(e, o.id)}
                          onDragEnd={(e) => {
                            handleShapeDragEnd(layer.id, o.id, o.points, e.target);
                            finishGroupDrag(e, o.id);
                          }}
                          onTransformEnd={(e) => {
                            const { points, scaleFactor } = handleShapeTransformEnd(o.points, e.target);
                            updateObject(layer.id, o.id, { points, width: Math.max(0.0008, Math.min(0.06, o.width * scaleFactor)) });
                          }}
                        />
                      );
                    }
                    if (o.kind === "icon") {
                      const def = ICONS[o.icon],
                        visualSize = Math.max(1, o.scale * W * 0.05),
                        s = visualSize / 24;
                      return (
                        <Group
                          key={o.id}
                          id={o.id}
                          x={o.x * W}
                          y={o.y * H}
                          rotation={o.rotation}
                          scaleX={s}
                          scaleY={s}
                          offsetX={12}
                          offsetY={12}
                          draggable={tool === "select" && !layer.locked}
                          onClick={(e) => {
                            if (tool !== "select") return;
                            if (e.evt.shiftKey) toggleSelect(o.id);
                            else selectOnly(o.id);
                          }}
                          onTap={() => tool === "select" && selectOnly(o.id)}
                          onDragStart={(e) => beginGroupDrag(e, o.id)}
                          onDragMove={(e) => syncGroupDrag(e, o.id)}
                          onDragEnd={(e) => {
                            updateObject(layer.id, o.id, { x: e.target.x() / W, y: e.target.y() / H });
                            finishGroupDrag(e, o.id);
                          }}
                          onTransformEnd={(e) => {
                            const node = e.target,
                              k = (W * 0.05) / 24,
                              scale = Math.max(0.1, Math.min(8, node.scaleX() / k));
                            updateObject(layer.id, o.id, { scale, rotation: node.rotation(), x: node.x() / W, y: node.y() / H });
                          }}
                        >
                          {def.stroke && <KonvaPath data={def.stroke} stroke={o.color} strokeWidth={1.6} lineCap="round" lineJoin="round" />}
                          {def.fill && <KonvaPath data={def.fill} fill={o.color} />}
                        </Group>
                      );
                    }
                    return (
                      <KonvaText
                        key={o.id}
                        id={o.id}
                        text={o.text}
                        x={o.x * W}
                        y={o.y * H}
                        rotation={o.rotation ?? 0}
                        fontSize={Math.max(1, o.size * W)}
                        fontFamily='Georgia, "Times New Roman", serif'
                        fill={o.color}
                        align={o.align === "center" ? "center" : o.align === "end" ? "right" : "left"}
                        draggable={tool === "select" && !layer.locked}
                        onClick={(e) => {
                          if (tool !== "select") return;
                          if (e.evt.shiftKey) toggleSelect(o.id);
                          else selectOnly(o.id);
                        }}
                        onTap={() => tool === "select" && selectOnly(o.id)}
                        onDragStart={(e) => beginGroupDrag(e, o.id)}
                        onDragMove={(e) => syncGroupDrag(e, o.id)}
                        onDragEnd={(e) => {
                          updateObject(layer.id, o.id, { x: e.target.x() / W, y: e.target.y() / H });
                          finishGroupDrag(e, o.id);
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target,
                            scale = Math.max(0.2, Math.min(6, (node.scaleX() + node.scaleY()) / 2));
                          node.scaleX(1);
                          node.scaleY(1);
                          updateObject(layer.id, o.id, {
                            size: Math.max(0.005, Math.min(0.3, o.size * scale)),
                            rotation: node.rotation(),
                            x: node.x() / W,
                            y: node.y() / H,
                          });
                        }}
                      />
                    );
                  })}
                </Layer>
              ))}
              <Layer listening={false}>
                {brushDraft && (
                  <Line
                    points={brushDraft.points.flatMap((p) => [p.x * W, p.y * H])}
                    stroke={brushDraft.color}
                    strokeWidth={Math.max(0.5, brushDraft.size * W)}
                    opacity={brushDraft.opacity}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
                {pathDraft && pathDraft.length > 1 && (
                  <Line
                    points={pathDraft.flatMap((p) => [p.x * W, p.y * H])}
                    stroke={color}
                    strokeWidth={Math.max(0.5, pathWidth * W)}
                    lineCap="round"
                    lineJoin="round"
                    opacity={0.85}
                  />
                )}
                {regionDraft && (
                  <>
                    <Line points={regionDraft.flatMap((p) => [p.x * W, p.y * H])} stroke="#f2a65a" strokeWidth={1.5} dash={[4, 3]} />
                    {regionDraft.map((p, i) => (
                      <Circle key={i} x={p.x * W} y={p.y * H} radius={4} fill={i === 0 ? "#f2a65a" : "#cfd7de"} />
                    ))}
                  </>
                )}
                {marquee && (
                  <Rect
                    x={Math.min(marquee.x0, marquee.x1)}
                    y={Math.min(marquee.y0, marquee.y1)}
                    width={Math.abs(marquee.x1 - marquee.x0)}
                    height={Math.abs(marquee.y1 - marquee.y0)}
                    fill="rgba(242,166,90,0.12)"
                    stroke="#f2a65a"
                    strokeWidth={1}
                    dash={[4, 3]}
                  />
                )}
              </Layer>
              <Layer>
                {tool === "select" && selectedIds.length > 0 && (
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    anchorSize={9}
                    keepRatio={selectedObjs.length === 1 && (selectedObj?.kind === "icon" || selectedObj?.kind === "label")}
                  />
                )}
              </Layer>
            </Stage>
          </div>
          <div className="mm-status-bar">
            <div className="mm-status-group">
              <span className="mm-status-dot" />
              <span>{t("mmStatusOnline")}</span>
              <span className="mm-status-sep" />
              <span>{t(saveStatus === "saving" ? "mmStatusSaving" : "mmStatusSaved")}</span>
            </div>
            <div className="mm-status-group mm-status-center">
              <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title={t("mmZoom")}>
                <Glyph name="zoomOut" size={15} />
              </button>
              <span>{Math.round(displayScale * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} title={t("mmZoom")}>
                <Glyph name="zoomIn" size={15} />
              </button>
              <button onClick={() => setZoom(1)} title={t("mmFitScreen")}>
                <Glyph name="fit" size={15} />
              </button>
            </div>
            <div className="mm-status-group">
              <span className="mm-res-badge">{resolutionBadge(project.resolutionTier)}</span>
              <button
                className={`mm-snap-toggle ${project.snapToGrid ? "on" : ""}`}
                onClick={() => setProject((p) => ({ ...p, snapToGrid: !p.snapToGrid }))}
                title={t("mmSnapToGrid")}
              >
                <Glyph name="grid" size={15} />
                {t("mmSnapToGrid")}
              </button>
              <button onClick={() => setShortcutsVisible((v) => !v)} title={t(shortcutsVisible ? "mmHideShortcuts" : "mmShowShortcuts")}>
                <Glyph name="keyboard" size={15} />
              </button>
            </div>
          </div>
          {shortcutsVisible && (
            <div className="mm-shortcut-hint">
              <span>{t(HINT_KEY[tool])}</span>
              <span className="mm-shortcut-legend">1–6 {t("mmToolSelect")}/{t("mmToolBrush")}/… · {t("mmMultiSelectHint")} · ⌘Z {t("undo")} · ⌘⇧Z {t("redo")} · ⌘D {t("mmDuplicateObject")} · ⌘C/⌘V copy/paste · ⌘] / ⌘[ {t("mmBringToFront")}/{t("mmSendToBack")} · ⌘ scroll {t("mmZoom")}</span>
            </div>
          )}
        </div>
        <aside className="mm-right-panel">
          <div className="mm-panel-tabs">
            <button className={panelTab === "objects" ? "active" : ""} onClick={() => setPanelTab("objects")}>
              <Glyph name="objects" size={15} />
              {t("mmPanelObjects")}
            </button>
            <button className={panelTab === "layers" ? "active" : ""} onClick={() => setPanelTab("layers")}>
              <Glyph name="layers" size={15} />
              {t("mmPanelLayers")}
            </button>
          </div>
          {panelTab === "objects" ? (
            <div className="mm-objects-tab">
              <div className="mm-search-row">
                <Glyph name="search" size={14} />
                <input placeholder={t("mmSearchObjects")} value={objectSearch} onChange={(e) => setObjectSearch(e.target.value)} />
              </div>
              {objectRows.length === 0 && <p className="mm-empty-note">{t("mmNoObjects")}</p>}
              <div className="mm-object-list">
                {objectRows.map(({ layer, o }) => (
                  <div key={o.id} className={`mm-object-row ${selectedIdSet.has(o.id) ? "selected" : ""}`}>
                    <button
                      className="mm-object-main"
                      onClick={() => {
                        setActiveLayerId(layer.id);
                        selectOnly(o.id);
                        setTool("select");
                      }}
                    >
                      <Glyph name={o.kind === "icon" ? "stamp" : o.kind === "label" ? "label" : o.kind === "region" ? "region" : o.kind === "path" ? "path" : "brush"} size={14} />
                      <span>
                        {o.kind === "label"
                          ? o.text || t("mmToolLabel")
                          : o.kind === "icon"
                            ? t(ICONS[o.icon].labelKey)
                            : o.kind === "region"
                              ? t(BIOME_LABEL_KEY[o.biome])
                              : o.kind === "path"
                                ? t(PATH_KIND_LABEL_KEY[o.pathKind])
                                : t("mmToolBrush")}
                      </span>
                      <small className="mm-layer-badge">{layer.name}</small>
                    </button>
                    <button title={t("mmDuplicateObject")} onClick={() => duplicateObject(o.id)}>
                      <Glyph name="duplicate" size={13} />
                    </button>
                    <button title={t("mmDeleteObject")} onClick={() => removeObject(o.id)}>
                      <Glyph name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mm-layers-tab">
              <div className="mm-layers-header">
                <span>
                  {project.layers.length}/20
                </span>
                <button className="mm-add-layer" onClick={addLayer}>
                  <Glyph name="plus" size={14} />
                  {t("mmAddLayer")}
                </button>
              </div>
              <div className="mm-layer-list">
                <div className="mm-layer-row mm-base-row">
                  <Glyph name="eye" size={14} />
                  <span>{t("mmBaseLayer")}</span>
                </div>
                {[...project.layers].reverse().map((l) => (
                  <div key={l.id} className={`mm-layer-row ${activeLayerId === l.id ? "active" : ""}`} onClick={() => setActiveLayerId(l.id)}>
                    <button
                      className="mm-layer-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(l.id, { visible: !l.visible });
                      }}
                      title={t("mmVisible")}
                    >
                      <Glyph name={l.visible ? "eye" : "eyeOff"} size={14} />
                    </button>
                    <button
                      className="mm-layer-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(l.id, { locked: !l.locked });
                      }}
                      title={t("mmLocked")}
                    >
                      <Glyph name={l.locked ? "lock" : "unlock"} size={14} />
                    </button>
                    <input
                      className="mm-layer-name"
                      key={l.id + l.name}
                      defaultValue={l.name}
                      maxLength={60}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        if (e.target.value !== l.name) updateLayer(l.id, { name: e.target.value });
                      }}
                    />
                    <small>{l.objects.length}</small>
                    <button className="mm-layer-icon" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} title={t("mmMoveUp")}>
                      <Glyph name="up" size={13} />
                    </button>
                    <button className="mm-layer-icon" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} title={t("mmMoveDown")}>
                      <Glyph name="down" size={13} />
                    </button>
                    <button className="mm-layer-icon" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} title={t("mmRemoveLayer")}>
                      <Glyph name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
              {active && (
                <label className="mm-slider mm-layer-opacity">
                  <span>{t("mmLayerOpacity")}</span>
                  <input type="range" min={0} max={1} step={0.05} value={active.opacity} onChange={(e) => updateLayer(active.id, { opacity: +e.target.value })} />
                  <b>{Math.round(active.opacity * 100)}%</b>
                </label>
              )}
            </div>
          )}
        </aside>
      </div>
      {showGallery && (
        <MapGallery
          currentId={project.id}
          onClose={() => setShowGallery(false)}
          onCreate={() => {
            setShowGallery(false);
            setShowCreate(true);
          }}
        />
      )}
      {showCreate && <CreateMapModal onClose={() => setShowCreate(false)} />}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="mm-edit-menu mm-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <MenuRow label={t("mmDuplicateObject")} shortcut="⌘D" disabled={!selectedObjs.length} onClick={() => { duplicateObjects(selectedIds); setContextMenu(null); }} />
          <MenuRow label={t("mmCopyObject")} shortcut="⌘C" disabled={!selectedObjs.length} onClick={() => { copySelection(); setContextMenu(null); }} />
          <MenuRow label={t("mmPasteObject")} shortcut="⌘V" disabled={!hasClipboard} onClick={() => { pasteClipboard(); setContextMenu(null); }} />
          <MenuRow label={t("mmDeleteObject")} shortcut="⌫" disabled={!selectedObjs.length} onClick={() => { removeObjects(selectedIds); setContextMenu(null); }} />
          <div className="mm-menu-divider" />
          <MenuRow label={t("mmBringToFront")} shortcut="⌘]" disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "front"); setContextMenu(null); }} />
          <MenuRow label={t("mmBringForward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "forward"); setContextMenu(null); }} />
          <MenuRow label={t("mmSendBackward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "backward"); setContextMenu(null); }} />
          <MenuRow label={t("mmSendToBack")} shortcut="⌘[" disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "back"); setContextMenu(null); }} />
        </div>
      )}
    </div>
  );
}
