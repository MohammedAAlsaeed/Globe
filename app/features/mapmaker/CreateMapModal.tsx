"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ASPECTS, RESOLUTIONS, computeCanvasSize, createProject } from "./domain";
import { stashInitialProject } from "./storage";
import type { AspectPreset, ResolutionTier } from "./types";

export function CreateMapModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(""),
    [resolution, setResolution] = useState<ResolutionTier>("medium"),
    [aspect, setAspect] = useState<AspectPreset>("landscape"),
    [cols, setCols] = useState(40),
    [rows, setRows] = useState(30),
    [nameError, setNameError] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const preset = ASPECTS.find((a) => a.key === aspect) ?? ASPECTS[0];
  const effectiveCols = aspect === "custom" ? cols : preset.cols,
    effectiveRows = aspect === "custom" ? rows : preset.rows;
  const size = useMemo(() => {
    const res = RESOLUTIONS.find((r) => r.key === resolution) ?? RESOLUTIONS[1];
    return computeCanvasSize(res.longEdge, effectiveCols, effectiveRows);
  }, [resolution, effectiveCols, effectiveRows]);
  const tile = Math.round(size.width / Math.max(1, effectiveCols));
  function close() {
    dialog.current?.close();
    onClose();
  }
  function create() {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    const project = createProject({
      name,
      resolutionTier: resolution,
      aspect,
      cols: effectiveCols,
      rows: effectiveRows,
    });
    stashInitialProject(project);
    router.push("/editor");
  }
  return (
    <dialog
      ref={dialog}
      className="mm-modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-header">
        <span className="eyebrow">{t("mmModalTitle")}</span>
        <button aria-label={t("close")} onClick={close}>
          ×
        </button>
      </div>
      <p className="mm-modal-sub">{t("mmModalSubtitle")}</p>
      <label className="field-label mm-name-field">
        {t("mmFieldMapName")}
        <input
          autoFocus
          maxLength={80}
          placeholder={t("mmMapNamePlaceholder")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(false);
          }}
        />
      </label>
      {nameError && <p className="mm-field-error">{t("mmNameRequired")}</p>}
      <div className="mm-modal-section">
        <span className="mm-modal-label">{t("mmFieldResolution")}</span>
        <div className="mm-option-grid mm-option-grid-4">
          {RESOLUTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`mm-option-card ${resolution === r.key ? "selected" : ""}`}
              onClick={() => setResolution(r.key)}
            >
              <b>{t(r.labelKey)}</b>
              <small>{t(`${r.labelKey}Note`)}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="mm-modal-section">
        <span className="mm-modal-label">{t("mmFieldAspect")}</span>
        <div className="mm-option-grid mm-option-grid-4">
          {ASPECTS.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`mm-option-card ${aspect === a.key ? "selected" : ""}`}
              onClick={() => setAspect(a.key)}
            >
              <span className={`mm-aspect-swatch mm-aspect-${a.key}`} />
              <b>{t(a.labelKey)}</b>
              <small>
                {a.key === "custom"
                  ? t("mmAspectCustomNote")
                  : t(`${a.labelKey}Note`)}
              </small>
            </button>
          ))}
        </div>
        {aspect === "custom" && (
          <div className="mm-custom-dims">
            <label className="field-label">
              {t("mmCustomColumns")}
              <input
                type="number"
                min={4}
                max={200}
                value={cols}
                onChange={(e) =>
                  setCols(Math.max(4, Math.min(200, +e.target.value || 4)))
                }
              />
            </label>
            <label className="field-label">
              {t("mmCustomRows")}
              <input
                type="number"
                min={4}
                max={200}
                value={rows}
                onChange={(e) =>
                  setRows(Math.max(4, Math.min(200, +e.target.value || 4)))
                }
              />
            </label>
          </div>
        )}
      </div>
      <p className="mm-dimensions-preview">
        {t("mmDimensionsPreview", { w: size.width, h: size.height, tile })}
      </p>
      <div className="button-row mm-modal-actions">
        <button className="export-button" onClick={create}>
          {t("mmCreateConfirm")}
        </button>
        <button className="secondary-button" onClick={close}>
          {t("mmCreateCancel")}
        </button>
      </div>
    </dialog>
  );
}
