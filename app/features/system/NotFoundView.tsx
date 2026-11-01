"use client";
/* eslint-disable @next/next/no-img-element -- static brand artwork */
/**
 * The 404 page: an address that leads nowhere, and the ways back in.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/features/account/ui";
import { useAuth } from "@/features/account/AuthProvider";
import { Flourish } from "@/components/ui/Flourish";

export function NotFoundView() {
  const { t } = useTranslation(),
    { user } = useAuth(),
    path = usePathname();
  return (
    <div className="site system-page with-header">
      <SiteHeader />
      <main className="system-main">
        <p className="system-code" aria-hidden>
          {t("sysNotFoundCode")}
        </p>
        <img
          className="system-rose drifting"
          src="/brand/compass-512.webp"
          alt=""
          width={150}
          height={150}
        />
        <h1 className="fl-title">
          <Flourish text={t("sysNotFoundTitle")} />
        </h1>
        <p className="system-lead">{t("sysNotFoundLead")}</p>
        {path && path !== "/" && (
          <p className="system-address">
            <span>{t("sysNotFoundAddress")}</span>
            <code dir="ltr">{path}</code>
          </p>
        )}
        <nav className="system-actions">
          <Link className="site-btn" href="/">
            {t("sysGoHome")}
          </Link>
          {user ? (
            <Link className="site-btn quiet" href="/maps">
              {t("sysMyMaps")}
            </Link>
          ) : (
            <Link className="site-btn quiet" href="/editor">
              {t("sysCreateMap")}
            </Link>
          )}
          <Link className="site-btn quiet" href="/print">
            {t("sysPrintStudio")}
          </Link>
        </nav>
      </main>
    </div>
  );
}
