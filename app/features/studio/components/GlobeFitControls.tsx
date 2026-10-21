"use client";
/* eslint-disable @next/next/no-img-element */
/**
 * The map on the globe: its projection, and — for a map that isn't 2:1 —
 * whether it keeps its proportions (on its sea) or stretches over the sphere,
 * with a preview of the image the globe is made from.
 */
import { useTranslation } from "react-i18next";
import { Icon } from "../../../components/ui/ornaments";
import { NumberField, SelectField } from "../../../components/ui/fields";
import { DEFAULT_GLOBE, type GlobeSettings } from "../domain/types";
import { coverage, needsFit } from "../domain/fit";
import type { SourceState } from "../hooks/useSource";

export function GlobeFitControls({
  globe,
  source,
  globeSource,
  defaultFill,
  onChange,
}: {
  globe: GlobeSettings;
  /** The map as given. */
  source: SourceState | null;
  /** The 2:1 image the globe is made from (null while it is being made). */
  globeSource: SourceState | null;
  /** The map's own background colour (its sea). */
  defaultFill: string;
  onChange: (patch: Partial<GlobeSettings>) => void;
}) {
  const { t } = useTranslation();
  const fits =
      !!source &&
      globe.sourceProjection === "equirectangular" &&
      needsFit(source.width, source.height),
    mode = globe.fit ?? "contain",
    fill = globe.fill ?? defaultFill,
    covers = source ? coverage(source.width, source.height) : null;
  return (
    <section className="control-section">
      <h2>
        <Icon name="globe" />
        {t("prOnGlobe")}
        <span className="section-number">01</span>
      </h2>
      <SelectField
        label={t("sourceType")}
        value={globe.sourceProjection}
        onChange={(v) =>
          onChange({ sourceProjection: v as GlobeSettings["sourceProjection"] })
        }
      >
        <option value="equirectangular">{t("equirectangular")}</option>
        <option value="mercator">{t("mercator")}</option>
      </SelectField>
      {globe.sourceProjection === "mercator" && (
        <div className="field-pair">
          <NumberField
            label={t("northBound")}
            defaultValue={DEFAULT_GLOBE.north}
            value={globe.north}
            min={1}
            max={89}
            step={0.01}
            unit="°"
            onChange={(north) => onChange({ north })}
          />
          <NumberField
            label={t("southBound")}
            defaultValue={DEFAULT_GLOBE.south}
            value={globe.south}
            min={-89}
            max={-1}
            step={0.01}
            unit="°"
            onChange={(south) => onChange({ south })}
          />
        </div>
      )}
      {fits && source && (
        <>
          <p className="help-copy">
            {t("prFitIntro", {
              ratio: (source.width / source.height).toFixed(2),
            })}
          </p>
          <div
            className="pr-choice"
            role="radiogroup"
            aria-label={t("prOnGlobe")}
          >
            <button
              role="radio"
              aria-checked={mode === "contain"}
              className={mode === "contain" ? "active" : ""}
              onClick={() => onChange({ fit: "contain" })}
            >
              <b>{t("prFitContain")}</b>
              <small>
                {covers?.kind === "latitudes"
                  ? t("prFitContainLat", {
                      north: covers.north,
                      south: covers.south,
                    })
                  : t("prFitContainLon", { degrees: covers?.degrees ?? 360 })}
              </small>
            </button>
            <button
              role="radio"
              aria-checked={mode === "stretch"}
              className={mode === "stretch" ? "active" : ""}
              onClick={() => onChange({ fit: "stretch" })}
            >
              <b>{t("prFitStretch")}</b>
              <small>{t("prFitStretchNote")}</small>
            </button>
          </div>
          {mode === "contain" && (
            <label className="pr-color-row">
              <span>{t("prFillColor")}</span>
              <input
                type="color"
                value={fill}
                onChange={(e) => onChange({ fill: e.target.value })}
              />
              {fill.toLowerCase() !== defaultFill.toLowerCase() && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onChange({ fill: defaultFill })}
                >
                  {t("prFillReset")}
                </button>
              )}
            </label>
          )}
          <figure className="pr-fit-preview">
            {globeSource ? (
              <img src={globeSource.url} alt={t("prFitPreview")} />
            ) : (
              <span className="pr-spinner" aria-hidden="true" />
            )}
            <figcaption>{t("prFitPreview")}</figcaption>
          </figure>
        </>
      )}
    </section>
  );
}
