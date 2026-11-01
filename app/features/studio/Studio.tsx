"use client";
/**
 * The print studio (/print): a finished map — normally sent from the editor —
 * printed as globe gores or flat as a poster.
 *
 *   Globe   the map on a sphere: gore layout, print sheets and a 3D preview;
 *           a map that isn't 2:1 is kept in proportion on its sea, or
 *           stretched (see ./domain/fit)
 *   Poster  the map flat on one sheet or across several, with bleed, crop
 *           marks, a frame and a title (see ./poster)
 *
 * The map itself is drawn in the editor; this page only prints it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "../account/ui";
import { SourceCard } from "./components/SourceCard";
import { GlobeFitControls } from "./components/GlobeFitControls";
import { GlobeControls } from "./components/GlobeControls";
import { PrintControls } from "./components/PrintControls";
import { PreviewPanel } from "./components/PreviewPanel";
import { ExportPanel } from "./components/ExportPanel";
import { ProjectToolbar } from "./components/ProjectToolbar";
import { PosterControls } from "./poster/PosterControls";
import { PosterView } from "./poster/PosterView";
import { planPoster } from "./poster/layout";
import { DEFAULT_POSTER, type PosterSettings } from "./poster/types";
import { useDocument } from "./hooks/useDocument";
import { useSource } from "./hooks/useSource";
import { useGlobeSource } from "./hooks/useGlobeSource";
import { needsFit } from "./domain/fit";
import { planPrint } from "./domain/layout";
import {
  loadHandoff,
  clearHandoff,
  type SavedProject,
  type SourceOrigin,
} from "./storage/projects";
import type { GlobeSettings, PrintSettings } from "./domain/types";
import { Icon } from "@/components/ui/ornaments";
import { Flourish } from "@/components/ui/Flourish";

const DEFAULT_FILL = "#2c5678";

export default function Studio({
  handoff: handoffPending = false,
}: {
  handoff?: boolean;
}) {
  const { t, i18n } = useTranslation(),
    state = useDocument(),
    [notice, setNotice] = useState(""),
    [origin, setOrigin] = useState<SourceOrigin | null>(null);
  const notify = useCallback((m: string) => setNotice(m), []),
    sourceState = useSource(notify, !handoffPending),
    d = state.document,
    mode = d.mode ?? "globe",
    poster = d.poster ?? DEFAULT_POSTER;
  const globeSource = useGlobeSource(sourceState.source, d.globe);
  const plan = useMemo(() => planPrint(d.globe, d.print), [d.globe, d.print]);
  const aspect = sourceState.source
      ? sourceState.source.width / sourceState.source.height
      : 2,
    posterPlan = useMemo(() => planPoster(aspect, poster), [aspect, poster]);

  // Messages fade after a while (they stay readable, and can be closed sooner).
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  // A map sent from the editor: it becomes the source, named after the map,
  // with the globe's sea in the map's own background colour.
  // Taken once: development re-runs effects, and a second run would find
  // the hand-off already cleared and fall back to the sample map.
  const handoffTaken = useRef(false);
  useEffect(() => {
    if (!handoffPending || handoffTaken.current) return;
    handoffTaken.current = true;
    (async () => {
      try {
        const handoff = await loadHandoff();
        if (
          handoff &&
          (await sourceState.upload(handoff.source, handoff.filename))
        ) {
          const size = await createImageBitmap(handoff.source).then((b) => {
            const r = { width: b.width, height: b.height };
            b.close();
            return r;
          });
          const name = handoff.origin?.name || handoff.document.name;
          state.replace({
            ...handoff.document,
            name,
            // A world-shaped (2:1) map opens on the globe; any other on the poster.
            mode: needsFit(size.width, size.height) ? "poster" : "globe",
            globe: {
              ...handoff.document.globe,
              fit: "contain",
              fill: handoff.origin?.background ?? DEFAULT_FILL,
            },
            poster: { ...DEFAULT_POSTER, ...handoff.document.poster },
          });
          setOrigin(handoff.origin ?? null);
          notify("mmPrintReady");
        } else await sourceState.sample();
      } finally {
        await clearHandoff().catch(() => {});
        window.history.replaceState(null, "", "/print");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffPending]);

  const globe = (patch: Partial<GlobeSettings>) =>
    state.change((old) => ({ ...old, globe: { ...old.globe, ...patch } }));
  const print = (patch: Partial<PrintSettings>) =>
    state.change((old) => ({ ...old, print: { ...old.print, ...patch } }));
  const posterChange = (patch: Partial<PosterSettings>) =>
    state.change((old) => ({
      ...old,
      poster: { ...(old.poster ?? DEFAULT_POSTER), ...patch },
    }));
  const setMode = (m: "globe" | "poster") =>
    state.change((old) => ({ ...old, mode: m }));

  async function restore(project: SavedProject) {
    if (await sourceState.upload(project.source, project.filename)) {
      state.replace(project.document);
      setOrigin(project.origin ?? null);
    } else throw new Error("loadFailed");
  }

  return (
    <div className="site pr-page">
      <SiteHeader />
      <main className="pr-main">
        <section className="pr-hero">
          <div className="pr-hero-copy">
            <span className="pr-eyebrow">{t("acPrintStudio")}</span>
            <h1 className="fl-title" key={mode}>
              {mode === "globe" ? (
                <Flourish text={t("prHeroGlobe")} />
              ) : (
                <Flourish text={t("prHeroPoster")} />
              )}
            </h1>
            <p>{t(mode === "globe" ? "prIntroGlobe" : "prIntroPoster")}</p>
          </div>
          <SourceCard
            source={sourceState.source}
            origin={origin}
            loading={sourceState.loading}
            onUpload={async (f) => {
              if (await sourceState.upload(f, f.name)) {
                setOrigin(null);
                state.replace({
                  ...d,
                  name: f.name.replace(/\.[^.]+$/, "").slice(0, 100) || d.name,
                  layers: [],
                });
              }
            }}
          />
        </section>

        <div className="pr-modes" role="tablist" aria-label={t("prModes")}>
          {(["globe", "poster"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "active" : ""}
              onClick={() => setMode(m)}
            >
              <Icon name={m === "globe" ? "globe" : "grid"} size={18} />
              <span>
                <b>{t(m === "globe" ? "prModeGlobe" : "prModePoster")}</b>
                <small>
                  {t(m === "globe" ? "prModeGlobeNote" : "prModePosterNote")}
                </small>
              </span>
            </button>
          ))}
        </div>

        <ProjectToolbar
          document={d}
          source={sourceState.source}
          origin={origin}
          onName={(name) => state.change((old) => ({ ...old, name }))}
          onRestore={restore}
          undo={state.undo}
          redo={state.redo}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          notify={notify}
        />
        {notice && (
          <div className="studio-notice" role="status">
            <span>{t(i18n.exists(notice) ? notice : "errorGeneric")}</span>
            <button
              aria-label={t("clearMessage")}
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}

        <div className="pr-workspace">
          <aside className="pr-controls" aria-label={t("settings")}>
            {mode === "globe" ? (
              <>
                <GlobeFitControls
                  globe={d.globe}
                  source={sourceState.source}
                  globeSource={globeSource.source}
                  defaultFill={origin?.background ?? DEFAULT_FILL}
                  onChange={globe}
                />
                <GlobeControls globe={d.globe} onChange={globe} />
                <PrintControls
                  settings={d.print}
                  onChange={print}
                  notify={notify}
                />
              </>
            ) : (
              <PosterControls
                settings={poster}
                plan={posterPlan}
                aspect={aspect}
                onChange={posterChange}
              />
            )}
            <div className="sidebar-note">
              <Icon name="shield" size={15} />
              <span>
                {t("private")}
                <small>{t("local")}</small>
              </span>
            </div>
          </aside>
          <div className="pr-stage">
            {mode === "globe" ? (
              <>
                <PreviewPanel
                  document={d}
                  source={globeSource.pending ? null : globeSource.source}
                  plan={plan}
                />
                <ExportPanel
                  document={d}
                  source={
                    sourceState.loading || globeSource.pending
                      ? null
                      : globeSource.source
                  }
                  plan={plan}
                  onDpi={(dpi) => state.change((old) => ({ ...old, dpi }))}
                  notify={notify}
                />
              </>
            ) : (
              <PosterView
                source={sourceState.loading ? null : sourceState.source}
                plan={posterPlan}
                settings={poster}
                name={d.name}
                notify={notify}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
