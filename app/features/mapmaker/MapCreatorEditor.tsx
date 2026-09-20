"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  resolutionBadge,
} from "./domain";
import { saveProject } from "./storage";
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
interface MMPatch {
  icon?: IconId;
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  color?: string;
  pathKind?: PathKind;
  points?: Point[];
  width?: number;
  biome?: Biome;
  opacity?: number;
  textureScale?: number;
  textureRotation?: number;
  text?: string;
  size?: number;
  align?: LabelAlign;
  rtl?: boolean;
  softness?: number;
}
const ARABIC_RANGE = /[؀-ۿ]/;

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="mm-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <b>{format ? format(value) : value}</b>
    </label>
  );
}

function pushRecent(list: string[], value: string, cap = 8) {
  return [value, ...list.filter((v) => v !== value)].slice(0, cap);
}

/** Undo/redo for the project, mirroring the print studio's own useDocument reducer. */
interface HistoryState {
  present: MMProject;
  past: MMProject[];
  future: MMProject[];
}
type HistoryAction =
  | { type: "update"; updater: (p: MMProject) => MMProject }
  | { type: "undo" }
  | { type: "redo" };
function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "update") {
    const next = action.updater(state.present);
    if (next === state.present) return state;
    return { present: next, past: [...state.past, state.present].slice(-60), future: [] };
  }
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      present: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { present: state.future[0], past: [...state.past, state.present], future: state.future.slice(1) };
  }
  return state;
}

