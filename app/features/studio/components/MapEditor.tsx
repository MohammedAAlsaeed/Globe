"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Konva from "konva";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Path as KonvaPath,
  Text as KonvaText,
  Circle,
  Group,
  Transformer,
} from "react-konva";
import { BIOME_FILL, PATH_STYLE } from "../rendering/layers";
import { ICONS, ICON_IDS, type IconId } from "../domain/icons";
import type {
  MapLayer,
  Stroke,
  Point,
  MapObject,
  IconObject,
  PathObject,
  RegionObject,
  LabelObject,
  LabelAlign,
  Biome,
  PathKind,
} from "../domain/types";
import type { SourceState } from "../hooks/useSource";
import { SelectField } from "../../../components/ui/fields";
type Tool = "select" | "brush" | "icon" | "path" | "region" | "label";
/** A loose union of every field any object kind can carry; call sites only set fields matching the target's own kind. */
interface ObjectPatch {
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
  text?: string;
  size?: number;
  align?: LabelAlign;
  rtl?: boolean;
}
const BIOME_LIST: Biome[] = [
  "forest",
  "mountains",
  "desert",
  "water",
  "grass",
  "swamp",
];
const BIOME_LABEL_KEY: Record<Biome, string> = {
  forest: "biomeForest",
  mountains: "biomeMountains",
  desert: "biomeDesert",
  water: "biomeWater",
  grass: "biomeGrass",
  swamp: "biomeSwamp",
};
const PATH_KIND_LIST: PathKind[] = ["river", "road", "border"];
const PATH_KIND_LABEL_KEY: Record<PathKind, string> = {
  river: "pathRiver",
  road: "pathRoad",
  border: "pathBorder",
};
const ARABIC_RANGE = /[؀-ۿ]/;
export function MapEditor({
  source,
  layers,
  onChange,
  notify,
}: {
  source: SourceState;
  layers: MapLayer[];
  onChange: (layers: MapLayer[]) => void;
  notify: (m: string) => void;
}) {
  const { t } = useTranslation(),
    containerRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<Konva.Stage>(null),
    transformerRef = useRef<Konva.Transformer>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null),
    [stageSize, setStageSize] = useState({ width: 800, height: 400 }),
    [active, setActive] = useState(""),
    [tool, setTool] = useState<Tool>("select"),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState("#765936"),
    [size, setSize] = useState(0.004),
    [iconId, setIconId] = useState<IconId>("mountain"),
    [iconScale, setIconScale] = useState(1),
    [pathKind, setPathKind] = useState<PathKind>("river"),
    [pathWidth, setPathWidth] = useState(0.006),
    [biome, setBiome] = useState<Biome>("forest"),
    [fillOpacity, setFillOpacity] = useState(0.55),
    [labelSize, setLabelSize] = useState(0.03),
    [labelAlign, setLabelAlign] = useState<LabelAlign>("start"),
    [labelRtl, setLabelRtl] = useState(false),
    [labelText, setLabelText] = useState(""),
    [labelDraft, setLabelDraft] = useState<Point | null>(null);
  const [brushDraft, setBrushDraft] = useState<Stroke | null>(null),
    [pathDraft, setPathDraft] = useState<Point[] | null>(null),
    [regionDraft, setRegionDraft] = useState<Point[] | null>(null);
  const selected =
    layers.find((l) => l.id === active) ?? layers[layers.length - 1];
  const selectedObj = selected?.objects.find((o) => o.id === selectedId);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setImgEl(img);
    };
    img.src = source.url;
    return () => {
      alive = false;
    };
  }, [source.url]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ratio = source.height / Math.max(1, source.width);
    const update = () => {
      const w = el.clientWidth || 800;
      setStageSize({ width: w, height: Math.max(1, Math.round(w * ratio)) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [source.width, source.height]);
  function selectTool(next: Tool) {
    setPathDraft(null);
    setRegionDraft(null);
    setLabelDraft(null);
    setTool(next);
  }
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
  }, [tool, selectedId, layers]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (
        tool === "select" &&
        selectedObj &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        removeObject(selectedObj.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedObj]);
  const updateLayer = (patch: Partial<MapLayer>) => {
    if (selected)
      onChange(
        layers.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)),
      );
  };
  function addLayer() {
    if (layers.length >= 20) return notify("layerLimit");
    const id = crypto.randomUUID();
    onChange([
      ...layers,
      {
        id,
        name: `${t("layer")} ${layers.length + 1}`,
        visible: true,
        opacity: 1,
        strokes: [],
        objects: [],
      },
    ]);
    setActive(id);
  }
  function moveLayer(delta: number) {
    if (!selected) return;
    const index = layers.findIndex((l) => l.id === selected.id),
      to = index + delta;
    if (to < 0 || to >= layers.length) return;
    const next = [...layers];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }
  function addObject(o: MapObject) {
    if (!selected) return notify("addLayerFirst");
    if (selected.objects.length >= 2000) return notify("editLimit");
    updateLayer({ objects: [...selected.objects, o] });
    setSelectedId(o.id);
  }
  function updateObject(id: string, patch: ObjectPatch) {
    if (!selected) return;
    updateLayer({
      objects: selected.objects.map((o) =>
        o.id === id ? ({ ...o, ...patch } as MapObject) : o,
      ),
    });
  }
  function removeObject(id: string) {
    if (!selected) return;
    updateLayer({ objects: selected.objects.filter((o) => o.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }
  function duplicateObject(id: string) {
    if (!selected) return;
    const o = selected.objects.find((x) => x.id === id);
    if (!o) return;
    const nid = crypto.randomUUID();
    if (o.kind === "icon" || o.kind === "label")
      addObject({ ...o, id: nid, x: Math.min(1, o.x + 0.02), y: Math.min(1, o.y + 0.02) });
    else
      addObject({
        ...o,
        id: nid,
        points: o.points.map((p) => ({
          x: Math.min(1, p.x + 0.02),
          y: Math.min(1, p.y + 0.02),
        })),
      });
  }
  const toNorm = (pos: { x: number; y: number }): Point => ({
    x: Math.max(0, Math.min(1, pos.x / stageSize.width)),
    y: Math.max(0, Math.min(1, pos.y / stageSize.height)),
  });
  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    if (tool === "select") {
      if (e.target === stage) setSelectedId(null);
      return;
    }
    if (!selected) return notify("addLayerFirst");
    if (!selected.visible) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const p = toNorm(pos);
    if (tool === "brush") {
      if (
        selected.strokes.length >= 5000 ||
        selected.strokes.reduce((n, s) => n + s.points.length, 0) > 196000
      )
        return notify("editLimit");
      setBrushDraft({
        id: crypto.randomUUID(),
        kind: "brush",
        points: [p],
        color,
        size,
      });
    } else if (tool === "path") {
      setPathDraft([p]);
    } else if (tool === "icon") {
      addObject({
        id: crypto.randomUUID(),
        kind: "icon",
        icon: iconId,
        x: p.x,
        y: p.y,
        rotation: 0,
        scale: iconScale,
        color,
      });
    } else if (tool === "region") {
      setRegionDraft((old) => {
        if (!old) return [p];
        const first = old[0],
          dx = (first.x - p.x) * stageSize.width,
          dy = (first.y - p.y) * stageSize.height;
        if (old.length >= 3 && Math.hypot(dx, dy) < 10) {
          addObject({
            id: crypto.randomUUID(),
            kind: "region",
            biome,
            points: old,
            opacity: fillOpacity,
          });
          return null;
        }
        return old.length >= 200 ? old : [...old, p];
      });
    } else if (tool === "label") {
      setLabelDraft(p);
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
    if (brushDraft && brushDraft.points.length < 4000)
      setBrushDraft((old) => (old ? { ...old, points: [...old.points, p] } : old));
    else if (pathDraft && pathDraft.length < 4000)
      setPathDraft((old) => (old ? [...old, p] : old));
  }
  function handlePointerUp() {
    if (brushDraft && selected) {
      updateLayer({ strokes: [...selected.strokes, brushDraft] });
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
  const W = stageSize.width,
    H = stageSize.height;
  return (
    <div className="editor-panel">
      <div className="editor-tools">
        <div className="tabs">
          {(
            [
              ["select", "toolSelect"],
              ["brush", "brush"],
              ["icon", "toolIcon"],
              ["path", "toolPath"],
              ["region", "toolRegion"],
              ["label", "toolLabel"],
            ] as [Tool, string][]
          ).map(([tl, key]) => (
            <button
              key={tl}
              className={tool === tl ? "active" : ""}
              onClick={() => selectTool(tl)}
            >
              {t(key)}
            </button>
          ))}
        </div>
        {tool === "brush" && (
          <>
            <label>
              {t("color")}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              {t("brushSize")}
              <input
                type="range"
                min={0.001}
                max={0.03}
                step={0.001}
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </label>
          </>
        )}
        {tool === "icon" && (
          <>
            <label>
              {t("color")}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              {t("iconScale")}
              <input
                type="range"
                min={0.3}
                max={4}
                step={0.1}
                value={iconScale}
                onChange={(e) => setIconScale(+e.target.value)}
              />
            </label>
          </>
        )}
        {tool === "path" && (
          <>
            <SelectField
              label={t("pathKind")}
              value={pathKind}
              onChange={(v) => setPathKind(v as PathKind)}
            >
              {PATH_KIND_LIST.map((k) => (
                <option key={k} value={k}>
                  {t(PATH_KIND_LABEL_KEY[k])}
                </option>
              ))}
            </SelectField>
            <label>
              {t("color")}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              {t("pathWidth")}
              <input
                type="range"
                min={0.002}
                max={0.02}
                step={0.001}
                value={pathWidth}
                onChange={(e) => setPathWidth(+e.target.value)}
              />
            </label>
          </>
        )}
        {tool === "region" && (
          <>
            <SelectField
              label={t("biome")}
              value={biome}
              onChange={(v) => setBiome(v as Biome)}
            >
              {BIOME_LIST.map((b) => (
                <option key={b} value={b}>
                  {t(BIOME_LABEL_KEY[b])}
                </option>
              ))}
            </SelectField>
            <label>
              {t("fillOpacity")}
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={fillOpacity}
                onChange={(e) => setFillOpacity(+e.target.value)}
              />
            </label>
            {regionDraft && regionDraft.length >= 3 && (
              <button className="secondary-button" onClick={finishRegion}>
                {t("finishShape")}
              </button>
            )}
          </>
        )}
        {tool === "label" && !labelDraft && (
          <>
            <label>
              {t("color")}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              {t("labelSize")}
              <input
                type="range"
                min={0.01}
                max={0.08}
                step={0.005}
                value={labelSize}
                onChange={(e) => setLabelSize(+e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      {tool === "icon" && (
        <div className="icon-palette">
          {ICON_IDS.map((id) => (
            <button
              key={id}
              className={iconId === id ? "selected" : ""}
              title={t(ICONS[id].labelKey)}
              onClick={() => setIconId(id)}
            >
              <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true">
                {ICONS[id].stroke && (
                  <path
                    d={ICONS[id].stroke}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {ICONS[id].fill && (
                  <path d={ICONS[id].fill} fill="currentColor" />
                )}
              </svg>
            </button>
          ))}
        </div>
      )}
      <p className="help-copy">
        {t(
          tool === "select"
            ? "selectHint"
            : tool === "brush"
              ? "editorHelp"
              : tool === "icon"
                ? "iconHint"
                : tool === "path"
                  ? "pathHint"
                  : tool === "region"
                    ? "regionHint"
                    : "labelHint",
        )}
      </p>
      {tool === "label" && labelDraft && (
        <div className="label-draft-panel">
          <label className="field-label">
            {t("labelText")}
            <input
              autoFocus
              maxLength={200}
              placeholder={t("labelPlaceholder")}
              value={labelText}
              onChange={(e) => {
                const v = e.target.value;
                setLabelText(v);
                setLabelRtl(ARABIC_RANGE.test(v));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmLabel();
                if (e.key === "Escape") setLabelDraft(null);
              }}
            />
          </label>
          <div className="editor-tools">
            <label>
              {t("color")}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              {t("labelSize")}
              <input
                type="range"
                min={0.01}
                max={0.08}
                step={0.005}
                value={labelSize}
                onChange={(e) => setLabelSize(+e.target.value)}
              />
            </label>
            <SelectField
              label={t("labelAlign")}
              value={labelAlign}
              onChange={(v) => setLabelAlign(v as LabelAlign)}
            >
              <option value="start">{t("alignStart")}</option>
              <option value="center">{t("alignCenter")}</option>
              <option value="end">{t("alignEnd")}</option>
            </SelectField>
            <label>
              <input
                type="checkbox"
                checked={labelRtl}
                onChange={(e) => setLabelRtl(e.target.checked)}
              />
              {t("labelRtl")}
            </label>
          </div>
          <div className="button-row">
            <button
              className="export-button"
              disabled={!labelText.trim()}
              onClick={confirmLabel}
            >
              {t("addLabel")}
            </button>
            <button
              className="secondary-button"
              onClick={() => setLabelDraft(null)}
            >
              {t("cancelDraft")}
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={`konva-stage-wrap tool-${tool} ${selected?.visible ? "editable" : ""}`}
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
            {imgEl && <KonvaImage image={imgEl} width={W} height={H} />}
          </Layer>
          {layers.map((layer) => (
            <Layer
              key={layer.id}
              visible={layer.visible}
              opacity={layer.opacity}
              listening={layer.id === selected?.id}
            >
              {layer.strokes.map((s) => {
                if (s.kind === "brush")
                  return (
                    <Line
                      key={s.id}
                      points={s.points.flatMap((p) => [p.x * W, p.y * H])}
                      stroke={s.color}
                      strokeWidth={Math.max(0.5, s.size * W)}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  );
                const p = s.points[0];
                if (!p) return null;
                const r = s.size * W * 2;
                return (
                  <Group key={s.id} x={p.x * W} y={p.y * H} listening={false}>
                    {s.symbol === "mountain" && (
                      <Line
                        points={[-r, r * 0.7, 0, -r, r, r * 0.7]}
                        closed
                        stroke={s.color}
                        strokeWidth={Math.max(1, r / 8)}
                      />
                    )}
                    {s.symbol === "city" && (
                      <>
                        <Line
                          points={[
                            -r * 0.6, -r * 0.6, r * 0.6, -r * 0.6, r * 0.6,
                            r * 0.6, -r * 0.6, r * 0.6,
                          ]}
                          closed
                          stroke={s.color}
                          strokeWidth={Math.max(1, r / 8)}
                        />
                        <Line
                          points={[
                            -r * 0.2, -r * 0.2, r * 0.2, -r * 0.2, r * 0.2,
                            r * 0.2, -r * 0.2, r * 0.2,
                          ]}
                          closed
                          fill={s.color}
                        />
                      </>
                    )}
                    {(!s.symbol || s.symbol === "star") && (
                      <KonvaPath
                        data="M0 -10L3 -3L10 0L3 3L0 10L-3 3L-10 0L-3 -3Z"
                        fill={s.color}
                        scaleX={r / 10}
                        scaleY={r / 10}
                      />
                    )}
                  </Group>
                );
              })}
              {layer.objects
                .filter((o): o is RegionObject => o.kind === "region")
                .map((o) => (
                  <Line
                    key={o.id}
                    id={o.id}
                    points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                    closed
                    fill={BIOME_FILL[o.biome]}
                    opacity={o.opacity}
                    stroke={selectedId === o.id ? "#33424a" : undefined}
                    strokeWidth={selectedId === o.id ? 1.5 : 0}
                    onClick={() => tool === "select" && setSelectedId(o.id)}
                    onTap={() => tool === "select" && setSelectedId(o.id)}
                  />
                ))}
              {layer.objects
                .filter((o): o is PathObject => o.kind === "path")
                .map((o) => {
                  const style = PATH_STYLE[o.pathKind],
                    w = Math.max(0.5, o.width * W);
                  return (
                    <Line
                      key={o.id}
                      id={o.id}
                      points={o.points.flatMap((p) => [p.x * W, p.y * H])}
                      stroke={selectedId === o.id ? "#c65b3d" : o.color || style.color}
                      strokeWidth={w}
                      dash={style.dash?.map((d) => d * w)}
                      lineCap="round"
                      lineJoin="round"
                      onClick={() => tool === "select" && setSelectedId(o.id)}
                      onTap={() => tool === "select" && setSelectedId(o.id)}
                    />
                  );
                })}
              {layer.objects
                .filter((o): o is IconObject => o.kind === "icon")
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
                      draggable={tool === "select"}
                      onClick={() => tool === "select" && setSelectedId(o.id)}
                      onTap={() => tool === "select" && setSelectedId(o.id)}
                      onDragEnd={(e) =>
                        updateObject(o.id, {
                          x: e.target.x() / W,
                          y: e.target.y() / H,
                        })
                      }
                      onTransformEnd={(e) => {
                        const node = e.target,
                          k = (W * 0.05) / 24,
                          scale = Math.max(0.1, Math.min(8, node.scaleX() / k));
                        updateObject(o.id, {
                          scale,
                          rotation: node.rotation(),
                          x: node.x() / W,
                          y: node.y() / H,
                        });
                      }}
                    >
                      {def.stroke && (
                        <KonvaPath
                          data={def.stroke}
                          stroke={o.color}
                          strokeWidth={1.6}
                          lineCap="round"
                          lineJoin="round"
                        />
                      )}
                      {def.fill && <KonvaPath data={def.fill} fill={o.color} />}
                    </Group>
                  );
                })}
              {layer.objects
                .filter((o): o is LabelObject => o.kind === "label")
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
                    draggable={tool === "select"}
                    onClick={() => tool === "select" && setSelectedId(o.id)}
                    onTap={() => tool === "select" && setSelectedId(o.id)}
                    onDragEnd={(e) =>
                      updateObject(o.id, {
                        x: e.target.x() / W,
                        y: e.target.y() / H,
                      })
                    }
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
                lineCap="round"
                lineJoin="round"
              />
            )}
            {pathDraft && pathDraft.length > 1 && (
              <Line
                points={pathDraft.flatMap((p) => [p.x * W, p.y * H])}
                stroke={PATH_STYLE[pathKind].color}
                strokeWidth={Math.max(0.5, pathWidth * W)}
                dash={PATH_STYLE[pathKind].dash}
                lineCap="round"
                lineJoin="round"
                opacity={0.85}
              />
            )}
            {regionDraft && (
              <>
                <Line
                  points={regionDraft.flatMap((p) => [p.x * W, p.y * H])}
                  stroke="#33424a"
                  strokeWidth={1.5}
                  dash={[4, 3]}
                />
                {regionDraft.map((p, i) => (
                  <Circle
                    key={i}
                    x={p.x * W}
                    y={p.y * H}
                    radius={4}
                    fill={i === 0 ? "#c65b3d" : "#33424a"}
                  />
                ))}
              </>
            )}
          </Layer>
          <Layer>
            {tool === "select" && selectedId && (
              <Transformer ref={transformerRef} rotateEnabled anchorSize={9} />
            )}
          </Layer>
        </Stage>
      </div>
      {tool === "select" && (
        <div className="object-inspector">
          {!selectedObj && <p className="help-copy">{t("noSelection")}</p>}
          {selectedObj?.kind === "icon" && (
            <>
              <SelectField
                label={t("iconPicker")}
                value={selectedObj.icon}
                onChange={(v) =>
                  updateObject(selectedObj.id, { icon: v as IconId })
                }
              >
                {ICON_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(ICONS[id].labelKey)}
                  </option>
                ))}
              </SelectField>
              <label>
                {t("color")}
                <input
                  type="color"
                  value={selectedObj.color}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { color: e.target.value })
                  }
                />
              </label>
              <label>
                {t("iconScale")}
                <input
                  type="range"
                  min={0.3}
                  max={4}
                  step={0.1}
                  value={selectedObj.scale}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { scale: +e.target.value })
                  }
                />
              </label>
              <label>
                {t("iconRotation")}
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={selectedObj.rotation}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { rotation: +e.target.value })
                  }
                />
              </label>
            </>
          )}
          {selectedObj?.kind === "label" && (
            <>
              <label className="field-label">
                {t("labelText")}
                <input
                  maxLength={200}
                  value={selectedObj.text}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { text: e.target.value })
                  }
                />
              </label>
              <label>
                {t("color")}
                <input
                  type="color"
                  value={selectedObj.color}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { color: e.target.value })
                  }
                />
              </label>
              <label>
                {t("labelSize")}
                <input
                  type="range"
                  min={0.01}
                  max={0.08}
                  step={0.005}
                  value={selectedObj.size}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { size: +e.target.value })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedObj.rtl}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { rtl: e.target.checked })
                  }
                />
                {t("labelRtl")}
              </label>
            </>
          )}
          {selectedObj?.kind === "path" && (
            <>
              <SelectField
                label={t("pathKind")}
                value={selectedObj.pathKind}
                onChange={(v) =>
                  updateObject(selectedObj.id, { pathKind: v as PathKind })
                }
              >
                {PATH_KIND_LIST.map((k) => (
                  <option key={k} value={k}>
                    {t(PATH_KIND_LABEL_KEY[k])}
                  </option>
                ))}
              </SelectField>
              <label>
                {t("color")}
                <input
                  type="color"
                  value={selectedObj.color}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { color: e.target.value })
                  }
                />
              </label>
              <label>
                {t("pathWidth")}
                <input
                  type="range"
                  min={0.002}
                  max={0.02}
                  step={0.001}
                  value={selectedObj.width}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { width: +e.target.value })
                  }
                />
              </label>
            </>
          )}
          {selectedObj?.kind === "region" && (
            <>
              <SelectField
                label={t("biome")}
                value={selectedObj.biome}
                onChange={(v) =>
                  updateObject(selectedObj.id, { biome: v as Biome })
                }
              >
                {BIOME_LIST.map((b) => (
                  <option key={b} value={b}>
                    {t(BIOME_LABEL_KEY[b])}
                  </option>
                ))}
              </SelectField>
              <label>
                {t("fillOpacity")}
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={selectedObj.opacity}
                  onChange={(e) =>
                    updateObject(selectedObj.id, { opacity: +e.target.value })
                  }
                />
              </label>
            </>
          )}
          {selectedObj && (
            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => duplicateObject(selectedObj.id)}
              >
                {t("duplicateObject")}
              </button>
              <button
                className="secondary-button"
                onClick={() => removeObject(selectedObj.id)}
              >
                {t("deleteObject")}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="layer-panel">
        <div className="section-heading">
          <h3>{t("layers")}</h3>
          <button className="secondary-button" onClick={addLayer}>
            ＋ {t("addLayer")}
          </button>
        </div>
        <div className="layer-list">
          {[...layers].reverse().map((l) => (
            <button
              className={selected?.id === l.id ? "selected" : ""}
              key={l.id}
              onClick={() => setActive(l.id)}
            >
              {l.visible ? "◉" : "○"} {l.name}{" "}
              <small>{l.strokes.length + l.objects.length}</small>
            </button>
          ))}
          <span>{t("baseMap")}</span>
        </div>
        {selected && (
          <div className="layer-options">
            <label className="field-label">
              {t("layerName")}
              <input
                key={selected.id + selected.name}
                defaultValue={selected.name}
                maxLength={60}
                onBlur={(e) => {
                  if (e.target.value !== selected.name)
                    updateLayer({ name: e.target.value });
                }}
              />
            </label>
            <label>
              {t("opacity")}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selected.opacity}
                onChange={(e) => updateLayer({ opacity: +e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={selected.visible}
                onChange={(e) => updateLayer({ visible: e.target.checked })}
              />
              {t("visible")}
            </label>
            <div className="button-row">
              <button
                title={t("moveUp")}
                aria-label={t("moveUp")}
                className="secondary-button"
                onClick={() => moveLayer(1)}
              >
                ↑
              </button>
              <button
                title={t("moveDown")}
                aria-label={t("moveDown")}
                className="secondary-button"
                onClick={() => moveLayer(-1)}
              >
                ↓
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  onChange(layers.filter((l) => l.id !== selected.id))
                }
              >
                {t("removeLayer")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
