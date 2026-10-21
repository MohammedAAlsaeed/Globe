"use client";
/**
 * Coast & water controls for the active land layer (Layers tab) —
 * Inkarnate-style land-layer coastline settings: the coastline shape (always
 * applied), and its decoration, which can be switched off: the land edge
 * (outline, beach, edge shading) and the water around it (shallows glow,
 * wave lines, depth shading away from the coast).
 */
import type { ReactNode } from "react";
import { Glyph } from "../glyphs";
import { Slider } from "../components/EditorControls";
import {
  COAST_STYLES,
  coastBase,
  coastSettings,
  coastStyle,
} from "./coastStyles";
import type { CoastEffect, MMLayer } from "../types";

type T = (k: string, opts?: Record<string, unknown>) => string;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Group({
  title,
  icon,
  open,
  children,
}: {
  title: string;
  icon: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="mm-bp-section" open={open}>
      <summary>
        <span className="mm-cp-title">
          <Glyph name={icon} size={13} />
          {title}
        </span>
        <Glyph name="chevronDown" size={13} />
      </summary>
      <div className="mm-bp-section-body">{children}</div>
    </details>
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

export function CoastEffectPanel({
  layer,
  t,
  mapWidthPx,
  busy,
  onChange,
}: {
  /** A land layer. */
  layer: MMLayer;
  t: T;
  mapWidthPx: number;
  busy: boolean;
  onChange: (next: CoastEffect) => void;
}) {
  const cur = coastSettings(layer),
    on = cur.enabled;
  // Edits keep the style they started from, so resets return to it.
  const set = (patch: Partial<CoastEffect>) =>
    onChange({
      ...cur,
      ...patch,
      style: null,
      baseStyle: cur.style ?? cur.baseStyle ?? null,
    });
  const base = coastBase(cur);
  const px = (v: number) => `${Math.max(0, Math.round(v * mapWidthPx))} px`;

  return (
    <section className="mm-coast-panel" aria-label={t("mmCoastEffect")}>
      <div className="mm-cp-head">
        <span className="mm-cp-name">
          <Glyph name="edgeShape" size={14} />
          {t("mmCoastEffect")}
        </span>
        {busy && <span className="mm-cp-busy">{t("mmCoastUpdating")}</span>}
      </div>
      <p className="mm-bp-note">{t("mmCoastEffectHint")}</p>
      <div className="mm-bp-chips wrap">
        {COAST_STYLES.map((st) => (
          <button
            key={st.id}
            className={
              cur.style === st.id
                ? "active"
                : !cur.style && base.style === st.id
                  ? "modified"
                  : ""
            }
            title={
              !cur.style && base.style === st.id
                ? t("mmStyleModified")
                : undefined
            }
            onClick={() => onChange(coastStyle(st.id))}
          >
            {t(st.labelKey)}
          </button>
        ))}
      </div>

      <Group title={t("mmCoastShape")} icon="edgeShape" open>
        <Slider
          label={t("mmRoughness")}
          value={cur.roughness}
          defaultValue={base.roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ roughness: v })}
          format={pct}
        />
        <Slider
          label={t("mmEdgeDetail")}
          value={cur.detail}
          defaultValue={base.detail}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ detail: v })}
          format={pct}
        />
        <Slider
          label={t("mmCoastSmoothing")}
          value={cur.smoothing}
          defaultValue={base.smoothing}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ smoothing: v })}
          format={pct}
        />
        <Slider
          label={t("mmIslets")}
          value={cur.islets}
          defaultValue={base.islets}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set({ islets: v })}
          format={pct}
        />
      </Group>

      <label className="mm-bp-toggle mm-cp-decor">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ ...cur, enabled: e.target.checked })}
        />
        <span className="mm-bp-switch" aria-hidden="true" />
        <span>{t("mmCoastDecoration")}</span>
      </label>
      {on && (
        <>
          <Group title={t("mmCoastLand")} icon="land">
            <div className="mm-bp-subtitle">{t("mmOutline")}</div>
            <Slider
              label={t("mmWidth")}
              value={cur.outlineWidth}
              defaultValue={base.outlineWidth}
              min={0}
              max={0.005}
              step={0.0001}
              onChange={(v) => set({ outlineWidth: v })}
              format={px}
            />
            <ColorRow
              label={t("mmColor")}
              value={cur.outlineColor}
              onChange={(v) => set({ outlineColor: v })}
            />
            <div className="mm-bp-subtitle">{t("mmShore")}</div>
            <Slider
              label={t("mmStrength")}
              value={cur.shoreStrength}
              defaultValue={base.shoreStrength}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => set({ shoreStrength: v })}
              format={pct}
            />
            <Slider
              label={t("mmWidth")}
              value={cur.shoreWidth}
              defaultValue={base.shoreWidth}
              min={0.001}
              max={0.02}
              step={0.0005}
              onChange={(v) => set({ shoreWidth: v })}
              format={px}
            />
            <ColorRow
              label={t("mmColor")}
              value={cur.shoreColor}
              onChange={(v) => set({ shoreColor: v })}
            />
            <div className="mm-bp-subtitle">{t("mmLandEdgeShade")}</div>
            <Slider
              label={t("mmDarkLight")}
              value={cur.landShade}
              defaultValue={base.landShade}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => set({ landShade: v })}
              format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
            />
            <Slider
              label={t("mmWidth")}
              value={cur.landShadeWidth}
              defaultValue={base.landShadeWidth}
              min={0.002}
              max={0.04}
              step={0.0005}
              onChange={(v) => set({ landShadeWidth: v })}
              format={px}
            />
          </Group>

          <Group title={t("mmCoastWater")} icon="water" open>
            <div className="mm-bp-subtitle">{t("mmShallowGlow")}</div>
            <Slider
              label={t("mmBrushOpacity")}
              value={cur.glowOpacity}
              defaultValue={base.glowOpacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => set({ glowOpacity: v })}
              format={pct}
            />
            <Slider
              label={t("mmWidth")}
              value={cur.glowWidth}
              defaultValue={base.glowWidth}
              min={0.002}
              max={0.06}
              step={0.0005}
              onChange={(v) => set({ glowWidth: v })}
              format={px}
            />
            <ColorRow
              label={t("mmColor")}
              value={cur.glowColor}
              onChange={(v) => set({ glowColor: v })}
            />

            <div className="mm-bp-subtitle">{t("mmWaves")}</div>
            <Slider
              label={t("mmCount")}
              value={cur.waves}
              defaultValue={base.waves}
              min={0}
              max={12}
              step={1}
              onChange={(v) => set({ waves: v })}
            />
            <Slider
              label={t("mmSpacing")}
              value={cur.waveSpacing}
              defaultValue={base.waveSpacing}
              min={0.002}
              max={0.025}
              step={0.0005}
              onChange={(v) => set({ waveSpacing: v })}
              format={px}
            />
            <Slider
              label={t("mmWaveOffset")}
              value={cur.waveOffset}
              defaultValue={base.waveOffset}
              min={0}
              max={0.03}
              step={0.0005}
              onChange={(v) => set({ waveOffset: v })}
              format={px}
            />
            <Slider
              label={t("mmWidth")}
              value={cur.waveWidth}
              defaultValue={base.waveWidth}
              min={0.0003}
              max={0.004}
              step={0.0001}
              onChange={(v) => set({ waveWidth: v })}
              format={px}
            />
            <Slider
              label={t("mmBrushOpacity")}
              value={cur.waveOpacity}
              defaultValue={base.waveOpacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => set({ waveOpacity: v })}
              format={pct}
            />
            <Slider
              label={t("mmWaveFade")}
              value={cur.waveFade}
              defaultValue={base.waveFade}
              min={0}
              max={0.9}
              step={0.01}
              onChange={(v) => set({ waveFade: v })}
              format={pct}
            />
            <Slider
              label={t("mmWaveBreakup")}
              value={cur.waveBreakup}
              defaultValue={base.waveBreakup}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => set({ waveBreakup: v })}
              format={pct}
            />
            <ColorRow
              label={t("mmColor")}
              value={cur.waveColor}
              onChange={(v) => set({ waveColor: v })}
            />

            <div className="mm-bp-subtitle">{t("mmDepthShading")}</div>
            <Slider
              label={t("mmStrength")}
              value={cur.depthStrength}
              defaultValue={base.depthStrength}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => set({ depthStrength: v })}
              format={pct}
            />
            <Slider
              label={t("mmDepthDistance")}
              value={cur.depthDistance}
              defaultValue={base.depthDistance}
              min={0.01}
              max={0.4}
              step={0.005}
              onChange={(v) => set({ depthDistance: v })}
              format={px}
            />
            <ColorRow
              label={t("mmColor")}
              value={cur.depthColor}
              onChange={(v) => set({ depthColor: v })}
            />
          </Group>

          <button className="secondary-button" onClick={() => onChange(base)}>
            {t("mmResetCoastTo", {
              style: t(
                COAST_STYLES.find((st) => st.id === base.style)?.labelKey ??
                  "mmCoastClassic",
              ),
            })}
          </button>
        </>
      )}
    </section>
  );
}
