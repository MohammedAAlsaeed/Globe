"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ASPECTS, RESOLUTIONS, computeCanvasSize, createProject } from "./domain";
import { stashInitialProject } from "./storage";
import type { AspectPreset, ResolutionTier } from "./types";
import { maps } from "../account/api";
import { useAuth } from "../account/AuthProvider";
import { GUEST_LIMITS } from "../account/types";
import { errorMessage } from "../account/ui";
import {ApiError} from "@/lib/api/client";

/**
 * "Create a map". Signed in, the map is created in the cloud straight away
 * (so it counts toward the plan and opens at its own address); signed out,
 * it starts on this device. Resolutions above what the plan exports are
 * shown but locked.
 */
export function CreateMapModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    router = useRouter(),
    { user } = useAuth(),
    dialog = useRef<HTMLDialogElement>(null);
  const maxPx = user?.plan.max_export_px ?? GUEST_LIMITS.max_export_px;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
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
  async function create() {
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
    if (!user) {
      stashInitialProject(project);
      router.push("/editor");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { map } = await maps.create(project);
      router.push(`/editor?map=${map.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "plan_limit_reached"
          ? t("mmMapLimitCreate", { max: e.body.max })
          : errorMessage(t, e),
      );
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="mm-modal"
      onCancel={close}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDialogElement).getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          close();
        }
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
          {RESOLUTIONS.map((r) => {
            const locked = r.longEdge > maxPx;
            return (
              <button
                key={r.key}
                type="button"
                disabled={locked}
                className={`mm-option-card ${resolution === r.key ? "selected" : ""}`}
                onClick={() => setResolution(r.key)}
              >
                <b>{t(r.labelKey)}</b>
                <small>{locked ? t("mmPlanLocked") : t(`${r.labelKey}Note`)}</small>
              </button>
            );
          })}
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
      {error && (
        <p className="mm-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row mm-modal-actions">
        <button className="export-button" disabled={busy} onClick={create}>
          {t("mmCreateConfirm")}
        </button>
        <button className="secondary-button" onClick={close}>
          {t("mmCreateCancel")}
        </button>
      </div>
    </dialog>
  );
}
