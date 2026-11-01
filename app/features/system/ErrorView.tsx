"use client";
/* eslint-disable @next/next/no-img-element -- static brand artwork */
/**
 * What a page shows when it fails while rendering (app/error.tsx and
 * app/editor/error.tsx): what happened in plain words, a way to try again,
 * and a reference to quote. The error is reported to the server's log.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { reportError } from "@/lib/reportError";
import { IS_PRODUCTION } from "@/lib/site";

export type ErrorPageProps = {
  error: unknown;
  /** Re-fetch and re-render the page (Next's error boundary). */
  retry: () => void;
};

/** The part of an error a person can quote: Next's digest for errors from
 * the server, else a short hash of the message. */
function referenceOf(error: unknown) {
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
  if (digest) return digest;
  const text = error instanceof Error ? `${error.name}:${error.message}` : "";
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).toUpperCase();
}

export function ErrorView({
  error,
  retry,
  variant = "page",
}: ErrorPageProps & { variant?: "page" | "editor" }) {
  const { t } = useTranslation(),
    [copied, setCopied] = useState(false),
    reference = referenceOf(error),
    digest =
      error && typeof error === "object" && "digest" in error
        ? String((error as { digest?: unknown }).digest ?? "") || undefined
        : undefined;

  useEffect(() => {
    reportError("render", error, digest);
  }, [error, digest]);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(reference)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <div className="site system-page">
      <main className="system-main" role="alert">
        <img
          className="system-rose tilted"
          src="/brand/compass-512.webp"
          alt=""
          width={150}
          height={150}
        />
        <h1>
          {variant === "editor" ? t("sysEditorErrorTitle") : t("sysErrorTitle")}
        </h1>
        <p className="system-lead">
          {variant === "editor" ? t("sysEditorErrorLead") : t("sysErrorLead")}
        </p>
        <div className="system-actions">
          <button className="site-btn" onClick={() => retry()}>
            {t("sysTryAgain")}
          </button>
          <button
            className="site-btn quiet"
            onClick={() => window.location.reload()}
          >
            {t("sysReload")}
          </button>
          <Link className="site-btn quiet" href="/">
            {t("sysGoHome")}
          </Link>
        </div>
        <div className="system-reference">
          <span>{t("sysReference")}</span>
          <code>{reference}</code>
          <button className="site-btn quiet small" onClick={copy}>
            {copied ? t("sysCopied") : t("sysCopy")}
          </button>
        </div>
        <p className="system-note">{t("sysReferenceHint")}</p>
        {/* The message itself, on the team's copies only. */}
        {!IS_PRODUCTION && error instanceof Error && (
          <details className="system-details">
            <summary>{t("sysDetails")}</summary>
            <pre dir="ltr">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
        )}
      </main>
    </div>
  );
}
