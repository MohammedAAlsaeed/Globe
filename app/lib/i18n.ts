import { studioEn, studioAr } from "./locales/studio";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ar } from "./locales/ar";
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...studioEn } },
    ar: { translation: { ...ar, ...studioAr } },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
