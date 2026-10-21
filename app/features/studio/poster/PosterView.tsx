"use client";
/**
 * The poster's preview (the whole poster, or sheet by sheet) and its output:
 * print, PDF and the poster as one image. The preview is a small render of
 * the same artwork the print uses.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SourceState } from "../hooks/useSource";
import { sheetName, type PosterPlan } from "./layout";
import { printScale, printedPpi, renderPoster } from "./render";
import { posterPdf, sheetSvg } from "./sheets";
import type { PosterSettings } from "./types";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** A new tab showing a short message until the PDF is ready (null if blocked). */
function waitingTab(message: string): Window | null {
  const tab = window.open("", "_blank");
  if (!tab) return null;
  try {
    const doc = tab.document;
    doc.title = message;
    doc.body.style.cssText =
      "margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1d33;color:#e9d9a8;font:16px system-ui,sans-serif";
    doc.body.textContent = message;
  } catch {
    // A blank tab is fine too.
  }
  return tab;
}
const safe = (v: string) =>
  v
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "map";

export function PosterView({
  source,
  plan,
  settings: s,
  name,
  notify,
}: {
  source: SourceState | null;
  plan: PosterPlan;
  settings: PosterSettings;
  name: string;
  notify: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"overview" | "sheets">("overview"),
    [page, setPage] = useState(0),
    [preview, setPreview] = useState<{ key: string; url: string } | null>(null),
    [job, setJob] = useState<{ stage: string; progress: number } | null>(null);
  const bitmap = useRef<{ url: string; image: ImageBitmap } | null>(null);
  const key = JSON.stringify([
    source?.url,
    plan.canvas,
    plan.artwork.map,
    s.frame,
    s.frameColor,
    s.mat,
    s.title,
    s.subtitle,
  ]);

  /** The source decoded once (and again only when it changes). */
  async function image(): Promise<ImageBitmap> {
    if (!source) throw new Error("missingSource");
    if (bitmap.current?.url !== source.url) {
      bitmap.current?.image.close();
      bitmap.current = {
        url: source.url,
        image: await createImageBitmap(source.blob),
      };
    }
    return bitmap.current.image;
  }
  useEffect(() => () => bitmap.current?.image.close(), []);

  // The preview: about 1600 px on its long side.
  useEffect(() => {
    if (!source || plan.error || !plan.canvas.width) return;
    let live = true,
      made = "";
    const timer = setTimeout(async () => {
      try {
        const k = Math.min(
            1600 / Math.max(plan.canvas.width, plan.canvas.height),
            printScale(plan, source.width),
          ),
          canvas = await renderPoster(await image(), plan, s, k),
          blob = await new Promise<Blob | null>((r) =>
            canvas.toBlob(r, "image/jpeg", 0.88),
          );
        canvas.width = canvas.height = 0;
        if (!blob || !live) return;
        made = URL.createObjectURL(blob);
        setPreview((old) => {
          if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1000);
          return { key, url: made };
        });
      } catch {
        // The source failed to decode; the source card says so.
      }
    }, 160);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers the plan and settings drawn
  }, [key, source, plan.error]);

  async function run(kind: "print" | "pdf" | "png") {
    if (!source || job) return;
    // The print tab is opened now, while the click still counts: browsers
    // block a tab opened after the seconds the poster takes to make.
    const tab = kind === "print" ? waitingTab(t("prPrintPreparing")) : null;
    setJob({ stage: "preparing", progress: 0 });
    try {
      await new Promise((r) => setTimeout(r, 30));
      const canvas = await renderPoster(
        await image(),
        plan,
        s,
        printScale(plan, source.width),
      );
      setJob({ stage: "assembling", progress: 0.3 });
      if (kind === "png") {
        const blob = await new Promise<Blob | null>((r) =>
          canvas.toBlob(r, "image/png"),
        );
        if (!blob) throw new Error("exFailed");
        download(blob, `${safe(name)}-poster.png`);
        notify("jobComplete");
      } else {
        const pdf = await posterPdf(plan, s, canvas, name, (v) =>
          setJob({ stage: "assembling", progress: 0.3 + v * 0.7 }),
        );
        if (kind === "pdf") {
          download(pdf, `${safe(name)}-poster.pdf`);
          notify("jobComplete");
        } else if (tab && !tab.closed) {
          // The browser's PDF viewer prints at the exact page size.
          const url = URL.createObjectURL(pdf);
          tab.location.href = url;
          setTimeout(() => URL.revokeObjectURL(url), 120_000);
          notify("prPrintOpened");
        } else {
          // No tab (blocked, or closed meanwhile): the PDF is downloaded instead.
          download(pdf, `${safe(name)}-poster.pdf`);
          notify("prPrintDownloaded");
        }
      }
      canvas.width = canvas.height = 0;
    } catch (e) {
      tab?.close();
      notify(e instanceof Error ? e.message : "errorGeneric");
    } finally {
      setJob(null);
    }
  }

  const ppi = source ? printedPpi(plan, source.width) : 0,
    index = Math.min(page, Math.max(0, plan.sheets.length - 1)),
    ready = !!preview && !plan.error;
  return (
    <>
      <section className="preview-panel">
        <div className="preview-header">
          <h2>
            {t("prPreview")}
            <span className="live">
              <i />
              {t("live")}
            </span>
          </h2>
          <span className="preview-meta">
            {plan.sheets.length} {t("pages")}
          </span>
        </div>
        <div className="preview-toolbar">
          <div className="tabs preview-tabs">
            {(["overview", "sheets"] as const).map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(v === "overview" ? "prOverview" : "sheets")}
              </button>
            ))}
          </div>
        </div>
        {plan.error ? (
          <p className="notice warning">
            {t(plan.error === "pageLimit" ? "prPageLimit" : "layoutError")}
          </p>
        ) : !ready ? (
          <div className="preview-loading">
            <span className="spinner" />
            {t("busyPreview")}
          </div>
        ) : view === "overview" ? (
          <div className="pr-overview">
            <div
              className="pr-overview-art"
              style={{
                aspectRatio: `${plan.canvas.width} / ${plan.canvas.height}`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={t("prOverview")} />
              {plan.sheets.length > 1 && (
                <svg
                  viewBox={`0 0 ${plan.canvas.width} ${plan.canvas.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {plan.sheets.map((sh) => (
                    <g key={`${sh.row}-${sh.col}`}>
                      <rect
                        x={sh.sourceX}
                        y={sh.sourceY}
                        width={sh.clip.width}
                        height={sh.clip.height}
                        fill="none"
                        stroke="#d9a93b"
                        strokeWidth={
                          Math.max(plan.canvas.width, plan.canvas.height) / 400
                        }
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={sh.sourceX + 4}
                        y={sh.sourceY + 12}
                        fontSize={
                          Math.max(plan.canvas.width, plan.canvas.height) / 40
                        }
                        fill="#d9a93b"
                      >
                        {sheetName(sh)}
                      </text>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="sheet-scroll">
              <div
                className="sheet-paper"
                style={{ width: "72%" }}
                dangerouslySetInnerHTML={{
                  __html: sheetSvg(
                    plan,
                    plan.sheets[index],
                    s,
                    preview.url,
                    name,
                    index,
                  ),
                }}
              />
            </div>
            <div className="page-navigation">
              <button disabled={index === 0} onClick={() => setPage(index - 1)}>
                {t("previous")}
              </button>
              <span>
                {plan.sheets.length > 1
                  ? `${sheetName(plan.sheets[index])} · `
                  : ""}
                {t("page")} {index + 1} {t("of")} {plan.sheets.length}
                <small>
                  {" "}
                  · {Math.round(plan.paper.width)} ×{" "}
                  {Math.round(plan.paper.height)} mm
                </small>
              </span>
              <button
                disabled={index === plan.sheets.length - 1}
                onClick={() => setPage(index + 1)}
              >
                {t("next")}
              </button>
            </div>
          </>
        )}
        <div className="preview-stats">
          <div>
            <span>{t("prPosterSize")}</span>
            <strong dir="ltr">
              {(plan.artwork.width / 10).toFixed(1)} ×{" "}
              {(plan.artwork.height / 10).toFixed(1)} cm
            </strong>
          </div>
          <div>
            <span>{t("pages")}</span>
            <strong>{plan.sheets.length}</strong>
          </div>
          <div>
            <span>{t("paper")}</span>
            <strong>{s.paper === "custom" ? t("custom") : s.paper}</strong>
          </div>
          <div>
            <span>{t("effective")}</span>
            <strong>{Math.round(ppi)} PPI</strong>
          </div>
        </div>
      </section>

      <section className="export-panel">
        <div className="export-heading">
          <span className="export-icon">↧</span>
          <div>
            <h2>{t("prPrintTitle")}</h2>
            <p>{t("prPrintNote")}</p>
          </div>
        </div>
        <p className={`quality-note ${ppi < 150 ? "warning" : ""}`}>
          {t(
            ppi < 150
              ? "prQualityLow"
              : ppi < 240
                ? "prQualityOk"
                : "prQualityHigh",
            { ppi: Math.round(ppi) },
          )}
        </p>
        <div className="export-actions">
          <button
            className="export-button"
            disabled={!!job || !source || !!plan.error}
            onClick={() => void run("print")}
          >
            ▤ {t("printNow")}
          </button>
          <button
            className="secondary-button"
            disabled={!!job || !source || !!plan.error}
            onClick={() => void run("pdf")}
          >
            {t("downloadPdf")}
          </button>
          <button
            className="secondary-button"
            disabled={!!job || !source || !!plan.error}
            onClick={() => void run("png")}
          >
            {t("prDownloadImage")}
          </button>
        </div>
        {job && (
          <div className="job-progress" role="status">
            <div>
              <span>{t(job.stage)}</span>
              <strong>{Math.round(job.progress * 100)}%</strong>
            </div>
            <progress value={job.progress} max={1} />
          </div>
        )}
        <p className="help-copy">
          {t(plan.sheets.length > 1 ? "prAssembleNote" : "prActualSize")}
        </p>
      </section>
    </>
  );
}
