/**
 * The interface's words in English and Arabic (react-i18next). The common
 * words are here; the rest load by section with the pages that need them
 * (see ./locales/sections.ts).
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ar } from "./locales/ar";
import { accountEn, accountAr } from "./locales/account";
import { systemEn, systemAr } from "./locales/system";

let loadingAll = false;
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...accountEn, ...systemEn } },
    ar: { translation: { ...ar, ...accountAr, ...systemAr } },
  },
  partialBundledLanguages: true,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  // Pages show words from sections that arrive later: re-render then.
  react: { bindI18nStore: "added" },
  // A word from a section the page didn't name: load every section.
  saveMissing: true,
  missingKeyHandler: (_lngs, _ns, key) => {
    if (process.env.NODE_ENV !== "production")
      console.warn(`[i18n] "${key}" is in a section this page doesn't load`);
    if (loadingAll) return;
    loadingAll = true;
    void import("./locales/sections").then((m) =>
      m.loadLocales(m.ALL_SECTIONS),
    );
  },
});
export default i18n;
