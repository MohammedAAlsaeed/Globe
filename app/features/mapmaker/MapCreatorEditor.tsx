"use client";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { biomeSwatchDataUrl, biomeTexture } from "./textures";
import {
  ARABIC_RANGE,
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
  MMBrush,
  MMLabel,
  MMLayer,
  MMObject,
  MMPatch,
  MMPath,
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
// -----------------------------------------------------------------------------
// Drawing limits & tuning
// -----------------------------------------------------------------------------
const MAX_LAYERS = 20,
  MAX_OBJECTS_PER_LAYER = 3000,
  MAX_STROKE_POINTS = 6000,
  MAX_REGION_POINTS = 300,
  /** Freehand samples closer than this (screen px) to the previous one are
   * dropped — keeps strokes light without visibly changing their shape. */
  MIN_STROKE_GAP_PX = 1,
  /** Clicking within this distance of a region's first vertex closes it. */
  REGION_CLOSE_PX = 10,
  /** A click this close to the last vertex is ignored (double-click, jitter). */
  REGION_DUPLICATE_PX = 4,
  /** An icon at scale 1 is this fraction of the map width. */
  ICON_BASE = 0.05,
  /** Display width that stroke softness and texture sizes were tuned at. Both
   * are scaled by `W / EFFECT_REF_WIDTH`, so they stay proportional to the
   * map at every zoom level and in the full-resolution print export. */
  EFFECT_REF_WIDTH = 900,
  LABEL_FONT = 'Georgia, "Times New Roman", serif',
  /** Stable empty array for the live stroke preview: its points are pushed
   * imperatively, and a constant prop means React never resets them. */
  NO_POINTS: number[] = [];

type StrokeDraft = Omit<MMBrush, "points"> | Omit<MMPath, "points">;
type ObjUpdater = (o: MMObject) => MMPatch;
type StagePoint = { x: number; y: number };

/** Konva's `#id` selector compares the raw string, so ids must never be
 * CSS-escaped: `CSS.escape` turns a UUID's leading digit into `\3X `, which
 * then never matches (≈10 in 16 objects). A predicate lookup sidesteps
 * selector parsing entirely. */
function findNode(stage: Konva.Stage, id: string): Konva.Node | null {
  return stage.findOne((n: Konva.Node) => n.id() === id) ?? null;
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
/** Wraps any angle into [-180, 180) to match the rotation sliders. */
function normalizeAngle(deg: number) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
function flattenPoints(points: Point[], w: number, h: number) {
  const out = new Array<number>(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    out[i * 2] = points[i].x * w;
    out[i * 2 + 1] = points[i].y * h;
  }
  return out;
}

/** Applies `fn` to one layer; returns the same project object when nothing
 * changed, so the history reducer records no empty undo step. */
function mapLayer(p: MMProject, layerId: string, fn: (l: MMLayer) => MMLayer): MMProject {
  let changed = false;
  const layers = p.layers.map((l) => {
    if (l.id !== layerId) return l;
    const next = fn(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { ...p, layers, updatedAt: Date.now() } : p;
}
/** Patches many objects (in any layers) in one immutable update. Updaters
 * receive the object's *current* value, never a stale render-time copy. */
function applyObjectPatches(p: MMProject, updaters: Map<string, ObjUpdater>): MMProject {
  if (!updaters.size) return p;
  let changed = false;
  const layers = p.layers.map((l) => {
    if (!l.objects.some((o) => updaters.has(o.id))) return l;
    changed = true;
    return {
      ...l,
      objects: l.objects.map((o) => {
        const update = updaters.get(o.id);
        return update ? ({ ...o, ...update(o) } as MMObject) : o;
      }),
    };
  });
  return changed ? { ...p, layers, updatedAt: Date.now() } : p;
}

/** Shared look for brush strokes and paths — used by both the committed
 * object and the live preview, so what you see while drawing is exactly what
 * lands on the map (no jump in smoothing/softness on release). */
function strokeAppearance(o: StrokeDraft, W: number) {
  const width = Math.max(0.5, (o.kind === "brush" ? o.size : o.width) * W),
    soft = o.softness > 0;
  return {
    stroke: o.color,
    strokeWidth: width,
    opacity: o.opacity,
    tension: 0.4,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    shadowEnabled: soft,
    shadowColor: o.color,
    shadowBlur: o.softness * (o.kind === "brush" ? 30 : 24) * (W / EFFECT_REF_WIDTH),
    shadowOpacity: soft ? 0.9 : 0,
    hitStrokeWidth: Math.max(12, width),
    perfectDrawEnabled: false,
  };
}
/** Biome texture fill, sized relative to the map (not to screen pixels). */
function regionFill(biome: Biome, textureScale: number, textureRotation: number, W: number) {
  const s = textureScale * (W / EFFECT_REF_WIDTH);
  return {
    fillPatternImage: biomeTexture(biome) as unknown as HTMLImageElement,
    fillPatternScale: { x: s, y: s },
    fillPatternRotation: textureRotation,
    fillPriority: "pattern",
    perfectDrawEnabled: false,
  };
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width (canvas px) of a label's widest line at the given font size. */
function measureLabel(text: string, fontSize: number) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 0;
  measureCtx.font = `${fontSize}px ${LABEL_FONT}`;
  let max = 0;
  for (const line of text.split("\n")) max = Math.max(max, measureCtx.measureText(line).width);
  return max;
}
/** Logical start/end → physical side, honouring the label's direction. */
function physicalAlign(o: Pick<MMLabel, "align" | "rtl">): "left" | "center" | "right" {
  if (o.align === "center") return "center";
  return (o.align === "end") !== o.rtl ? "right" : "left";
}
/** Konva only aligns text inside an explicit width, so labels get a measured
 * block width, and `offsetX` turns the label's (x, y) into a true anchor:
 * left edge for start, middle for center, right edge for end (mirrored for
 * RTL). Labels saved before anchoring existed (`anchored` unset) keep their
 * original top-left placement, so existing maps never shift. */
function labelLayout(o: MMLabel, W: number) {
  const fontSize = Math.max(1, o.size * W),
    width = Math.ceil(measureLabel(o.text, fontSize)) + 1,
    align = physicalAlign(o),
    offsetX = !o.anchored ? 0 : align === "center" ? width / 2 : align === "right" ? width : 0;
  return { fontSize, width, align, offsetX };
}

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
  /** In-flight brush/path stroke. Only its *style* lives in React state (set
   * once at pointer-down); the points stream straight into the Konva preview
   * node, so drawing never re-renders the whole editor per pointer move. */
  const [stroke, setStroke] = useState<StrokeDraft | null>(null),
    [regionDraft, setRegionDraft] = useState<Point[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<Konva.Stage>(null),
    transformerRef = useRef<Konva.Transformer>(null),
    gridGroupRef = useRef<Konva.Group>(null),
    overlayLayerRef = useRef<Konva.Layer>(null),
    uiLayerRef = useRef<Konva.Layer>(null),
    strokeLineRef = useRef<Konva.Line>(null),
    strokePointsRef = useRef<Point[]>([]),
    marqueeRectRef = useRef<Konva.Rect>(null),
    /** Aborts the active window-level pointer gesture (stroke/marquee). */
    pointerSessionRef = useRef<(() => void) | null>(null),
    pendingPatchesRef = useRef<Map<string, ObjUpdater> | null>(null),
    /** Current canvas size, readable from long-lived pointer listeners. */
    viewRef = useRef({ w: 0, h: 0 }),
    clipboardRef = useRef<{ layerId: string; objs: MMObject[] } | null>(null),
    panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null),
    zoomAnchorRef = useRef<{ contentX: number; contentY: number; scaleRatio: number; clientX: number; clientY: number } | null>(null),
    editMenuRef = useRef<HTMLDivElement>(null),
    contextMenuRef = useRef<HTMLDivElement>(null);
  const [spaceHeld, setSpaceHeld] = useState(false),
    [panningActive, setPanningActive] = useState(false),
    [hasClipboard, setHasClipboard] = useState(false),
    [showEditMenu, setShowEditMenu] = useState(false),
    [marqueeStart, setMarqueeStart] = useState<StagePoint | null>(null),
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

  useLayoutEffect(() => {
    viewRef.current = { w: W, h: H };
  }, [W, H]);
  // Seed the live stroke preview when it mounts, and re-project it if the
  // view is zoomed mid-stroke (its points are otherwise pushed imperatively).
  useLayoutEffect(() => {
    const line = strokeLineRef.current;
    if (!stroke || !line) return;
    line.points(flattenPoints(strokePointsRef.current, W, H));
    line.getLayer()?.batchDraw();
  }, [stroke, W, H]);
  // Never leave window-level pointer listeners behind on unmount.
  useEffect(() => {
    const session = pointerSessionRef;
    return () => session.current?.();
  }, []);

  // Objects on a hidden or locked layer stay selected but get no handles.
  const selectionEditable = !!selectedLayer && selectedLayer.visible && !selectedLayer.locked;
  useEffect(() => {
    const tr = transformerRef.current,
      stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes =
      tool === "select" && selectionEditable
        ? selectedIds.map((id) => findNode(stage, id)).filter((n): n is Konva.Node => !!n)
        : [];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [tool, selectedIds, project, selectionEditable]);

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
    // Aborts an in-flight stroke/marquee gesture without committing it.
    pointerSessionRef.current?.();
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
  // Every write is a functional update against the *latest* project (never
  // the render-time `project` closure), so several writes landing in the
  // same tick compose instead of silently overwriting one another.
  function updateLayer(id: string, patch: Partial<Omit<MMLayer, "id" | "objects">>) {
    setProject((p) => mapLayer(p, id, (l) => ({ ...l, ...patch })));
  }
  function addLayer() {
    if (project.layers.length >= MAX_LAYERS) return;
    const layer = createLayer(`Layer ${project.layers.length + 1}`);
    setProject((p) =>
      p.layers.length >= MAX_LAYERS
        ? p
        : { ...p, layers: [...p.layers, layer], updatedAt: Date.now() },
    );
    setActiveLayerId(layer.id);
  }
  function removeLayer(id: string) {
    if (project.layers.length <= 1) return;
    const removed = project.layers.find((l) => l.id === id);
    setProject((p) =>
      p.layers.length <= 1
        ? p
        : { ...p, layers: p.layers.filter((l) => l.id !== id), updatedAt: Date.now() },
    );
    if (removed) {
      const gone = new Set(removed.objects.map((o) => o.id));
      setSelectedIds((cur) => cur.filter((sid) => !gone.has(sid)));
    }
    if (activeLayerId === id) {
      const remaining = project.layers.filter((l) => l.id !== id);
      setActiveLayerId(remaining[remaining.length - 1]?.id ?? "");
    }
  }
  function moveLayer(id: string, delta: number) {
    setProject((p) => {
      const index = p.layers.findIndex((l) => l.id === id),
        to = index + delta;
      if (index < 0 || to < 0 || to >= p.layers.length) return p;
      const layers = [...p.layers];
      [layers[index], layers[to]] = [layers[to], layers[index]];
      return { ...p, layers, updatedAt: Date.now() };
    });
  }
  function addObject(o: MMObject) {
    if (!active || active.locked || active.objects.length >= MAX_OBJECTS_PER_LAYER) return;
    const layerId = active.id;
    setProject((p) =>
      mapLayer(p, layerId, (l) =>
        l.locked || l.objects.length >= MAX_OBJECTS_PER_LAYER ? l : { ...l, objects: [...l.objects, o] },
      ),
    );
    setSelectedIds([o.id]);
    if (o.kind === "icon") setRecentIcons((r) => [o.icon, ...r.filter((i) => i !== o.icon)].slice(0, 10));
  }
  function updateObject(id: string, patch: MMPatch) {
    setProject((p) => applyObjectPatches(p, new Map([[id, () => patch]])));
  }
  function removeObjects(ids: string[]) {
    if (!ids.length) return;
    const idSet = new Set(ids);
    setProject((p) => {
      if (!p.layers.some((l) => l.objects.some((o) => idSet.has(o.id)))) return p;
      return {
        ...p,
        updatedAt: Date.now(),
        layers: p.layers.map((l) =>
          l.objects.some((o) => idSet.has(o.id))
            ? { ...l, objects: l.objects.filter((o) => !idSet.has(o.id)) }
            : l,
        ),
      };
    });
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
    if (!layer || layer.locked) return;
    const clones = layer.objects.filter((o) => idSet.has(o.id)).map(cloneWithOffset);
    if (!clones.length) return;
    setProject((p) => mapLayer(p, layer.id, (l) => ({ ...l, objects: [...l.objects, ...clones] })));
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
    setProject((p) => mapLayer(p, layer.id, (l) => ({ ...l, objects: [...l.objects, ...clones] })));
    setSelectedIds(clones.map((c) => c.id));
  }
  function reorderObject(id: string, dir: "front" | "back" | "forward" | "backward") {
    setProject((p) => {
      const layer = p.layers.find((l) => l.objects.some((o) => o.id === id));
      if (!layer) return p;
      return mapLayer(p, layer.id, (l) => {
        const idx = l.objects.findIndex((o) => o.id === id);
        const arr = [...l.objects];
        const [obj] = arr.splice(idx, 1);
        if (dir === "front") arr.push(obj);
        else if (dir === "back") arr.unshift(obj);
        else if (dir === "forward") arr.splice(Math.min(arr.length, idx + 1), 0, obj);
        else arr.splice(Math.max(0, idx - 1), 0, obj);
        return arr.every((o, i) => o === l.objects[i]) ? l : { ...l, objects: arr };
      });
    });
  }
  /** Batched front/back for one or many objects at once (keyboard shortcut,
   * Edit menu, context menu, multi-select toolbar) — one array rebuild. */
  function reorderObjects(ids: string[], dir: "front" | "back") {
    const idSet = new Set(ids);
    setProject((p) => {
      const layer = p.layers.find((l) => l.objects.some((o) => idSet.has(o.id)));
      if (!layer) return p;
      return mapLayer(p, layer.id, (l) => {
        const moving = l.objects.filter((o) => idSet.has(o.id)),
          staying = l.objects.filter((o) => !idSet.has(o.id)),
          arr = dir === "front" ? [...staying, ...moving] : [...moving, ...staying];
        return arr.every((o, i) => o === l.objects[i]) ? l : { ...l, objects: arr };
      });
    });
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
  const toNorm = (pos: StagePoint): Point => ({
    x: clamp(pos.x / W, 0, 1),
    y: clamp(pos.y / H, 0, 1),
  });

  // ---- Committing Konva-side drags/transforms back into the document ----
  /** Konva fires `dragend` / `transformend` once *per node*. With a
   * multi-selection the Transformer drags or transforms every attached node,
   * so several of these land in the same tick: each one queues its patch
   * here and the queue is flushed as a single update. One gesture becomes
   * one undo step, and no handler can overwrite another's result. The flush
   * is synchronous (before the next paint) so baked nodes never flicker. */
  function queuePatch(id: string, updater: ObjUpdater) {
    let pending = pendingPatchesRef.current;
    if (!pending) {
      const batch = new Map<string, ObjUpdater>();
      pending = batch;
      pendingPatchesRef.current = batch;
      queueMicrotask(() => {
        pendingPatchesRef.current = null;
        flushSync(() => setProject((p) => applyObjectPatches(p, batch)));
      });
    }
    pending.set(id, updater);
  }
  function onObjectDragEnd(o: MMObject, node: Konva.Node) {
    if (o.kind === "icon" || o.kind === "label") {
      const x = node.x() / W,
        y = node.y() / H;
      queuePatch(o.id, () => ({ x, y }));
      return;
    }
    // Line-based shapes: bake the node's offset into the points and put the
    // node back at (0,0), so the stored points always stay canonical.
    const dx = node.x() / W,
      dy = node.y() / H;
    node.position({ x: 0, y: 0 });
    queuePatch(o.id, (cur) =>
      cur.kind === "icon" || cur.kind === "label"
        ? {}
        : { points: cur.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) },
    );
  }
  function onObjectTransformEnd(o: MMObject, node: Konva.Node) {
    const uniform = Math.sqrt(Math.abs(node.scaleX() * node.scaleY())) || 1;
    if (o.kind === "icon") {
      const k = (W * ICON_BASE) / 24,
        scale = clamp(uniform / k, 0.1, 8),
        rotation = normalizeAngle(node.rotation()),
        x = node.x() / W,
        y = node.y() / H,
        s = Math.max(1, scale * W * ICON_BASE) / 24;
      node.scale({ x: s, y: s }); // exactly what the next render will set
      queuePatch(o.id, () => ({ scale, rotation, x, y }));
      return;
    }
    if (o.kind === "label") {
      const rotation = normalizeAngle(node.rotation()),
        x = node.x() / W,
        y = node.y() / H;
      node.scale({ x: 1, y: 1 });
      queuePatch(o.id, (cur) =>
        cur.kind === "label" ? { size: clamp(cur.size * uniform, 0.005, 0.3), rotation, x, y } : {},
      );
      return;
    }
    // Line-based shapes: bake the full transform matrix into the points, scale
    // the stroke width along, then reset the node.
    const m = node.getTransform().copy(),
      w = W,
      h = H;
    node.position({ x: 0, y: 0 });
    node.scale({ x: 1, y: 1 });
    node.rotation(0);
    node.skew({ x: 0, y: 0 });
    queuePatch(o.id, (cur) => {
      if (cur.kind === "icon" || cur.kind === "label") return {};
      const points = cur.points.map((p) => {
        const a = m.point({ x: p.x * w, y: p.y * h });
        return { x: a.x / w, y: a.y / h };
      });
      if (cur.kind === "brush") return { points, size: clamp(cur.size * uniform, 0.001, 0.08) };
      if (cur.kind === "path") return { points, width: clamp(cur.width * uniform, 0.0008, 0.06) };
      return { points };
    });
  }
  /** Selection + drag/transform wiring shared by every rendered object. */
  function objectHandlers(o: MMObject, layer: MMLayer) {
    return {
      id: o.id,
      draggable: tool === "select" && !layer.locked,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (tool !== "select") return;
        if (e.evt.shiftKey) toggleSelect(o.id);
        else selectOnly(o.id);
      },
      onTap: () => {
        if (tool === "select") selectOnly(o.id);
      },
      // Dragging an unselected object selects it first, so the drag never
      // moves a different, stale selection along with it.
      onDragStart: () => {
        if (!selectedIdSet.has(o.id)) selectOnly(o.id);
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onObjectDragEnd(o, e.target),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onObjectTransformEnd(o, e.target),
    };
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

  // ---- Drawing ----
  /** Follows one pointer gesture at the *window* level, so a stroke or
   * marquee keeps tracking — and always ends — even when the pointer leaves
   * the canvas, is released outside it, or the window loses focus. Positions
   * are mapped to stage coordinates by Konva itself; coalesced events are
   * used where available for smooth, high-frequency strokes. */
  function trackPointer(
    pointerId: number,
    onMove: (pos: StagePoint) => void,
    onEnd: (commit: boolean) => void,
  ) {
    const stage = stageRef.current;
    if (!stage) return;
    const s: Konva.Stage = stage;
    pointerSessionRef.current?.();
    function read(ev: PointerEvent) {
      s.setPointersPositions(ev);
      return s.getPointerPosition();
    }
    function move(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const samples = ev.getCoalescedEvents?.() ?? [];
      for (const sample of samples.length ? samples : [ev]) {
        const pos = read(sample);
        if (pos) onMove(pos);
      }
    }
    function up(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const pos = read(ev);
      if (pos) onMove(pos);
      stop(true);
    }
    function cancel(ev: PointerEvent) {
      if (ev.pointerId === pointerId) stop(false);
    }
    function blur() {
      stop(true);
    }
    function abort() {
      stop(false);
    }
    function stop(commit: boolean) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
      if (pointerSessionRef.current === abort) pointerSessionRef.current = null;
      onEnd(commit);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    pointerSessionRef.current = abort;
  }

  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    if (spaceHeld || e.evt.button !== 0 || pointerSessionRef.current) return;
    const stage = e.target.getStage(),
      pos = stage?.getPointerPosition();
    if (!stage || !pos) return;
    if (tool === "select") {
      if (e.target === stage) startMarquee(pos, e.evt.pointerId, e.evt.shiftKey);
      return;
    }
    if (!active || active.locked) return;
    const p = toNorm(pos);
    if (tool === "brush" || tool === "path") {
      startStroke(p, e.evt.pointerId);
    } else if (tool === "icon") {
      const sp = snap(p);
      addObject({
        id: crypto.randomUUID(),
        kind: "icon",
        icon: iconId,
        x: sp.x,
        y: sp.y,
        rotation: iconRotation,
        scale: iconScale,
        color,
      });
    } else if (tool === "region") {
      addRegionPoint(snap(p));
    } else if (tool === "label") {
      // Suppress the follow-up mousedown's default focus change, which would
      // otherwise immediately steal focus from the auto-focused text input.
      e.evt.preventDefault();
      setLabelDraft(snap(p));
      setLabelText("");
    }
  }

  /** Freehand brush/path: the points live in a ref and are streamed into the
   * preview Line directly (no React render per pointer move); React only
   * hears about the stroke when it starts and when it's committed. */
  function startStroke(start: Point, pointerId: number) {
    const id = crypto.randomUUID();
    const style: StrokeDraft =
      tool === "brush"
        ? { id, kind: "brush", color, size: brushSize, opacity: brushOpacity, softness: brushSoftness }
        : { id, kind: "path", pathKind, color, width: pathWidth, opacity: pathOpacity, softness: pathSoftness };
    const points: Point[] = [start];
    strokePointsRef.current = points;
    setStroke(style);
    trackPointer(
      pointerId,
      (pos) => {
        if (points.length >= MAX_STROKE_POINTS) return;
        const { w, h } = viewRef.current,
          last = points[points.length - 1],
          next = { x: clamp(pos.x / w, 0, 1), y: clamp(pos.y / h, 0, 1) };
        if (Math.hypot((next.x - last.x) * w, (next.y - last.y) * h) < MIN_STROKE_GAP_PX) return;
        points.push(next);
        const line = strokeLineRef.current;
        if (line) {
          line.points(flattenPoints(points, w, h));
          line.getLayer()?.batchDraw();
        }
      },
      (commit) => {
        strokePointsRef.current = [];
        setStroke(null);
        if (!commit) return;
        if (style.kind === "brush")
          // A single click leaves a round dot (a zero-length, round-capped line).
          addObject({ ...style, points: points.length > 1 ? points : [start, start] });
        else if (points.length >= 2) addObject({ ...style, points });
      },
    );
  }

  /** Rubber-band selection, drawn imperatively like strokes. */
  function startMarquee(start: StagePoint, pointerId: number, additive: boolean) {
    let end = start;
    setMarqueeStart(start);
    trackPointer(
      pointerId,
      (pos) => {
        end = pos;
        const rect = marqueeRectRef.current;
        if (!rect) return;
        rect.setAttrs({
          x: Math.min(start.x, pos.x),
          y: Math.min(start.y, pos.y),
          width: Math.abs(pos.x - start.x),
          height: Math.abs(pos.y - start.y),
        });
        rect.getLayer()?.batchDraw();
      },
      (commit) => {
        setMarqueeStart(null);
        if (commit) selectInRect(start, end, additive);
      },
    );
  }
  function selectInRect(a: StagePoint, b: StagePoint, additive: boolean) {
    const x0 = Math.min(a.x, b.x),
      x1 = Math.max(a.x, b.x),
      y0 = Math.min(a.y, b.y),
      y1 = Math.max(a.y, b.y);
    if (x1 - x0 < 4 && y1 - y0 < 4) {
      if (!additive) clearSelection();
      return;
    }
    const stage = stageRef.current;
    if (!stage || !active || active.locked || !active.visible) return;
    // One tree walk for all ids instead of one lookup per object.
    const nodes = new Map(stage.find((n: Konva.Node) => !!n.id()).map((n) => [n.id(), n]));
    const hits = active.objects
      .filter((o) => {
        const node = nodes.get(o.id);
        if (!node) return false;
        const r = node.getClientRect({ relativeTo: stage });
        return r.x < x1 && r.x + r.width > x0 && r.y < y1 && r.y + r.height > y0;
      })
      .map((o) => o.id);
    setSelectedIds((cur) => (additive ? Array.from(new Set([...cur, ...hits])) : hits));
  }

  /** Region (polygon) tool: click to add vertices; click the first vertex,
   * double-click, or press "Finish shape" to close it. */
  function addRegionPoint(p: Point) {
    const draft = regionDraft;
    if (!draft) {
      setRegionDraft([p]);
      return;
    }
    const distPx = (a: Point, b: Point) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
    if (draft.length >= 3 && distPx(draft[0], p) < REGION_CLOSE_PX) {
      commitRegion(draft);
      return;
    }
    // The two pointer-downs of a double-click (or a shaky click) land on the
    // same spot — never turn them into duplicate vertices.
    if (distPx(draft[draft.length - 1], p) < REGION_DUPLICATE_PX) return;
    if (draft.length >= MAX_REGION_POINTS) return;
    setRegionDraft([...draft, p]);
  }
  function commitRegion(points: Point[]) {
    if (points.length < 3) return;
    addObject({
      id: crypto.randomUUID(),
      kind: "region",
      biome,
      points,
      opacity: fillOpacity,
      textureScale,
      textureRotation,
    });
    setRegionDraft(null);
  }
  function finishRegion() {
    if (tool === "region" && regionDraft) commitRegion(regionDraft);
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
      anchored: true,
    });
    setLabelDraft(null);
    setLabelText("");
  }
  /** Inspector edits for the single selected object. Changing a label's
   * alignment or direction re-anchors it so its text stays exactly where it
   * is on the map (as design tools do) instead of jumping by its own width. */
  function patchSelected(patch: MMPatch) {
    const o = selectedObj;
    if (!o) return;
    if (o.kind === "label" && (patch.align !== undefined || patch.rtl !== undefined)) {
      const next = { ...o, ...patch, anchored: true } as MMLabel,
        d = labelLayout(next, W).offsetX - labelLayout(o, W).offsetX,
        r = ((o.rotation ?? 0) * Math.PI) / 180;
      updateObject(o.id, {
        ...patch,
        anchored: true,
        x: o.x + (d * Math.cos(r)) / W,
        y: o.y + (d * Math.sin(r)) / H,
      });
      return;
    }
    updateObject(o.id, patch);
  }

  // ---- Handing the finished map off to the print pipeline ----
  /** Rasterises just the map at the project's native resolution. Editor-only
   * chrome (snap grid, drafts/marquee, selection Transformer) is hidden for
   * the capture and restored synchronously, so it never ends up in the print
   * and never flashes on screen. */
  function renderMapCanvas(stage: Konva.Stage) {
    const chrome = [gridGroupRef.current, overlayLayerRef.current, uiLayerRef.current].filter(
      (n): n is Konva.Group | Konva.Layer => !!n,
    );
    const wasVisible = chrome.map((n) => n.visible());
    chrome.forEach((n) => n.visible(false));
    try {
      return stage.toCanvas({ pixelRatio: project.width / W });
    } finally {
      chrome.forEach((n, i) => n.visible(wasVisible[i]));
    }
  }
  async function handlePrint() {
    const stage = stageRef.current;
    if (!stage || printing) return;
    setPrinting(true);
    try {
      const canvas = renderMapCanvas(stage);
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
                      style={{ backgroundImage: `url(${biomeSwatchDataUrl(b)})` }}
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
                onPatch={patchSelected}
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
              onDblClick={finishRegion}
              onDblTap={finishRegion}
              onContextMenu={handleContextMenu}
            >
              <Layer listening={false}>
                <Rect x={0} y={0} width={W} height={H} fill={project.background} />
                {project.snapToGrid && (
                  <Group ref={gridGroupRef}>
                    {Array.from({ length: project.tileCols + 1 }, (_, i) => (
                      <Line key={`v${i}`} points={[i * tileW, 0, i * tileW, H]} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                    ))}
                    {Array.from({ length: project.tileRows + 1 }, (_, i) => (
                      <Line key={`h${i}`} points={[0, i * tileH, W, i * tileH]} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                    ))}
                  </Group>
                )}
              </Layer>
              {project.layers.map((layer) => (
                <Layer key={layer.id} visible={layer.visible} opacity={layer.opacity} listening={layer.id === active?.id && !layer.locked}>
                  {layer.objects.map((o) => {
                    const handlers = objectHandlers(o, layer);
                    if (o.kind === "region")
                      return (
                        <Line
                          key={o.id}
                          {...handlers}
                          points={flattenPoints(o.points, W, H)}
                          closed
                          tension={0.3}
                          {...regionFill(o.biome, o.textureScale, o.textureRotation, W)}
                          opacity={o.opacity}
                        />
                      );
                    if (o.kind === "brush" || o.kind === "path")
                      return (
                        <Line
                          key={o.id}
                          {...handlers}
                          points={flattenPoints(o.points, W, H)}
                          {...strokeAppearance(o, W)}
                        />
                      );
                    if (o.kind === "icon") {
                      const def = ICONS[o.icon],
                        s = Math.max(1, o.scale * W * ICON_BASE) / 24;
                      return (
                        <Group
                          key={o.id}
                          {...handlers}
                          x={o.x * W}
                          y={o.y * H}
                          rotation={o.rotation}
                          scaleX={s}
                          scaleY={s}
                          offsetX={12}
                          offsetY={12}
                        >
                          {/* Invisible hit area: the whole 24×24 icon cell is
                              clickable/draggable, not just its thin strokes. */}
                          <Rect width={24} height={24} fill="rgba(0,0,0,0)" />
                          {def.stroke && <KonvaPath data={def.stroke} stroke={o.color} strokeWidth={1.6} lineCap="round" lineJoin="round" />}
                          {def.fill && <KonvaPath data={def.fill} fill={o.color} />}
                        </Group>
                      );
                    }
                    const label = labelLayout(o, W);
                    return (
                      <KonvaText
                        key={o.id}
                        {...handlers}
                        text={o.text}
                        x={o.x * W}
                        y={o.y * H}
                        rotation={o.rotation ?? 0}
                        fontSize={label.fontSize}
                        fontFamily={LABEL_FONT}
                        fill={o.color}
                        width={label.width}
                        wrap="none"
                        align={label.align}
                        direction={o.rtl ? "rtl" : "ltr"}
                        offsetX={label.offsetX}
                      />
                    );
                  })}
                </Layer>
              ))}
              {/* Editor-only overlays: live drafts and the marquee. Hidden
                  when rendering the map for print. */}
              <Layer ref={overlayLayerRef} listening={false}>
                {stroke && <Line ref={strokeLineRef} points={NO_POINTS} {...strokeAppearance(stroke, W)} />}
                {regionDraft && (
                  <>
                    {regionDraft.length >= 3 && (
                      <Line
                        points={flattenPoints(regionDraft, W, H)}
                        closed
                        tension={0.3}
                        {...regionFill(biome, textureScale, textureRotation, W)}
                        opacity={fillOpacity * 0.6}
                      />
                    )}
                    <Line
                      points={flattenPoints(regionDraft, W, H)}
                      closed={regionDraft.length >= 3}
                      tension={0.3}
                      stroke="#f2a65a"
                      strokeWidth={1.5}
                      dash={[4, 3]}
                    />
                    {regionDraft.map((p, i) => (
                      <Circle key={i} x={p.x * W} y={p.y * H} radius={i === 0 ? 5 : 4} fill={i === 0 ? "#f2a65a" : "#cfd7de"} />
                    ))}
                  </>
                )}
                {marqueeStart && (
                  <Rect
                    ref={marqueeRectRef}
                    x={marqueeStart.x}
                    y={marqueeStart.y}
                    width={0}
                    height={0}
                    fill="rgba(242,166,90,0.12)"
                    stroke="#f2a65a"
                    strokeWidth={1}
                    dash={[4, 3]}
                  />
                )}
              </Layer>
              <Layer ref={uiLayerRef}>
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
