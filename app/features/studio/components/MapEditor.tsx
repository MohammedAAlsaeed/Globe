"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { drawLayers } from "../rendering/layers";
import type { MapLayer, Stroke, Point } from "../domain/types";
import type { SourceState } from "../hooks/useSource";
import { SelectField } from "../../../components/ui/fields";
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
    canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    [active, setActive] = useState(""),
    [tool, setTool] = useState<"brush" | "symbol">("brush"),
    [symbol, setSymbol] = useState("mountain"),
    [color, setColor] = useState("#765936"),
    [size, setSize] = useState(0.004),
    [draft, setDraft] = useState<Stroke | null>(null),
    [imageReady, setImageReady] = useState(0);
  const selected =
    layers.find((l) => l.id === active) ?? layers[layers.length - 1];
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) {
        image.current = img;
        setImageReady((n) => n + 1);
      }
    };
    img.src = source.url;
    return () => {
      alive = false;
    };
  }, [source.url]);
  useEffect(() => {
    const c = canvas.current,
      img = image.current;
    if (!c || !img) return;
    c.width = Math.min(1600, source.width);
    c.height = Math.round((c.width * source.height) / source.width);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    drawLayers(ctx, layers, c.width, c.height);
    if (draft)
      drawLayers(
        ctx,
        [
          {
            id: "draft",
            name: "",
            opacity: selected?.opacity ?? 1,
            visible: true,
            strokes: [draft],
          },
        ],
        c.width,
        c.height,
      );
  }, [
    layers,
    draft,
    source.width,
    source.height,
    imageReady,
    selected?.opacity,
  ]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
  };
  const updateLayer = (patch: Partial<MapLayer>) => {
    if (selected)
      onChange(
        layers.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)),
      );
  };
  function add() {
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
      },
    ]);
    setActive(id);
  }
  function move(delta: number) {
    if (!selected) return;
    const index = layers.findIndex((l) => l.id === selected.id),
      to = index + delta;
    if (to < 0 || to >= layers.length) return;
    const next = [...layers];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }
  return (
    <div className="editor-panel">
      <div className="editor-tools">
        <div className="tabs">
          <button
            className={tool === "brush" ? "active" : ""}
            onClick={() => setTool("brush")}
          >
            {t("brush")}
          </button>
          <button
            className={tool === "symbol" ? "active" : ""}
            onClick={() => setTool("symbol")}
          >
            {t("symbol")}
          </button>
        </div>
        {tool === "symbol" && (
          <SelectField label={t("symbol")} value={symbol} onChange={setSymbol}>
            {["mountain", "city", "star"].map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </SelectField>
        )}
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
      </div>
      <p className="help-copy">{t("editorHelp")}</p>
      <canvas
        className={`editor-canvas ${selected?.visible ? "editable" : ""}`}
        ref={canvas}
        aria-label={t("editor")}
        onPointerDown={(e) => {
          if (!selected) return notify("addLayerFirst");
          if (!selected.visible) return;
          if (
            selected.strokes.length >= 5000 ||
            layers.reduce(
              (sum, l) =>
                sum + l.strokes.reduce((n, s) => n + s.points.length, 0),
              0,
            ) > 196000
          )
            return notify("editLimit");
          e.currentTarget.setPointerCapture(e.pointerId);
          setDraft({
            id: crypto.randomUUID(),
            kind: tool,
            points: [point(e)],
            color,
            size,
            symbol,
          });
        }}
        onPointerMove={(e) => {
          if (draft && draft.kind === "brush" && draft.points.length < 4000) {
            const nextPoint = point(e);
            setDraft((old) =>
              old ? { ...old, points: [...old.points, nextPoint] } : null,
            );
          }
        }}
        onPointerUp={(e) => {
          if (draft && selected) {
            updateLayer({ strokes: [...selected.strokes, draft] });
            setDraft(null);
          }
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => setDraft(null)}
      />
      <div className="layer-panel">
        <div className="section-heading">
          <h3>{t("layers")}</h3>
          <button className="secondary-button" onClick={add}>
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
              {l.visible ? "◉" : "○"} {l.name} <small>{l.strokes.length}</small>
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
                onClick={() => move(1)}
              >
                ↑
              </button>
              <button
                title={t("moveDown")}
                aria-label={t("moveDown")}
                className="secondary-button"
                onClick={() => move(-1)}
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
