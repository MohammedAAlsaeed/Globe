import { studioEn, studioAr } from "./locales/studio";
import { mapmakerEn } from "./locales/mapmaker.en";
import { mapmakerAr } from "./locales/mapmaker.ar";
import { accountEn, accountAr } from "./locales/account";
import { stampsEn, stampsAr } from "./locales/stamps";
import { linesEn, linesAr } from "./locales/lines";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ar } from "./locales/ar";
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...studioEn, ...mapmakerEn, ...accountEn, ...stampsEn, ...linesEn } },
    ar: { translation: { ...ar, ...studioAr, ...mapmakerAr, ...accountAr, ...stampsAr, ...linesAr } },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
