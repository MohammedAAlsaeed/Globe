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
  Text as KonvaText,
  Circle,
  Group,
  Image as KonvaImage,
  Transformer,
} from "react-konva";
import "../../lib/i18n";
import { Glyph } from "./glyphs";
import { BrushPanel, PAINT_MODES } from "./brush/BrushPanel";
import { LandPanel } from "./brush/LandPanel";
import { PaintNode } from "./brush/PaintNode";
import { LAND_PENDING_NAME, LandLayerNode, landImageId } from "./brush/LandLayerNode";
import { CoastEffectPanel } from "./brush/CoastEffectPanel";
import { renderLandLayer } from "./brush/landLayer";
import { layerSeed, resolveCoast } from "./brush/coastStyles";
import {
  LiveStroke,
  colorize,
  gridCellAt,
  makeCanvas,
  paintCompositeOp,
  renderPaint,
  type RenderedPaint,
  type StrokeStyle,
} from "./brush/engine";
import {
  DEFAULT_LAND_TOOL,
  LAND_MODES,
  landBrush,
  landSettings,
  loadLandTool,
  renderLand,
  saveLandTool,
  type LandToolState,
} from "./brush/land";
import { mulberry32, newSeed } from "./brush/noise";
import { DEFAULT_SOURCE, loadFavorites, saveFavorites, type FavoriteBrush } from "./brush/presets";
import { brushBase, loadBrushState, saveBrushState, type BrushState } from "./brush/state";
import { textureDef } from "./brush/textures";
import { biomeSwatchDataUrl, biomeTexture } from "./textures";
import { LineShapeNode } from "./lines/LineShape";
import { LINE_DRAW_MODES, LinePanel } from "./lines/LinePanel";
import { LineNodeEditor } from "./lines/LineNodeEditor";
import { baseLook as lineBaseLook, builtinLineStyles, loadLineTool, saveLineTool, withSet, type LineStyle, type LineToolState } from "./lines/state";
import { fitTrail, reverseNodes, shiftNodes, snapAngle, transformNodes, type LineNode, type Vec } from "./lines/geometry";
import { lineAssetKeys, lineSet, lineSetLabel } from "./lines/catalog";
import { useLineLibrary } from "./lines/remote";
import {
  ARABIC_RANGE,
  BIOME_LABEL_KEY,
  BIOME_LIST,
  createLayer,
  pushRecent,
  resolutionBadge,
  TOOL_DEFAULTS,
} from "./domain";
import { useHistory } from "./hooks/useHistory";
import { ColorControl, MenuHint, MenuRow, MultiSelectionBar, ObjectQuickBar, Slider } from "./components/EditorControls";
import { EditTarget } from "./components/EditTarget";
import { deleteProject, exportProjectToFile, saveProject } from "./storage";
import { useCloudSync } from "./cloud/useCloudSync";
import { CloudStatusBar, ConflictDialog } from "./cloud/CloudControls";
import { UpgradeDialog } from "../account/UpgradeDialog";
import { pressed, shortcutLabel, shortcutLabels, useShortcuts, type ShortcutId } from "./shortcuts";
import { maps } from "../account/api";
import { useAuth } from "../account/AuthProvider";
import { saveHandoff } from "../studio/storage/projects";
import { DEFAULT_DOCUMENT } from "../studio/domain/types";
import type {
  Biome,
  LabelAlign,
  CloudBinding,
  CoastEffect,
  LandMode,
  LayerRole,
  MMBrush,
  MMLabel,
  MMLand,
  MMLayer,
  MMLine,
  LineLook,
  MMObject,
  MMPaint,
  MMPatch,
  MMProject,
  PaintMode,
  PaintPoint,
  PaintSource,
  Point,
  MMStamp,
} from "./types";
import {SelectField} from "@/components/ui/fields";
import {ApiError} from "@/lib/api/client";
import { setOfAsset, stampSet } from "./stamps/catalog";
import { clearLibrary, loadLibrary, resolvePlaced } from "./stamps/remote";
import { uploadStamps } from "./stamps/upload";
import { errorMessage } from "../account/ui";
import { migrateProject } from "./stamps/migrate";
import { STAMP_IMAGE, StampNode } from "./stamps/StampNode";
import { repivot } from "./stamps/geometry";
import { LayerStampSettings } from "./stamps/LayerStampSettings";
import { alignDeltas, distributeDeltas, pickable, shiftPatch, withGroups, type AlignMode, type Rect as Box } from "./arrange";
import { StampPanel, setLabel } from "./stamps/StampPanel";
import { resolveShadow, stampCompositeOp, stampPicture } from "./stamps/render";
import { Scatter, factoryLook as stampFactoryLook, loadStampState, lookOf, makeStamp, saveStampState, selectSet, type StampLook, type StampToolState } from "./stamps/state";

type Tool = "select" | "brush" | "land" | "stamp" | "line" | "region" | "label";
const TOOLS: { key: Tool; labelKey: string }[] = [
  { key: "select", labelKey: "mmToolSelect" },
  { key: "brush", labelKey: "mmToolBrush" },
  { key: "land", labelKey: "mmToolLand" },
  { key: "stamp", labelKey: "mmToolStamp" },
  { key: "line", labelKey: "mmToolLine" },
  { key: "region", labelKey: "mmToolRegion" },
  { key: "label", labelKey: "mmToolLabel" },
];
const HINT_KEY: Record<Tool, string> = {
  select: "mmShortcutHintSelect",
  brush: "mmShortcutHintBrush",
  land: "mmShortcutHintLand",
  stamp: "mmShortcutHintStamp",
  line: "lnHintPen",
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
  MAX_REGION_POINTS = 300,
  /** Clicking within this distance of a region's first vertex closes it. */
  REGION_CLOSE_PX = 10,
  /** A click this close to the last vertex is ignored (double-click, jitter). */
  REGION_DUPLICATE_PX = 4,
  /** Display width that stroke softness and texture sizes were tuned at. Both
   * are scaled by `W / EFFECT_REF_WIDTH`, so they stay proportional to the
   * map at every zoom level and in the full-resolution print export. */
  EFFECT_REF_WIDTH = 900,
  LABEL_FONT = 'Georgia, "Times New Roman", serif';

type StrokeDraft = Omit<MMBrush, "points">;
type ObjUpdater = (o: MMObject) => MMPatch | Partial<MMStamp> | Partial<MMLine>;
type StagePoint = { x: number; y: number };
/** Drawing on a land layer: its base texture and its current land coverage
 * (null while it has no land) — texture previews are clipped to the land. */
type LandContext = { base: PaintSource; land: HTMLCanvasElement | null };
/** A Brush or Land gesture in progress: the recipe being built, the free
 * stroke's incremental live rasterizer, and the land layer it's drawn on. */
type DrawSession = { obj: MMPaint | MMLand; live: LiveStroke | null; onLand: LandContext | null };
/** Freehand brush/lasso samples closer than this (screen px) are dropped. */
const PAINT_GAP_PX = 1.5,
  LASSO_GAP_PX = 3,
  MAX_PAINT_POINTS = 8000,
  MAX_GRID_CELLS = 4000;
/** Rounds a normalized coordinate for compact, stable storage. */
const q5 = (v: number) => Math.round(v * 1e5) / 1e5;
/** A line node rounded for storage (handles too). */
function roundNode(n: LineNode): LineNode {
  const out: LineNode = { x: q5(n.x), y: q5(n.y) };
  if (n.t) out.t = n.t;
  if (n.hi) out.hi = { x: q5(n.hi.x), y: q5(n.hi.y) };
  if (n.ho) out.ho = { x: q5(n.ho.x), y: q5(n.ho.y) };
  return out;
}
/** A line's look (the fields a style holds). */
function lineLookOf(o: MMLine): LineLook {
  return { mode: o.mode, stroke: o.stroke, stamp: o.stamp, opacity: o.opacity, ...(o.blend ? { blend: o.blend } : {}) };
}
/** Clicking this close (screen px) to a line's end continues it with the Pen. */
const LINE_END_PX = 8;

/** Konva's `#id` selector compares the raw string, so ids must never be
 * CSS-escaped: `CSS.escape` turns a UUID's leading digit into `\3X `, which
 * then never matches (≈10 in 16 objects). A predicate lookup sidesteps
 * selector parsing entirely. */
/** The copied objects, kept per browser so they can be pasted into another map. */
const CLIPBOARD_KEY = "mapmaker-clipboard";
function storedClipboard(): { layerId: string; objs: MMObject[] } | null {
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY),
      objs = raw ? (JSON.parse(raw) as MMObject[]) : null;
    return Array.isArray(objs) && objs.length ? { layerId: "", objs } : null;
  } catch {
    return null;
  }
}
/** What Ctrl/⌘ + wheel does over the canvas (a per-browser preference). */
type CtrlWheel = "zoom" | "rotate";
const CTRL_WHEEL_KEY = "mapmaker-ctrl-wheel";
function loadCtrlWheel(): CtrlWheel {
  try {
    return localStorage.getItem(CTRL_WHEEL_KEY) === "rotate" ? "rotate" : "zoom";
  } catch {
    return "zoom";
  }
}
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

