"use client";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StudioDocument } from "../domain/types";
import type { SourceState } from "../hooks/useSource";
import {
  encodeProject,
  decodeProject,
  saveLocal,
  loadLocal,
  type SavedProject,
} from "../storage/projects";
import { saveBlob } from "../export/svg";
export function ProjectToolbar({
  document: d,
  source,
  onName,
  onRestore,
  undo,
  redo,
  canUndo,
  canRedo,
  notify,
}: {
  document: StudioDocument;
  source: SourceState | null;
  onName: (name: string) => void;
  onRestore: (p: SavedProject) => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  notify: (m: string) => void;
}) {
  const { t } = useTranslation(),
    file = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false);
  const project = () => {
    if (!source) throw new Error("missingSource");
    return { document: d, source: source.blob, filename: source.filename };
  };
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : "loadFailed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="project-toolbar">
      <label className="project-title">
        <span>{t("projectName")}</span>
        <input
          key={d.name}
          aria-label={t("projectName")}
          defaultValue={d.name}
          maxLength={100}
          onBlur={(e) => {
            if (e.target.value !== d.name) onName(e.target.value || "My globe");
          }}
        />
      </label>
      <div className="history-buttons">
        <button
          className="secondary-button"
          disabled={!canUndo}
          onClick={undo}
          title={t("undo")}
          aria-label={t("undo")}
        >
          ↶
        </button>
        <button
          className="secondary-button"
          disabled={!canRedo}
          onClick={redo}
          title={t("redo")}
          aria-label={t("redo")}
        >
          ↷
        </button>
      </div>
      <div className="project-actions">
        <button
          disabled={busy || !source}
          onClick={() =>
            task(async () => {
              saveBlob(await encodeProject(project()), "al-idrisi.atelier");
              notify("jobComplete");
            })
          }
        >
          {t("saveProject")}
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          {t("openProject")}
        </button>
        <button
          disabled={busy || !source}
          onClick={() =>
            task(async () => {
              await saveLocal(project());
              notify("localSaved");
            })
          }
        >
          {t("saveLocal")}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            task(async () => {
              const saved = await loadLocal();
              if (!saved) return notify("noDraft");
              await onRestore(saved);
              notify("projectLoaded");
            })
          }
        >
          {t("restoreLocal")}
        </button>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept=".atelier,.zip"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected)
            task(async () => {
              await onRestore(await decodeProject(selected));
              notify("projectLoaded");
            });
          e.target.value = "";
        }}
      />
    </div>
  );
}
