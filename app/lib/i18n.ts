import { studioEn, studioAr } from "./locales/studio";
import { mapmakerEn } from "./locales/mapmaker.en";
import { mapmakerAr } from "./locales/mapmaker.ar";
import { accountEn, accountAr } from "./locales/account";
import { stampsEn, stampsAr } from "./locales/stamps";
import { linesEn, linesAr } from "./locales/lines";
import { shortcutsEn, shortcutsAr } from "./locales/shortcuts";
import { printingEn, printingAr } from "./locales/printing";
import { textEn, textAr } from "./locales/text";
import { controlsEn, controlsAr } from "./locales/controls";
import { shapesEn, shapesAr } from "./locales/shapes";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ar } from "./locales/ar";
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        ...en,
        ...studioEn,
        ...mapmakerEn,
        ...accountEn,
        ...stampsEn,
        ...linesEn,
        ...shortcutsEn,
        ...printingEn,
        ...textEn,
        ...controlsEn,
        ...shapesEn,
      },
    },
    ar: {
      translation: {
        ...ar,
        ...studioAr,
        ...mapmakerAr,
        ...accountAr,
        ...stampsAr,
        ...linesAr,
        ...shortcutsAr,
        ...printingAr,
        ...textAr,
        ...controlsAr,
        ...shapesAr,
      },
    },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
