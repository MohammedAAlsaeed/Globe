"use client";
/**
 * App-wide client providers: the interface language, the signed-in user,
 * and whether the server can be used right now.
 *
 * The language comes from the server (a cookie), so the first render
 * already matches what the browser shows. Each page load gets its own i18n
 * instance, so server renders for different visitors never share one.
 */
import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../lib/i18n";
import {
  type Language,
  LANGUAGE_KEY,
  parseLanguage,
  rememberLanguage,
} from "@/lib/language";
import { AuthProvider } from "@/features/account/AuthProvider";
import { ControlsSync } from "@/features/mapmaker/controlsSync";
import { ServiceStatusProvider } from "@/features/system/ServiceStatus";

export function Providers({
  lang,
  children,
}: {
  lang: Language;
  children: ReactNode;
}) {
  const [instance] = useState(() => i18n.cloneInstance({ lng: lang }));

  useEffect(() => {
    // Browsers that chose a language before it moved to a cookie.
    if (document.cookie.includes(`${LANGUAGE_KEY}=`)) return;
    let saved: Language | null = null;
    try {
      saved = parseLanguage(localStorage.getItem(LANGUAGE_KEY));
    } catch {}
    if (!saved) return;
    rememberLanguage(saved);
    if (saved !== instance.language) void instance.changeLanguage(saved);
  }, [instance]);

  useEffect(() => {
    const sync = (lng: string) => {
      document.documentElement.lang = lng;
      document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
    };
    instance.on("languageChanged", sync);
    return () => instance.off("languageChanged", sync);
  }, [instance]);

  return (
    <I18nextProvider i18n={instance}>
      <AuthProvider>
        <ControlsSync />
        {/* Offline / maintenance notices and screen (features/system). */}
        <ServiceStatusProvider>{children}</ServiceStatusProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}
