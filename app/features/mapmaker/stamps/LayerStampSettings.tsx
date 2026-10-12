"use client";
/**
 * Layer-wide settings for stamps (Layers tab, under the layer's opacity):
 * the layer's blend mode — how the whole layer mixes with those beneath —
 * and the shared shadow used by its stamps in shadow mode "Layer".
 */
import { BLEND_MODES } from "../brush/BrushPanel";
import { ColorControl, Section, Slider } from "../components/EditorControls";
import type { BlendMode, MMLayer, ShadowSettings } from "../types";
import { DEFAULT_SHADOW } from "./render";

type T = (k: string, opts?: Record<string, unknown>) => string;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function LayerStampSettings({
  layer,
  onChange,
  t,
}: {
  layer: MMLayer;
  onChange: (patch: Partial<MMLayer>) => void;
  t: T;
}) {
  const shadow = layer.stampShadow ?? DEFAULT_SHADOW,
    setShadow = (p: Partial<ShadowSettings>) => onChange({ stampShadow: { ...shadow, ...p } });
  return (
    <div className="mm-layer-stamps">
      <Section title={t("stLayerEffects")}>
        <label className="mm-bp-select-row">
          <span>{t("mmBlendMode")}</span>
          <select value={layer.blend ?? "normal"} onChange={(e) => onChange({ blend: e.target.value as BlendMode })}>
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`mmBlend_${b}`)}
              </option>
            ))}
          </select>
        </label>
        <span className="mm-bp-subtitle">{t("stShadow")}</span>
        <p className="mm-bp-hint">{t("stLayerShadowHint")}</p>
        <div className="mm-st-color-row">
          <span>{t("stShadowColor")}</span>
          <ColorControl color={shadow.color} recents={[]} onChange={(c) => setShadow({ color: c })} label={t("stShadowColor")} recentLabel="" />
        </div>
        <Slider label={t("stOpacity")} value={shadow.opacity} min={0} max={1} step={0.01} onChange={(v) => setShadow({ opacity: v })} format={pct} />
        <Slider label={t("stShadowBlur")} value={shadow.blur} min={0} max={0.5} step={0.01} onChange={(v) => setShadow({ blur: v })} format={pct} />
        <Slider label={t("stShadowDistance")} value={shadow.distance} min={0} max={0.5} step={0.01} onChange={(v) => setShadow({ distance: v })} format={pct} />
        <Slider label={t("stShadowAngle")} value={shadow.angle} min={0} max={359} step={1} onChange={(v) => setShadow({ angle: v })} format={(v) => `${v}°`} />
      </Section>
    </div>
  );
}
