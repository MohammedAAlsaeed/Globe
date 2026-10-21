"use client";
/**
 * The poster's settings: paper and size (one sheet, or a chosen size across
 * several sheets), cutting (bleed, crop marks), and the frame and title.
 */
import { useTranslation } from "react-i18next";
import { Icon } from "../../../components/ui/ornaments";
import {
  NumberField,
  SelectField,
  Toggle,
} from "../../../components/ui/fields";
import { PAPER_IDS, type PaperId } from "../domain/paper";
import { heightPerWidth, type PosterPlan } from "./layout";
import { DEFAULT_POSTER, FRAME_STYLES, type PosterSettings } from "./types";

export function PosterControls({
  settings: s,
  plan,
  aspect,
  onChange,
}: {
  settings: PosterSettings;
  plan: PosterPlan;
  /** The map's width / height. */
  aspect: number;
  onChange: (patch: Partial<PosterSettings>) => void;
}) {
  const { t } = useTranslation();
  const k = heightPerWidth(aspect, s),
    tiled = plan.sheets.length > 1;
  return (
    <>
      <section className="control-section">
        <h2>
          <Icon name="ruler" />
          {t("prSizeTitle")}
          <span className="section-number">01</span>
        </h2>
        <div
          className="pr-choice"
          role="radiogroup"
          aria-label={t("prSizeTitle")}
        >
          <button
            role="radio"
            aria-checked={s.size === "page"}
            className={s.size === "page" ? "active" : ""}
            onClick={() => onChange({ size: "page" })}
          >
            <b>{t("prSizePage")}</b>
            <small>{t("prSizePageNote")}</small>
          </button>
          <button
            role="radio"
            aria-checked={s.size === "custom"}
            className={s.size === "custom" ? "active" : ""}
            // Start from the size it prints at now, so nothing jumps.
            onClick={() =>
              onChange({
                size: "custom",
                printWidth: Math.round(plan.artwork.width || s.printWidth),
              })
            }
          >
            <b>{t("prSizeCustom")}</b>
            <small>{t("prSizeCustomNote")}</small>
          </button>
        </div>
        {s.size === "custom" && (
          <div className="field-pair">
            <NumberField
              label={t("prPosterWidth")}
              value={Math.round(s.printWidth) / 10}
              defaultValue={DEFAULT_POSTER.printWidth / 10}
              onChange={(cm) => onChange({ printWidth: cm * 10 })}
              min={3}
              max={500}
              step={0.5}
              unit="cm"
            />
            <NumberField
              label={t("prPosterHeight")}
              value={Math.round(s.printWidth * k) / 10}
              onChange={(cm) => onChange({ printWidth: (cm * 10) / k })}
              min={3}
              max={Math.round(500 * k)}
              step={0.5}
              unit="cm"
            />
          </div>
        )}
        <div className="field-pair">
          <SelectField
            label={t("paper")}
            value={s.paper}
            onChange={(paper) => onChange({ paper: paper as PaperId })}
          >
            {PAPER_IDS.map((id) => (
              <option key={id} value={id}>
                {id === "custom" ? t("custom") : id}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("orientation")}
            value={s.orientation}
            onChange={(o) =>
              onChange({ orientation: o as PosterSettings["orientation"] })
            }
          >
            {["auto", "portrait", "landscape"].map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </SelectField>
        </div>
        {s.paper === "custom" && (
          <div className="field-pair">
            <NumberField
              label={t("paperWidth")}
              defaultValue={DEFAULT_POSTER.width}
              value={s.width}
              onChange={(width) => onChange({ width })}
              min={50}
              max={1500}
              unit="mm"
            />
            <NumberField
              label={t("paperHeight")}
              defaultValue={DEFAULT_POSTER.height}
              value={s.height}
              onChange={(height) => onChange({ height })}
              min={50}
              max={1500}
              unit="mm"
            />
          </div>
        )}
        <div className="field-pair">
          <NumberField
            label={t("margin")}
            defaultValue={DEFAULT_POSTER.margin}
            value={s.margin}
            onChange={(margin) => onChange({ margin })}
            min={0}
            max={50}
            step={0.5}
            unit="mm"
          />
          {tiled && (
            <NumberField
              label={t("prOverlap")}
              defaultValue={DEFAULT_POSTER.overlap}
              value={s.overlap}
              onChange={(overlap) => onChange({ overlap })}
              min={0}
              max={40}
              step={0.5}
              unit="mm"
            />
          )}
        </div>
        {tiled && (
          <p className="help-copy">
            {t("prTiledNote", {
              cols: plan.cols,
              rows: plan.rows,
              count: plan.sheets.length,
            })}
          </p>
        )}
      </section>

      <section className="control-section">
        <h2>
          <Icon name="sliders" />
          {t("prCutTitle")}
          <span className="section-number">02</span>
        </h2>
        <div className="field-pair">
          <NumberField
            label={t("prBleed")}
            defaultValue={DEFAULT_POSTER.bleed}
            value={s.bleed}
            onChange={(bleed) => onChange({ bleed })}
            min={0}
            max={10}
            step={0.5}
            unit="mm"
          />
        </div>
        <Toggle
          label={t("prCropMarks")}
          value={s.cropMarks}
          onChange={(cropMarks) => onChange({ cropMarks })}
        />
        <p className="help-copy">{t("prCutNote")}</p>
      </section>

      <section className="control-section">
        <h2>
          <Icon name="image" />
          {t("prFrameTitle")}
          <span className="section-number">03</span>
        </h2>
        <span className="pr-label">{t("prFrame")}</span>
        <div className="pr-chips" role="radiogroup" aria-label={t("prFrame")}>
          {FRAME_STYLES.map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={s.frame === f}
              className={s.frame === f ? "active" : ""}
              onClick={() => onChange({ frame: f })}
            >
              <i className={`pr-frame-icon ${f}`} aria-hidden="true" />
              {t(`prFrame_${f}`)}
            </button>
          ))}
        </div>
        <label className="field-label">
          {t("prTitle")}
          <input
            value={s.title}
            maxLength={120}
            placeholder={t("prTitlePlaceholder")}
            onChange={(e) => onChange({ title: e.target.value })}
            dir="auto"
          />
        </label>
        <label className="field-label">
          {t("prSubtitle")}
          <input
            value={s.subtitle}
            maxLength={160}
            placeholder={t("prSubtitlePlaceholder")}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            dir="auto"
          />
        </label>
        {(s.frame !== "none" || s.title.trim() || s.subtitle.trim()) && (
          <div className="pr-colors">
            <label className="pr-color-row">
              <span>{t("prInk")}</span>
              <input
                type="color"
                value={s.frameColor}
                onChange={(e) => onChange({ frameColor: e.target.value })}
              />
            </label>
            <label className="pr-color-row">
              <span>{t("prMat")}</span>
              <input
                type="color"
                value={s.mat}
                onChange={(e) => onChange({ mat: e.target.value })}
              />
            </label>
          </div>
        )}
      </section>
    </>
  );
}