/** Look of legacy brush strokes (maps from before Brush Tool 2.0). */
function strokeAppearance(o: StrokeDraft, W: number) {
  const width = Math.max(0.5, o.size * W),
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
    shadowBlur: o.softness * 30 * (W / EFFECT_REF_WIDTH),
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
export function MapCreatorEditor({
  initial,
  onReplaceProject,
}: {
  initial: MMProject;
  /** Opens another version of the map in place of this one (cloud conflicts). */
  onReplaceProject: (project: MMProject) => void;
}) {
  const { t, i18n } = useTranslation(),
    router = useRouter(),
    { user, refresh: refreshUser } = useAuth();

  // ---- Project state (undo/redo history) ----------------------------------
  // Maps saved before the Stamp Tool open with their icons as stamps.
  const [migratedInitial] = useState(() => migrateProject(initial));
  /** The preview that follows the pointer while placing stamps. */
  const stampGhostRef = useRef<Konva.Group>(null);
  const { project, updateProject, undo, redo, canUndo, canRedo } = useHistory(migratedInitial);
  const setProject = updateProject;
  /** Each map layer's Konva layer (its own canvas), for layer blend modes. */
  const konvaLayersRef = useRef(new Map<string, Konva.Layer>());
  /** A Konva layer's blend mode, as a canvas composite operation. */
  function layerBlendOf(node: Konva.Layer): GlobalCompositeOperation {
    for (const [id, n] of konvaLayersRef.current)
      if (n === node) {
        const blend = project.layers.find((l) => l.id === id)?.blend;
        return blend && blend !== "normal" ? blend : "source-over";
      }
    return "source-over";
  }

  // ---- UI state: active layer/tool/selection, panels, view ----------------
  const [activeLayerId, setActiveLayerId] = useState(
    initial.layers[initial.layers.length - 1]?.id ?? "",
  );
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [panelTab, setPanelTab] = useState<"objects" | "layers">("layers");
  const [objectSearch, setObjectSearch] = useState("");
  const [shortcutsVisible, setShortcutsVisible] = useState(true);
  /** The cloud map this project is saved as (unset: this device only). */
  const [cloud, setCloud] = useState<CloudBinding | undefined>(initial.cloud);
  /** A message over the canvas (e.g. an export the plan doesn't allow). */
  /** A message above the canvas: a problem (export limit) or a confirmation. */
  const [notice, setNotice] = useState<string | null>(null),
    [noticeOk, setNoticeOk] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(900);

  const [color, setColor] = useState("#e7dcb8"),
    [recentColors, setRecentColors] = useState<string[]>([]),
    [stampTool, setStampTool] = useState<StampToolState>(loadStampState),
    /** Multiple placement in progress: the stamps dropped so far. */
    [scatterDraft, setScatterDraft] = useState<MMStamp[] | null>(null),
    [stampUpload, setStampUpload] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null }),
    /** What Ctrl/⌘ + wheel does over the canvas: zoom the map, or (as in
     * Inkarnate) turn the stamp being placed or the selected stamps. */
    [ctrlWheel, setCtrlWheel] = useState<CtrlWheel>(loadCtrlWheel),
    /** Bumped after each placement, so the next stamp (and its preview) is a new draw. */
    [stampDraw, setStampDraw] = useState(1),
    [biome, setBiome] = useState<Biome>("forest"),
    [textureScale, setTextureScale] = useState<number>(TOOL_DEFAULTS.textureScale),
    [textureRotation, setTextureRotation] = useState<number>(TOOL_DEFAULTS.textureRotation),
    [fillOpacity, setFillOpacity] = useState<number>(TOOL_DEFAULTS.fillOpacity),
    [labelSize, setLabelSize] = useState<number>(TOOL_DEFAULTS.labelSize),
    [labelAlign, setLabelAlign] = useState<LabelAlign>("start"),
    [labelRtl, setLabelRtl] = useState(false),
    [labelText, setLabelText] = useState(""),
    [labelDraft, setLabelDraft] = useState<Point | null>(null);
  const [regionDraft, setRegionDraft] = useState<Point[] | null>(null);
  // ---- Brush Tool 2.0 state ----
  /** Everything the Brush panel edits; remembered per browser. */
  const [brushState, setBrushState] = useState<BrushState>(loadBrushState),
    [favorites, setFavorites] = useState<FavoriteBrush[]>(loadFavorites),
    /** True while a paint gesture's live preview node is mounted. */
    [paintPreview, setPaintPreview] = useState(false),
    /** Polygon sub-tool: vertices placed so far (click-by-click). */
    [polyDraft, setPolyDraft] = useState<PaintPoint[] | null>(null),
    [showLayerMenu, setShowLayerMenu] = useState(false);
  /** Everything the Land panel edits; remembered per browser. */
  const [landTool, setLandTool] = useState<LandToolState>(loadLandTool);
  // ---- Line Tool state ----
  /** The Line tool's mode, settings and the look new lines get; per browser. */
  // The keyboard shortcuts in force (defaults, or the person's own).
  const keys = useShortcuts();
  const [lineTool, setLineTool] = useState<LineToolState>(loadLineTool),
    /** Pen: nodes placed so far (null when no line is being drawn). */
    [penDraft, setPenDraft] = useState<LineNode[] | null>(null),
    /** Free Draw / Pen preview mounted. */
    [lineDrafting, setLineDrafting] = useState(false),
    /** Edit Nodes: the line being reshaped and its selected nodes. */
    [nodeEditState, setNodeEdit] = useState<{ id: string; sel: number[] } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<Konva.Stage>(null),
    transformerRef = useRef<Konva.Transformer>(null),
    gridGroupRef = useRef<Konva.Group>(null),
    overlayLayerRef = useRef<Konva.Layer>(null),
    uiLayerRef = useRef<Konva.Layer>(null),
    /** Live line preview (Free Draw trail, Pen rubber band), updated imperatively. */
    lineDraftRef = useRef<Konva.Shape>(null),
    /** The last pointer-down on a line (double-click → Edit Nodes). */
    lineClickRef = useRef<{ id: string; t: number } | null>(null),
    /** Pen: where the pointer is (stage px), for the rubber band to the next node. */
    penCursorRef = useRef<Vec | null>(null),
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
    contextMenuRef = useRef<HTMLDivElement>(null),
    /** Brush Tool: the gesture in progress, its preview node, the size cursor. */
    paintSessionRef = useRef<DrawSession | null>(null),
    paintImageRef = useRef<Konva.Image>(null),
    paintFrameRef = useRef(0),
    brushCursorRef = useRef<Konva.Circle>(null),
    layerMenuRef = useRef<HTMLDivElement>(null),
    polySeedRef = useRef(0),
    coastPanelRef = useRef<HTMLDivElement>(null),
    /** Current land coverage of each land layer (from LandLayerNode). */
    landMasksRef = useRef(new Map<string, HTMLCanvasElement>());
  const [spaceHeld, setSpaceHeld] = useState(false),
    [panningActive, setPanningActive] = useState(false),
    [hasClipboard, setHasClipboard] = useState(() => typeof window !== "undefined" && !!storedClipboard()),
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
  /** Selected lines, and the one being reshaped with Edit Nodes. */
  const selectedLines = selectedObjs.filter((o): o is MMLine => o.kind === "line");
  const editedLayer = nodeEditState ? project.layers.find((l) => l.objects.some((o) => o.id === nodeEditState.id)) : undefined;
  const editedLine = (editedLayer?.objects.find((o) => o.id === nodeEditState?.id) as MMLine | undefined) ?? null;
  const nodeEditing = !!editedLine && !!editedLayer && editedLayer.visible && !editedLayer.locked && !editedLine.locked && !editedLine.hidden;
  /** Edit Nodes, while its line still exists, is selected and can be changed. */
  const nodeEdit = nodeEditState && nodeEditing && selectedIds.includes(nodeEditState.id) ? nodeEditState : null;
  /** Pen: an existing line being continued (hidden while its draft is shown). */
  const [penTarget, setPenTarget] = useState<{ id: string; atStart: boolean } | null>(null);
  /** Land layers: their land shapes, texture paint, base texture and coast. */
  const landByLayer = useMemo(() => {
    const m = new Map<string, { lands: MMLand[]; paints: MMPaint[]; base: PaintSource; fx: CoastEffect }>();
    for (const l of project.layers) {
      const fx = resolveCoast(l);
      if (!fx) continue;
      m.set(l.id, {
        fx,
        base: landSettings(l).base,
        lands: l.objects.filter((o): o is MMLand => o.kind === "land" && !o.hidden),
        paints: l.objects.filter((o): o is MMPaint => o.kind === "paint" && !o.hidden),
      });
    }
    return m;
  }, [project.layers]);
  /** The Land tool's target: the active layer, when it is a land layer. */
  const landTarget = active?.role === "land" ? active : null;
  /** The topmost land layer (what the Land tool switches to). */
  const topLand = [...project.layers].reverse().find((l) => l.role === "land");
  /** Brush & Land share their gestures; this is the active one's sub-tool. */
  const drawMode: PaintMode | LandMode = tool === "land" ? landTool.mode : brushState.mode;
  const onLandChange = useCallback((layerId: string, land: HTMLCanvasElement | null) => {
    if (land) landMasksRef.current.set(layerId, land);
    else landMasksRef.current.delete(layerId);
  }, []);
  /** Layers whose coastline is being rebuilt right now (status bar hint). */
  const [coastBusy, setCoastBusy] = useState<ReadonlySet<string>>(() => new Set());
  const onCoastBusy = useCallback((layerId: string, busy: boolean) => {
    setCoastBusy((cur) => {
      if (cur.has(layerId) === busy) return cur;
      const next = new Set(cur);
      if (busy) next.add(layerId);
      else next.delete(layerId);
      return next;
    });
  }, []);

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

  // Every change is also kept on this device (under the cloud map's id once
  // it has one), so work survives going offline or closing the tab. Edits
  // are written after a short pause; a finished cloud save is written at
  // once (so the device copy is never mistaken for newer unsaved work), and
  // anything still waiting is written when the page is left.
  const pendingLocal = useRef<MMProject | null>(null);
  const writeLocal = useCallback(() => {
    const next = pendingLocal.current;
    pendingLocal.current = null;
    if (next) void saveProject(next);
  }, []);
  const lastLocalBinding = useRef(cloud);
  useEffect(() => {
    pendingLocal.current = { ...project, id: cloud?.id ?? project.id, cloud };
    const bindingChanged = lastLocalBinding.current !== cloud;
    lastLocalBinding.current = cloud;
    if (bindingChanged) return writeLocal();
    const timer = setTimeout(writeLocal, 700);
    return () => clearTimeout(timer);
  }, [project, cloud, writeLocal]);
  useEffect(() => {
    window.addEventListener("pagehide", writeLocal);
    return () => {
      window.removeEventListener("pagehide", writeLocal);
      writeLocal();
    };
  }, [writeLocal]);
  // Once uploaded, the device copy lives under the cloud id: drop the old one.
  useEffect(() => {
    if (cloud && cloud.id !== initial.id) void deleteProject(initial.id).catch(() => {});
  }, [cloud, initial.id]);

  // Layer blend modes: each layer is its own canvas, so the browser blends it
  // with the canvases beneath (and printing does the same, see renderMapCanvas).
  useEffect(() => {
    for (const l of project.layers) {
      const canvas = konvaLayersRef.current.get(l.id)?.getCanvas()._canvas;
      if (canvas) canvas.style.mixBlendMode = l.blend && l.blend !== "normal" ? l.blend : "";
    }
  });

  // ---- Stamps from the server's library (see ./stamps/remote) ----
  useEffect(() => {
    if (user) void loadLibrary();
    else if (user === null) clearLibrary();
  }, [user]);
  // Uploaded stamps this map uses, even ones the library no longer lists.
  useEffect(() => {
    if (!user) return;
    const keys = project.layers.flatMap((l) =>
      l.objects.flatMap((o) => (o.kind === "stamp" ? [o.asset] : o.kind === "line" && o.mode === "stamp" ? lineAssetKeys(o.stamp.parts) : [])),
    );
    void resolvePlaced(keys);
  }, [user, project.layers]);
  /** Uploads pictures to My stamps. Returns the error message (also shown
   * in the panel), or null when it worked. */
  async function uploadOwnStamps(files: File[], asSet: boolean): Promise<string | null> {
    setStampUpload({ busy: true, error: null });
    try {
      const setId = await uploadStamps(files, asSet),
        set = setId ? stampSet(setId) : undefined;
      if (set) setStampTool((st) => selectSet(st, set));
      setStampUpload({ busy: false, error: null });
      return null;
    } catch (e) {
      const quota = user?.plan.upload_quota_bytes ?? 0,
        error =
          e instanceof ApiError && e.code === "plan_limit_reached"
            ? t("stUploadLimit", { quota: `${Math.round(quota / 1024 / 1024)} MB` })
            : e instanceof Error && e.message === "emptyImage"
              ? t("stUploadEmpty")
              : errorMessage(t, e);
      setStampUpload({ busy: false, error });
      return error;
    } finally {
      void refreshUser();
    }
  }

  // ---- Line styles and line art from the server (see ./lines/remote) ----
  const describeLineError = useCallback(
    (e: unknown) =>
      e instanceof ApiError && e.code === "plan_limit_reached"
        ? t(e.body.limit === "line_styles" ? "lnStyleLimit" : "stUploadLimit", { max: e.body.max, quota: `${Math.round((user?.plan.upload_quota_bytes ?? 0) / 1024 / 1024)} MB` })
        : errorMessage(t, e),
    [t, user],
  );
  const lineLib = useLineLibrary(user, describeLineError);
  const libraryStyles: LineStyle[] = useMemo(() => [...lineLib.own, ...lineLib.official], [lineLib.own, lineLib.official]);

  // ---- Cloud saving (see ./cloud/useCloudSync) ----
  const sync = useCloudSync({
    project,
    binding: cloud,
    setBinding: setCloud,
    user,
    onSignedOut: () => void refreshUser(),
    onReplaceProject,
    onRename: (name) => setProject((p) => ({ ...p, name, updatedAt: Date.now() })),
    captureThumbnail,
    copySuffix: t("mmCopySuffix"),
  });

  const fitScale = fitWidth / project.width,
    displayScale = fitScale * zoom,
    W = Math.round(project.width * displayScale),
    H = Math.round(project.height * displayScale),
    tileW = W / project.tileCols,
    tileH = H / project.tileRows;

  useLayoutEffect(() => {
    viewRef.current = { w: W, h: H };
  }, [W, H]);
  // Never leave window-level pointer listeners behind on unmount.
  useEffect(() => {
    const session = pointerSessionRef;
    return () => session.current?.();
  }, []);

  // Objects on a hidden or locked layer stay selected but get no handles.
  // Paint and land strokes are raster-like, never transformed — like Inkarnate.
  const selectionEditable = !!selectedLayer && selectedLayer.visible && !selectedLayer.locked;
  useEffect(() => {
    const tr = transformerRef.current,
      stage = stageRef.current;
    if (!tr || !stage) return;
    const handleIds = selectedObjs.filter((o) => o.kind !== "paint" && o.kind !== "land" && !o.locked && !o.hidden).map((o) => o.id);
    const nodes =
      tool === "select" && selectionEditable && !nodeEdit
        ? handleIds.map((id) => findNode(stage, id)).filter((n): n is Konva.Node => !!n)
        : [];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedIds, project, selectionEditable, nodeEdit]);

  // The Stamp tool's settings persist per browser too.
  useEffect(() => {
    const timer = setTimeout(() => saveStampState(stampTool), 400);
    return () => clearTimeout(timer);
  }, [stampTool]);
  // Brush settings and favorites persist per browser (debounced while sliding).
  useEffect(() => {
    const timer = setTimeout(() => saveBrushState(brushState), 400);
    return () => clearTimeout(timer);
  }, [brushState]);
  useEffect(() => saveFavorites(favorites), [favorites]);
  useEffect(() => {
    const timer = setTimeout(() => saveLandTool(landTool), 400);
    return () => clearTimeout(timer);
  }, [landTool]);
  useEffect(() => {
    const timer = setTimeout(() => saveLineTool(lineTool), 400);
    return () => clearTimeout(timer);
  }, [lineTool]);
  // Pen: redraw the in-progress line whenever a node is added.
  useEffect(() => {
    if (penDraft) requestAnimationFrame(() => showPenPreview(penDraft, penCursorRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penDraft, W, H, lineTool.look]);
  useEffect(() => {
    if (!showLayerMenu) return;
    const onDown = (e: PointerEvent) => {
      if (layerMenuRef.current && !layerMenuRef.current.contains(e.target as Node)) setShowLayerMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [showLayerMenu]);
  // Polygon sub-tool preview: re-rendered whenever a vertex is added.
  useEffect(() => {
    if (!polyDraft) return;
    const raf = requestAnimationFrame(() => {
      const node = paintImageRef.current;
      if (!node) return;
      const draft = buildDraft("polygon", polyDraft, polySeedRef.current);
      showPaintRaster(polyDraft.length >= 3 ? previewRaster(draft, W, H, landContext()) : null);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyDraft, W, H, brushState, landTool]);

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
      // Every key below comes from the shortcut table (./shortcuts), so the
      // texts that name keys, and custom shortcuts later on, always agree.
      const is = (id: ShortcutId) => pressed(e, id, keys);
      if (is("view.pan") && !spaceHeld) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (is("edit.undo")) {
        e.preventDefault();
        undo();
        return;
      }
      if (is("edit.redo")) {
        e.preventDefault();
        redo();
        return;
      }
      if (is("file.save")) {
        e.preventDefault();
        sync.saveNow();
        return;
      }
      if (is("edit.copy") && selectedObjs.length) {
        e.preventDefault();
        copySelection();
        return;
      }
      if (is("edit.group") && selectedIds.length) {
        e.preventDefault();
        groupSelection();
        return;
      }
      if (is("edit.ungroup") && selectedIds.length) {
        e.preventDefault();
        ungroupSelection();
        return;
      }
      if (is("edit.paste") && (clipboardRef.current || storedClipboard())) {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (is("arrange.front") && selectedIds.length) {
        e.preventDefault();
        reorderObjects(selectedIds, "front");
        return;
      }
      if (is("arrange.back") && selectedIds.length) {
        e.preventDefault();
        reorderObjects(selectedIds, "back");
        return;
      }
      // ---- Line Tool: Pen and Edit Nodes keys come before object deletion ----
      if (penDraft && is("line.removeLast")) {
        e.preventDefault();
        if (penDraft.length <= 1) cancelDrafts();
        else setPenDraft(penDraft.slice(0, -1));
        return;
      }
      if (penDraft && is("line.finish")) {
        e.preventDefault();
        finishPen(false);
        return;
      }
      if (nodeEdit && nodeEdit.sel.length && is("line.removeLast")) {
        e.preventDefault();
        removeEditedNodes();
        return;
      }
      if (tool === "select" && selectedIds.length && is("edit.delete")) {
        e.preventDefault();
        removeObjects(selectedIds);
        return;
      }
      if (is("edit.duplicate") && selectedIds.length) {
        e.preventDefault();
        duplicateObjects(selectedIds);
        return;
      }
      if (is("edit.cancel")) {
        cancelDrafts();
        setNodeEdit(null);
        setContextMenu(null);
        return;
      }
      // ---- Stamp size & direction (Alt: fine steps) ----
      if (stampStepsActive()) {
        const fine = e.altKey;
        if (is("stamp.bigger") || is("stamp.smaller")) {
          e.preventDefault();
          scaleStamps(is("stamp.bigger") ? (fine ? 1.01 : 1.1) : 1 / (fine ? 1.01 : 1.1));
          return;
        }
        if (is("stamp.turnLeft") || is("stamp.turnRight")) {
          e.preventDefault();
          turnStamps((is("stamp.turnRight") ? 1 : -1) * (fine ? 1 : 15));
          return;
        }
      }
      // ---- Tools ----
      const toolHit = TOOLS.find((tl) => is(`tool.${tl.key}` as ShortcutId));
      if (toolHit) {
        e.preventDefault();
        selectTool(toolHit.key);
        return;
      }
      // ---- Line Tool ----
      if (is("line.editNodes") && selectedLines.length === 1 && (tool === "select" || tool === "line")) {
        e.preventDefault();
        toggleNodeEdit(selectedLines[0].id);
        return;
      }
      if (tool === "line" && (is("line.free") || is("line.pen") || is("line.editNodes"))) {
        e.preventDefault();
        changeLineTool({ ...lineTool, draw: is("line.free") ? "free" : is("line.pen") ? "pen" : "edit" });
        return;
      }
      if ((tool === "line" || selectedLines.length > 0) && (is("line.wider") || is("line.thinner"))) {
        e.preventDefault();
        const k = e.altKey ? 1.02 : e.shiftKey ? 1.5 : 1.15;
        scaleLineWidth(is("line.wider") ? k : 1 / k);
        return;
      }
      // ---- Brush and Land ----
      if (tool !== "brush" && tool !== "land") return;
      if (is("paint.erase")) {
        e.preventDefault();
        if (tool === "land") setLandTool((st) => ({ ...st, erase: !st.erase }));
        else setBrushState((st) => ({ ...st, erase: !st.erase }));
      } else if (is("paint.bigger") || is("paint.smaller")) {
        e.preventDefault();
        const k = is("paint.bigger") ? 1.12 : 1 / 1.12;
        if (tool === "land")
          setLandTool((st) => ({ ...st, size: clamp(st.size * k, 2 / project.width, 0.3) }));
        else
          setBrushState((st) => ({
            ...st,
            presetId: null,
            brush: { ...st.brush, size: clamp(st.brush.size * k, 1 / project.width, 0.25) },
          }));
      } else if (is("paint.finishShape") && polyDraft) {
        e.preventDefault();
        commitPolygon();
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
  }, [tool, selectedIds, selectedObjs, undo, redo, spaceHeld, polyDraft, project.width, stampTool, lineTool, penDraft, nodeEdit, keys]);

  // ---- Shared small helpers (used by keyboard shortcuts, the Edit menu and
  // the toolbars, so all three stay in sync with one implementation) ----
  function cancelDrafts() {
    // Aborts an in-flight stroke/marquee gesture without committing it.
    pointerSessionRef.current?.();
    setRegionDraft(null);
    setLabelDraft(null);
    setPolyDraft(null);
    setPenDraft(null);
    setPenTarget(null);
  }
  function selectTool(next: Tool) {
    cancelDrafts();
    if (next !== "line" && next !== "select") setNodeEdit(null);
    setTool(next);
    // The Land tool edits land layers: pick one if another layer is active.
    if (next === "land" && active?.role !== "land" && topLand) setActiveLayerId(topLand.id);
  }
  /** The objects of the layer holding `id` (groups never span layers). */
  function siblingsOf(id: string) {
    return project.layers.find((l) => l.objects.some((o) => o.id === id))?.objects ?? [];
  }
  /** Picking one member of a group picks the whole group. */
  function selectOnly(id: string) {
    setSelectedIds(withGroups([id], siblingsOf(id)));
  }
  function toggleSelect(id: string) {
    const unit = withGroups([id], siblingsOf(id));
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => !unit.includes(x)) : [...new Set([...ids, ...unit])]));
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
    // Also kept for this browser, so it can be pasted into another map.
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboardRef.current.objs));
    } catch {}
    setHasClipboard(true);
  }

  // ---- Layer & object CRUD ----
  // Every write is a functional update against the *latest* project (never
  // the render-time `project` closure), so several writes landing in the
  // same tick compose instead of silently overwriting one another.
  function updateLayer(id: string, patch: Partial<Omit<MMLayer, "id" | "objects">>) {
    setProject((p) => mapLayer(p, id, (l) => ({ ...l, ...patch })));
  }
  /** Adds a layer. Brush layers (Inkarnate-style): a Water layer goes to the
   * bottom of the stack, Land and custom layers on top. */
  function addLayer(role: LayerRole = "custom") {
    if (project.layers.length >= MAX_LAYERS) return;
    const name =
      role === "water" ? t("mmLayerWater") : role === "land" ? t("mmLayerLand") : `${t("mmLayerDefaultName")} ${project.layers.length + 1}`;
    const layer = createLayer(name, role);
    setProject((p) =>
      p.layers.length >= MAX_LAYERS
        ? p
        : { ...p, layers: role === "water" ? [layer, ...p.layers] : [...p.layers, layer], updatedAt: Date.now() },
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
  }
  /** Adds many objects to the active layer as one undo step (scattered stamps). */
  function addObjects(list: MMObject[], select: boolean) {
    if (!active || active.locked || !list.length) return;
    const layerId = active.id;
    setProject((p) =>
      mapLayer(p, layerId, (l) =>
        l.locked ? l : { ...l, objects: [...l.objects, ...list].slice(0, MAX_OBJECTS_PER_LAYER) },
      ),
    );
    if (select) setSelectedIds(list.map((o) => o.id));
  }
  /** Applies a look change to stamps (the Stamp panel while stamps are selected). */
  /** Changes stamps relative to their own values (keyboard and wheel steps). */
  function adjustStamps(ids: string[], change: (o: MMStamp) => Partial<MMStamp>) {
    setProject((p) =>
      applyObjectPatches(p, new Map(ids.map((id) => [id, (cur: MMObject) => (cur.kind === "stamp" ? change(cur) : {})]))),
    );
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
    if (o.kind === "stamp" || o.kind === "label")
      return { ...o, id: nid, x: Math.min(1, o.x + 0.02), y: Math.min(1, o.y + 0.02) };
    if (o.kind === "line") return { ...o, id: nid, nodes: shiftNodes(o.nodes, 0.02, 0.02) };
    return {
      ...o,
      id: nid,
      points: o.points.map((p) => ({ x: Math.min(1, p.x + 0.02), y: Math.min(1, p.y + 0.02) })),
    };
  }
  /** Copies of grouped objects form new groups of their own. */
  function regroup(clones: MMObject[]): MMObject[] {
    const fresh = new Map<string, string>();
    return clones.map((c) => {
      if (!c.group) return c;
      if (!fresh.has(c.group)) fresh.set(c.group, crypto.randomUUID());
      return { ...c, group: fresh.get(c.group) };
    });
  }
  function duplicateObjects(ids: string[]) {
    const idSet = new Set(ids);
    const layer = project.layers.find((l) => l.objects.some((o) => idSet.has(o.id)));
    if (!layer || layer.locked) return;
    const clones = regroup(layer.objects.filter((o) => idSet.has(o.id)).map(cloneWithOffset));
    if (!clones.length) return;
    setProject((p) => mapLayer(p, layer.id, (l) => ({ ...l, objects: [...l.objects, ...clones] })));
    setSelectedIds(clones.map((c) => c.id));
  }
  function duplicateObject(id: string) {
    duplicateObjects([id]);
  }
  function pasteClipboard() {
    const clip = clipboardRef.current ?? storedClipboard();
    if (!clip || !clip.objs.length) return;
    const layer =
      active && !active.locked ? active : project.layers.find((l) => l.id === clip.layerId);
    if (!layer || layer.locked) return;
    // Land shapes only make sense on a land layer.
    const clones = regroup(clip.objs.filter((o) => o.kind !== "land" || layer.role === "land").map(cloneWithOffset));
    if (!clones.length) return;
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
    if (o.kind === "stamp" || o.kind === "label") {
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
      cur.kind === "stamp" || cur.kind === "label"
        ? {}
        : cur.kind === "line"
          ? { nodes: shiftNodes(cur.nodes, dx, dy) }
          : { points: cur.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) },
    );
  }
  function onObjectTransformEnd(o: MMObject, node: Konva.Node) {
    const uniform = Math.sqrt(Math.abs(node.scaleX() * node.scaleY())) || 1;
    if (o.kind === "stamp") {
      // The stamp's group is drawn at scale 1: fold the resize into the
      // size and put the scale back.
      const rotation = normalizeAngle(node.rotation()),
        x = node.x() / W,
        y = node.y() / H;
      node.scale({ x: 1, y: 1 });
      queuePatch(o.id, (cur) => (cur.kind === "stamp" ? { size: clamp(cur.size * uniform, 0.002, 0.8), rotation, x, y } : {}));
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
      if (cur.kind === "stamp" || cur.kind === "label") return {};
      if (cur.kind === "line")
        return {
          nodes: transformNodes(cur.nodes, w, h, (p) => m.point(p)).map(roundNode),
          stroke: { ...cur.stroke, width: clamp(cur.stroke.width * uniform, 0.0002, 0.2) },
          stamp: { ...cur.stamp, size: clamp(cur.stamp.size * uniform, 0.0005, 0.2) },
        };
      const points = cur.points.map((p) => {
        const a = m.point({ x: p.x * w, y: p.y * h });
        return { x: a.x / w, y: a.y / h };
      });
      if (cur.kind === "brush") return { points, size: clamp(cur.size * uniform, 0.001, 0.08) };
      return { points };
    });
  }
  /** Selection + drag/transform wiring shared by every rendered object. */
  function objectHandlers(o: MMObject, layer: MMLayer) {
    return {
      id: o.id,
      // Locked objects let clicks pass through to whatever is beneath.
      listening: !o.locked,
      draggable: tool === "select" && !layer.locked && !o.locked,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
        // Line tool, Edit Nodes: clicking a line picks it for reshaping.
        if (tool === "line" && lineTool.draw === "edit" && o.kind === "line") {
          selectOnly(o.id);
          setNodeEdit({ id: o.id, sel: [] });
          return;
        }
        if (tool !== "select") return;
        if (e.evt.shiftKey) toggleSelect(o.id);
        else selectOnly(o.id);
      },
      onTap: () => {
        if (tool === "select") selectOnly(o.id);
      },
      // Double-clicking a line with the Select tool edits its nodes. Timed
      // from pointer-downs: once the first click selects the line, Konva no
      // longer reports the second click (the Transformer takes over).
      onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => {
        if (tool !== "select" || o.kind !== "line" || layer.locked || e.evt.button !== 0) return;
        const now = performance.now(),
          last = lineClickRef.current;
        lineClickRef.current = { id: o.id, t: now };
        if (last && last.id === o.id && now - last.t < 450) {
          lineClickRef.current = null;
          selectOnly(o.id);
          setNodeEdit({ id: o.id, sel: [] });
        }
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
    // Pen: right-click finishes the line (as in Inkarnate).
    if (tool === "line" && penDraft) {
      finishPen(false);
      return;
    }
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
    onMove: (pos: StagePoint, ev: PointerEvent) => void,
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
        if (pos) onMove(pos, sample);
      }
    }
    function up(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const pos = read(ev);
      if (pos) onMove(pos, ev);
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
    if (tool === "line" && lineTool.draw === "edit") {
      // Clicking empty canvas ends Edit Nodes (lines are picked by their own click).
      if (e.target === stage) {
        setNodeEdit(null);
        clearSelection();
      }
      return;
    }
    if (!active || active.locked) return;
    const p = toNorm(pos);
    if (tool === "brush" || tool === "land") {
      if (tool === "land" && active.role !== "land") return;
      startDraw(pos, e.evt);
    } else if (tool === "line") {
      if (lineTool.draw === "free") startLineFree(pos, e.evt.pointerId);
      else penDown(pos, e.evt);
    } else if (tool === "stamp") {
      startStamping(pos, e.evt.pointerId);
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

  // ---- Line Tool ----------------------------------------------------------------
  // Free Draw streams the pointer trail into a live preview and fits it with a
  // few smooth nodes on release; the Pen places nodes click by click (drag to
  // pull Bézier handles); Edit Nodes reshapes a line (./lines/LineNodeEditor).
  // Previews are drawn imperatively into one LineShape inside the active
  // layer, so drawing never re-renders the editor per pointer move.

  /** The look a new line gets (a fresh seed, so walls don't repeat). */
  function newLine(nodes: LineNode[], closed: boolean): MMLine {
    const look = lineTool.look;
    return {
      id: crypto.randomUUID(),
      kind: "line",
      closed,
      nodes: nodes.map(roundNode),
      ...look,
      stamp: { ...look.stamp, seed: newSeed() },
      styleId: lineTool.styleId,
    };
  }
  /** Adds a drawn line; the panel stays on the tool's settings for the next one. */
  function addLine(o: MMLine) {
    addObject(o);
    setSelectedIds([]);
  }
  function changeLineTool(next: LineToolState) {
    if (next.draw !== lineTool.draw) cancelDrafts();
    if (next.draw !== "edit") setNodeEdit(null);
    setLineTool(next);
  }
  /** Patches lines (any fields of MMLine) as one undo step. */
  function patchLines(ids: string[], patch: (o: MMLine) => Partial<MMLine>) {
    setProject((p) => applyObjectPatches(p, new Map(ids.map((id) => [id, (cur: MMObject) => (cur.kind === "line" ? patch(cur) : {})]))));
  }
  /** Snaps a point (stage px): to the end of another line, else to the grid. */
  function snapLinePoint(p: Vec, exclude?: string): Vec {
    let best: Vec | null = null,
      bestD = LINE_END_PX + 1;
    if (lineTool.snapEnds && active)
      for (const o of active.objects) {
        if (o.kind !== "line" || o.id === exclude || o.hidden || o.closed) continue;
        for (const n of [o.nodes[0], o.nodes[o.nodes.length - 1]]) {
          const d = Math.hypot(n.x * W - p.x, n.y * H - p.y);
          if (d < bestD) {
            bestD = d;
            best = { x: n.x * W, y: n.y * H };
          }
        }
      }
    if (best) return best;
    if (project.snapToGrid) {
      const g = snap({ x: p.x / W, y: p.y / H });
      return { x: g.x * W, y: g.y * H };
    }
    return p;
  }
  /** An open line in the active layer with an end under the pointer. */
  function lineEndAt(p: Vec): { line: MMLine; atStart: boolean } | null {
    if (!active || active.locked) return null;
    for (const o of [...active.objects].reverse()) {
      if (o.kind !== "line" || o.closed || o.hidden || o.locked) continue;
      const a = o.nodes[0],
        b = o.nodes[o.nodes.length - 1];
      if (Math.hypot(b.x * W - p.x, b.y * H - p.y) <= LINE_END_PX) return { line: o, atStart: false };
      if (Math.hypot(a.x * W - p.x, a.y * H - p.y) <= LINE_END_PX) return { line: o, atStart: true };
    }
    return null;
  }
  /** Shows a line being drawn in the live preview node. */
  function showLineDraft(nodes: LineNode[], closed = false) {
    const node = lineDraftRef.current;
    if (!node) return;
    node.setAttrs({ line: { ...lineTool.look, nodes, closed }, W: viewRef.current.w, H: viewRef.current.h });
    node.getLayer()?.batchDraw();
  }
  /** Pen preview: the nodes placed so far plus a rubber band to the pointer. */
  function showPenPreview(nodes: LineNode[], cursor: Vec | null) {
    const { w, h } = viewRef.current;
    showLineDraft(cursor && nodes.length ? [...nodes, { x: cursor.x / w, y: cursor.y / h }] : nodes);
  }
  /** Where the Pen puts the next node: Shift turns it to the angle steps
   * from the previous node; otherwise it snaps to line ends / the grid. */
  function penPoint(pos: StagePoint, shift: boolean, prev: LineNode | null): Vec {
    if (shift && prev) return snapAngle({ x: prev.x * W, y: prev.y * H }, pos, lineTool.angleStep);
    return snapLinePoint(pos);
  }

  /** Free Draw: drag to draw; the trail becomes a few smooth nodes. */
  function startLineFree(start: StagePoint, pointerId: number) {
    const first = snapLinePoint(start),
      trail: Vec[] = [first];
    let frame = 0;
    flushSync(() => setLineDrafting(true));
    const draw = () => {
      frame = 0;
      const { w, h } = viewRef.current,
        // Long trails are thinned for the preview only.
        step = Math.max(1, Math.floor(trail.length / 1500));
      showLineDraft(trail.filter((_, i) => i % step === 0 || i === trail.length - 1).map((p) => ({ x: p.x / w, y: p.y / h })));
    };
    trackPointer(
      pointerId,
      (pos, ev) => {
        const last = trail[trail.length - 1];
        let p: Vec = pos;
        if (ev.shiftKey) p = snapAngle(first, pos, lineTool.angleStep);
        if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5 || trail.length >= MAX_PAINT_POINTS) return;
        if (ev.shiftKey) trail.length = 1;
        trail.push(p);
        frame ||= requestAnimationFrame(draw);
      },
      (commit) => {
        cancelAnimationFrame(frame);
        setLineDrafting(false);
        if (!commit || trail.length < 2) return;
        const { w, h } = viewRef.current;
        trail[trail.length - 1] = snapLinePoint(trail[trail.length - 1]);
        let length = 0;
        for (let i = 1; i < trail.length; i++) length += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
        if (length < 4) return;
        // Ending where it began closes the loop.
        const closed = length > 60 && Math.hypot(trail[0].x - trail[trail.length - 1].x, trail[0].y - trail[trail.length - 1].y) < REGION_CLOSE_PX;
        const nodes = fitTrail(trail, w, h, lineTool.smoothing, closed);
        if (nodes.length >= (closed ? 3 : 2)) addLine(newLine(nodes, closed));
      },
    );
  }

  /** Pen: click to place a node, drag to pull its handles (Alt: one handle).
   * Click the first node to close the line, the last node (or double-click,
   * right-click, Enter) to finish it. Starting on an end of an open line
   * continues that line. */
  function penDown(pos: StagePoint, ev: PointerEvent) {
    const draft = penDraft;
    if (!draft) {
      const end = lineEndAt(pos);
      if (end) {
        setPenTarget({ id: end.line.id, atStart: end.atStart });
        setPenDraft(end.atStart ? reverseNodes(end.line.nodes) : end.line.nodes);
        return;
      }
    }
    const prev = draft?.[draft.length - 1] ?? null,
      p = penPoint(pos, ev.shiftKey, prev);
    if (draft && draft.length >= 3 && !penTarget && Math.hypot(draft[0].x * W - p.x, draft[0].y * H - p.y) < REGION_CLOSE_PX) {
      finishPen(true);
      return;
    }
    if (prev && Math.hypot(prev.x * W - p.x, prev.y * H - p.y) < REGION_DUPLICATE_PX * 1.5) {
      if (draft!.length >= 2) finishPen(false);
      return;
    }
    if (draft && draft.length >= 2000) return;
    const base = draft ?? [],
      node: LineNode = { x: p.x / W, y: p.y / H };
    let cur = node;
    setPenDraft([...base, node]);
    trackPointer(
      ev.pointerId,
      (pos2, e2) => {
        const { w, h } = viewRef.current,
          dx = pos2.x - p.x,
          dy = pos2.y - p.y;
        if (Math.hypot(dx, dy) < 3) return;
        const ho = { x: dx / w, y: dy / h };
        cur = e2.altKey ? { ...node, ho } : { ...node, t: "smooth", ho, hi: { x: -ho.x, y: -ho.y } };
        showPenPreview([...base, cur], null);
      },
      (commit) => {
        if (commit && cur !== node) setPenDraft([...base, cur]);
      },
    );
  }
  function finishPen(closeIt: boolean) {
    const draft = penDraft,
      target = penTarget;
    setPenDraft(null);
    setPenTarget(null);
    penCursorRef.current = null;
    if (!draft || draft.length < 2) return;
    if (target) {
      const nodes = (target.atStart ? reverseNodes(draft) : draft).map(roundNode);
      patchLines([target.id], () => ({ nodes }));
      return;
    }
    addLine(newLine(draft, closeIt && draft.length >= 3));
  }

  // ---- Edit Nodes ----
  function toggleNodeEdit(id: string) {
    if (nodeEdit?.id === id) setNodeEdit(null);
    else {
      selectOnly(id);
      setNodeEdit({ id, sel: [] });
    }
  }
  /** Removes the selected nodes; a line left too short opens or goes away. */
  function removeEditedNodes() {
    if (!editedLine || !nodeEdit) return;
    const drop = new Set(nodeEdit.sel);
    const nodes = editedLine.nodes.filter((_, i) => !drop.has(i));
    let closed = editedLine.closed;
    if (closed && nodes.length < 3) closed = false;
    if (nodes.length < 2) {
      removeObjects([editedLine.id]);
      setNodeEdit(null);
      return;
    }
    patchLines([editedLine.id], () => ({ nodes, closed }));
    setNodeEdit({ ...nodeEdit, sel: [] });
  }
  /** Width keys: the selected lines, else the next line. */
  function scaleLineWidth(k: number) {
    const scale = (l: LineLook): LineLook =>
      l.mode === "stamp"
        ? { ...l, stamp: { ...l.stamp, size: clamp(l.stamp.size * k, 0.0005, 0.2) } }
        : { ...l, stroke: { ...l.stroke, width: clamp(l.stroke.width * k, 0.0002, 0.2) } };
    if (selectedLines.length) patchLines(selectedLines.map((o) => o.id), (o) => scale(lineLookOf(o)));
    else setLineTool((st) => ({ ...st, look: scale(st.look), styleId: st.styleId }));
  }

  // ---- Arranging: groups, lock/hide, align & distribute (see ./arrange) -------
  function groupSelection() {
    if (selectedObjs.length < 2) return;
    const group = crypto.randomUUID(),
      ids = selectedObjs.map((o) => o.id);
    setProject((p) => applyObjectPatches(p, new Map(ids.map((id) => [id, () => ({ group })]))));
  }
  function ungroupSelection() {
    const ids = selectedObjs.filter((o) => o.group).map((o) => o.id);
    if (!ids.length) return;
    setProject((p) => applyObjectPatches(p, new Map(ids.map((id) => [id, () => ({ group: undefined })]))));
  }
  /** Locks/unlocks or hides/shows objects. Locked or hidden objects leave the selection. */
  function setObjectFlags(ids: string[], flags: { locked?: boolean; hidden?: boolean }) {
    if (!ids.length) return;
    setProject((p) => applyObjectPatches(p, new Map(ids.map((id) => [id, () => flags]))));
    if (flags.locked || flags.hidden) setSelectedIds((cur) => cur.filter((id) => !ids.includes(id)));
  }
  /** Selected objects' boxes on the stage, a group counting as one unit. */
  function selectionUnits() {
    const stage = stageRef.current,
      units = new Map<string, { ids: string[]; rect: Box }>();
    if (!stage) return units;
    for (const o of selectedObjs) {
      if (o.kind === "paint" || o.kind === "land" || o.locked) continue;
      const node = findNode(stage, o.id);
      if (!node) continue;
      const r = node.getClientRect({ relativeTo: stage, skipShadow: true }),
        key = o.group ?? o.id,
        u = units.get(key);
      if (!u) units.set(key, { ids: [o.id], rect: r });
      else {
        const x = Math.min(u.rect.x, r.x),
          y = Math.min(u.rect.y, r.y);
        u.rect = { x, y, width: Math.max(u.rect.x + u.rect.width, r.x + r.width) - x, height: Math.max(u.rect.y + u.rect.height, r.y + r.height) - y };
        u.ids.push(o.id);
      }
    }
    return units;
  }
  function arrangeSelection(how: AlignMode | "distributeX" | "distributeY") {
    const units = selectionUnits();
    if (units.size < 2) return;
    const rects = new Map([...units].map(([k, u]) => [k, u.rect]));
    const deltas =
      how === "distributeX" ? distributeDeltas(rects, "x") : how === "distributeY" ? distributeDeltas(rects, "y") : alignDeltas(rects, how);
    const updaters = new Map<string, ObjUpdater>();
    for (const [key, d] of deltas) {
      if (!d.dx && !d.dy) continue;
      for (const id of units.get(key)!.ids) updaters.set(id, (cur) => shiftPatch(cur, d.dx / W, d.dy / H));
    }
    if (updaters.size) setProject((p) => applyObjectPatches(p, updaters));
  }

  /** Scene stamp: the selection drawn into one picture and saved to My
   * stamps, to place again in any map. */
  async function saveSelectionAsStamp() {
    const stage = stageRef.current;
    if (!stage || !user || !selectedObjs.length) return;
    const parts = selectedObjs
      .filter((o) => o.kind !== "paint" && o.kind !== "land" && !o.hidden)
      .map((o) => ({ o, node: findNode(stage, o.id) }))
      .filter((x): x is { o: MMObject; node: Konva.Node } => !!x.node);
    if (!parts.length) return;
    const rects = parts.map((x) => x.node.getClientRect({ relativeTo: stage })),
      x0 = Math.min(...rects.map((r) => r.x)),
      y0 = Math.min(...rects.map((r) => r.y)),
      x1 = Math.max(...rects.map((r) => r.x + r.width)),
      y1 = Math.max(...rects.map((r) => r.y + r.height)),
      // As sharp as the map itself, at most 2048 px on the long side.
      k = Math.min(project.width / W, 2048 / Math.max(1, x1 - x0, y1 - y0));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round((x1 - x0) * k));
    out.height = Math.max(1, Math.round((y1 - y0) * k));
    const ctx = out.getContext("2d")!,
      restore: (() => void)[] = [];
    try {
      parts.forEach(({ o, node }, i) => {
        // Stamps drawn from art sized for the picture, not the screen.
        if (o.kind === "stamp") {
          const img = (node as Konva.Group).findOne(`.${STAMP_IMAGE}`) as Konva.Image | undefined,
            hi = stampPicture(o, o.size * W * k, W, H);
          if (img && hi) {
            const old = img.image();
            img.image(hi);
            restore.push(() => img.image(old));
          }
        }
        const r = rects[i];
        ctx.drawImage(node.toCanvas({ pixelRatio: k }), (r.x - x0) * k, (r.y - y0) * k, r.width * k, r.height * k);
      });
    } finally {
      restore.forEach((f) => f());
    }
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    if (!blob) return;
    const name = t("stSceneName", { n: new Date().toLocaleDateString(i18n.language) });
    const error = await uploadOwnStamps([new File([blob], `${name}.png`, { type: "image/png" })], false);
    setNoticeOk(!error);
    setNotice(error ?? t("stSceneSaved"));
  }

  // The canvas wheel, as a native listener so it can stop the page scrolling:
  //   Shift + wheel        resize stamps (placing, or the selected ones)
  //   Alt + wheel          turn them
  //   Ctrl/⌘ + wheel       zoom the map — or turn stamps, by preference
  //   wheel / two fingers  scroll the map
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  useLayoutEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      const mod = e.ctrlKey || e.metaKey,
        // macOS turns Shift + wheel into a sideways scroll.
        d = e.deltaY || e.deltaX;
      if (stampStepsActive() && d && (e.shiftKey || e.altKey || (mod && ctrlWheel === "rotate"))) {
        e.preventDefault();
        if (e.shiftKey && !e.altKey && !mod) scaleStamps(d < 0 ? 1.05 : 1 / 1.05);
        else turnStamps(d < 0 ? -5 : 5);
        return;
      }
      if (!mod) return;
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
    };
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- Stamp size & direction from the keyboard and wheel -----------------------
  // The same steps work while placing (they change the next stamp, and its
  // preview follows) and on selected stamps (each changes where it stands).
  /** Stamps the steps act on, or null while placing. */
  function nudgeTargets() {
    return tool === "select" && selectedStamps.length ? selectedStamps.map((o) => o.id) : null;
  }
  const stampStepsActive = () => tool === "stamp" || (tool === "select" && selectedStamps.length > 0);
  function scaleStamps(k: number) {
    const ids = nudgeTargets();
    if (ids) adjustStamps(ids, (o) => ({ size: clamp(o.size * k, 0.002, 0.8) }));
    else setStampTool((st) => ({ ...st, look: { ...st.look, size: clamp(st.look.size * k, 0.002, 0.8) } }));
  }
  function turnStamps(deg: number) {
    const ids = nudgeTargets();
    if (ids) adjustStamps(ids, (o) => ({ rotation: normalizeAngle(o.rotation + deg) }));
    else setStampTool((st) => ({ ...st, look: { ...st.look, rotation: normalizeAngle(st.look.rotation + deg) } }));
  }
  function changeCtrlWheel(next: CtrlWheel) {
    setCtrlWheel(next);
    try {
      localStorage.setItem(CTRL_WHEEL_KEY, next);
    } catch {}
  }

  // ---- Stamp tool ---------------------------------------------------------------
  /** The stamp the next click places (variant, size and turn already drawn),
   * shown as a preview under the pointer. */
  const nextStamp = useMemo(
    () => (tool === "stamp" ? makeStamp(stampTool, { x: 0, y: 0 }, mulberry32(stampDraw * 7907)) : null),
    [tool, stampTool, stampDraw],
  );
  /** Single: a click places one stamp. Multiple: a drag scatters stamps along
   * the stroke (previewed live, added as one undo step on release). Auto: a
   * click places one, a drag scatters. */
  function startStamping(start: StagePoint, pointerId: number) {
    const s = stampTool,
      { w, h } = viewRef.current;
    // A click places exactly the stamp its preview showed.
    const placeOne = () => {
      if (!nextStamp) return;
      const at = snap({ x: clamp(start.x / w, 0, 1), y: clamp(start.y / h, 0, 1) });
      addObjects([{ ...nextStamp, id: crypto.randomUUID(), x: at.x, y: at.y }], s.autoSelect);
      setStampDraw((n) => n + 1);
    };
    if (s.placement === "single") return placeOne();
    let scatter: Scatter | null = null;
    const placed: MMStamp[] = [];
    const begin = () => {
      scatter = new Scatter(s, w, h, newSeed());
      placed.push(...scatter.feed(start.x, start.y));
      setScatterDraft([...placed]);
    };
    if (s.placement === "multiple") begin();
    trackPointer(
      pointerId,
      (pos) => {
        // Auto: a drag (not a click) turns into scattering.
        if (!scatter) {
          if (Math.hypot(pos.x - start.x, pos.y - start.y) < 6) return;
          begin();
        }
        const more = scatter!.feed(pos.x, pos.y);
        if (more.length && placed.length < MAX_OBJECTS_PER_LAYER) {
          placed.push(...more);
          setScatterDraft([...placed]);
        }
      },
      (commit) => {
        setScatterDraft(null);
        if (!commit) return;
        if (!scatter) return placeOne();
        const list = s.depthSort ? [...placed].sort((a, b) => a.y - b.y) : placed;
        addObjects(list, false);
      },
    );
  }
  /** The look shared by the selected stamps (the first one's), for the panel. */
  const selectedStamps = selectedObjs.filter((o): o is MMStamp => o.kind === "stamp");
  const stampEditing =
    selectedStamps.length > 0 && selectedStamps.length === selectedObjs.length && (tool === "select" || (tool === "stamp" && stampTool.autoSelect))
      ? {
          count: selectedStamps.length,
          look: lookOf(selectedStamps[0]),
          vector: selectedStamps.every((o) => setOfAsset(o.asset)?.vector ?? true),
          setId: setOfAsset(selectedStamps[0].asset)?.id ?? null,
        }
      : null;
  /** Clip "texture" starts from the land texture at or below the active layer. */
  const clipDefault = (() => {
    for (let i = project.layers.findIndex((l) => l.id === active?.id); i >= 0; i--)
      if (project.layers[i].role === "land") return landSettings(project.layers[i]).base;
    return DEFAULT_SOURCE;
  })();
  /** Applies a look change to every selected stamp, each where it stands.
   * A new anchor point moves (x, y) so the stamp itself doesn't move. */
  function editSelectedStamps(patch: Partial<StampLook>) {
    const { pivot, ...rest } = patch,
      w = W,
      h = H;
    setProject((p) =>
      applyObjectPatches(
        p,
        new Map(
          selectedStamps.map((o) => [
            o.id,
            (cur: MMObject) => (cur.kind === "stamp" ? { ...rest, ...(pivot ? repivot({ ...cur, ...rest }, pivot, w, h) : {}) } : {}),
          ]),
        ),
      ),
    );
  }

  // ---- Brush & Land tools ----------------------------------------------------
  // Both tools build a *recipe* while the pointer moves — MMPaint for the
  // Brush (colour/texture), MMLand for the Land tool (where land is) —
  // preview it live inside the active layer, exactly as it will look once
  // merged, and add it as one object (one undo step) on release. They share
  // every gesture: free stroke, lasso, rectangle/ellipse drag and the
  // click-by-click polygon (plus Grid Block for paint).

  /** Brush panel / toolbar changes. Switching sub-tool drops a half-built polygon. */
  function updateBrush(next: BrushState) {
    if (next.mode !== brushState.mode) setPolyDraft(null);
    setBrushState(next);
  }
  /** Land panel / toolbar changes. Switching sub-tool drops a half-built polygon. */
  function updateLandTool(next: LandToolState) {
    if (next.mode !== landTool.mode) setPolyDraft(null);
    setLandTool(next);
  }
  /** A paint recipe from the current Brush panel settings. */
  function buildPaint(mode: PaintMode, points: PaintPoint[], seed = newSeed(), cells?: [number, number][]): MMPaint {
    const b = brushState,
      shape = mode === "rect" || mode === "ellipse" || mode === "polygon";
    return {
      id: crypto.randomUUID(),
      kind: "paint",
      mode,
      erase: b.erase,
      blend: b.blend,
      opacity: b.opacity,
      source: b.source,
      points,
      ...(mode === "free" ? { brush: b.brush } : { edge: b.edge }),
      ...(shape ? { rough: b.rough } : {}),
      ...(mode === "grid" ? { cells: cells ?? [], grid: b.grid } : {}),
      seed,
    };
  }
  /** A land recipe from the current Land panel settings. */
  function buildLand(mode: LandMode, points: PaintPoint[], seed = newSeed()): MMLand {
    const l = landTool,
      shape = mode === "rect" || mode === "ellipse" || mode === "polygon";
    return {
      id: crypto.randomUUID(),
      kind: "land",
      mode,
      erase: l.erase,
      points,
      ...(mode === "free" ? { size: l.size } : { edge: l.edge }),
      ...(shape ? { rough: l.rough } : {}),
      seed,
    };
  }
  /** A recipe for the active tool (Land tool → land, otherwise paint). */
  function buildDraft(mode: PaintMode | LandMode, points: PaintPoint[], seed = newSeed(), cells?: [number, number][]) {
    return tool === "land"
      ? buildLand(mode as LandMode, points, seed)
      : buildPaint(mode as PaintMode, points, seed, cells);
  }
  /** The active layer's land context, when it's a land layer. */
  function landContext(): LandContext | null {
    if (active?.role !== "land") return null;
    return { base: landSettings(active).base, land: landMasksRef.current.get(active.id) ?? null };
  }
  /** Clips a raster to the land (`land` covers the whole stage at w×h). */
  function clipToLand(r: RenderedPaint, land: HTMLCanvasElement, w: number, h: number): RenderedPaint {
    const out = makeCanvas(r.canvas.width, r.canvas.height),
      ctx = out.getContext("2d")!;
    ctx.drawImage(r.canvas, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(land, -r.x, -r.y, w, h);
    return { ...r, canvas: out };
  }
  /** Finishes a paint preview raster on a land layer: the texture eraser
   * shows the base texture it restores, and everything is clipped to the
   * land (no land yet → nothing to see). Elsewhere it's used as-is. */
  function onLandPreview(r: RenderedPaint | null, erase: boolean, ctx: LandContext | null, w: number, h: number) {
    if (!r || !ctx) return r;
    if (!ctx.land) return null;
    const canvas = erase ? colorize(r.canvas, ctx.base, w, r.x, r.y) : r.canvas;
    return clipToLand({ ...r, canvas }, ctx.land, w, h);
  }
  /** A draft's live preview raster: land in the base texture (removed land
   * as a cut-out), paint as it will look in its layer. */
  function previewRaster(o: MMPaint | MMLand, w: number, h: number, ctx: LandContext | null) {
    if (o.kind === "land") {
      const r = renderLand(o, w, h, true);
      return r && !o.erase && ctx ? { ...r, canvas: colorize(r.canvas, ctx.base, w, r.x, r.y) } : r;
    }
    return onLandPreview(renderPaint(o, w, h, true), o.erase, ctx, w, h);
  }
  /** How a free stroke is painted live (see previewRaster). */
  function liveStyle(o: MMPaint | MMLand, ctx: LandContext | null): StrokeStyle {
    if (o.kind === "land")
      return { brush: landBrush(o.size ?? landTool.size), source: o.erase ? null : (ctx?.base ?? null), seed: o.seed };
    // A texture eraser on a land layer paints the base texture back.
    return { brush: o.brush!, source: o.erase ? (ctx?.base ?? null) : o.source, seed: o.seed };
  }
  /** Shows a raster in the live preview node (or hides it). */
  function showPaintRaster(r: RenderedPaint | null) {
    const node = paintImageRef.current;
    if (!node) return;
    if (!r) node.visible(false);
    else node.setAttrs({ image: r.canvas, x: r.x, y: r.y, width: r.canvas.width, height: r.canvas.height, visible: true });
    node.getLayer()?.batchDraw();
  }
  /** Redraws the live preview at most once per animation frame. */
  function schedulePaintFrame() {
    if (paintFrameRef.current) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = 0;
      const session = paintSessionRef.current;
      if (!session) return;
      const { w, h } = viewRef.current,
        { obj, live, onLand } = session;
      if (!live) {
        showPaintRaster(previewRaster(obj, w, h, onLand));
        return;
      }
      live.compose();
      const r = { canvas: live.canvas, x: 0, y: 0 };
      // The live stroke already carries its colours; paint on land is clipped.
      showPaintRaster(obj.kind === "paint" && onLand ? (onLand.land ? clipToLand(r, onLand.land, w, h) : null) : r);
    });
  }
  /** A pointer sample in normalized map coordinates, with pen pressure. */
  function paintSample(pos: StagePoint, ev: PointerEvent): PaintPoint {
    const { w, h } = viewRef.current,
      pt: PaintPoint = { x: q5(clamp(pos.x / w, -0.05, 1.05)), y: q5(clamp(pos.y / h, -0.05, 1.05)) };
    // Pressure only matters to the Brush (the land brush has a fixed size).
    if (tool === "brush" && ev.pointerType === "pen" && ev.pressure > 0) pt.p = Math.round(ev.pressure * 100) / 100;
    return pt;
  }

  /** Starts a Brush or Land gesture at the pointer. */
  function startDraw(pos: StagePoint, ev: PointerEvent) {
    const mode = drawMode;
    if (mode === "polygon") {
      addPolygonVertex(toNorm(pos));
      return;
    }
    const first = paintSample(pos, ev),
      obj = buildDraft(mode, [first], newSeed(), mode === "grid" ? [] : undefined),
      session: DrawSession = { obj, live: null, onLand: landContext() },
      aspect = project.height / project.width,
      cellKeys = new Set<string>();
    const addCell = (pt: PaintPoint) => {
      if (obj.kind !== "paint" || !obj.cells || !obj.grid || obj.cells.length >= MAX_GRID_CELLS) return;
      const cell = gridCellAt(pt.x, pt.y, obj.grid, aspect),
        key = `${cell[0]},${cell[1]}`;
      if (cellKeys.has(key)) return;
      cellKeys.add(key);
      obj.cells.push(cell);
    };
    paintSessionRef.current = session;
    // Mount the preview node now, so the first frame already has it.
    flushSync(() => setPaintPreview(true));
    if (mode === "free") {
      const { w, h } = viewRef.current;
      session.live = new LiveStroke(liveStyle(obj, session.onLand), w, h);
      session.live.add(first);
    } else if (mode === "grid") addCell(first);
    if (mode !== "rect" && mode !== "ellipse") schedulePaintFrame();

    trackPointer(
      ev.pointerId,
      (p, e) => {
        const { w, h } = viewRef.current,
          pt = paintSample(p, e),
          pts = obj.points,
          last = pts[pts.length - 1],
          gapPx = Math.hypot((pt.x - last.x) * w, (pt.y - last.y) * h);
        if (mode === "free") {
          if (gapPx < PAINT_GAP_PX || pts.length >= MAX_PAINT_POINTS) return;
          pts.push(pt);
          session.live!.add(pt);
        } else if (mode === "edge") {
          if (gapPx < LASSO_GAP_PX || pts.length >= MAX_PAINT_POINTS) return;
          pts.push(pt);
        } else if (mode === "rect" || mode === "ellipse") {
          // Shift: perfect square / circle. Alt: draw from the center.
          let dx = (pt.x - first.x) * w,
            dy = (pt.y - first.y) * h;
          if (e.shiftKey) {
            const m = Math.max(Math.abs(dx), Math.abs(dy));
            dx = Math.sign(dx || 1) * m;
            dy = Math.sign(dy || 1) * m;
          }
          const corner = { x: q5(first.x + dx / w), y: q5(first.y + dy / h) };
          obj.points = e.altKey ? [{ x: q5(first.x - dx / w), y: q5(first.y - dy / h) }, corner] : [first, corner];
        } else if (mode === "grid" && obj.kind === "paint") {
          // Fill every cell along the segment, so fast drags leave no gaps.
          const cellPx = obj.grid!.cell * w,
            steps = Math.max(1, Math.ceil(gapPx / Math.max(2, cellPx / 3)));
          for (let k = 1; k <= steps; k++)
            addCell({ x: last.x + ((pt.x - last.x) * k) / steps, y: last.y + ((pt.y - last.y) * k) / steps });
          pts.push(pt);
        }
        schedulePaintFrame();
      },
      (commit) => {
        cancelAnimationFrame(paintFrameRef.current);
        paintFrameRef.current = 0;
        paintSessionRef.current = null;
        setPaintPreview(false);
        if (!commit || !drawIsWorthKeeping(obj)) return;
        // Grid Block stores cells, not the pointer trail.
        addObject(obj.kind === "paint" && mode === "grid" ? { ...obj, points: [] } : obj);
      },
    );
  }
  /** Filters out accidental clicks for shape tools (tiny lasso, zero-size box). */
  function drawIsWorthKeeping(o: MMPaint | MMLand) {
    const px = (a: PaintPoint, b: PaintPoint) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
    switch (o.mode) {
      case "free":
        return o.points.length > 0;
      case "grid":
        return o.kind === "paint" && (o.cells?.length ?? 0) > 0;
      case "rect":
      case "ellipse":
        return o.points.length === 2 && Math.abs(o.points[0].x - o.points[1].x) * W > 3 && Math.abs(o.points[0].y - o.points[1].y) * H > 3;
      case "edge": {
        if (o.points.length < 3) return false;
        let span = 0;
        for (const p of o.points) span = Math.max(span, px(p, o.points[0]));
        return span > 8;
      }
      default:
        return o.points.length >= 3;
    }
  }
  /** Polygon sub-tool: click to add vertices; click the first vertex,
   * double-click or press Enter to close; Escape cancels. */
  function addPolygonVertex(p: Point) {
    const pt = { x: q5(p.x), y: q5(p.y) },
      draft = polyDraft;
    if (!draft) {
      polySeedRef.current = newSeed();
      setPolyDraft([pt]);
      return;
    }
    const dist = (a: PaintPoint, b: PaintPoint) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
    if (draft.length >= 3 && dist(draft[0], pt) < REGION_CLOSE_PX) {
      commitPolygon();
      return;
    }
    if (dist(draft[draft.length - 1], pt) < REGION_DUPLICATE_PX || draft.length >= MAX_REGION_POINTS) return;
    setPolyDraft([...draft, pt]);
  }
  function commitPolygon() {
    if (polyDraft && polyDraft.length >= 3) addObject(buildDraft("polygon", polyDraft, polySeedRef.current));
    setPolyDraft(null);
  }
  /** Brush size cursor: follows the pointer over the canvas (imperatively). */
  function handleStageHover(e: Konva.KonvaEventObject<PointerEvent>) {
    moveStampGhost(e.target.getStage()?.getPointerPosition() ?? null);
    const pos = e.target.getStage()?.getPointerPosition();
    // Pen: rubber band from the last node to where the next one would go.
    if (tool === "line" && penDraft && pos && !pointerSessionRef.current) {
      const prev = penDraft[penDraft.length - 1];
      penCursorRef.current = penPoint(pos, e.evt.shiftKey, prev);
      showPenPreview(penDraft, penCursorRef.current);
    }
    const c = brushCursorRef.current;
    if (!c) return;
    const show =
      (((tool === "brush" || tool === "land") && drawMode === "free") || (tool === "line" && lineTool.draw !== "edit")) && !!pos && !spaceHeld;
    if (show) c.setAttrs({ x: pos!.x, y: pos!.y, visible: true });
    else if (!c.visible()) return;
    else c.visible(false);
    c.getLayer()?.batchDraw();
  }
  /** Moves the placing preview to the pointer (snapped like the click will be). */
  function moveStampGhost(pos: StagePoint | null) {
    const g = stampGhostRef.current;
    if (!g) return;
    if (!pos || spaceHeld) {
      if (g.visible()) {
        g.visible(false);
        g.getLayer()?.batchDraw();
      }
      return;
    }
    const at = stampTool.placement === "multiple" ? toNorm(pos) : snap(toNorm(pos));
    g.setAttrs({ x: at.x * W, y: at.y * H, visible: true });
    g.getLayer()?.batchDraw();
  }
  function hideBrushCursor() {
    moveStampGhost(null);
    const c = brushCursorRef.current;
    if (c?.visible()) {
      c.visible(false);
      c.getLayer()?.batchDraw();
    }
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
        if (o.kind === "paint" || o.kind === "land" || !pickable(o)) return false; // raster-like, or locked/hidden
        const node = nodes.get(o.id);
        if (!node) return false;
        const r = node.getClientRect({ relativeTo: stage });
        return r.x < x1 && r.x + r.width > x0 && r.y < y1 && r.y + r.height > y0;
      })
      .map((o) => o.id);
    const unit = withGroups(hits, active.objects);
    setSelectedIds((cur) => (additive ? Array.from(new Set([...cur, ...unit])) : unit));
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
  /** Double-click closes a Region / Polygon draft — but only a *real* double
   * click: Konva fires dblclick for any two quick clicks, even far apart,
   * which would close a shape while the user is still placing corners fast. */
  function finishRegion(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const pos = e.target.getStage()?.getPointerPosition(),
      onLast = (pts: Point[] | null) => {
        const last = pts?.[pts.length - 1];
        return !!pos && !!last && Math.hypot(last.x * W - pos.x, last.y * H - pos.y) <= REGION_DUPLICATE_PX * 2;
      };
    if (tool === "region" && regionDraft && regionDraft.length >= 3 && onLast(regionDraft)) commitRegion(regionDraft);
    if ((tool === "brush" || tool === "land") && polyDraft && polyDraft.length >= 3 && onLast(polyDraft)) commitPolygon();
    // (The Pen finishes a real double-click itself: its second click lands on
    // the last node. Konva's dblclick also fires for two quick clicks far
    // apart, so it must not end a line.)
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
  /** Rasterises just the map at the project's native resolution.
   *  - Editor-only chrome (snap grid, drafts/marquee, brush cursor, selection
   *    Transformer) is hidden for the capture and restored synchronously, so
   *    it never ends up in the print and never flashes on screen.
   *  - Each layer is rendered on its own and then stacked, exactly like the
   *    on-screen layer canvases — so an eraser or a blend mode only ever acts
   *    within its own layer, as it does while editing.
   *  - Land layers are rebuilt at full resolution (in the worker) with every
   *    edit included; paint on other layers is re-rendered at full resolution
   *    too (not upscaled from the screen raster), so textures stay crisp. */
  async function renderMapCanvas(stage: Konva.Stage) {
    // Exactly the project's own pixel size (W/H are rounded display sizes).
    const ratio = project.width / W,
      outW = project.width,
      outH = project.height;
    // Full-resolution land layers first (async), then the synchronous capture.
    const landImages = new Map<string, HTMLCanvasElement | null>();
    for (const layer of project.layers) {
      const land = layer.visible ? landByLayer.get(layer.id) : undefined;
      if (!land) continue;
      const img = await renderLandLayer({ layerId: layer.id, ...land, seed: layerSeed(layer.id) }, outW, outH);
      landImages.set(layer.id, img?.image ?? null);
    }
    const chrome = [gridGroupRef.current, overlayLayerRef.current, uiLayerRef.current].filter(
      (n): n is Konva.Group | Konva.Layer => !!n,
    );
    const wasVisible = chrome.map((n) => n.visible());
    // Swap screen rasters for print-resolution ones (restored afterwards).
    const swapped: { node: Konva.Node; attrs: Konva.NodeConfig }[] = [];
    const swap = (node: Konva.Node, attrs: Konva.NodeConfig) => {
      swapped.push({ node, attrs: Object.fromEntries(Object.keys(attrs).map((k) => [k, node.getAttr(k)])) });
      node.setAttrs(attrs);
    };
    // Not-yet-merged land edits: the full-res images already contain them.
    for (const n of stage.find((x: Konva.Node) => x.name() === LAND_PENDING_NAME)) swap(n, { visible: false });
    // Stamps: their art redrawn at print size (uploaded images are already full size).
    for (const layer of project.layers) {
      if (!layer.visible) continue;
      for (const o of layer.objects) {
        if (o.kind !== "stamp") continue;
        const node = (findNode(stage, o.id) as Konva.Group | null)?.findOne(`.${STAMP_IMAGE}`),
          hi = node ? stampPicture(o, o.size * outW, outW, outH) : null;
        if (node && hi) swap(node, { image: hi });
      }
    }
    for (const layer of project.layers) {
      if (!layer.visible) continue;
      if (landImages.has(layer.id)) {
        const node = findNode(stage, landImageId(layer.id)),
          img = landImages.get(layer.id) ?? null;
        if (node) swap(node, { image: img ?? undefined, visible: !!img });
        continue;
      }
      for (const o of layer.objects) {
        if (o.kind !== "paint") continue;
        const node = findNode(stage, o.id),
          hi = node ? renderPaint(o, project.width, project.height) : null;
        if (!node || !hi) continue;
        swap(node, { image: hi.canvas, x: hi.x / ratio, y: hi.y / ratio, width: hi.canvas.width / ratio, height: hi.canvas.height / ratio });
      }
    }
    chrome.forEach((n) => n.visible(false));
    try {
      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext("2d")!;
      for (const layer of stage.getLayers()) {
        if (!layer.visible() || layer === overlayLayerRef.current || layer === uiLayerRef.current) continue;
        ctx.globalCompositeOperation = layerBlendOf(layer);
        ctx.drawImage(layer.toCanvas({ x: 0, y: 0, width: W, height: H, pixelRatio: ratio }), 0, 0, outW, outH);
      }
      return out;
    } finally {
      chrome.forEach((n, i) => n.visible(wasVisible[i]));
      for (const { node, attrs } of swapped.reverse()) node.setAttrs(attrs);
    }
  }
  /** A small preview of the map for the gallery (editor chrome hidden). */
  async function captureThumbnail(): Promise<Blob | null> {
    const stage = stageRef.current;
    if (!stage || W <= 0) return null;
    const chrome = [gridGroupRef.current, overlayLayerRef.current, uiLayerRef.current].filter(
      (n): n is Konva.Group | Konva.Layer => !!n,
    );
    const wasVisible = chrome.map((n) => n.visible());
    chrome.forEach((n) => n.visible(false));
    let canvas: HTMLCanvasElement;
    try {
      canvas = stage.toCanvas({ x: 0, y: 0, width: W, height: H, pixelRatio: Math.min(1, 480 / W) });
    } finally {
      chrome.forEach((n, i) => n.visible(wasVisible[i]));
    }
    return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  }
  async function handlePrint() {
    const stage = stageRef.current;
    if (!stage || printing) return;
    setPrinting(true);
    setNotice(null);
    try {
      // Cloud maps record each export with the plan's license; the server
      // refuses sizes above what the plan exports.
      if (user && cloud) {
        try {
          await maps.recordExport(cloud.id, project.width, project.height);
        } catch (e) {
          if (e instanceof ApiError && e.code === "plan_limit_reached") {
            setNoticeOk(false);
            setNotice(t("mmExportLimit", { px: e.body.max, w: project.width }));
            return;
          }
          // Offline or a hiccup: printing doesn't wait on the record.
        }
      }
      // Let the button show its busy state before the (heavy) full-res render.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const canvas = await renderMapCanvas(stage);
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

  /** Opens the active land layer's coast settings (Layers tab). */
  function showCoastPanel() {
    setPanelTab("layers");
    requestAnimationFrame(() => coastPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // ---- Derived: the searchable, cross-layer Objects panel list ----
  const searchLower = objectSearch.trim().toLowerCase();
  /** Human-readable name of an object, for the Objects panel and search. */
  function objectLabel(o: MMObject) {
    switch (o.kind) {
      case "label":
        return o.text || t("mmToolLabel");
      case "stamp": {
        const set = setOfAsset(o.asset);
        return set ? setLabel(t, set) : t("mmToolStamp");
      }
      case "region":
        return t(BIOME_LABEL_KEY[o.biome]);
      case "line": {
        if (o.name) return o.name;
        const style = o.styleId ? (builtinLineStyles().find((x) => x.id === o.styleId) ?? libraryStyles.find((x) => x.id === o.styleId)) : undefined;
        if (style) return style.name ?? t(style.labelKey ?? "mmToolLine");
        const set = o.mode === "stamp" ? lineSet(o.stamp.set) : undefined;
        return set ? lineSetLabel(t, set) : t("mmToolLine");
      }
      case "paint": {
        const mode = t(PAINT_MODES.find((m) => m.key === o.mode)?.labelKey ?? "mmToolBrush");
        if (o.erase) return `${t("mmEraser")} · ${mode}`;
        return `${mode} · ${o.source.type === "texture" ? t(textureDef(o.source.texture).labelKey) : t("mmSourceColor")}`;
      }
      case "land":
        return `${t(o.erase ? "mmLandRemove" : "mmLandAdd")} · ${t(LAND_MODES.find((m) => m.key === o.mode)?.labelKey ?? "mmToolLand")}`;
      default:
        return t("mmToolBrush");
    }
  }
  const objectRows = useMemo(
    () =>
      project.layers.flatMap((layer) =>
        layer.objects.map((o) => ({ layer, o })),
      ).filter(({ o }) => !searchLower || objectLabel(o).toLowerCase().includes(searchLower)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.layers, searchLower, i18n.language, libraryStyles],
  );

  /** How the live preview composites into its layer (see previewRaster). */
  const previewLook: { opacity: number; op: GlobalCompositeOperation } =
    tool === "land"
      ? { opacity: 1, op: landTool.erase ? "destination-out" : "source-over" }
      : {
          opacity: brushState.opacity,
          // On land, the texture eraser paints the base texture back.
          op: brushState.erase && active?.role === "land" ? "source-over" : paintCompositeOp(brushState),
        };

  // ---- Line panel: the tool's settings, or the selected lines ----
  const lineEditing =
    selectedLines.length > 0 && selectedLines.length === selectedObjs.length && (tool === "select" || (tool === "line" && lineTool.draw === "edit"))
      ? { count: selectedLines.length, look: lineLookOf(selectedLines[0]), styleId: selectedLines[0].styleId ?? null }
      : null;
  const lineBase = lineBaseLook(lineEditing ? lineEditing.styleId : lineTool.styleId, libraryStyles);
  const singleLine = selectedLines.length === 1 && selectedObjs.length === 1 ? selectedLines[0] : null;
  const lineActions = singleLine
    ? {
        name: singleLine.name ?? "",
        closed: singleLine.closed,
        canClose: singleLine.closed || singleLine.nodes.length >= 3,
        editingNodes: nodeEdit?.id === singleLine.id,
        onRename: (name: string) => patchLines([singleLine.id], () => ({ name: name || undefined })),
        onToggleClosed: () => patchLines([singleLine.id], (o) => ({ closed: !o.closed && o.nodes.length >= 3 })),
        onReverse: () => patchLines([singleLine.id], (o) => ({ nodes: reverseNodes(o.nodes) })),
        onEditNodes: () => toggleNodeEdit(singleLine.id),
      }
    : null;
  /** A new look for the selected lines (and the style it came from, when one was applied). */
  function editSelectedLines(look: LineLook, styleId?: string | null) {
    patchLines(
      selectedLines.map((o) => o.id),
      () => ({ ...look, blend: look.blend, ...(styleId !== undefined ? { styleId } : {}) }),
    );
  }
  /** Uses a line-art set: for the selected lines, or the next line. */
  function applyLineSet(id: string | null) {
    const set = id ? lineSet(id) : undefined;
    if (!set) return;
    if (lineEditing) editSelectedLines(withSet(lineEditing.look, set));
    else setLineTool((st) => ({ ...st, look: withSet(st.look, set), styleId: null }));
  }
  /** The live preview node's base look (stable, so React never resets the
   * nodes it is given imperatively). */
  const lineDraftBase = useMemo(() => ({ ...lineTool.look, nodes: [] as LineNode[], closed: false }), [lineTool.look]);
  const floatingPanel = (stampEditing && tool !== "stamp") || (lineEditing && tool !== "line");
  const blendOp = (b?: string): GlobalCompositeOperation => (b && b !== "normal" ? (b as GlobalCompositeOperation) : "source-over");

  // ---- Render ----
  return (
    <div className="mm-shell">
      <header className="mm-appbar">
        <Link href="/" className="mm-back" title={t("mmBackHome")}>
          <Glyph name="chevronLeft" />
        </Link>
        <button className="mm-back" title={t("mmMyMaps")} onClick={() => router.push("/maps")}>
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
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value, updatedAt: Date.now() }))}
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
              {TOOLS.map((tl) => (
                <MenuRow
                  key={tl.key}
                  label={t(tl.labelKey)}
                  shortcut={shortcutLabels(`tool.${tl.key}` as ShortcutId, keys)}
                  onClick={() => {
                    selectTool(tl.key);
                    setShowEditMenu(false);
                  }}
                />
              ))}
              <div className="mm-menu-divider" />
              <div className="mm-menu-heading">{t("mmMenuEdit")}</div>
              <MenuRow label={t("undo")} shortcut={shortcutLabel("edit.undo", keys)} disabled={!canUndo} onClick={() => { undo(); setShowEditMenu(false); }} />
              <MenuRow label={t("redo")} shortcut={shortcutLabel("edit.redo", keys)} disabled={!canRedo} onClick={() => { redo(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmDuplicateObject")} shortcut={shortcutLabel("edit.duplicate", keys)} disabled={!selectedObjs.length} onClick={() => { duplicateObjects(selectedIds); setShowEditMenu(false); }} />
              <MenuRow label={t("mmGroup")} shortcut={shortcutLabel("edit.group", keys)} disabled={selectedObjs.length < 2} onClick={() => { groupSelection(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmUngroup")} shortcut={shortcutLabel("edit.ungroup", keys)} disabled={!selectedObjs.some((o) => o.group)} onClick={() => { ungroupSelection(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmCopyObject")} shortcut={shortcutLabel("edit.copy", keys)} disabled={!selectedObjs.length} onClick={() => { copySelection(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmPasteObject")} shortcut={shortcutLabel("edit.paste", keys)} disabled={!hasClipboard} onClick={() => { pasteClipboard(); setShowEditMenu(false); }} />
              <MenuRow label={t("mmDeleteObject")} shortcut={shortcutLabel("edit.delete", keys)} disabled={!selectedObjs.length} onClick={() => { removeObjects(selectedIds); setShowEditMenu(false); }} />
              <MenuRow label={t("mmBringToFront")} shortcut={shortcutLabel("arrange.front", keys)} disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "front"); setShowEditMenu(false); }} />
              <MenuRow label={t("mmBringForward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "forward"); setShowEditMenu(false); }} />
              <MenuRow label={t("mmSendBackward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "backward"); setShowEditMenu(false); }} />
              <MenuRow label={t("mmSendToBack")} shortcut={shortcutLabel("arrange.back", keys)} disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "back"); setShowEditMenu(false); }} />
              <div className="mm-menu-divider" />
              <div className="mm-menu-heading">{t("mmMenuView")}</div>
              <MenuRow label={t("mmFitScreen")} onClick={() => { setZoom(1); setShowEditMenu(false); }} icon="fit" />
              <MenuHint label={t("mmZoom")} hint={t("mmZoomHint")} />
              <MenuHint label={t("mmPan")} hint={t("mmPanHint")} />
              <MenuHint label={t("mmCancelDraft")} hint={t("mmEscapeHint")} />
              <MenuHint label={t("mmMultiSelect")} hint={t("mmMultiSelectHint")} />
              <div className="mm-menu-heading">{t("stWheelHeading")}</div>
              <MenuRow label={t("stWheelZoom")} icon={ctrlWheel === "zoom" ? "check" : undefined} onClick={() => changeCtrlWheel("zoom")} />
              <MenuRow label={t("stWheelRotate")} icon={ctrlWheel === "rotate" ? "check" : undefined} onClick={() => changeCtrlWheel("rotate")} />
              <MenuHint
                label={t("stStampKeys")}
                hint={t("stStampKeysHint", {
                  bigger: shortcutLabels("stamp.bigger", keys),
                  smaller: shortcutLabels("stamp.smaller", keys),
                  left: shortcutLabel("stamp.turnLeft", keys),
                  right: shortcutLabel("stamp.turnRight", keys),
                })}
              />
              <div className="mm-menu-heading">{t("lnMenuHeading")}</div>
              <MenuHint
                label={t("lnKeysDraw", { line: shortcutLabel("tool.line", keys), free: shortcutLabel("line.free", keys), pen: shortcutLabel("line.pen", keys), nodes: shortcutLabel("line.editNodes", keys) })}
                hint={t("lnKeysDrawHint", { wider: shortcutLabel("line.wider", keys), thinner: shortcutLabel("line.thinner", keys) })}
              />
              <MenuHint label={t("lnKeysEdit")} hint={t("lnKeysEditHint")} />
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
              title={`${t(tl.labelKey)} (${shortcutLabels(`tool.${tl.key}` as ShortcutId, keys)})`}
              onClick={() => selectTool(tl.key)}
            >
              <Glyph name={tl.key} />
            </button>
          ))}
        </nav>
        {tool === "brush" && (
          <BrushPanel
            state={brushState}
            onChange={updateBrush}
            t={t}
            mapWidthPx={project.width}
            tileCell={1 / project.tileCols}
            recentColors={recentColors}
            onCommitColor={(c) => setRecentColors((r) => pushRecent(r, c))}
            favorites={favorites}
            onSaveFavorite={(name) =>
              setFavorites((list) => [
                {
                  id: crypto.randomUUID(),
                  name,
                  brush: brushState.brush,
                  opacity: brushState.opacity,
                  blend: brushState.blend,
                  source: brushState.source,
                },
                ...list,
              ])
            }
            onDeleteFavorite={(id) => setFavorites((list) => list.filter((f) => f.id !== id))}
            target={
              active && (
                <EditTarget
                  role={active.role ?? "custom"}
                  layerName={active.name}
                  what={t(active.role === "land" ? "mmTargetLandTexture" : active.role === "water" ? "mmTargetWater" : "mmTargetPaint")}
                  note={active.locked ? t("mmTargetLocked") : active.role === "land" ? t("mmTargetLandTextureNote", { land: shortcutLabel("tool.land", keys) }) : undefined}
                  warning={active.locked}
                />
              )
            }
          />
        )}
        {tool === "land" && (
          <LandPanel
            state={landTool}
            onChange={updateLandTool}
            t={t}
            mapWidthPx={project.width}
            target={
              landTarget ? (
                <EditTarget
                  role="land"
                  layerName={landTarget.name}
                  what={t("mmTargetLandShape")}
                  note={landTarget.locked ? t("mmTargetLocked") : undefined}
                  warning={landTarget.locked}
                />
              ) : (
                <EditTarget
                  role={active?.role ?? "custom"}
                  layerName={active?.name ?? ""}
                  what={t("mmTargetNoLand")}
                  note={t("mmTargetNoLandNote")}
                  warning
                  action={
                    topLand
                      ? { label: t("mmUseLandLayer", { layer: topLand.name }), onClick: () => setActiveLayerId(topLand.id) }
                      : { label: t("mmAddLandLayer"), onClick: () => addLayer("land") }
                  }
                />
              )
            }
            base={landTarget ? landSettings(landTarget).base : null}
            onBaseChange={(patch) => {
              if (!landTarget) return;
              const land = landSettings(landTarget);
              updateLayer(landTarget.id, { land: { ...land, base: { ...land.base, ...patch } } });
            }}
            recentColors={recentColors}
            onCommitColor={(c) => setRecentColors((r) => pushRecent(r, c))}
            onEditCoast={landTarget ? showCoastPanel : null}
          />
        )}
        {(tool === "stamp" || stampEditing) && (
          <StampPanel
            state={stampTool}
            onChange={setStampTool}
            editing={stampEditing}
            onEditLook={editSelectedStamps}
            onDoneEditing={clearSelection}
            floating={tool !== "stamp"}
            defaultClipSource={clipDefault}
            layerBlends={!!active?.blend && active.blend !== "normal"}
            uploads={{
              signedIn: !!user,
              used: user?.usage.upload_bytes ?? 0,
              quota: user?.plan.upload_quota_bytes ?? 0,
              busy: stampUpload.busy,
              error: stampUpload.error,
              onUpload: (files, asSet) => void uploadOwnStamps(files, asSet),
            }}
            t={t}
            mapWidthPx={project.width}
            recentColors={recentColors}
            onCommitColor={(c) => setRecentColors((r) => pushRecent(r, c))}
            target={
              active && (
                <EditTarget
                  role={active.role ?? "custom"}
                  layerName={active.name}
                  what={t("stTarget")}
                  note={active.locked ? t("mmTargetLocked") : undefined}
                  warning={active.locked}
                />
              )
            }
          />
        )}
        {(tool === "line" || lineEditing) && (
          <LinePanel
            state={lineTool}
            onChange={changeLineTool}
            editing={lineEditing}
            onEditLook={editSelectedLines}
            onDoneEditing={() => {
              clearSelection();
              setNodeEdit(null);
            }}
            baseLook={lineBase}
            line={lineActions}
            library={{
              signedIn: !!user,
              own: lineLib.own,
              official: lineLib.official,
              max: lineLib.max,
              busy: lineLib.busy,
              error: lineLib.error,
              onSave: (name) => void lineLib.save(name, lineEditing ? lineEditing.look : lineTool.look),
              onDelete: (id) => void lineLib.remove(id),
              onLimit: lineLib.promptLimit,
            }}
            uploads={{
              signedIn: !!user,
              busy: lineLib.uploadBusy,
              error: lineLib.uploadError,
              onUpload: (files) => void lineLib.upload(files).then(applyLineSet),
              onAddPiece: (setId, role, file) => void lineLib.addPiece(setId, role, file),
            }}
            t={t}
            mapWidthPx={project.width}
            recentColors={recentColors}
            onCommitColor={(c) => setRecentColors((r) => pushRecent(r, c))}
            floating={tool !== "line"}
            target={
              active &&
              tool === "line" && (
                <EditTarget
                  role={active.role ?? "custom"}
                  layerName={active.name}
                  what={t("lnTarget")}
                  note={active.locked ? t("mmTargetLocked") : undefined}
                  warning={active.locked}
                />
              )
            }
          />
        )}
        <div className="mm-canvas-column">
          <div className={`mm-top-toolbar ${floatingPanel ? "beside-floating" : ""}`}>
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
                grouped={selectedObjs.some((o) => o.group)}
                onGroup={groupSelection}
                onUngroup={ungroupSelection}
                onAlign={(mode) => arrangeSelection(mode)}
                onDistribute={(axis) => arrangeSelection(axis === "x" ? "distributeX" : "distributeY")}
                onLock={() => setObjectFlags(selectedIds, { locked: true })}
                onHide={() => setObjectFlags(selectedIds, { hidden: true })}
                onSaveStamp={user ? () => void saveSelectionAsStamp() : null}
              />
            )}
            {tool === "brush" && (
              <>
                <div className="mm-tb-modes" role="radiogroup" aria-label={t("mmSubTools")}>
                  {PAINT_MODES.map((m) => (
                    <button
                      key={m.key}
                      className={brushState.mode === m.key ? "active" : ""}
                      title={t(m.labelKey)}
                      role="radio"
                      aria-checked={brushState.mode === m.key}
                      onClick={() => updateBrush({ ...brushState, mode: m.key })}
                    >
                      <Glyph name={m.glyph} size={16} />
                    </button>
                  ))}
                </div>
                <button
                  className={`mm-pill ${brushState.erase ? "selected" : ""}`}
                  title={t("mmEraserHint")}
                  onClick={() => setBrushState((st) => ({ ...st, erase: !st.erase }))}
                >
                  {t("mmEraser")}
                </button>
                {brushState.mode === "free" && (
                  <Slider
                    label={t("mmBrushSize")} defaultValue={Math.round(brushBase(brushState, favorites).brush.size * project.width)}
                    value={Math.round(brushState.brush.size * project.width)}
                    min={1}
                    max={Math.round(project.width * 0.25)}
                    step={1}
                    onChange={(v) => setBrushState((st) => ({ ...st, presetId: null, brush: { ...st.brush, size: v / project.width } }))}
                    format={(v) => `${v} px`}
                  />
                )}
                <Slider
                  label={t("mmBrushOpacity")} defaultValue={brushBase(brushState, favorites).opacity}
                  value={brushState.opacity}
                  min={0.02}
                  max={1}
                  step={0.01}
                  onChange={(v) => setBrushState((st) => ({ ...st, presetId: null, opacity: v }))}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                {polyDraft && polyDraft.length >= 3 && (
                  <button className="secondary-button" onClick={commitPolygon}>
                    {t("mmFinishShape")}
                  </button>
                )}
              </>
            )}
            {tool === "land" && (
              <>
                <div className="mm-tb-modes" role="radiogroup" aria-label={t("mmSubTools")}>
                  {LAND_MODES.map((m) => (
                    <button
                      key={m.key}
                      className={landTool.mode === m.key ? "active" : ""}
                      title={t(m.labelKey)}
                      role="radio"
                      aria-checked={landTool.mode === m.key}
                      onClick={() => updateLandTool({ ...landTool, mode: m.key })}
                    >
                      <Glyph name={m.glyph} size={16} />
                    </button>
                  ))}
                </div>
                <button
                  className={`mm-pill ${landTool.erase ? "selected" : ""}`}
                  title={t("mmLandRemoveHint")}
                  onClick={() => setLandTool((st) => ({ ...st, erase: !st.erase }))}
                >
                  {t("mmLandRemove")}
                </button>
                {landTool.mode === "free" && (
                  <Slider
                    label={t("mmBrushSize")} defaultValue={Math.round(DEFAULT_LAND_TOOL.size * project.width)}
                    value={Math.round(landTool.size * project.width)}
                    min={2}
                    max={Math.round(project.width * 0.3)}
                    step={1}
                    onChange={(v) => setLandTool((st) => ({ ...st, size: v / project.width }))}
                    format={(v) => `${v} px`}
                  />
                )}
                {polyDraft && polyDraft.length >= 3 && (
                  <button className="secondary-button" onClick={commitPolygon}>
                    {t("mmFinishShape")}
                  </button>
                )}
              </>
            )}
            {tool === "stamp" && (
              <>
                <Slider
                  label={t("stSize")} defaultValue={stampFactoryLook(stampSet(stampTool.set)).size}
                  value={stampTool.look.size}
                  min={0.003}
                  max={0.4}
                  step={0.001}
                  onChange={(v) => setStampTool((st) => ({ ...st, look: { ...st.look, size: v } }))}
                  format={(v) => `${Math.round(v * project.width)} px`}
                />
                <Slider
                  label={t("stRotation")} defaultValue={0}
                  value={Math.round(stampTool.look.rotation)}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(v) => setStampTool((st) => ({ ...st, look: { ...st.look, rotation: v } }))}
                  format={(v) => `${v}°`}
                />
              </>
            )}
            {tool === "line" && (
              <>
                <div className="mm-tb-modes" role="radiogroup" aria-label={t("lnDrawMode")}>
                  {LINE_DRAW_MODES.map((m) => (
                    <button
                      key={m.key}
                      className={lineTool.draw === m.key ? "active" : ""}
                      title={`${t(m.labelKey)} (${shortcutLabel(m.shortcut, keys)})`}
                      role="radio"
                      aria-checked={lineTool.draw === m.key}
                      onClick={() => changeLineTool({ ...lineTool, draw: m.key })}
                    >
                      <Glyph name={m.glyph} size={16} />
                    </button>
                  ))}
                </div>
                {lineTool.draw !== "edit" &&
                  (lineTool.look.mode === "color" ? (
                    <Slider
                      label={t("lnWidth")} defaultValue={Math.round(lineBaseLook(lineTool.styleId, libraryStyles).stroke.width * project.width * 10) / 10}
                      value={Math.round(lineTool.look.stroke.width * project.width * 10) / 10}
                      min={0.5}
                      max={Math.round(project.width * 0.04)}
                      step={0.5}
                      onChange={(v) => setLineTool((st) => ({ ...st, look: { ...st.look, stroke: { ...st.look.stroke, width: v / project.width } } }))}
                      format={(v) => `${v} px`}
                    />
                  ) : (
                    <Slider
                      label={t("lnStampSize")} defaultValue={Math.round(lineBaseLook(lineTool.styleId, libraryStyles).stamp.size * project.width * 10) / 10}
                      value={Math.round(lineTool.look.stamp.size * project.width * 10) / 10}
                      min={1}
                      max={Math.round(project.width * 0.1)}
                      step={0.5}
                      onChange={(v) => setLineTool((st) => ({ ...st, look: { ...st.look, stamp: { ...st.look.stamp, size: v / project.width } } }))}
                      format={(v) => `${v} px`}
                    />
                  ))}
                {penDraft && penDraft.length >= 2 && (
                  <button className="secondary-button" onClick={() => finishPen(false)}>
                    {t("lnFinish")}
                  </button>
                )}
                {penDraft && penDraft.length >= 3 && !penTarget && (
                  <button className="secondary-button" onClick={() => finishPen(true)}>
                    {t("lnFinishClosed")}
                  </button>
                )}
                {lineTool.draw === "edit" && !nodeEdit && <span className="mm-toolbar-note">{t("lnPickLine")}</span>}
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
                <Slider label={t("mmTextureScale")} defaultValue={TOOL_DEFAULTS.textureScale} value={textureScale} min={0.4} max={3} step={0.1} onChange={setTextureScale} />
                <Slider label={t("mmTextureRotation")} defaultValue={TOOL_DEFAULTS.textureRotation} value={textureRotation} min={0} max={359} step={1} onChange={setTextureRotation} format={(v) => `${v}°`} />
                <Slider label={t("mmFillOpacity")} defaultValue={TOOL_DEFAULTS.fillOpacity} value={fillOpacity} min={0.1} max={1} step={0.05} onChange={setFillOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                {regionDraft && regionDraft.length >= 3 && (
                  <button className="secondary-button" onClick={() => commitRegion(regionDraft)}>
                    {t("mmFinishShape")}
                  </button>
                )}
              </>
            )}
            {tool === "label" && !labelDraft && (
              <>
                <ColorControl color={color} recents={recentColors} onChange={commitColor} label={t("mmColor")} recentLabel={t("mmRecents")} />
                <Slider label={t("mmLabelSize")} defaultValue={TOOL_DEFAULTS.labelSize} value={labelSize} min={0.01} max={0.1} step={0.005} onChange={setLabelSize} />
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
                lineActions={lineActions ?? undefined}
              />
            )}
          </div>
          {notice && (
            <div className={`mm-editor-notice ${noticeOk ? "ok" : ""} ${floatingPanel ? "beside-floating" : ""}`} role={noticeOk ? "status" : "alert"}>
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} aria-label={t("close")}>
                ×
              </button>
            </div>
          )}
          <div
            className="mm-canvas-wrap"
            ref={containerRef}
            style={{
              cursor: panningActive
                ? "grabbing"
                : spaceHeld
                  ? "grab"
                  : tool === "select" || (tool === "line" && lineTool.draw === "edit")
                    ? undefined
                    : "crosshair",
            }}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <Stage
              ref={stageRef}
              width={W}
              height={H}
              onPointerDown={handlePointerDown}
              onPointerMove={handleStageHover}
              onPointerLeave={hideBrushCursor}
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
              {project.layers.map((layer) => {
                const land = landByLayer.get(layer.id);
                return (
                  <Layer
                    key={layer.id}
                    ref={(node) => {
                      if (node) konvaLayersRef.current.set(layer.id, node);
                      else konvaLayersRef.current.delete(layer.id);
                    }}
                    visible={layer.visible}
                    opacity={layer.opacity}
                    listening={layer.id === active?.id && !layer.locked}
                  >
                    {/* Land layers: land shapes, textured, inside one coastline. */}
                    {land && (
                      <LandLayerNode
                        layerId={layer.id}
                        lands={land.lands}
                        paints={land.paints}
                        base={land.base}
                        fx={land.fx}
                        seed={layerSeed(layer.id)}
                        W={W}
                        H={H}
                        projectW={project.width}
                        projectH={project.height}
                        onBusyChange={onCoastBusy}
                        onLandChange={onLandChange}
                      />
                    )}
                    {layer.objects.map((o) => {
                      // Land shapes and land texture are drawn by LandLayerNode.
                      if (o.kind === "land" || o.hidden) return null;
                      if (o.kind === "paint") return land ? null : <PaintNode key={o.id} o={o} W={W} H={H} />;
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
                      if (o.kind === "line")
                        // A line being continued with the Pen is shown by its draft.
                        return penTarget?.id === o.id ? null : (
                          <LineShapeNode key={o.id} {...handlers} line={o} W={W} H={H} opacity={o.opacity} globalCompositeOperation={blendOp(o.blend)} />
                        );
                      if (o.kind === "brush")
                        return (
                          <Line
                            key={o.id}
                            {...handlers}
                            points={flattenPoints(o.points, W, H)}
                            {...strokeAppearance(o, W)}
                          />
                        );
                      if (o.kind === "stamp")
                        return (
                          <StampNode key={o.id} o={o} W={W} H={H} shadow={resolveShadow(o, layer)} op={stampCompositeOp(o, layer)} handlers={handlers} />
                        );
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
                    {/* Stamps being scattered (Multiple placement), not yet added. */}
                    {scatterDraft &&
                      layer.id === active?.id &&
                      scatterDraft.map((o) => (
                        <StampNode key={o.id} o={o} W={W} H={H} shadow={resolveShadow(o, layer)} op={stampCompositeOp(o, layer)} />
                      ))}
                    {/* Line being drawn (Free Draw trail / Pen), set imperatively. */}
                    {(lineDrafting || !!penDraft) && layer.id === active?.id && (
                      <LineShapeNode
                        ref={lineDraftRef}
                        line={lineDraftBase}
                        W={W}
                        H={H}
                        listening={false}
                        opacity={lineTool.look.opacity}
                        globalCompositeOperation={blendOp(lineTool.look.blend)}
                      />
                    )}
                    {/* Live Brush / Land preview — inside the active layer, so
                        erasers and blend modes preview exactly as they commit.
                        Its image/position are set imperatively per frame. */}
                    {(paintPreview || !!polyDraft) && layer.id === active?.id && (
                      <KonvaImage
                        ref={paintImageRef}
                        image={undefined}
                        visible={false}
                        listening={false}
                        opacity={previewLook.opacity}
                        globalCompositeOperation={previewLook.op}
                      />
                    )}
                  </Layer>
                );
              })}
              {/* Editor-only overlays: live drafts and the marquee. Hidden
                  when rendering the map for print. */}
              <Layer ref={overlayLayerRef} listening={false}>
                {penDraft &&
                  penDraft.map((n, i) => (
                    <Circle
                      key={i}
                      x={n.x * W}
                      y={n.y * H}
                      radius={i === 0 ? 5 : 3.5}
                      fill={i === 0 ? "#f2a65a" : "#ffffff"}
                      stroke="#1b1f24"
                      strokeWidth={1}
                    />
                  ))}
                {polyDraft && (
                  <>
                    <Line points={flattenPoints(polyDraft, W, H)} stroke="#f2a65a" strokeWidth={1.5} dash={[4, 3]} closed={polyDraft.length >= 3} />
                    {polyDraft.map((p, i) => (
                      <Circle key={i} x={p.x * W} y={p.y * H} radius={i === 0 ? 5 : 4} fill={i === 0 ? "#f2a65a" : "#cfd7de"} />
                    ))}
                  </>
                )}
                {(tool === "brush" || tool === "land" || tool === "line") && (
                  <Circle
                    ref={brushCursorRef}
                    radius={Math.max(
                      1,
                      ((tool === "land"
                        ? landTool.size
                        : tool === "line"
                          ? lineTool.look.mode === "stamp"
                            ? lineTool.look.stamp.size
                            : lineTool.look.stroke.width + 2 * lineTool.look.stroke.casing
                          : brushState.brush.size) *
                        W) /
                        2,
                    )}
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth={1}
                    shadowColor="#000"
                    shadowBlur={2}
                    shadowOpacity={0.8}
                    visible={false}
                    dash={tool !== "line" && (tool === "land" ? landTool.erase : brushState.erase) ? [3, 3] : undefined}
                  />
                )}
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
                {tool === "stamp" && nextStamp && (
                  <Group ref={stampGhostRef} name="stampGhost" visible={false} opacity={0.7}>
                    <StampNode o={nextStamp} W={W} H={H} shadow={active ? resolveShadow(nextStamp, active) : null} />
                    {stampTool.placement !== "single" && stampTool.spread > 0 && (
                      <Circle
                        radius={(stampTool.spread * stampTool.look.size * W) / 2}
                        stroke="rgba(255,255,255,0.7)"
                        strokeWidth={1}
                        dash={[4, 4]}
                        opacity={stampTool.placement === "multiple" ? 1 : 0.45}
                      />
                    )}
                  </Group>
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
                {nodeEditing && editedLine && nodeEdit && (
                  <LineNodeEditor
                    line={editedLine}
                    W={W}
                    H={H}
                    selected={nodeEdit.sel}
                    onSelect={(sel) => setNodeEdit({ id: editedLine.id, sel })}
                    onPreview={(nodes) => {
                      const n = stageRef.current && findNode(stageRef.current, editedLine.id);
                      if (!n) return;
                      n.setAttr("line", { ...editedLine, nodes });
                      n.getLayer()?.batchDraw();
                    }}
                    onCommit={(nodes) => patchLines([editedLine.id], () => ({ nodes: nodes.map(roundNode) }))}
                    snap={(p) => snapLinePoint(p, editedLine.id)}
                  />
                )}
                {tool === "select" && selectedIds.length > 0 && (
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    anchorSize={9}
                    keepRatio={selectedObjs.every((o) => o.kind === "stamp" || o.kind === "label")}
                  />
                )}
              </Layer>
            </Stage>
          </div>
          <div className="mm-status-bar">
            <CloudStatusBar status={sync.status} onSave={sync.saveNow} />
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
              <span>
                {tool === "brush"
                  ? t(PAINT_MODES.find((m) => m.key === brushState.mode)!.hintKey)
                  : tool === "land"
                    ? t(LAND_MODES.find((m) => m.key === landTool.mode)!.hintKey)
                    : tool === "line"
                      ? t(LINE_DRAW_MODES.find((m) => m.key === lineTool.draw)!.hintKey)
                      : t(HINT_KEY[tool])}
              </span>
              <span className="mm-shortcut-legend">
                1–7 {t("mmToolSelect")}/{t("mmToolBrush")}/… · {t("mmMultiSelectHint")} · {shortcutLabel("edit.undo", keys)} {t("undo")} · {shortcutLabel("edit.redo", keys)} {t("redo")} · {shortcutLabel("edit.duplicate", keys)} {t("mmDuplicateObject")} · {shortcutLabel("edit.copy", keys)}/{shortcutLabel("edit.paste", keys)} {t("mmCopyObject")}/{t("mmPasteObject")} · {shortcutLabel("arrange.front", keys)} / {shortcutLabel("arrange.back", keys)} {t("mmBringToFront")}/{t("mmSendToBack")} · {t("mmZoomHint")}
              </span>
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
                  <div key={o.id} className={`mm-object-row ${selectedIdSet.has(o.id) ? "selected" : ""} ${o.hidden ? "hidden-object" : ""}`}>
                    <button
                      className="mm-object-main"
                      onClick={() => {
                        setActiveLayerId(layer.id);
                        selectOnly(o.id);
                        setTool("select");
                      }}
                    >
                      <Glyph
                        name={
                          o.kind === "stamp"
                            ? "stamp"
                            : o.kind === "label"
                              ? "label"
                              : o.kind === "region"
                                ? "region"
                                : o.kind === "line"
                                  ? "line"
                                  : o.kind === "land"
                                    ? o.erase
                                      ? "water"
                                      : "land"
                                    : o.kind === "paint"
                                    ? o.erase
                                      ? "eraser"
                                      : (PAINT_MODES.find((m) => m.key === o.mode)?.glyph ?? "brush")
                                    : "brush"
                        }
                        size={14}
                      />
                      <span>{objectLabel(o)}</span>
                      <small className="mm-layer-badge">{layer.name}</small>
                    </button>
                    <button
                      title={t(o.hidden ? "mmShowObject" : "mmHideObjects")}
                      aria-pressed={!!o.hidden}
                      className={o.hidden ? "on" : ""}
                      onClick={() => setObjectFlags([o.id], { hidden: !o.hidden })}
                    >
                      <Glyph name={o.hidden ? "eyeOff" : "eye"} size={13} />
                    </button>
                    <button
                      title={t(o.locked ? "mmUnlockObject" : "mmLockObjects")}
                      aria-pressed={!!o.locked}
                      className={o.locked ? "on" : ""}
                      onClick={() => setObjectFlags([o.id], { locked: !o.locked })}
                    >
                      <Glyph name={o.locked ? "lock" : "unlock"} size={13} />
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
                <div className="mm-add-layer-wrap" ref={layerMenuRef}>
                  <button className="mm-add-layer" onClick={() => setShowLayerMenu((v) => !v)} aria-expanded={showLayerMenu}>
                    <Glyph name="plus" size={14} />
                    {t("mmAddLayer")}
                  </button>
                  {showLayerMenu && (
                    <div className="mm-edit-menu mm-layer-menu">
                      <MenuRow label={t("mmAddLandLayer")} icon="land" onClick={() => { addLayer("land"); setShowLayerMenu(false); }} />
                      <MenuRow label={t("mmAddWaterLayer")} icon="water" onClick={() => { addLayer("water"); setShowLayerMenu(false); }} />
                      <MenuRow label={t("mmAddCustomLayer")} icon="layers" onClick={() => { addLayer("custom"); setShowLayerMenu(false); }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="mm-layer-list">
                <div className="mm-layer-row mm-base-row">
                  <Glyph name="eye" size={14} />
                  <span>{t("mmBaseLayer")}</span>
                </div>
                {[...project.layers].reverse().map((l) => (
                  <div key={l.id} className={`mm-layer-row ${activeLayerId === l.id ? "active" : ""}`} onClick={() => setActiveLayerId(l.id)}>
                    {l.role && l.role !== "custom" && (
                      <span className={`mm-layer-role mm-role-${l.role}`} title={t(l.role === "water" ? "mmLayerWater" : "mmLayerLand")}>
                        <Glyph name={l.role} size={12} />
                      </span>
                    )}
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
                      onClick={(e) => {
                        // Editing a layer's name also makes it the active layer.
                        e.stopPropagation();
                        setActiveLayerId(l.id);
                      }}
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
                <div className="mm-layer-opacity">
                  <Slider
                    label={t("mmLayerOpacity")}
                    defaultValue={1}
                    value={active.opacity}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => updateLayer(active.id, { opacity: v })}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                </div>
              )}
              {active && <LayerStampSettings layer={active} onChange={(patch) => updateLayer(active.id, patch)} t={t} />}
              {landTarget && (
                <div ref={coastPanelRef}>
                  <CoastEffectPanel
                    layer={landTarget}
                    t={t}
                    mapWidthPx={project.width}
                    busy={coastBusy.has(landTarget.id)}
                    onChange={(coast) => updateLayer(landTarget.id, { coast })}
                  />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      {lineLib.limitPrompt && user && (
        <UpgradeDialog
          limit="line_styles"
          planCode={lineLib.limitPrompt.plan ?? user.plan.code}
          max={lineLib.limitPrompt.max ?? lineLib.max}
          used={lineLib.own.length}
          title={t("lnLimitTitle")}
          message={t("lnLimitText", { plan: t(`acPlan_${lineLib.limitPrompt.plan ?? user.plan.code}`), max: lineLib.limitPrompt.max ?? lineLib.max })}
          onClose={lineLib.closeLimitPrompt}
        />
      )}
      {sync.conflict && (
        <ConflictDialog busy={sync.resolving} error={sync.resolveError} onChoose={(c) => void sync.resolveConflict(c)} />
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="mm-edit-menu mm-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {lineActions && (
            <>
              <MenuRow label={t("lnEditNodes")} shortcut={shortcutLabel("line.editNodes", keys)} icon="editNodes" onClick={() => { lineActions.onEditNodes(); setContextMenu(null); }} />
              <MenuRow label={t("lnReverse")} icon="reverse" onClick={() => { lineActions.onReverse(); setContextMenu(null); }} />
              <MenuRow label={t(lineActions.closed ? "lnOpenPath" : "lnClosePath")} icon="closePath" disabled={!lineActions.canClose} onClick={() => { lineActions.onToggleClosed(); setContextMenu(null); }} />
              <div className="mm-menu-divider" />
            </>
          )}
          <MenuRow label={t("mmDuplicateObject")} shortcut={shortcutLabel("edit.duplicate", keys)} disabled={!selectedObjs.length} onClick={() => { duplicateObjects(selectedIds); setContextMenu(null); }} />
          <MenuRow label={t("mmCopyObject")} shortcut={shortcutLabel("edit.copy", keys)} disabled={!selectedObjs.length} onClick={() => { copySelection(); setContextMenu(null); }} />
          <MenuRow label={t("mmPasteObject")} shortcut={shortcutLabel("edit.paste", keys)} disabled={!hasClipboard} onClick={() => { pasteClipboard(); setContextMenu(null); }} />
          <MenuRow label={t("mmDeleteObject")} shortcut={shortcutLabel("edit.delete", keys)} disabled={!selectedObjs.length} onClick={() => { removeObjects(selectedIds); setContextMenu(null); }} />
          <div className="mm-menu-divider" />
          <MenuRow label={t("mmGroup")} shortcut={shortcutLabel("edit.group", keys)} disabled={selectedObjs.length < 2} onClick={() => { groupSelection(); setContextMenu(null); }} />
          <MenuRow label={t("mmUngroup")} shortcut={shortcutLabel("edit.ungroup", keys)} disabled={!selectedObjs.some((o) => o.group)} onClick={() => { ungroupSelection(); setContextMenu(null); }} />
          <MenuRow label={t("mmLockObjects")} disabled={!selectedObjs.length} onClick={() => { setObjectFlags(selectedIds, { locked: true }); setContextMenu(null); }} />
          <MenuRow label={t("mmHideObjects")} disabled={!selectedObjs.length} onClick={() => { setObjectFlags(selectedIds, { hidden: true }); setContextMenu(null); }} />
          {user && (
            <MenuRow label={t("stSaveAsStamp")} disabled={!selectedObjs.length} onClick={() => { void saveSelectionAsStamp(); setContextMenu(null); }} />
          )}
          <div className="mm-menu-divider" />
          <MenuRow label={t("mmBringToFront")} shortcut={shortcutLabel("arrange.front", keys)} disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "front"); setContextMenu(null); }} />
          <MenuRow label={t("mmBringForward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "forward"); setContextMenu(null); }} />
          <MenuRow label={t("mmSendBackward")} disabled={selectedObjs.length !== 1} onClick={() => { if (selectedObj) reorderObject(selectedObj.id, "backward"); setContextMenu(null); }} />
          <MenuRow label={t("mmSendToBack")} shortcut={shortcutLabel("arrange.back", keys)} disabled={!selectedObjs.length} onClick={() => { reorderObjects(selectedIds, "back"); setContextMenu(null); }} />
        </div>
      )}
    </div>
  );
}