export function MapCreatorEditor({ initial }: { initial: MMProject }) {
  const { t, i18n } = useTranslation(),
    router = useRouter();
  const [history, dispatchHistory] = useReducer(historyReducer, {
    present: initial,
    past: [],
    future: [],
  });
  const project = history.present,
    canUndo = history.past.length > 0,
    canRedo = history.future.length > 0;
  const updateProject = useCallback(
    (updater: (p: MMProject) => MMProject) => dispatchHistory({ type: "update", updater }),
    [],
  );
  const undo = useCallback(() => dispatchHistory({ type: "undo" }), []);
  const redo = useCallback(() => dispatchHistory({ type: "redo" }), []);
  const setProject = updateProject;
  const [activeLayerId, setActiveLayerId] = useState(
    initial.layers[initial.layers.length - 1]?.id ?? "",
  );
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    transformerRef = useRef<Konva.Transformer>(null);

  const active =
    project.layers.find((l) => l.id === activeLayerId) ??
    project.layers[project.layers.length - 1];
  const selectedLayer = project.layers.find((l) =>
    l.objects.some((o) => o.id === selectedId),
  );
  const selectedObj = selectedLayer?.objects.find((o) => o.id === selectedId);

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
    const node =
      tool === "select" && selectedId
        ? stage.findOne(`#${CSS.escape(selectedId)}`)
        : null;
    tr.nodes(node && node.getClassName() === "Group" ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [tool, selectedId, project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;
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
      if (
        tool === "select" &&
        selectedObj &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        removeObject(selectedObj.id);
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedObj) {
        e.preventDefault();
        duplicateObject(selectedObj.id);
        return;
      }
      if (e.key === "Escape") {
        setPathDraft(null);
        setRegionDraft(null);
        setLabelDraft(null);
        return;
      }
      const hotkeyIndex = TOOLS.findIndex((tl, i) => String(i + 1) === e.key);
      if (!mod && hotkeyIndex >= 0) {
        e.preventDefault();
        selectTool(TOOLS[hotkeyIndex].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedObj, undo, redo]);

  function selectTool(next: Tool) {
    setPathDraft(null);
    setRegionDraft(null);
    setLabelDraft(null);
    setTool(next);
  }

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
    setSelectedId(o.id);
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
  function removeObject(id: string) {
    const layer = project.layers.find((l) => l.objects.some((o) => o.id === id));
    if (!layer) return;
    updateLayer(layer.id, { objects: layer.objects.filter((o) => o.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }
  function duplicateObject(id: string) {
    const layer = project.layers.find((l) => l.objects.some((o) => o.id === id));
    const o = layer?.objects.find((x) => x.id === id);
    if (!layer || !o) return;
    const nid = crypto.randomUUID();
    if (o.kind === "icon" || o.kind === "label")
      addObjectTo(layer.id, { ...o, id: nid, x: Math.min(1, o.x + 0.02), y: Math.min(1, o.y + 0.02) });
    else
      addObjectTo(layer.id, {
        ...o,
        id: nid,
        points: o.points.map((p) => ({ x: Math.min(1, p.x + 0.02), y: Math.min(1, p.y + 0.02) })),
      });
  }
  function addObjectTo(layerId: string, o: MMObject) {
    updateLayer(layerId, {
      objects: [...(project.layers.find((l) => l.id === layerId)?.objects ?? []), o],
    });
    setSelectedId(o.id);
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

  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    if (tool === "select") {
      if (e.target === stage) setSelectedId(null);
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
  function handlePointerUp() {
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

  return (
    <div className="mm-shell">
      <header className="mm-appbar">
        <Link href="/" className="mm-back" title={t("mmBackHome")}>
          <Glyph name="chevronLeft" />
        </Link>
        <button className="mm-back" title={t("mmMyMaps")} onClick={() => setShowGallery(true)}>
          <Glyph name="folder" size={16} />
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
            {tool === "select" && !selectedObj && (
              <span className="mm-toolbar-note">{t("mmNoSelection")}</span>
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
              />
            )}
          </div>
          <div
            className="mm-canvas-wrap"
            ref={containerRef}
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              setZoom((z) => Math.max(0.25, Math.min(4, z - e.deltaY * 0.0015)));
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
              }}
              onDblClick={finishRegion}
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
                  {layer.objects
                    .filter((o): o is MMObject & { kind: "region" } => o.kind === "region")
                    .map((o) => (
                      <Line
                        key={o.id}
                        id={o.id}
                        points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                        closed
                        fillPatternImage={biomeTexture(o.biome) as unknown as HTMLImageElement}
                        fillPatternScale={{ x: o.textureScale, y: o.textureScale }}
                        fillPatternRotation={o.textureRotation}
                        fillPriority="pattern"
                        opacity={o.opacity}
                        stroke={selectedId === o.id ? "#f2a65a" : undefined}
                        strokeWidth={selectedId === o.id ? 2 : 0}
                        draggable={tool === "select" && !layer.locked}
                        onClick={() => tool === "select" && setSelectedId(o.id)}
                        onTap={() => tool === "select" && setSelectedId(o.id)}
                        onDragEnd={(e) => handleShapeDragEnd(layer.id, o.id, o.points, e.target)}
                      />
                    ))}
                  {layer.objects
                    .filter((o): o is MMObject & { kind: "brush" } => o.kind === "brush")
                    .map((s) => (
                      <Line
                        key={s.id}
                        id={s.id}
                        points={s.points.flatMap((p) => [p.x * W, p.y * H])}
                        stroke={selectedId === s.id ? "#f2a65a" : s.color}
                        strokeWidth={Math.max(0.5, s.size * W)}
                        opacity={s.opacity}
                        shadowColor={s.color}
                        shadowBlur={s.softness * 30}
                        shadowOpacity={s.softness > 0 ? 0.9 : 0}
                        lineCap="round"
                        lineJoin="round"
                        draggable={tool === "select" && !layer.locked}
                        hitStrokeWidth={Math.max(12, s.size * W)}
                        onClick={() => tool === "select" && setSelectedId(s.id)}
                        onTap={() => tool === "select" && setSelectedId(s.id)}
                        onDragEnd={(e) => handleShapeDragEnd(layer.id, s.id, s.points, e.target)}
                      />
                    ))}
                  {layer.objects
                    .filter((o): o is MMObject & { kind: "path" } => o.kind === "path")
                    .map((o) => {
                      const w = Math.max(0.5, o.width * W);
                      return (
                        <Line
                          key={o.id}
                          id={o.id}
                          points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                          stroke={selectedId === o.id ? "#f2a65a" : o.color}
                          strokeWidth={w}
                          opacity={o.opacity}
                          shadowColor={o.color}
                          shadowBlur={o.softness * 24}
                          shadowOpacity={o.softness > 0 ? 0.9 : 0}
                          lineCap="round"
                          lineJoin="round"
                          draggable={tool === "select" && !layer.locked}
                          hitStrokeWidth={Math.max(12, w)}
                          onClick={() => tool === "select" && setSelectedId(o.id)}
                          onTap={() => tool === "select" && setSelectedId(o.id)}
                          onDragEnd={(e) => handleShapeDragEnd(layer.id, o.id, o.points, e.target)}
                        />
                      );
                    })}
                  {layer.objects
                    .filter((o): o is MMObject & { kind: "icon" } => o.kind === "icon")
                    .map((o) => {
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
                          onClick={() => tool === "select" && setSelectedId(o.id)}
                          onTap={() => tool === "select" && setSelectedId(o.id)}
                          onDragEnd={(e) => updateObject(layer.id, o.id, { x: e.target.x() / W, y: e.target.y() / H })}
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
                    })}
                  {layer.objects
                    .filter((o): o is MMObject & { kind: "label" } => o.kind === "label")
                    .map((o) => (
                      <KonvaText
                        key={o.id}
                        id={o.id}
                        text={o.text}
                        x={o.x * W}
                        y={o.y * H}
                        fontSize={Math.max(1, o.size * W)}
                        fontFamily='Georgia, "Times New Roman", serif'
                        fill={o.color}
                        align={o.align === "center" ? "center" : o.align === "end" ? "right" : "left"}
                        draggable={tool === "select" && !layer.locked}
                        onClick={() => tool === "select" && setSelectedId(o.id)}
                        onTap={() => tool === "select" && setSelectedId(o.id)}
                        onDragEnd={(e) => updateObject(layer.id, o.id, { x: e.target.x() / W, y: e.target.y() / H })}
                      />
                    ))}
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
              </Layer>
              <Layer>{tool === "select" && selectedId && <Transformer ref={transformerRef} rotateEnabled anchorSize={9} />}</Layer>
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
              <span className="mm-shortcut-legend">1–6 {t("mmToolSelect")}/{t("mmToolBrush")}/… · ⌘Z {t("undo")} · ⌘⇧Z {t("redo")} · ⌘ scroll {t("mmZoom")}</span>
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
                  <div key={o.id} className={`mm-object-row ${selectedId === o.id ? "selected" : ""}`}>
                    <button
                      className="mm-object-main"
                      onClick={() => {
                        setActiveLayerId(layer.id);
                        setSelectedId(o.id);
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
    </div>
  );
}

function ColorControl({
  color,
  recents,
  onChange,
  label,
  recentLabel,
}: {
  color: string;
  recents: string[];
  onChange: (v: string) => void;
  label: string;
  recentLabel: string;
}) {
  return (
    <div className="mm-color-control">
      <label className="mm-color-input" title={label}>
        <input type="color" value={color} onChange={(e) => onChange(e.target.value)} />
      </label>
      {recents.length > 0 && (
        <div className="mm-recents-row" title={recentLabel}>
          {recents.map((c) => (
            <button key={c} className="mm-color-chip" style={{ background: c }} onClick={() => onChange(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectQuickBar({
  obj,
  t,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  obj: MMObject;
  layerId: string;
  t: (k: string, opts?: Record<string, unknown>) => string;
  onPatch: (patch: MMPatch) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mm-quickbar">
      {obj.kind === "icon" && (
        <>
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmIconSize")} value={obj.scale} min={0.3} max={4} step={0.1} onChange={(v) => onPatch({ scale: v })} />
          <Slider label={t("mmIconRotation")} value={obj.rotation} min={-180} max={180} step={1} onChange={(v) => onPatch({ rotation: v })} format={(v) => `${v}°`} />
        </>
      )}
      {obj.kind === "label" && (
        <>
          <input className="mm-inline-text" value={obj.text} onChange={(e) => onPatch({ text: e.target.value })} />
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmLabelSize")} value={obj.size} min={0.01} max={0.1} step={0.005} onChange={(v) => onPatch({ size: v })} />
        </>
      )}
      {obj.kind === "path" && (
        <>
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmPathWidth")} value={obj.width} min={0.002} max={0.03} step={0.001} onChange={(v) => onPatch({ width: v })} />
        </>
      )}
      {obj.kind === "region" && (
        <Slider label={t("mmFillOpacity")} value={obj.opacity} min={0.1} max={1} step={0.05} onChange={(v) => onPatch({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      {obj.kind === "brush" && (
        <>
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmBrushSize")} value={obj.size} min={0.002} max={0.05} step={0.001} onChange={(v) => onPatch({ size: v })} />
          <Slider label={t("mmBrushOpacity")} value={obj.opacity} min={0.1} max={1} step={0.05} onChange={(v) => onPatch({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t("mmBrushSoftness")} value={obj.softness} min={0} max={1} step={0.05} onChange={(v) => onPatch({ softness: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </>
      )}
      <div className="button-row">
        <button className="secondary-button" onClick={onDuplicate}>
          {t("mmDuplicateObject")}
        </button>
        <button className="secondary-button" onClick={onDelete}>
          {t("mmDeleteObject")}
        </button>
      </div>
    </div>
  );
}
