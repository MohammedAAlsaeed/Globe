"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { resolutionBadge } from "./domain";
import { deleteProject, listProjects, stashInitialProject } from "./storage";
import type { MMProject } from "./types";
import { Glyph } from "./glyphs";

function formatDate(ts: number, locale: string) {
  try {
    return new Date(ts).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function MapGallery({
  onClose,
  onCreate,
  currentId,
}: {
  onClose: () => void;
  onCreate: () => void;
  currentId?: string;
}) {
  const { t, i18n } = useTranslation(),
    router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null);
  const [projects, setProjects] = useState<MMProject[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    listProjects().then(setProjects);
  }, []);

  function close() {
    dialog.current?.close();
    onClose();
  }
  function open(project: MMProject) {
    stashInitialProject(project);
    router.push("/editor");
    close();
  }
  async function remove(id: string) {
    await deleteProject(id);
    setProjects((p) => (p ? p.filter((x) => x.id !== id) : p));
    setConfirmId(null);
  }

  return (
    <dialog
      ref={dialog}
      className="mm-modal mm-gallery-modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-header">
        <span className="eyebrow">{t("mmGalleryTitle")}</span>
        <button aria-label={t("close")} onClick={close}>
          ×
        </button>
      </div>
      {projects === null ? (
        <p className="mm-empty-note">…</p>
      ) : projects.length === 0 ? (
        <p className="mm-empty-note">{t("mmGalleryEmpty")}</p>
      ) : (
        <div className="mm-gallery-list">
          {projects.map((p) => (
            <div key={p.id} className={`mm-gallery-row ${p.id === currentId ? "current" : ""}`}>
              <button className="mm-gallery-main" onClick={() => open(p)}>
                <span className="mm-gallery-swatch" style={{ background: p.background }} />
                <span className="mm-gallery-info">
                  <b>{p.name || t("mmUntitledMap")}</b>
                  <small>
                    {resolutionBadge(p.resolutionTier)} · {p.width}×{p.height} · {formatDate(p.updatedAt, i18n.language)}
                  </small>
                </span>
              </button>
              {confirmId === p.id ? (
                <div className="mm-gallery-confirm">
                  <button className="secondary-button" onClick={() => remove(p.id)}>
                    {t("mmConfirmDelete")}
                  </button>
                  <button className="secondary-button" onClick={() => setConfirmId(null)}>
                    {t("mmCreateCancel")}
                  </button>
                </div>
              ) : (
                <button title={t("mmDeleteObject")} onClick={() => setConfirmId(p.id)}>
                  <Glyph name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="button-row mm-modal-actions">
        <button className="export-button" onClick={onCreate}>
          {t("mmCreateCardButton")}
        </button>
        <button className="secondary-button" onClick={close}>
          {t("close")}
        </button>
      </div>
    </dialog>
  );
}
