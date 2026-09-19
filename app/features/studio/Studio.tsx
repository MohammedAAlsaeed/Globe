"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "../../lib/i18n";
import { Icon, Astrolabe } from "../../components/ui/ornaments";
import { SourcePanel } from "./components/SourcePanel";
import { GlobeControls } from "./components/GlobeControls";
import { PrintControls } from "./components/PrintControls";
import { PreviewPanel } from "./components/PreviewPanel";
import { ExportPanel } from "./components/ExportPanel";
import { ProjectToolbar } from "./components/ProjectToolbar";
import { useDocument } from "./hooks/useDocument";
import { useSource } from "./hooks/useSource";
import { planPrint } from "./domain/layout";
import type { GlobeSettings, PrintSettings } from "./domain/types";
import type { SavedProject } from "./storage/projects";
export default function Studio() {
  const { t, i18n } = useTranslation(),
    state = useDocument(),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(""),
    dialog = useRef<HTMLDialogElement>(null);
  const notify = useCallback((m: string) => setNotice(m), []),
    sourceState = useSource(notify),
    d = state.document;
  const plan = useMemo(() => planPrint(d.globe, d.print), [d.globe, d.print]);
  useEffect(() => {
    try {
      const lang = localStorage.getItem("atelier-language");
      if (lang === "ar" || lang === "en") i18n.changeLanguage(lang);
    } catch {}
  }, [i18n]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const globe = (patch: Partial<GlobeSettings>) =>
    state.change((old) => ({ ...old, globe: { ...old.globe, ...patch } }));
  const print = (patch: Partial<PrintSettings>) =>
    state.change((old) => ({ ...old, print: { ...old.print, ...patch } }));
  async function restore(project: SavedProject) {
    if (await sourceState.upload(project.source, project.filename))
      state.replace(project.document);
    else throw new Error("loadFailed");
  }
  return (
    <div className="site-shell">
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-emblem">✳</span>
          <span>
            <b>{t("brand")}</b>
            <small>{t("atelier")}</small>
          </span>
        </Link>
        <nav aria-label={t("studio")}>
          <button className="nav-active" onClick={() => setModal("")}>
            {t("printStudio")}
          </button>
          <button onClick={() => setModal("guide")}>{t("guide")}</button>
          <button onClick={() => setModal("about")}>{t("about")}</button>
        </nav>
        <button
          className="language"
          onClick={() => {
            const lang = i18n.language === "en" ? "ar" : "en";
            i18n.changeLanguage(lang);
            try {
              localStorage.setItem("atelier-language", lang);
            } catch {}
          }}
        >
          <Icon name="globe" size={17} />
          {i18n.language === "en" ? "العربية" : "English"}
        </button>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              {t("eyebrow")}
            </div>
            <h1>{t("title")}</h1>
            <p>{t("intro")}</p>
          </div>
          <Astrolabe />
          <span className="hero-coordinate">٢٤° ٤٢′ ش · ٤٦° ٤٠′ ق</span>
        </section>
        <ProjectToolbar
          document={d}
          source={sourceState.source}
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
        <div className="workspace studio-workspace">
          <aside className="controls">
            <SourcePanel
              source={sourceState.source}
              loading={sourceState.loading}
              globe={d.globe}
              onChange={globe}
              onUpload={async (f) => {
                if (await sourceState.upload(f, f.name))
                  state.replace({ ...d, layers: [] });
              }}
              onSample={async () => {
                if (await sourceState.sample())
                  state.replace({
                    ...d,
                    layers: [],
                    globe: { ...d.globe, sourceProjection: "equirectangular" },
                  });
              }}
            />
            <GlobeControls globe={d.globe} onChange={globe} />
            <PrintControls
              settings={d.print}
              onChange={print}
              notify={notify}
            />
            <div className="sidebar-note">
              <Icon name="shield" size={15} />
              <span>
                {t("private")}
                <small>{t("local")}</small>
              </span>
            </div>
          </aside>
          <div className="main-panel studio-main">
            <PreviewPanel
              document={d}
              source={sourceState.source}
              plan={plan}
              onLayers={(layers) => state.change((old) => ({ ...old, layers }))}
              notify={notify}
            />
            <ExportPanel
              document={d}
              source={sourceState.loading ? null : sourceState.source}
              plan={plan}
              onDpi={(dpi) => state.change((old) => ({ ...old, dpi }))}
              notify={notify}
            />
            <section className="craft-banner">
              <span className="craft-star">✳</span>
              <div>
                <h3>{t("craftTitle")}</h3>
                <p>{t("craftText")}</p>
              </div>
              <button onClick={() => setModal("guide")} aria-label={t("guide")}>
                <Icon name="chevron" />
              </button>
            </section>
          </div>
        </div>
        <footer>
          <span>
            © {new Date().getFullYear()} {t("brand")} · {t("atelier")}
          </span>
          <span>{t("sourceCredit")}</span>
          <span>
            <Icon name="spark" size={12} />
            {t("precise")}
          </span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setModal("")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal("");
        }}
      >
        <div className="dialog-header">
          <span className="eyebrow">{t("brand")}</span>
          <button aria-label={t("close")} onClick={() => setModal("")}>
            ×
          </button>
        </div>
        <h2>{t(modal === "guide" ? "helpTitle" : "about")}</h2>
        <p>{t(modal === "guide" ? "guideNew" : "aboutNew")}</p>
        <button className="export-button" onClick={() => setModal("")}>
          {t("close")}
        </button>
      </dialog>
    </div>
  );
}
