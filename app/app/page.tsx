"use client";
/* eslint-disable @next/next/no-img-element -- static brand artwork */
/**
 * The landing page: what the atelier does, and the two ways in — make a map,
 * or print one you already have as a globe.
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CreateMapModal } from "@/features/mapmaker/CreateMapModal";
import { SiteHeader } from "@/features/account/ui";

function VerifiedNotice() {
  const { t } = useTranslation();
  return useSearchParams().get("verified") === "1" ? (
    <p className="site-notice ok landing-verified" role="status">
      {t("acVerified")}
    </p>
  ) : null;
}

export default function Home() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  return (
    <div className="site">
      <SiteHeader />
      <Suspense>
        <VerifiedNotice />
      </Suspense>
      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <h1>{t("mmLandingTitle")}</h1>
            <p>{t("mmLandingIntro")}</p>
            <div className="landing-ctas">
              <button className="site-btn" onClick={() => setCreating(true)}>
                {t("mmCreateCardButton")}
              </button>
              <Link className="site-btn quiet" href="/print">
                {t("mmPrintCardButton")}
              </Link>
            </div>
          </div>
          <img className="landing-rose" src="/brand/compass-1024.webp" alt="" />
        </section>
        <section className="landing-paths">
          <div className="landing-path">
            <h2>{t("mmCreateCardTitle")}</h2>
            <p>{t("mmCreateCardText")}</p>
            <button
              className="site-btn quiet small"
              onClick={() => setCreating(true)}
            >
              {t("mmCreateCardButton")}
            </button>
          </div>
          <div className="landing-path">
            <h2>{t("mmPrintCardTitle")}</h2>
            <p>{t("mmPrintCardText")}</p>
            <Link className="site-btn quiet small" href="/print">
              {t("mmPrintCardButton")}
            </Link>
          </div>
        </section>
        <p className="landing-foot">{t("mmLandingFooter")}</p>
      </main>
      {creating && <CreateMapModal onClose={() => setCreating(false)} />}
    </div>
  );
}
