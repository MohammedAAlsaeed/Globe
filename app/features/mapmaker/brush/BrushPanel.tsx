"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs generated at runtime; next/image has nothing to optimise here */
/**
 * The Brush Tool panel (left of the canvas while the Brush tool is active):
 * paint/eraser, sub-tools, presets & favorites, size/opacity/softness, the
 * texture catalog and color picker, color filters, blend mode, Edit Brush
 * (tip, flow, spacing, rotation, jitter, scatter), pen dynamics, natural-edge
 * styling for Edge Shape, and grid settings for Grid Block.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Glyph } from "../glyphs";
import { Slider } from "../components/EditorControls";
import { ICONS, ICON_IDS, type IconId } from "../../studio/domain/icons";
import { brushPreview } from "./engine";
import {
  EDGE_STYLES,
  PRESETS,
  PRESET_GROUPS,
  presetById,
  type FavoriteBrush,
} from "./presets";
import {
  TEXTURES,
  TEXTURE_CATEGORIES,
  textureDef,
  textureThumb,
  type TextureCategory,
} from "./textures";
import { TIP_LIST } from "./tips";
import { applyFavorite, applyPreset, type BrushState } from "./state";
import type {
  BlendMode,
  BrushSettings,
  EdgeSettings,
  LayerRole,
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
    key: "edge",
    glyph: "edgeShape",
    labelKey: "mmModeEdge",
    hintKey: "mmModeEdgeHint",
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

const BLEND_MODES: BlendMode[] = [
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

function Section({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="mm-bp-section" open={open}>
      <summary>
        <span>{title}</span>
        <Glyph name="chevronDown" size={13} />
      </summary>
      <div className="mm-bp-section-body">{children}</div>
    </details>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mm-bp-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mm-bp-switch" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mm-bp-color-row">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

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
  layerName,
  layerRole,
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
  layerName: string;
  layerRole: LayerRole;
}) {
  const [presetsOpen, setPresetsOpen] = useState(false),
    [favName, setFavName] = useState<string | null>(null),
    [texCategory, setTexCategory] = useState<TextureCategory | "all">("all");
  const s = state,
    free = s.mode === "free",
    shape = s.mode === "rect" || s.mode === "ellipse" || s.mode === "polygon",
    showEdge = !s.erase && (s.mode === "edge" || (shape && s.rough));

  const set = (patch: Partial<BrushState>) => onChange({ ...s, ...patch });
  const setBrush = (patch: Partial<BrushSettings>) =>
    set({ brush: { ...s.brush, ...patch }, presetId: null });
  const setSource = (patch: Partial<PaintSource>) =>
    set({ source: { ...s.source, ...patch } });
  const setEdge = (patch: Partial<EdgeSettings>) =>
    set({ edge: { ...s.edge, ...patch }, edgeStyle: null });
  const px = (v: number) => `${Math.max(0, Math.round(v * mapWidthPx))} px`;

  const presetLabel = useMemo(() => {
    if (!s.presetId) return t("mmPresetCustom");
    const fav = favorites.find((f) => f.id === s.presetId);
    if (fav) return fav.name;
    const p = presetById(s.presetId);
    return p ? t(p.labelKey) : t("mmPresetCustom");
  }, [s.presetId, favorites, t]);

  const textures =
    texCategory === "all"
      ? TEXTURES
      : TEXTURES.filter((x) => x.category === texCategory);
  const softness = free ? s.brush.softness : Math.min(1, s.edge.feather / 0.01);
  const modeInfo = PAINT_MODES.find((m) => m.key === s.mode)!;

  return (
    <aside className="mm-brush-panel" aria-label={t("mmBrushPanel")}>
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
      <div className="mm-bp-presets">
        <button
          className="mm-bp-preset-button"
          onClick={() => setPresetsOpen((v) => !v)}
          aria-expanded={presetsOpen}
        >
          <img src={brushPreview(s.brush, s.source)} alt="" />
          <span>{presetLabel}</span>
          <Glyph name="chevronDown" size={14} />
        </button>
        <button
          className="mm-bp-icon-button"
          title={t("mmSaveFavorite")}
          onClick={() => setFavName((v) => (v === null ? presetLabel : null))}
        >
          <Glyph name="star" size={15} />
        </button>
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
            label={t("mmBrushSize")}
            value={Math.round(s.brush.size * mapWidthPx)}
            min={1}
            max={Math.round(mapWidthPx * 0.25)}
            step={1}
            onChange={(v) => setBrush({ size: v / mapWidthPx })}
            format={(v) => `${v} px`}
          />
        )}
        <Slider
          label={s.erase ? t("mmEraseStrength") : t("mmBrushOpacity")}
          value={s.opacity}
          min={0.02}
          max={1}
          step={0.01}
          onChange={(v) => set({ opacity: v, presetId: null })}
          format={pct}
        />
        <Slider
          label={t("mmBrushSoftness")}
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
          <div className="mm-bp-segment small">
            <button
              className={s.source.type === "texture" ? "active" : ""}
              onClick={() => setSource({ type: "texture" })}
            >
              {t("mmSourceTexture")}
            </button>
            <button
              className={s.source.type === "color" ? "active" : ""}
              onClick={() => setSource({ type: "color" })}
            >
              {t("mmSourceColor")}
            </button>
          </div>
          {s.source.type === "texture" ? (
            <>
              <div className="mm-bp-chips">
                <button
                  className={texCategory === "all" ? "active" : ""}
                  onClick={() => setTexCategory("all")}
                >
                  {t("mmTexCatAll")}
                </button>
                {TEXTURE_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    className={texCategory === c.key ? "active" : ""}
                    onClick={() => setTexCategory(c.key)}
                  >
                    {t(c.labelKey)}
                  </button>
                ))}
              </div>
              <div className="mm-bp-texture-grid">
                {textures.map((x) => (
                  <button
                    key={x.id}
                    className={s.source.texture === x.id ? "selected" : ""}
                    title={t(x.labelKey)}
                    onClick={() => setSource({ texture: x.id })}
                    style={{ backgroundImage: `url(${textureThumb(x.id)})` }}
                  >
                    <span>{t(x.labelKey)}</span>
                  </button>
                ))}
              </div>
              <div className="mm-bp-current">
                {t(textureDef(s.source.texture).labelKey)}
              </div>
              <Slider
                label={t("mmTextureScale")}
                value={s.source.textureScale}
                min={0.25}
                max={4}
                step={0.05}
                onChange={(v) => setSource({ textureScale: v })}
                format={(v) => `${v.toFixed(2)}×`}
              />
              <Slider
                label={t("mmTextureRotation")}
                value={s.source.textureRotation}
                min={0}
                max={359}
                step={1}
                onChange={(v) => setSource({ textureRotation: v })}
                format={(v) => `${v}°`}
              />
            </>
          ) : (
            <div className="mm-bp-color">
              <input
                type="color"
                value={s.source.color}
                onChange={(e) => setSource({ color: e.target.value })}
                onBlur={(e) => onCommitColor(e.target.value)}
              />
              <div className="mm-recents-row">
                {recentColors.map((c) => (
                  <button
                    key={c}
                    className="mm-color-chip"
                    style={{ background: c }}
                    onClick={() => setSource({ color: c })}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ---- color filters ---- */}
      {!s.erase && (
        <Section title={t("mmColorFilters")}>
          <Slider
            label={t("mmHue")}
            value={s.source.hue}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setSource({ hue: v })}
            format={(v) => `${v}°`}
          />
          <Slider
            label={t("mmSaturation")}
            value={s.source.saturation}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setSource({ saturation: v })}
            format={signedPct}
          />
          <Slider
            label={t("mmBrightness")}
            value={s.source.brightness}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setSource({ brightness: v })}
            format={signedPct}
          />
          <Slider
            label={t("mmContrast")}
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
            label={t("mmFlow")}
            value={s.brush.flow}
            min={0.02}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ flow: v })}
            format={pct}
          />
          <Slider
            label={t("mmSpacing")}
            value={s.brush.spacing}
            min={0.02}
            max={2}
            step={0.01}
            onChange={(v) => setBrush({ spacing: v })}
            format={pct}
          />
          <Slider
            label={t("mmRotation")}
            value={s.brush.rotation}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setBrush({ rotation: v })}
            format={(v) => `${v}°`}
          />
          <Slider
            label={t("mmSizeJitter")}
            value={s.brush.sizeJitter}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ sizeJitter: v })}
            format={pct}
          />
          <Slider
            label={t("mmOpacityJitter")}
            value={s.brush.opacityJitter}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ opacityJitter: v })}
            format={pct}
          />
          <Slider
            label={t("mmRotationJitter")}
            value={s.brush.rotationJitter}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush({ rotationJitter: v })}
            format={pct}
          />
          <Slider
            label={t("mmScatter")}
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

      {/* ---- natural edge (Edge Shape) ---- */}
      {showEdge && (
        <Section title={t("mmEdgeSettings")} open>
          <div className="mm-bp-chips wrap">
            {EDGE_STYLES.map((st) => (
              <button
                key={st.id}
                className={s.edgeStyle === st.id ? "active" : ""}
                onClick={() =>
                  set({ edge: { ...s.edge, ...st.edge }, edgeStyle: st.id })
                }
              >
                {t(st.labelKey)}
              </button>
            ))}
          </div>
          <Slider
            label={t("mmRoughness")}
            value={s.edge.roughness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ roughness: v })}
            format={pct}
          />
          <Slider
            label={t("mmEdgeDetail")}
            value={s.edge.detail}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ detail: v })}
            format={pct}
          />
          <Slider
            label={t("mmIslets")}
            value={s.edge.islets}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ islets: v })}
            format={pct}
          />
          <div className="mm-bp-subtitle">{t("mmOutline")}</div>
          <Slider
            label={t("mmWidth")}
            value={s.edge.outlineWidth}
            min={0}
            max={0.005}
            step={0.0001}
            onChange={(v) => setEdge({ outlineWidth: v })}
            format={px}
          />
          <ColorRow
            label={t("mmColor")}
            value={s.edge.outlineColor}
            onChange={(v) => setEdge({ outlineColor: v })}
          />
          <div className="mm-bp-subtitle">{t("mmShore")}</div>
          <Slider
            label={t("mmStrength")}
            value={s.edge.shoreStrength}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ shoreStrength: v })}
            format={pct}
          />
          <Slider
            label={t("mmWidth")}
            value={s.edge.shoreWidth}
            min={0.001}
            max={0.02}
            step={0.0005}
            onChange={(v) => setEdge({ shoreWidth: v })}
            format={px}
          />
          <ColorRow
            label={t("mmColor")}
            value={s.edge.shoreColor}
            onChange={(v) => setEdge({ shoreColor: v })}
          />
          <div className="mm-bp-subtitle">{t("mmInnerShade")}</div>
          <Slider
            label={t("mmDepthShallows")}
            value={s.edge.innerShade}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ innerShade: v })}
            format={signedPct}
          />
          <Slider
            label={t("mmWidth")}
            value={s.edge.innerShadeWidth}
            min={0.002}
            max={0.04}
            step={0.0005}
            onChange={(v) => setEdge({ innerShadeWidth: v })}
            format={px}
          />
          <div className="mm-bp-subtitle">{t("mmWaterGlow")}</div>
          <Slider
            label={t("mmBrushOpacity")}
            value={s.edge.glowOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ glowOpacity: v })}
            format={pct}
          />
          <Slider
            label={t("mmWidth")}
            value={s.edge.glowWidth}
            min={0.002}
            max={0.04}
            step={0.0005}
            onChange={(v) => setEdge({ glowWidth: v })}
            format={px}
          />
          <ColorRow
            label={t("mmColor")}
            value={s.edge.glowColor}
            onChange={(v) => setEdge({ glowColor: v })}
          />
          <div className="mm-bp-subtitle">{t("mmRipples")}</div>
          <Slider
            label={t("mmCount")}
            value={s.edge.ripples}
            min={0}
            max={6}
            step={1}
            onChange={(v) => setEdge({ ripples: v })}
          />
          <Slider
            label={t("mmSpacing")}
            value={s.edge.rippleSpacing}
            min={0.002}
            max={0.02}
            step={0.0005}
            onChange={(v) => setEdge({ rippleSpacing: v })}
            format={px}
          />
          <Slider
            label={t("mmBrushOpacity")}
            value={s.edge.rippleOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setEdge({ rippleOpacity: v })}
            format={pct}
          />
          <ColorRow
            label={t("mmColor")}
            value={s.edge.rippleColor}
            onChange={(v) => setEdge({ rippleColor: v })}
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
            label={t("mmCellSize")}
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

      <div className={`mm-bp-layer mm-role-${layerRole}`}>
        <Glyph
          name={
            layerRole === "water"
              ? "water"
              : layerRole === "land"
                ? "land"
                : "layers"
          }
          size={14}
        />
        <span>{t("mmPaintingOn", { layer: layerName })}</span>
      </div>
      <p className="mm-bp-shortcuts">{t("mmBrushShortcuts")}</p>
    </aside>
  );
}
