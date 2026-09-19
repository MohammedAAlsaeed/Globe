"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NumberField,
  SelectField,
  Toggle,
} from "../../../components/ui/fields";
import { Icon } from "../../../components/ui/ornaments";
import type { PrintSettings } from "../domain/types";
import { calibrationPdf } from "../export/pdf";
import { validateDocument } from "../domain/validation";
import { DEFAULT_DOCUMENT } from "../domain/types";
import { saveBlob } from "../export/svg";
export function PrintControls({
  settings: p,
  onChange,
  notify,
}: {
  settings: PrintSettings;
  onChange: (p: Partial<PrintSettings>) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation(),
    [printer, setPrinter] = useState("My printer"),
    [measuredX, setMeasuredX] = useState(100),
    [measuredY, setMeasuredY] = useState(100);
  function saveProfile() {
    try {
      localStorage.setItem(`atelier-printer:${printer}`, JSON.stringify(p));
      notify("printerSaved");
    } catch {
      notify("storageError");
    }
  }
  function loadProfile() {
    try {
      const raw = localStorage.getItem(`atelier-printer:${printer}`);
      if (!raw) return notify("noPrinter");
      const saved = validateDocument({
        ...DEFAULT_DOCUMENT,
        print: JSON.parse(raw),
      }).print;
      onChange(saved);
      notify("calibrationApplied");
    } catch {
      notify("storageError");
    }
  }
  return (
    <section className="control-section">
      <h2>
        <Icon name="grid" />
        {t("printStudio")}
        <span className="section-number">04</span>
      </h2>
      <div className="field-pair">
        <SelectField
          label={t("paper")}
          value={p.paper}
          onChange={(paper) =>
            onChange({ paper: paper as PrintSettings["paper"] })
          }
        >
          {["A4", "A3", "Letter", "custom"].map((v) => (
            <option key={v} value={v}>
              {v === "custom" ? t(v) : v}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("orientation")}
          value={p.orientation}
          onChange={(orientation) =>
            onChange({
              orientation: orientation as PrintSettings["orientation"],
            })
          }
        >
          {["auto", "portrait", "landscape"].map((v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ))}
        </SelectField>
      </div>
      {p.paper === "custom" && (
        <>
          <div className="field-pair">
            <NumberField
              label={t("paperWidth")}
              value={p.width}
              onChange={(width) => onChange({ width })}
              min={50}
              max={1500}
              unit="mm"
            />
            <NumberField
              label={t("paperHeight")}
              value={p.height}
              onChange={(height) => onChange({ height })}
              min={50}
              max={1500}
              unit="mm"
            />
          </div>
          <p className="help-copy">{t("paperNote")}</p>
        </>
      )}
      <div className="field-pair">
        <NumberField
          label={t("margin")}
          value={p.margin}
          onChange={(margin) => onChange({ margin })}
          min={0}
          max={100}
          step={0.5}
          unit="mm"
        />
        <NumberField
          label={t("overlap")}
          value={p.overlap}
          onChange={(overlap) => onChange({ overlap })}
          min={0}
          max={50}
          unit="mm"
        />
      </div>
      <Toggle
        label={t("registration")}
        value={p.marks}
        onChange={(marks) => onChange({ marks })}
      />
      <Toggle
        label={t("outline")}
        value={p.outline}
        onChange={(outline) => onChange({ outline })}
      />
      <details className="small-details calibration">
        <summary>{t("calibration")}</summary>
        <p className="help-copy">{t("calibrationHelp")}</p>
        <button
          className="secondary-button"
          onClick={async () => {
            try {
              saveBlob(await calibrationPdf(), "al-idrisi-calibration.pdf");
              notify("downloadCalibration");
            } catch {
              notify("errorGeneric");
            }
          }}
        >
          {t("calibrationSheet")}
        </button>
        <div className="field-pair">
          <NumberField
            label={t("measuredWidth")}
            value={measuredX}
            onChange={setMeasuredX}
            min={84}
            max={125}
            step={0.1}
            unit="mm"
          />
          <NumberField
            label={t("measuredHeight")}
            value={measuredY}
            onChange={setMeasuredY}
            min={84}
            max={125}
            step={0.1}
            unit="mm"
          />
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            onChange({
              calibrationX: 100 / measuredX,
              calibrationY: 100 / measuredY,
            });
            notify("calibrationApplied");
          }}
        >
          {t("applyCalibration")}
        </button>
        <p className="help-copy">
          X {(p.calibrationX * 100).toFixed(2)}% · Y{" "}
          {(p.calibrationY * 100).toFixed(2)}%
        </p>
        <button
          className="text-button"
          onClick={() => onChange({ calibrationX: 1, calibrationY: 1 })}
        >
          {t("resetCalibration")}
        </button>
        <label className="field-label">
          {t("printerName")}
          <input
            value={printer}
            maxLength={60}
            onChange={(e) => setPrinter(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="secondary-button" onClick={saveProfile}>
            {t("savePrinter")}
          </button>
          <button className="secondary-button" onClick={loadProfile}>
            {t("loadPrinter")}
          </button>
        </div>
      </details>
    </section>
  );
}
