"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../components/ui/ornaments";
import {
  NumberField,
  SelectField,
  Toggle,
} from "../../../components/ui/fields";
import { recommendGores } from "../domain/geometry";
import type { GlobeSettings } from "../domain/types";
export function GlobeControls({
  globe: s,
  onChange,
}: {
  globe: GlobeSettings;
  onChange: (p: Partial<GlobeSettings>) => void;
}) {
  const { t } = useTranslation(),
    [linked, setLinked] = useState(true),
    [unit, setUnit] = useState("mm"),
    [maxWidth, setMaxWidth] = useState(40);
  const factor = unit === "cm" ? 10 : unit === "in" ? 25.4 : 1;
  const dimension = (key: "height" | "width", v: number) =>
    onChange(
      linked
        ? { height: v * factor, width: v * factor }
        : { [key]: v * factor },
    );
  return (
    <>
      <section className="control-section">
        <h2>
          <Icon name="ruler" />
          {t("dimensions")}
          <span className="section-number">02</span>
        </h2>
        <SelectField label={t("unit")} value={unit} onChange={setUnit}>
          <option value="mm">{t("mmUnit")}</option>
          <option value="cm">{t("cmUnit")}</option>
          <option value="in">{t("inUnit")}</option>
        </SelectField>
        <div className="field-pair">
          {(["height", "width"] as const).map((key) => (
            <NumberField
              key={key}
              label={t(key)}
              value={s[key] / factor}
              onChange={(v) => dimension(key, v)}
              min={20 / factor}
              max={1000 / factor}
              step={0.1}
              unit={unit}
            />
          ))}
        </div>
        <button
          className="link-dimensions linked"
          aria-pressed={linked}
          onClick={() => {
            setLinked(!linked);
            if (!linked) onChange({ width: s.height });
          }}
        >
          <Icon name="link" size={14} />
          {t(linked ? "linked" : "unlinked")}
        </button>
        {s.width !== s.height && (
          <p className="help-copy warning">{t("ellipsoidNote")}</p>
        )}
        <div className="range-label">
          <label htmlFor="gores">{t("gores")}</label>
          <span>{s.gores}</span>
        </div>
        <input
          id="gores"
          type="range"
          min={6}
          max={72}
          step={2}
          value={s.gores}
          onChange={(e) => onChange({ gores: +e.target.value })}
        />
        <div className="gore-presets">
          {[8, 12, 16, 24, 36].map((n) => (
            <button
              key={n}
              className={s.gores === n ? "selected" : ""}
              onClick={() => onChange({ gores: n })}
            >
              {n}
            </button>
          ))}
        </div>
        <details className="small-details">
          <summary>{t("suggest")}</summary>
          <NumberField
            label={t("maxGore")}
            value={maxWidth}
            onChange={setMaxWidth}
            min={5}
            max={200}
            unit="mm"
          />
          <button
            className="secondary-button"
            onClick={() =>
              onChange({ gores: recommendGores(s.width, maxWidth) })
            }
          >
            {t("suggest")} · {recommendGores(s.width, maxWidth)}
          </button>
        </details>
      </section>
      <section className="control-section">
        <h2>
          <Icon name="sliders" />
          {t("settings")}
          <span className="section-number">03</span>
        </h2>
        <div className="field-pair">
          <NumberField
            label={t("seam")}
            value={s.offset}
            onChange={(offset) => onChange({ offset })}
            min={-180}
            max={180}
            unit="°"
          />
          <NumberField
            label={t("gap")}
            value={s.gap}
            onChange={(gap) => onChange({ gap })}
            min={0}
            max={30}
            step={0.5}
            unit="mm"
          />
        </div>
        <div className="field-pair">
          <NumberField
            label={t("tabWidth")}
            value={s.tab}
            onChange={(tab) => onChange({ tab })}
            min={0}
            max={15}
            step={0.5}
            unit="mm"
          />
          <NumberField
            label={t("bleedWidth")}
            value={s.bleed}
            onChange={(bleed) => onChange({ bleed })}
            min={0}
            max={5}
            step={0.5}
            unit="mm"
          />
        </div>
        <Toggle
          label={t("cutlines")}
          value={s.guides}
          onChange={(guides) => onChange({ guides })}
        />
        <Toggle
          label={t("graticule")}
          value={s.grid}
          onChange={(grid) => onChange({ grid })}
        />
        <Toggle
          label={t("numbered")}
          value={s.labels}
          onChange={(labels) => onChange({ labels })}
        />
        <SelectField
          label={t("sampling")}
          value={s.resampling}
          onChange={(resampling) =>
            onChange({ resampling: resampling as GlobeSettings["resampling"] })
          }
        >
          {["bilinear", "bicubic", "lanczos"].map((v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ))}
        </SelectField>
      </section>
    </>
  );
}
