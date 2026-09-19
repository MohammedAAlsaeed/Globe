"use client";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StudioDocument, PrintPlan } from "../domain/types";
import type { SourceState } from "../hooks/useSource";
import { effectivePpi } from "../domain/geometry";
import { NumberField, SelectField } from "../../../components/ui/fields";
import { useExport } from "../hooks/useExport";
export function ExportPanel({
  document: d,
  source,
  plan,
  onDpi,
  notify,
}: {
  document: StudioDocument;
  source: SourceState | null;
  plan: PrintPlan;
  onDpi: (n: number) => void;
  notify: (m: string) => void;
}) {
  const { t } = useTranslation(),
    [format, setFormat] = useState<"png" | "svg">("svg"),
    [gore, setGore] = useState(1),
    exporter = useExport(notify),
    frame = useRef<HTMLIFrameElement>(null),
    ppi = source ? effectivePpi(source.width, source.height, d.globe) : 0;
  return (
    <section className="export-panel">
      <div className="export-heading">
        <span className="export-icon">↧</span>
        <div>
          <h2>{t("exportGroup")}</h2>
          <p>{t("exportNote")}</p>
        </div>
      </div>
      <div className="preflight">
        <div>
          <span>{t("effective")}</span>
          <strong>{Math.round(ppi)} PPI</strong>
        </div>
        <div>
          <span>{t("pages")}</span>
          <strong>{plan.pages.length}</strong>
        </div>
        <div>
          <span>{t("printSummary")}</span>
          <strong>{t(plan.tiled ? "tiled" : "packed")}</strong>
        </div>
      </div>
      <p className={`quality-note ${ppi < d.dpi ? "warning" : ""}`}>
        {t(ppi < d.dpi ? "qualityLow" : "qualityHigh")} {t("qualityHint")}
      </p>
      {source &&
        d.globe.sourceProjection === "equirectangular" &&
        Math.abs(source.width / source.height - 2) > 0.05 && (
          <p className="notice warning">{t("sourceRatio")}</p>
        )}
      {d.globe.sourceProjection === "mercator" && (
        <p className="notice warning">{t("polarMissing")}</p>
      )}
      {plan.error && <p className="notice warning">{t(plan.error)}</p>}
      <div className="export-fields">
        <SelectField
          label={t("outputDpi")}
          value={d.dpi}
          onChange={(v) => onDpi(+v)}
        >
          {[150, 300, 600].map((n) => (
            <option key={n} value={n}>
              {n} PPI
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("archiveFormat")}
          value={format}
          onChange={(v) => setFormat(v as "png" | "svg")}
        >
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
        </SelectField>
        <NumberField
          label={t("goreNumber")}
          value={Math.min(gore, d.globe.gores)}
          onChange={setGore}
          min={1}
          max={d.globe.gores}
        />
      </div>
      <div className="export-actions">
        <button
          className="export-button"
          disabled={!!exporter.job || !source || !!plan.error}
          onClick={() => exporter.run("print", d, source, format, gore - 1)}
        >
          ▤ {t("printNow")}
        </button>
        <button
          className="secondary-button"
          disabled={!!exporter.job || !source || !!plan.error}
          onClick={() => exporter.run("pdf", d, source, format, gore - 1)}
        >
          {t("downloadPdf")}
        </button>
        <button
          className="secondary-button"
          disabled={!!exporter.job || !source}
          onClick={() => exporter.run("zip", d, source, format, gore - 1)}
        >
          {t("downloadZip")}
        </button>
        <button
          className="secondary-button"
          disabled={!!exporter.job || !source}
          onClick={() => exporter.run("single", d, source, format, gore - 1)}
        >
          {t("singleGore")}
        </button>
      </div>
      {exporter.job && (
        <div className="job-progress" role="status">
          <div>
            <span>{t(exporter.job.stage)}</span>
            <strong>{Math.round(exporter.job.progress * 100)}%</strong>
          </div>
          <progress value={exporter.job.progress} max={1} />
          <button onClick={exporter.cancel}>{t("cancelJob")}</button>
        </div>
      )}
      <p className="help-copy">{t("formatHelp")}</p>
      <p className="help-copy">{t("testFit")}</p>
      {exporter.pdfUrl && (
        <div className="pdf-ready">
          <div className="section-heading">
            <h3>{t("pdfReady")}</h3>
            <button onClick={exporter.dismiss} aria-label={t("dismissPdf")}>
              ×
            </button>
          </div>
          <p>{t("actualSize")}</p>
          <iframe ref={frame} title={t("printStudio")} src={exporter.pdfUrl} />
          <div className="button-row">
            <button
              className="export-button"
              onClick={() => {
                try {
                  frame.current?.contentWindow?.focus();
                  frame.current?.contentWindow?.print();
                } catch {
                  notify("printUnavailable");
                }
              }}
            >
              {t("printNow")}
            </button>
            <a
              className="secondary-button"
              href={exporter.pdfUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("printReady")}
            </a>
          </div>
          <p className="help-copy">{t("browserPrintNote")}</p>
        </div>
      )}
    </section>
  );
}
