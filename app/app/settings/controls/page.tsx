"use client";
/**
 * Controls & shortcuts as a page of its own (the editor opens the same
 * settings in a dialog: "?" or the Edit menu).
 */
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/features/account/ui";
import { ControlsSettings } from "@/features/mapmaker/components/ControlsSettings";
import "../../../features/mapmaker/mapmaker.css";
import { Flourish } from "@/components/ui/Flourish";

export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="site">
      <SiteHeader />
      <main className="mm-ct-page">
        <div className="mm-ct-page-head">
          <div>
            <h1 className="fl-title">
              <Flourish text={t("ctPageTitle")} />
            </h1>
            <p>{t("ctSubtitle")}</p>
          </div>
          <Link className="site-btn quiet" href="/editor">
            {t("ctBackToEditor")}
          </Link>
        </div>
        <div className="mm-ct-card">
          <ControlsSettings t={t} />
        </div>
      </main>
    </div>
  );
}
