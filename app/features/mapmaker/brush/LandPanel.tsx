"use client";
/**
 * The Land Tool panel (left of the canvas while the Land tool is active):
 * add or remove land with a free brush, Edge Shape, polygon, rectangle or
 * ellipse; the natural edge of the shapes; and the land layer's base
 * texture. The coastline's look (outline, beach, glow, waves, depth) is the
 * layer's coast effect — one click away in the Layers tab.
 */
import type { ReactNode } from "react";
import { Glyph } from "../glyphs";
import { shortcutLabel } from "../shortcuts";
import { Slider } from "../components/EditorControls";
import { SourcePicker } from "./SourcePicker";
import { DEFAULT_LAND_TOOL, LAND_MODES, type LandToolState } from "./land";
import type { NaturalEdge, PaintSource } from "../types";

type T = (k: string, opts?: Record<string, unknown>) => string;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function LandPanel({
  state,
  onChange,
  t,
  mapWidthPx,
  target,
  base,
  onBaseChange,
  recentColors,
  onCommitColor,
  onEditCoast,
}: {
  state: LandToolState;
  onChange: (next: LandToolState) => void;
  t: T;
  /** Project width in px — sizes are shown in real map pixels. */
  mapWidthPx: number;
  /** What the tool edits (see EditTarget). */
  target: ReactNode;
  /** The target land layer's base texture (null: no land layer targeted). */
  base: PaintSource | null;
  onBaseChange: (patch: Partial<PaintSource>) => void;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  onEditCoast: (() => void) | null;
}) {
  const s = state,
    shape = s.mode === "polygon" || s.mode === "rect" || s.mode === "ellipse",
    natural = s.mode === "free" || s.mode === "edge" || (shape && s.rough),
    modeInfo = LAND_MODES.find((m) => m.key === s.mode)!;
  const set = (patch: Partial<LandToolState>) => onChange({ ...s, ...patch });
  const setEdge = (patch: Partial<NaturalEdge>) =>
    set({ edge: { ...s.edge, ...patch } });

  return (
    <aside
      className="mm-brush-panel mm-land-panel"
      aria-label={t("mmLandPanel")}
    >
      {target}
      <div className="mm-bp-head">
        <div className="mm-bp-segment" role="radiogroup">
          <button
            className={!s.erase ? "active" : ""}
            onClick={() => set({ erase: false })}
            role="radio"
            aria-checked={!s.erase}
          >
            <Glyph name="land" size={15} />
            {t("mmLandAdd")}
          </button>
          <button
            className={s.erase ? "active" : ""}
            onClick={() => set({ erase: true })}
            role="radio"
            aria-checked={s.erase}
            title={t("mmLandRemoveHint")}
          >
            <Glyph name="water" size={15} />
            {t("mmLandRemove")}
          </button>
        </div>
      </div>

      <div
        className="mm-bp-modes"
        role="radiogroup"
        aria-label={t("mmSubTools")}
      >
        {LAND_MODES.map((m) => (
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

      <div className="mm-bp-props">
        {s.mode === "free" && (
          <Slider
            label={t("mmBrushSize")}
            defaultValue={Math.round(DEFAULT_LAND_TOOL.size * mapWidthPx)}
            value={Math.round(s.size * mapWidthPx)}
            min={2}
            max={Math.round(mapWidthPx * 0.3)}
            step={1}
            onChange={(v) => set({ size: v / mapWidthPx })}
            format={(v) => `${v} px`}
          />
        )}
        {shape && (
          <label className="mm-bp-toggle">
            <input
              type="checkbox"
              checked={s.rough}
              onChange={(e) => set({ rough: e.target.checked })}
            />
            <span className="mm-bp-switch" aria-hidden="true" />
            <span>{t("mmRoughEdges")}</span>
          </label>
        )}
        {natural && (
          <>
            <Slider
              label={t("mmRoughness")}
              defaultValue={DEFAULT_LAND_TOOL.edge.roughness}
              value={s.edge.roughness}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setEdge({ roughness: v })}
              format={pct}
            />
            <Slider
              label={t("mmEdgeDetail")}
              defaultValue={DEFAULT_LAND_TOOL.edge.detail}
              value={s.edge.detail}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setEdge({ detail: v })}
              format={pct}
            />
          </>
        )}
      </div>

      {base && (
        <details className="mm-bp-section" open>
          <summary>
            <span>{t("mmLandTexture")}</span>
            <Glyph name="chevronDown" size={13} />
          </summary>
          <div className="mm-bp-section-body">
            <p className="mm-bp-note">{t("mmLandTextureHint")}</p>
            <SourcePicker
              source={base}
              onChange={onBaseChange}
              t={t}
              recentColors={recentColors}
              onCommitColor={onCommitColor}
            />
          </div>
        </details>
      )}

      {onEditCoast && (
        <button className="secondary-button" onClick={onEditCoast}>
          <Glyph name="edgeShape" size={14} />
          {t("mmEditCoast")}
        </button>
      )}
      <p className="mm-bp-shortcuts">
        {t("mmLandShortcuts", {
          land: shortcutLabel("tool.land"),
          erase: shortcutLabel("paint.erase"),
          size: `${shortcutLabel("paint.smaller")} ${shortcutLabel("paint.bigger")}`,
          cancel: shortcutLabel("edit.cancel"),
        })}
      </p>
    </aside>
  );
}
