"use client";
/**
 * Shared pieces of the site outside the editor: the compass loader, the
 * header with the account menu, and turning API errors into messages.
 */
/* eslint-disable @next/next/no-img-element -- static brand artwork */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthProvider";
import { ApiError, NetworkError } from "@/lib/api/client";
import { rememberLanguage } from "@/lib/language";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** The compass rose, swinging round to north while something loads. */
export function CompassLoader({
  label,
  size = 120,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div
      className="compass-loader"
      role="status"
      aria-live="polite"
      style={{ ["--size" as string]: `${size}px` }}
    >
      <img src="/brand/compass-512.webp" alt="" width={size} height={size} />
      {label && <span>{label}</span>}
    </div>
  );
}

/** Full-screen loading state, for pages waiting on their first data. */
export function CompassScreen({ label }: { label?: string }) {
  return (
    <div className="compass-screen">
      <CompassLoader label={label} size={132} />
    </div>
  );
}

/** A friendly message for any error a request can throw. */
export function errorMessage(t: T, e: unknown): string {
  if (e instanceof NetworkError) return t("acErrorNetwork");
  if (e instanceof ApiError) {
    if (e.status === 429) return t("acErrorTooMany");
    if (e.code === "account_suspended") return t("acSuspended");
    if (e.code === "session_ended") return t("acSessionEnded");
    if (
      e.code === "two_factor_required" ||
      e.code === "two_factor_setup_required"
    )
      return t("acNeedTwoFactor");
    if (e.status === 422 && e.message)
      return Object.values(e.errors)[0]?.[0] ?? e.message;
  }
  return t("acErrorGeneric");
}

/** Where to go after signing in: a same-site path from ?next=, else My maps. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/maps";
}

export function SiteHeader() {
  const { t, i18n } = useTranslation(),
    { user, signOut } = useAuth(),
    path = usePathname(),
    router = useRouter(),
    [menu, setMenu] = useState(false),
    menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  function toggleLanguage() {
    const lang = i18n.language === "ar" ? "en" : "ar";
    void i18n.changeLanguage(lang);
    rememberLanguage(lang);
  }

  return (
    <header className="site-header">
      <Link href="/" className="site-brand">
        <img src="/brand/compass-256.webp" alt="" width={38} height={38} />
        <span className="site-brand-name">{t("acBrand")}</span>
      </Link>
      <nav className="site-nav">
        <Link href="/maps" aria-current={path === "/maps" ? "page" : undefined}>
          {t("acMyMaps")}
        </Link>
        <Link href="/print" className="site-nav-secondary">
          {t("acPrintStudio")}
        </Link>
      </nav>
      <div className="site-header-end">
        <button className="site-lang" onClick={toggleLanguage}>
          {t("acLanguageToggle")}
        </button>
        {user ? (
          <div className="site-account" ref={menuRef}>
            <button
              className="site-account-button"
              aria-expanded={menu}
              aria-haspopup="menu"
              onClick={() => setMenu((v) => !v)}
            >
              <span className="site-plan">{t(`acPlan_${user.plan.code}`)}</span>
              <span className="site-avatar">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  user.name.slice(0, 1).toUpperCase()
                )}
              </span>
            </button>
            {menu && (
              <div className="site-menu" role="menu">
                <div className="site-menu-who">
                  <b>{user.name}</b>
                  <small>{user.email}</small>
                </div>
                <Link
                  href="/maps"
                  role="menuitem"
                  onClick={() => setMenu(false)}
                >
                  {t("acMyMaps")}
                </Link>
                <Link
                  href="/library"
                  role="menuitem"
                  onClick={() => setMenu(false)}
                >
                  {t("stCatCustom")}
                </Link>
                <Link
                  href="/settings/controls"
                  role="menuitem"
                  onClick={() => setMenu(false)}
                >
                  {t("ctTitle")}
                </Link>
                {user.permissions.length > 0 && (
                  <Link
                    href="/admin"
                    role="menuitem"
                    onClick={() => setMenu(false)}
                  >
                    {t("acAdminPanel")}
                  </Link>
                )}
                <button
                  role="menuitem"
                  onClick={async () => {
                    setMenu(false);
                    await signOut();
                    router.push("/");
                  }}
                >
                  {t("acSignOut")}
                </button>
              </div>
            )}
          </div>
        ) : user === null ? (
          <>
            <Link
              href={`/login?next=${encodeURIComponent(path || "/maps")}`}
              className="site-btn quiet small"
            >
              {t("acSignIn")}
            </Link>
            <Link href="/register" className="site-btn small site-register">
              {t("acCreateAccount")}
            </Link>
          </>
        ) : null}
      </div>
    </header>
  );
}

/** The "G" mark for Google sign-in buttons (Google's brand colours). */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
