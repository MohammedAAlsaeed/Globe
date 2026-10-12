import { studioEn, studioAr } from "./locales/studio";
import { mapmakerEn } from "./locales/mapmaker.en";
import { mapmakerAr } from "./locales/mapmaker.ar";
import { accountEn, accountAr } from "./locales/account";
import { stampsEn, stampsAr } from "./locales/stamps";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ar } from "./locales/ar";
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...studioEn, ...mapmakerEn, ...accountEn, ...stampsEn } },
    ar: { translation: { ...ar, ...studioAr, ...mapmakerAr, ...accountAr, ...stampsAr } },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
