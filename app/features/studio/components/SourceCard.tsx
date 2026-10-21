"use client";
/* eslint-disable @next/next/no-img-element */
/**
 * The map being printed: normally the one sent from the editor (with the way
 * back to it); another image can be dropped or chosen instead.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../components/ui/ornaments";
import type { SourceState } from "../hooks/useSource";
import type { SourceOrigin } from "../storage/projects";

export function SourceCard({
  source,
  origin,
  loading,
  onUpload,
}: {
  source: SourceState | null;
  origin: SourceOrigin | null;
  loading: boolean;
  onUpload: (file: File) => void;
}) {
  const { t } = useTranslation(),
    input = useRef<HTMLInputElement>(null),
    [drag, setDrag] = useState(false);
  const name =
    origin?.name || source?.filename?.replace(/\.[^.]+$/, "") || t("prSample");
  const editorHref = origin?.mapId
    ? `/editor?map=${encodeURIComponent(origin.mapId)}`
    : "/editor";
  return (
    <section
      className={`pr-source ${drag ? "dragging" : ""}`}
      aria-label={t("prSourceTitle")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) onUpload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <div className="pr-source-thumb">
        {source ? (
          <img src={source.url} alt="" />
        ) : (
          <span className="pr-spinner" aria-hidden="true" />
        )}
      </div>
      <div className="pr-source-text">
        <span className="pr-source-badge">
          {origin
            ? t("prFromEditor")
            : source?.filename
              ? t("prFromDevice")
              : t("prSampleBadge")}
        </span>
        <strong>{loading ? t("sourceReplacing") : name}</strong>
        {source && (
          <small dir="ltr">
            {source.width.toLocaleString()} × {source.height.toLocaleString()}{" "}
            px
          </small>
        )}
      </div>
      <div className="pr-source-actions">
        {origin && (
          <Link className="site-btn quiet small" href={editorHref}>
            {t("prBackToEditor")}
          </Link>
        )}
        <button
          className="site-btn quiet small"
          disabled={loading}
          onClick={() => input.current?.click()}
        >
          <Icon name="upload" size={14} />
          {t("prOtherImage")}
        </button>
      </div>
    </section>
  );
}
