"use client";
/**
 * The editor's save state (status bar) and the conflict dialog.
 */
import { shortcutLabel } from "../shortcuts";
import { useEffect, useRef } from "react";
import Link from "next/link";
import "../createMap.css";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../account/ui";
import type { CloudStatus, ConflictChoice } from "./useCloudSync";
import { ApiError } from "@/lib/api/client";

const LABEL: Record<CloudStatus, string> = {
  loading: "mmLocalOnly",
  signin: "mmLocalOnly",
  limit: "mmCloudLimit",
  pending: "mmCloudPending",
  saving: "mmCloudSaving",
  saved: "mmCloudSaved",
  offline: "mmCloudOffline",
  error: "mmCloudError",
  conflict: "mmConflictTitle",
};

export function CloudStatusBar({
  status,
  onSave,
}: {
  status: CloudStatus;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const here =
    typeof window === "undefined"
      ? "/editor"
      : window.location.pathname + window.location.search;
  return (
    <div className="mm-status-group mm-cloud" data-status={status}>
      <span className="mm-status-dot" />
      <span role="status">{t(LABEL[status])}</span>
      {status === "signin" && (
        <Link
          className="mm-cloud-action"
          href={`/login?next=${encodeURIComponent(here)}`}
        >
          {t("mmSignInToSave")}
        </Link>
      )}
      {status === "limit" && (
        <Link className="mm-cloud-action" href="/maps">
          {t("acMyMaps")}
        </Link>
      )}
      {(status === "pending" || status === "error" || status === "offline") && (
        <button
          className="mm-cloud-action"
          onClick={onSave}
          title={shortcutLabel("file.save")}
        >
          {t("mmSaveNow")}
        </button>
      )}
    </div>
  );
}

export function ConflictDialog({
  busy,
  error,
  onChoose,
}: {
  busy: boolean;
  error: unknown;
  onChoose: (choice: ConflictChoice) => void;
}) {
  const { t } = useTranslation(),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const message = !error
    ? null
    : error instanceof ApiError && error.code === "plan_limit_reached"
      ? t("mmMapLimitCreate", { max: error.body.max })
      : errorMessage(t, error);
  const options: { key: ConflictChoice; title: string; note: string }[] = [
    { key: "load", title: t("mmConflictLoad"), note: t("mmConflictLoadNote") },
    { key: "copy", title: t("mmConflictCopy"), note: t("mmConflictCopyNote") },
    {
      key: "replace",
      title: t("mmConflictReplace"),
      note: t("mmConflictReplaceNote"),
    },
  ];
  return (
    // A decision is required: Escape does not dismiss it.
    <dialog
      ref={dialog}
      className="mm-modal mm-conflict"
      onCancel={(e) => e.preventDefault()}
    >
      <h2>{t("mmConflictTitle")}</h2>
      <p className="mm-modal-sub">{t("mmConflictText")}</p>
      <div className="mm-conflict-options">
        {options.map((o) => (
          <button
            key={o.key}
            className="mm-option-card"
            disabled={busy}
            onClick={() => onChoose(o.key)}
          >
            <b>{o.title}</b>
            <small>{o.note}</small>
          </button>
        ))}
      </div>
      {message && (
        <p className="mm-field-error" role="alert">
          {message}
        </p>
      )}
    </dialog>
  );
}
