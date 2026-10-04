"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { usePreview } from "../hooks/usePreview";
import { goreBox } from "../domain/geometry";
import { goreSvg, pageSvg } from "../export/svg";
import { MapEditor } from "./MapEditor";
import type { StudioDocument, PrintPlan, MapLayer } from "../domain/types";
import type { SourceState } from "../hooks/useSource";
const GlobePreview = dynamic(
  () => import("./GlobePreview").then((m) => m.GlobePreview),
  { ssr: false },
);
export function PreviewPanel({
  document: d,
  source,
  plan,
  onLayers,
  notify,
}: {
  document: StudioDocument;
  source: SourceState | null;
  plan: PrintPlan;
  onLayers: (l: MapLayer[]) => void;
  notify: (m: string) => void;
}) {
  const { t } = useTranslation(),
    [view, setView] = useState("sheets"),
    [page, setPage] = useState(0),
    [zoom, setZoom] = useState(1),
    mode = view === "globe3d" ? "panorama" : "gores";
  const preview = usePreview(source, d, mode),
    g = goreBox(d.globe),
    index = Math.min(page, Math.max(0, plan.pages.length - 1));
  return (
    <section className="preview-panel">
      <div className="preview-header">
        <h2>
          {t("preview")}
          <span className="live">
            <i />
            {t("live")}
          </span>
        </h2>
        <span className="preview-meta">
          {plan.pages.length} {t("pages")}
        </span>
      </div>
      <div className="preview-toolbar">
        <div className="tabs preview-tabs">
          {["sheets", "goresView", "globe3d", "editor"].map((v) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setZoom(1);
              }}
            >
              {t(v)}
            </button>
          ))}
        </div>
        {["sheets", "goresView"].includes(view) && (
          <div className="zoom">
            <button
              aria-label="−"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            >
              −
            </button>
            <button onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="+"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            >
              ＋
            </button>
          </div>
        )}
      </div>
      {view === "editor" && source ? (
        <MapEditor
          source={source}
          layers={d.layers}
          onChange={onLayers}
          notify={notify}
        />
      ) : (
        <>
          {preview.error ? (
            <p className="notice warning">{t(preview.error)}</p>
          ) : preview.pending || !source ? (
            <div className="preview-loading">
              <span className="spinner" />
              {t("busyPreview")}
            </div>
          ) : view === "globe3d" ? (
            <GlobePreview url={preview.assets[0]?.url ?? ""} globe={d.globe} />
          ) : view === "sheets" ? (
            <>
              {plan.error ? (
                <p className="notice warning">{t(plan.error)}</p>
              ) : (
                <>
                  <div className="sheet-scroll">
                    <div
                      className="sheet-paper"
                      style={{ width: `${zoom * 72}%` }}
                      dangerouslySetInnerHTML={{
                        __html: pageSvg(
                          plan.pages[index],
                          d.globe,
                          d.print,
                          preview.assets,
                          index,
                          plan.pages.length,
                        ),
                      }}
                    />
                  </div>
                  <div className="page-navigation">
                    <button
                      disabled={index === 0}
                      onClick={() => setPage(index - 1)}
                    >
                      {t("previous")}
                    </button>
                    <span>
                      {t("page")} {index + 1} {t("of")} {plan.pages.length}{" "}
                      <small>
                        {" "}
                        · {plan.pages[index].width} × {plan.pages[index].height}{" "}
                        mm
                      </small>
                    </span>
                    <button
                      disabled={index === plan.pages.length - 1}
                      onClick={() => setPage(index + 1)}
                    >
                      {t("next")}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="preview-scroll gores-scroll">
              <div
                className="gore-gallery"
                style={{ minWidth: `${zoom * 100}%` }}
              >
                <div className="plate-title">
                  <h3>{t("plateDynamic", { count: d.globe.gores })}</h3>
                  <p>{t("sinusoidal")}</p>
                </div>
                <div className="gore-strip">
                  {preview.assets.map((asset) => (
                    <div
                      key={asset.index}
                      style={{ flex: `${g.width} 0 0` }}
                      dangerouslySetInnerHTML={{
                        __html: goreSvg(d.globe, asset.index, asset.url),
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <div className="preview-stats">
        <div>
          <span>{t("count")}</span>
          <strong>{d.globe.gores}</strong>
        </div>
        <div>
          <span>{t("goreHeight")}</span>
          <strong>{g.goreHeight.toFixed(1)} mm</strong>
        </div>
        <div>
          <span>{t("pages")}</span>
          <strong>{plan.pages.length}</strong>
        </div>
        <div>
          <span>{t("physicalSize")}</span>
          <strong>
            {d.globe.width} × {d.globe.height} mm
          </strong>
        </div>
      </div>
    </section>
  );
}
