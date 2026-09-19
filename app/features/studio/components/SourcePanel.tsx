"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../components/ui/ornaments";
import { NumberField, SelectField } from "../../../components/ui/fields";
import type { GlobeSettings } from "../domain/types";
import type { SourceState } from "../hooks/useSource";
export function SourcePanel({
  source,
  loading,
  globe,
  onChange,
  onUpload,
  onSample,
}: {
  source: SourceState | null;
  loading: boolean;
  globe: GlobeSettings;
  onChange: (patch: Partial<GlobeSettings>) => void;
  onUpload: (file: File) => void;
  onSample: () => void;
}) {
  const { t } = useTranslation(),
    input = useRef<HTMLInputElement>(null),
    [drag, setDrag] = useState(false);
  return (
    <section className="control-section source-section">
      <h2>
        <Icon name="image" />
        {t("source")}
        <span className="section-number">01</span>
      </h2>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) onUpload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <button
        className={`upload-zone ${drag ? "dragging" : ""}`}
        disabled={loading}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]);
        }}
      >
        <Icon name="upload" size={24} />
        <strong>{t(loading ? "sourceReplacing" : "upload")}</strong>
        <span>{t("drop")}</span>
        <small>{t("formats")}</small>
      </button>
      {source && (
        <div className="source-file">
          <img src={source.url} alt="" />
          <div>
            <strong>{source.filename || t("sample")}</strong>
            <span dir="ltr">
              {source.width.toLocaleString()} × {source.height.toLocaleString()}{" "}
              px
            </span>
          </div>
          <button
            aria-label={t("replace")}
            onClick={() => input.current?.click()}
          >
            <Icon name="image" size={16} />
          </button>
        </div>
      )}
      <p className="help-copy">{t("newSourceNote")}</p>
      {source?.filename && (
        <button className="text-button" onClick={onSample}>
          {t("sampleAction")}
        </button>
      )}
      <SelectField
        label={t("sourceType")}
        value={globe.sourceProjection}
        onChange={(value) =>
          onChange({
            sourceProjection: value as GlobeSettings["sourceProjection"],
          })
        }
      >
        <option value="equirectangular">{t("equirectangular")}</option>
        <option value="mercator">{t("mercator")}</option>
      </SelectField>
      {globe.sourceProjection === "mercator" && (
        <>
          <div className="field-pair">
            <NumberField
              label={t("northBound")}
              value={globe.north}
              min={1}
              max={89}
              step={0.01}
              unit="°"
              onChange={(north) => onChange({ north })}
            />
            <NumberField
              label={t("southBound")}
              value={globe.south}
              min={-89}
              max={-1}
              step={0.01}
              unit="°"
              onChange={(south) => onChange({ south })}
            />
          </div>
          <p className="help-copy warning">{t("mercatorNote")}</p>
        </>
      )}
    </section>
  );
}
