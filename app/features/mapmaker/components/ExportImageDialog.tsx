"use client";
/**
 * "Save as image": the format, the size (sizes above the plan's export limit
 * are shown locked and open the upgrade prompt) and, for JPEG and WebP, the
 * quality. The map is rendered at the chosen size, never upscaled from the
 * screen (see MapCreatorEditor → renderMapCanvas).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Glyph } from "../glyphs";
import { Slider } from "./EditorControls";
import { maxCanvasPixels } from "../../../lib/canvasLimits";
import { IMAGE_FORMATS, exportSizes, printSizeCm, type ExportSize, type ImageFormat } from "../export/imageFormats";
import type { TextExportMode } from "../text/exportVector";

type T = (k: string, o?: Record<string, unknown>) => string;

const LABEL: Record<ImageFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP", tiff: "TIFF", pdf: "PDF", svg: "SVG" };

const FORMAT_KEY = "mapmaker-export-format";
function savedFormat(): ImageFormat {
  try {
    const f = localStorage.getItem(FORMAT_KEY);
    return IMAGE_FORMATS.some((x) => x.id === f) ? (f as ImageFormat) : "png";
  } catch {
    return "png";
  }
}

export function ExportImageDialog({
  t,
  name,
  width,
  height,
  maxPx,
  onExport,
  onLocked,
  onClose,
}: {
  t: T;
  name: string;
  /** The map's own size in pixels. */
  width: number;
  height: number;
  /** The plan's largest export (long side, px). */
  maxPx: number;
  /** Renders, encodes and downloads; resolves when done (rejects on failure). */
  onExport: (format: ImageFormat, size: ExportSize, quality: number, textMode: TextExportMode) => Promise<void>;
  /** A locked size was picked: show the plan's limit. */
  onLocked: (size: ExportSize) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sizes = useMemo(() => exportSizes(width, height, maxPx, maxCanvasPixels()), [width, height, maxPx]);
  const [format, setFormat] = useState<ImageFormat>(savedFormat),
    [scale, setScale] = useState(() => (sizes.find((s) => s.scale === 1 && !s.locked) ?? sizes.filter((s) => !s.locked).at(-1) ?? sizes[0])?.scale ?? 1),
    [quality, setQuality] = useState(0.9),
    [textMode, setTextMode] = useState<TextExportMode>("outlines"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const size = sizes.find((s) => s.scale === scale) ?? sizes[0],
    info = IMAGE_FORMATS.find((f) => f.id === format)!;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const close = () => {
    if (busy) return;
    dialog.current?.close();
    onClose();
  };
  const save = async () => {
    if (!size || size.locked) return;
    setBusy(true);
    setError(false);
    try {
      localStorage.setItem(FORMAT_KEY, format);
    } catch {}
    try {
      await onExport(format, size, quality, textMode);
      dialog.current?.close();
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="mm-export-dialog"
      aria-labelledby="mm-export-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="mm-export-head">
        <div>
          <h2 id="mm-export-title">{t("exSaveTitle")}</h2>
          <p>{name || t("mmUntitledMap")}</p>
        </div>
        <button className="mm-export-close" onClick={close} aria-label={t("acUpgradeClose")} disabled={busy}>
          <Glyph name="close" size={14} />
        </button>
      </header>

      <span className="mm-export-label">{t("exFormat")}</span>
      <div className="mm-export-formats" role="radiogroup" aria-label={t("exFormat")}>
        {IMAGE_FORMATS.map((f) => (
          <button key={f.id} role="radio" aria-checked={format === f.id} className={format === f.id ? "active" : ""} onClick={() => setFormat(f.id)} disabled={busy}>
            <b>{LABEL[f.id]}</b>
            <small>{t(`exFormat_${f.id}`)}</small>
          </button>
        ))}
      </div>

      <span className="mm-export-label">{t("exSize")}</span>
      <div className="mm-export-sizes" role="radiogroup" aria-label={t("exSize")}>
        {sizes.map((s) => (
          <button
            key={s.scale}
            role="radio"
            aria-checked={scale === s.scale}
            className={`${scale === s.scale ? "active" : ""} ${s.locked ? "locked" : ""}`}
            disabled={busy}
            onClick={() => (s.locked ? onLocked(s) : setScale(s.scale))}
          >
            <span className="mm-export-size-name">
              {t(`exScale_${String(s.scale).replace(".", "_")}`)}
              {s.locked && <Glyph name="lock" size={11} />}
            </span>
            <span className="mm-export-size-px">
              {s.width.toLocaleString()} × {s.height.toLocaleString()} px
            </span>
            <span className="mm-export-size-cm">{t("exPrintsAt", { w: printSizeCm(s.width, 300), h: printSizeCm(s.height, 300) })}</span>
          </button>
        ))}
      </div>

      {info.lossy && (
        <div className="mm-export-quality">
          <Slider label={t("exQuality")} defaultValue={0.9} value={quality} min={0.5} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      )}

      {format === "svg" && (
        <>
          <span className="mm-export-label">{t("exTextMode")}</span>
          <div className="mm-export-formats mm-export-textmode" role="radiogroup" aria-label={t("exTextMode")}>
            {(["outlines", "editable"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={textMode === m} className={textMode === m ? "active" : ""} onClick={() => setTextMode(m)} disabled={busy} title={t(`exText_${m}Hint`)}>
                <b>{t(`exText_${m}`)}</b>
                <small>{t(`exText_${m}Hint`)}</small>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mm-export-note">{t(`exNote_${format}`)}</p>
      {error && (
        <p className="mm-export-error" role="alert">
          {t("exFailed")}
        </p>
      )}

      <div className="mm-export-actions">
        <button className="secondary-button" onClick={close} disabled={busy}>
          {t("mmCancelDraft")}
        </button>
        <button className="export-button" onClick={() => void save()} disabled={busy || !size || size.locked}>
          <Glyph name={busy ? "image" : "download"} size={14} />
          {busy ? t("exSaving") : t("exSaveAs", { format: LABEL[format] })}
        </button>
      </div>
    </dialog>
  );
}
