"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs generated at runtime; next/image has nothing to optimise here */
/**
 * The Brush Tool panel (left of the canvas while the Brush tool is active):
 * paint/eraser, sub-tools, presets & favorites, size/opacity/softness, the
 * texture catalog and color picker, color filters, blend mode, Edit Brush
 * (tip, flow, spacing, rotation, jitter, scatter), pen dynamics, the natural
 * edge of rough shapes, and grid settings for Grid Block. The panel opens
 * with the edit target (which layer, and what of it, the brush changes).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Glyph } from "../glyphs";
import { shortcutLabel } from "../shortcuts";
import { Section, Slider, Toggle } from "../components/EditorControls";
import { ICONS, ICON_IDS, type IconId } from "../../studio/domain/icons";
import { brushPreview } from "./engine";
import {
  PRESETS,
  PRESET_GROUPS,
  presetById,
  type FavoriteBrush,
} from "./presets";
import { SourcePicker } from "./SourcePicker";
import { TIP_LIST } from "./tips";
import { applyFavorite, applyPreset, brushBase, type BrushState } from "./state";
import type {
  BlendMode,
  BrushSettings,
  EdgeSettings,
  PaintMode,
  PaintSource,
} from "../types";

type T = (k: string, opts?: Record<string, unknown>) => string;

export const PAINT_MODES: {
  key: PaintMode;
  glyph: string;
  labelKey: string;
  hintKey: string;
}[] = [
  {
    key: "free",
    glyph: "freeBrush",
    labelKey: "mmModeFree",
    hintKey: "mmModeFreeHint",
  },
  {
    key: "grid",
    glyph: "gridBlock",
    labelKey: "mmModeGrid",
    hintKey: "mmModeGridHint",
  },
  {
    key: "rect",
    glyph: "rect",
    labelKey: "mmModeRect",
    hintKey: "mmModeRectHint",
  },
  {
    key: "ellipse",
    glyph: "ellipse",
    labelKey: "mmModeEllipse",
    hintKey: "mmModeEllipseHint",
  },
  {
    key: "polygon",
    glyph: "polygon",
    labelKey: "mmModePolygon",
    hintKey: "mmModePolygonHint",
  },
];

export const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "hue",
  "saturation",
  "color",
  "luminosity",
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

export function BrushPanel({
  state,
  onChange,
  t,
  mapWidthPx,
  tileCell,
  recentColors,
  onCommitColor,
  favorites,
  onSaveFavorite,
  onDeleteFavorite,
  target,
}: {
  state: BrushState;
  onChange: (next: BrushState) => void;
  t: T;
  /** Project width in px — sizes are shown in real map pixels. */
  mapWidthPx: number;
  /** One map tile, as a fraction of map width (Grid Block default). */
  tileCell: number;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  favorites: FavoriteBrush[];
  onSaveFavorite: (name: string) => void;
  onDeleteFavorite: (id: string) => void;
  /** What the brush edits (see EditTarget). */
  target: ReactNode;
}) {
  const [presetsOpen, setPresetsOpen] = useState(false),
    [favName, setFavName] = useState<string | null>(null);
  const s = state,
    free = s.mode === "free",
    shape = s.mode === "rect" || s.mode === "ellipse" || s.mode === "polygon";

  const set = (patch: Partial<BrushState>) => onChange({ ...s, ...patch });
  const setBrush = (patch: Partial<BrushSettings>) =>
    set({ brush: { ...s.brush, ...patch }, presetId: null });
  const setSource = (patch: Partial<PaintSource>) =>
    set({ source: { ...s.source, ...patch } });
  const setEdge = (patch: Partial<EdgeSettings>) =>
    set({ edge: { ...s.edge, ...patch } });
  const px = (v: number) => `${Math.max(0, Math.round(v * mapWidthPx))} px`;

  /** A preset's or favorite's name (null when unknown). */
  const nameOf = (id: string | null | undefined) => {
    if (!id) return null;
    const fav = favorites.find((f) => f.id === id);
    if (fav) return fav.name;
    const p = presetById(id);
    return p ? t(p.labelKey) : null;
  };
  // What resets return to: the brush this one started from (see brushBase).
  const base = useMemo(() => brushBase(s, favorites), [s, favorites]),
    baseName = nameOf(s.baseId);
  const edited = !s.presetId && !!baseName,
    presetLabel = nameOf(s.presetId) ?? baseName ?? t("mmPresetCustom");

  const softness = free ? s.brush.softness : Math.min(1, s.edge.feather / 0.01);
  const modeInfo = PAINT_MODES.find((m) => m.key === s.mode)!;

  return (
    <aside className="mm-brush-panel" aria-label={t("mmBrushPanel")}>
      {target}
      <div className="mm-bp-head">
        <div className="mm-bp-segment" role="radiogroup">
          <button
            className={!s.erase ? "active" : ""}
            onClick={() => set({ erase: false })}
            role="radio"
            aria-checked={!s.erase}
          >
            <Glyph name="brush" size={15} />
            {t("mmPaint")}
          </button>
          <button
            className={s.erase ? "active" : ""}
            onClick={() => set({ erase: true })}
            role="radio"
            aria-checked={s.erase}
            title={t("mmEraserHint")}
          >
            <Glyph name="eraser" size={15} />
            {t("mmEraser")}
          </button>
        </div>
      </div>

      <div
        className="mm-bp-modes"
        role="radiogroup"
        aria-label={t("mmSubTools")}
      >
        {PAINT_MODES.map((m) => (
          <button
            key={m.key}
            className={s.mode === m.key ? "active" : ""}
            onClick={() => set({ mode: m.key })}
            title={t(m.labelKey)}
            role="radio"
            aria-checked={s.mode === m.key}
          >
            <Glyph name={m.glyph} size={18} />
            <span>{t(m.labelKey)}</span>
          </button>
        ))}
      </div>
      <p className="mm-bp-hint">{t(modeInfo.hintKey)}</p>

      {/* ---- presets & favorites ---- */}
      <div className={`mm-bp-presets ${edited ? "edited" : ""}`}>
        <button
          className="mm-bp-preset-button"
          onClick={() => setPresetsOpen((v) => !v)}
          aria-expanded={presetsOpen}
        >
          <img src={brushPreview(s.brush, s.source)} alt="" />
          <span title={edited ? t("mmPresetModified", { name: presetLabel }) : undefined}>{presetLabel}</span>
          {edited && <i className="mm-bp-edited-dot" aria-label={t("mmPresetModified", { name: presetLabel })} />}
          <Glyph name="chevronDown" size={14} />
        </button>
        <button
          className="mm-bp-icon-button"
          title={t("mmSaveFavorite")}
          onClick={() => setFavName((v) => (v === null ? presetLabel : null))}
        >
          <Glyph name="star" size={15} />
        </button>
        {edited && (
          <button
            className="mm-bp-icon-button"
            title={t("mmPresetRevert", { name: baseName })}
            aria-label={t("mmPresetRevert", { name: baseName })}
            onClick={() => onChange({ ...base, mode: s.mode, erase: s.erase, edge: s.edge, rough: s.rough, grid: s.grid })}
          >
            <Glyph name="reset" size={15} />
          </button>
        )}
      </div>
      {favName !== null && (
        <form
          className="mm-bp-fav-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (favName.trim()) onSaveFavorite(favName.trim().slice(0, 40));
            setFavName(null);
          }}
        >
          <input
            autoFocus
            value={favName}
            maxLength={40}
            onChange={(e) => setFavName(e.target.value)}
            placeholder={t("mmFavoriteName")}
          />
          <button type="submit" className="export-button">
            {t("mmSave")}
          </button>
        </form>
      )}
      {presetsOpen && (
        <div className="mm-bp-preset-list">
          {favorites.length > 0 && (
            <>
              <div className="mm-bp-group-title">{t("mmFavorites")}</div>
              {favorites.map((f) => (
                <div
                  key={f.id}
                  className={`mm-bp-preset-row ${s.presetId === f.id ? "selected" : ""}`}
                >
                  <button
                    onClick={() => {
                      onChange(applyFavorite(s, f));
                      setPresetsOpen(false);
                    }}
                  >
                    <img src={brushPreview(f.brush, f.source)} alt="" />
                    <span>{f.name}</span>
                  </button>
                  <button
                    className="mm-bp-row-x"
                    title={t("mmDeleteFavorite")}
                    onClick={() => onDeleteFavorite(f.id)}
                  >
                    <Glyph name="close" size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
          {PRESET_GROUPS.map((g) => (
            <div key={g.key}>
              <div className="mm-bp-group-title">{t(g.labelKey)}</div>
              {PRESETS.filter((p) => p.group === g.key).map((p) => (
                <div
                  key={p.id}
                  className={`mm-bp-preset-row ${s.presetId === p.id ? "selected" : ""}`}
                >
                  <button
                    onClick={() => {
                      onChange(applyPreset(s, p));
                      setPresetsOpen(false);
                    }}
                  >
                    <img
                      src={brushPreview(
                        {
                          ...s.brush,
                          ...p.brush,
                          pen: { ...s.brush.pen, ...p.brush.pen },
                        },
                        p.source ? { ...s.source, ...p.source } : s.source,
                      )}
                      alt=""
                    />
                    <span>{t(p.labelKey)}</span>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ---- core properties ---- */}
      <div className="mm-bp-props">
        {free && (
          <Slider
            label={t("mmBrushSize")} defaultValue={Math.round(base.brush.size * mapWidthPx)}
            value={Math.round(s.brush.size * mapWidthPx)}
            min={1}
            max={Math.round(mapWidthPx * 0.25)}
            step={1}
            onChange={(v) => setBrush({ size: v / mapWidthPx })}
            format={(v) => `${v} px`}
          />
        )}
        <Slider
          label={s.erase ? t("mmEraseStrength") : t("mmBrushOpacity")} defaultValue={base.opacity}
          value={s.opacity}
          min={0.02}
          max={1}
          step={0.01}
          onChange={(v) => set({ opacity: v, presetId: null })}
          format={pct}
        />
        <Slider
          label={t("mmBrushSoftness")} defaultValue={free ? base.brush.softness : base.edge.feather / 0.01}
          value={softness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            free ? setBrush({ softness: v }) : setEdge({ feather: v * 0.01 })
          }
          format={pct}
        />
      </div>

      {/* ---- source: texture catalog / color ---- */}
      {!s.erase && (
        <Section title={t("mmPaintSource")} open>
          <SourcePicker
            source={s.source}
            onChange={setSource}
            t={t}
            recentColors={recentColors}
            onCommitColor={onCommitColor}
          />
        </Section>
      )}

      {/* ---- color filters ---- */}
      {!s.erase && (
        <Section title={t("mmColorFilters")}>
          <Slider
            label={t("mmHue")} defaultValue={base.source.hue}
            value={s.source.hue}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setSource({ hue: v })}
            format={(v) => `${v}°`}
          />
          <Slider
            label={t("mmSaturation")} defaultValue={base.source.saturation}
            value={s.source.saturation}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setSource({ saturation: v })}
            format={signedPct}
          />
          <Slider
            label={t("mmBrightness")} defaultValue={base.source.brightness}
            value={s.source.brightness}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setSource({ brightness: v })}
            format={signedPct}
          />
          <Slider
            label={t("mmContrast")} defaultValue={base.source.contrast}
            value={s.source.contrast}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setSource({ contrast: v })}
            format={signedPct}
          />
          <button
            className="secondary-button"
            onClick={() =>
              setSource({ hue: 0, saturation: 0, brightness: 0, contrast: 0 })
            }
          >
            {t("mmResetFilters")}
          </button>
        </Section>
      )}

      {/* ---- blend mode ---- */}
      {!s.erase && (
        <label className="mm-bp-select-row">
          <span>{t("mmBlendMode")}</span>
          <select
            value={s.blend}
            onChange={(e) =>
              set({ blend: e.target.value as BlendMode, presetId: null })
            }
          >
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`mmBlend_${b}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* ---- Edit Brush (Free Brush) ---- */}
      {free && (
        <Section title={t("mmEditBrush")}>
          <div className="mm-bp-tips">
            {TIP_LIST.map((tip) => (
              <button
                key={tip.key}
                className={s.brush.tip === tip.key ? "selected" : ""}
                onClick={() => setBrush({ tip: tip.key })}
                title={t(tip.labelKey)}
              >
                <img
                  src={brushPreview(
                    {
                      ...s.brush,
                      tip: tip.key,
                      size: 0.02,
                      sizeJitter: 0,
                      scatter: 0,
                    },
                    { ...s.source, type: "color", color: "#e7e9ec" },
                    64,
                    28,
                  )}
                  alt=""
                />
                <span>{t(tip.labelKey)}</span>
              </button>
            ))}
          </div>
          <label className="mm-bp-select-row">
            <span>{t("mmStampTip")}</span>
            <select
              value={s.brush.tip.startsWith("stamp:") ? s.brush.tip : ""}
              onChange={(e) =>
                e.target.value &&
                setBrush({
                  tip: e.target.value as BrushSettings["tip"],
                  spacing: Math.max(s.brush.spacing, 0.6),
                  rotationJitter: s.brush.rotationJitter || 0.15,
                })
              }
            >
              <option value="">{t("mmStampTipNone")}</option>
              {ICON_IDS.map((id: IconId) => (
                <option key={id} value={`stamp:${id}`}>
                  {t(ICONS[id].labelKey)}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label={t("mmFlow")} defaultValue={base.brush.flow}
            value={s.brush.flow}
            min={0.02}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ flow: v })}
            format={pct}
          />
          <Slider
            label={t("mmSpacing")} defaultValue={base.brush.spacing}
            value={s.brush.spacing}
            min={0.02}
            max={2}
            step={0.01}
            onChange={(v) => setBrush({ spacing: v })}
            format={pct}
          />
          <Slider
            label={t("mmRotation")} defaultValue={base.brush.rotation}
            value={s.brush.rotation}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setBrush({ rotation: v })}
            format={(v) => `${v}°`}
          />
          <Slider
            label={t("mmSizeJitter")} defaultValue={base.brush.sizeJitter}
            value={s.brush.sizeJitter}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ sizeJitter: v })}
            format={pct}
          />
          <Slider
            label={t("mmOpacityJitter")} defaultValue={base.brush.opacityJitter}
            value={s.brush.opacityJitter}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ opacityJitter: v })}
            format={pct}
          />
          <Slider
            label={t("mmRotationJitter")} defaultValue={base.brush.rotationJitter}
            value={s.brush.rotationJitter}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ rotationJitter: v })}
            format={pct}
          />
          <Slider
            label={t("mmScatter")} defaultValue={base.brush.scatter}
            value={s.brush.scatter}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => setBrush({ scatter: v })}
            format={pct}
          />
        </Section>
      )}

      {/* ---- pen dynamics ---- */}
      {free && (
        <Section title={t("mmPenDynamics")}>
          <Toggle
            label={t("mmPenEnable")}
            checked={s.brush.pen.enabled}
            onChange={(v) => setBrush({ pen: { ...s.brush.pen, enabled: v } })}
          />
          <div
            className={`mm-bp-indent ${s.brush.pen.enabled ? "" : "disabled"}`}
          >
            <Toggle
              label={t("mmPenSize")}
              checked={s.brush.pen.size}
              onChange={(v) => setBrush({ pen: { ...s.brush.pen, size: v } })}
            />
            <Toggle
              label={t("mmPenOpacity")}
              checked={s.brush.pen.opacity}
              onChange={(v) =>
                setBrush({ pen: { ...s.brush.pen, opacity: v } })
              }
            />
            <Toggle
              label={t("mmPenFlow")}
              checked={s.brush.pen.flow}
              onChange={(v) => setBrush({ pen: { ...s.brush.pen, flow: v } })}
            />
          </div>
          <p className="mm-bp-note">{t("mmPenNote")}</p>
        </Section>
      )}

      {/* ---- rough edges for geometric shapes ---- */}
      {shape && !s.erase && (
        <div className="mm-bp-props">
          <Toggle
            label={t("mmRoughEdges")}
            checked={s.rough}
            onChange={(v) => set({ rough: v })}
          />
        </div>
      )}

      {/* ---- natural edge of rough shapes ---- */}
      {shape && s.rough && !s.erase && (
        <Section title={t("mmEdgeSettings")} open>
          <Slider
            label={t("mmRoughness")} defaultValue={base.edge.roughness}
            value={s.edge.roughness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ roughness: v })}
            format={pct}
          />
          <Slider
            label={t("mmEdgeDetail")} defaultValue={base.edge.detail}
            value={s.edge.detail}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ detail: v })}
            format={pct}
          />
        </Section>
      )}

      {/* ---- Grid Block ---- */}
      {s.mode === "grid" && (
        <Section title={t("mmGridSettings")} open>
          <div className="mm-bp-segment small">
            <button
              className={s.grid.type === "square" ? "active" : ""}
              onClick={() => set({ grid: { ...s.grid, type: "square" } })}
            >
              {t("mmGridSquare")}
            </button>
            <button
              className={s.grid.type === "hex" ? "active" : ""}
              onClick={() => set({ grid: { ...s.grid, type: "hex" } })}
            >
              {t("mmGridHex")}
            </button>
          </div>
          <Slider
            label={t("mmCellSize")} defaultValue={tileCell}
            value={s.grid.cell}
            min={0.005}
            max={0.15}
            step={0.001}
            onChange={(v) => set({ grid: { ...s.grid, cell: v } })}
            format={px}
          />
          <button
            className="secondary-button"
            onClick={() => set({ grid: { ...s.grid, cell: tileCell } })}
          >
            {t("mmMatchMapTiles")}
          </button>
        </Section>
      )}

      <p className="mm-bp-shortcuts">
        {t("mmBrushShortcuts", {
          brush: shortcutLabel("tool.brush"),
          land: shortcutLabel("tool.land"),
          line: shortcutLabel("tool.line"),
          erase: shortcutLabel("paint.erase"),
          size: `${shortcutLabel("paint.smaller")} ${shortcutLabel("paint.bigger")}`,
          cancel: shortcutLabel("edit.cancel"),
        })}
      </p>
    </aside>
  );
}
