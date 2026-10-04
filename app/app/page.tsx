"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "../lib/i18n";
import "../features/mapmaker/mapmaker.css";
import { Icon, Astrolabe } from "../components/ui/ornaments";
import { CreateMapModal } from "../features/mapmaker/CreateMapModal";
import { MapGallery } from "../features/mapmaker/MapGallery";

export default function Home() {
  const { t, i18n } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
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
          <button onClick={() => setShowGallery(true)}>{t("mmMyMaps")}</button>
          <Link href="/print">{t("printStudio")}</Link>
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
        <section className="hero mm-landing-hero">
          <div className="eyebrow">
            <span />
            {t("mmLandingEyebrow")}
          </div>
          <h1>{t("mmLandingTitle")}</h1>
          <p>{t("mmLandingIntro")}</p>
          <Astrolabe />
        </section>
        <div className="mm-cta-grid">
          <div className="mm-cta-card">
            <span className="mm-cta-icon">
              <Icon name="ruler" size={22} />
            </span>
            <h2>{t("mmCreateCardTitle")}</h2>
            <p>{t("mmCreateCardText")}</p>
            <button className="mm-cta-button" onClick={() => setShowCreate(true)}>
              {t("mmCreateCardButton")}
            </button>
          </div>
          <div className="mm-cta-card">
            <span className="mm-cta-icon">
              <Icon name="upload" size={22} />
            </span>
            <h2>{t("mmPrintCardTitle")}</h2>
            <p>{t("mmPrintCardText")}</p>
            <Link href="/print" className="mm-cta-button secondary">
              {t("mmPrintCardButton")}
            </Link>
          </div>
        </div>
        <p className="mm-landing-footer-note">{t("mmLandingFooter")}</p>
      </main>
      {showCreate && <CreateMapModal onClose={() => setShowCreate(false)} />}
      {showGallery && (
        <MapGallery
          onClose={() => setShowGallery(false)}
          onCreate={() => {
            setShowGallery(false);
            setShowCreate(true);
          }}
        />
      )}
    </div>
  );
}
