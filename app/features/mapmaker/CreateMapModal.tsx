"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./createMap.css";
import { useTranslation } from "react-i18next";
import {
  ASPECTS,
  RESOLUTIONS,
  computeCanvasSize,
  createProject,
} from "./domain";
import { stashInitialProject } from "./storage";
import {
  EARTH_COLS,
  EARTH_DEFAULT_SHOWN,
  EARTH_LAYERS,
  EARTH_ROWS,
  buildEarthProject,
  earthDetail,
  type EarthData,
  type EarthLayer,
} from "./templates/earth";
import { loadEarth, povName } from "./templates/load";
import { EARTH_PREVIEW_LAND } from "./templates/earthPreview.generated";
import type { AspectPreset, MMProject, ResolutionTier } from "./types";
import { maps } from "../account/api";
import { useAuth } from "../account/AuthProvider";
import { GUEST_LIMITS } from "../account/types";
import { errorMessage } from "../account/ui";
import { ApiError } from "@/lib/api/client";

type Template = "blank" | "earth";

/**
 * "Create a map", blank or from a template (the Earth, ./templates). Signed in, the map is created in the cloud straight away
 * (so it counts toward the plan and opens at its own address); signed out,
 * it starts on this device. Resolutions above what the plan exports are
 * shown but locked.
 */
export function CreateMapModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation(),
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
  const uiLang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [template, setTemplate] = useState<Template>("blank"),
    [earthLang, setEarthLang] = useState<"ar" | "en">(uiLang),
    [shown, setShown] =
      useState<Record<EarthLayer, boolean>>(EARTH_DEFAULT_SHOWN),
    [pov, setPov] = useState(""),
    [earth, setEarth] = useState<EarthData | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const earthMode = template === "earth",
    detail = earthDetail(resolution);
  // Fetch the Earth as soon as it is picked (its points of view fill the list).
  useEffect(() => {
    if (!earthMode) return;
    let live = true;
    loadEarth(detail).then(
      (d) => live && setEarth(d),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [earthMode, detail]);
  const preset = ASPECTS.find((a) => a.key === aspect) ?? ASPECTS[0];
  const effectiveCols = earthMode
      ? EARTH_COLS
      : aspect === "custom"
        ? cols
        : preset.cols,
    effectiveRows = earthMode
      ? EARTH_ROWS
      : aspect === "custom"
        ? rows
        : preset.rows;
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
    let project: MMProject;
    if (earthMode) {
      setBusy(true);
      setError(null);
      try {
        const data = await loadEarth(detail);
        project = buildEarthProject(data, {
          name,
          resolutionTier: resolution,
          lang: earthLang,
          pov: pov || null,
          shown,
          layerNames: {
            water: t("mmEarthLayer_water"),
            land: t("mmEarthLayer_land"),
            ...(Object.fromEntries(
              EARTH_LAYERS.map((k) => [k, t(`mmEarthLayer_${k}`)]),
            ) as Record<EarthLayer, string>),
          },
        });
      } catch {
        setError(t("mmEarthLoadFailed"));
        setBusy(false);
        return;
      }
    } else
      project = createProject({
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
        const rect = (
          e.currentTarget as HTMLDialogElement
        ).getBoundingClientRect();
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
        <span className="mm-modal-label">{t("mmStartFrom")}</span>
        <div className="mm-option-grid mm-template-grid">
          <button
            type="button"
            className={`mm-option-card mm-template-card ${template === "blank" ? "selected" : ""}`}
            onClick={() => setTemplate("blank")}
          >
            <span className="mm-template-thumb mm-template-blank" />
            <b>{t("mmTplBlank")}</b>
            <small>{t("mmTplBlankNote")}</small>
          </button>
          <button
            type="button"
            className={`mm-option-card mm-template-card ${earthMode ? "selected" : ""}`}
            onClick={() => setTemplate("earth")}
          >
            <EarthThumb />
            <b>{t("mmTplEarth")}</b>
            <small>{t("mmTplEarthNote")}</small>
          </button>
        </div>
      </div>
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
                <small>
                  {locked ? t("mmPlanLocked") : t(`${r.labelKey}Note`)}
                </small>
              </button>
            );
          })}
        </div>
      </div>
      {earthMode && (
        <>
          <p className="mm-template-note">{t("mmEarthShape")}</p>
          <div className="mm-modal-section">
            <span className="mm-modal-label">{t("mmEarthNames")}</span>
            <div className="mm-option-grid mm-template-grid">
              {(["ar", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`mm-option-card ${earthLang === l ? "selected" : ""}`}
                  onClick={() => setEarthLang(l)}
                >
                  <b lang={l}>{l === "ar" ? "العربية" : "English"}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="mm-modal-section">
            <span className="mm-modal-label">{t("mmEarthShow")}</span>
            <div className="mm-earth-layers">
              {EARTH_LAYERS.map((k) => (
                <label key={k} className="mm-earth-layer">
                  <input
                    type="checkbox"
                    checked={shown[k]}
                    onChange={(e) =>
                      setShown((s) => ({ ...s, [k]: e.target.checked }))
                    }
                  />
                  {t(`mmEarthLayer_${k}`)}
                </label>
              ))}
            </div>
            <small className="mm-template-hint">{t("mmEarthShowNote")}</small>
          </div>
          <label className="field-label mm-earth-pov">
            {t("mmEarthPov")}
            <select value={pov} onChange={(e) => setPov(e.target.value)}>
              <option value="">{t("mmEarthPovDefault")}</option>
              {(earth?.povs ?? [])
                .map((c) => ({ c, n: povName(c, uiLang) }))
                .sort((a, b) => a.n.localeCompare(b.n, uiLang))
                .map(({ c, n }) => (
                  <option key={c} value={c}>
                    {t("mmEarthPovAs", { country: n })}
                  </option>
                ))}
            </select>
          </label>
          <small className="mm-template-hint">{t("mmEarthCredit")}</small>
        </>
      )}
      {!earthMode && (
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
      )}
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
          {busy && earthMode ? t("mmEarthLoading") : t("mmCreateConfirm")}
        </button>
        <button className="secondary-button" onClick={close}>
          {t("mmCreateCancel")}
        </button>
      </div>
    </dialog>
  );
}

/** The Earth template's card picture: the land on a 30° grid. */
function EarthThumb() {
  const grid: string[] = [];
  for (let x = 30; x < 360; x += 30) grid.push(`M${x} 0V180`);
  for (let y = 30; y < 180; y += 30) grid.push(`M0 ${y}H360`);
  return (
    <svg
      className="mm-template-thumb"
      viewBox="0 0 360 180"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="360" height="180" fill="#2c5678" />
      <path
        d={grid.join("")}
        stroke="#9fc0d8"
        strokeOpacity={0.22}
        strokeWidth={0.5}
        fill="none"
      />
      <path
        d={EARTH_PREVIEW_LAND}
        fill="#c9b98a"
        stroke="#4a3a24"
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
