/**
 * The site's own typefaces: thmanyah (ثمانية) for Arabic.
 *
 *  - thmanyah sans: everything you read (menus, forms, panels, buttons);
 *  - thmanyah serif display: titles (where the site used Amiri).
 *
 * Pages in Arabic (`html[lang="ar"]`) are set in it entirely, its Latin
 * and numbers too, so they match the Arabic around them. Pages in English
 * keep their fonts (IBM Plex Sans Arabic, Amiri) and never download these.
 * The CSS names them in `--ui-sans` and `--ui-display` (app/fonts.css).
 *
 * Licence (assets/fonts/thmanyah/LICENSE.pdf): the files are used exactly as
 * published (no subsetting or other change), built into the site by
 * next/font under hashed names, and served from the site's own origin
 * without CORS headers, so other sites can't use them. They must not be put
 * in public/, offered for download, or embedded in what people export
 * (maps, SVG, PDF): the Text Tool's fonts are a separate, open-licensed set
 * (features/mapmaker/text/fonts.ts).
 */
import localFont from "next/font/local";

// Their names are fixed (`declarations`), so the CSS names them directly:
// "thmanyahSans" and "thmanyahDisplay", each followed by the
// metrics-matched fallback next/font names after it ("… Fallback").
// Importing this module (app/layout.tsx) adds their @font-face rules.
//
// Not preloaded: English pages may never need them, and Arabic pages show
// the (metrics-matched) fallback for the moment they take to arrive.

export const thmanyahSans = localFont({
  src: [
    {
      path: "../assets/fonts/thmanyah/thmanyahsans-Regular.woff2",
      weight: "400",
    },
    {
      path: "../assets/fonts/thmanyah/thmanyahsans-Medium.woff2",
      weight: "500",
    },
    { path: "../assets/fonts/thmanyah/thmanyahsans-Bold.woff2", weight: "700" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-family", value: "thmanyahSans" }],
});
export const thmanyahDisplay = localFont({
  src: [
    {
      path: "../assets/fonts/thmanyah/thmanyahserifdisplay-Regular.woff2",
      weight: "400",
    },
    {
      path: "../assets/fonts/thmanyah/thmanyahserifdisplay-Bold.woff2",
      weight: "700",
    },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "font-family", value: "thmanyahDisplay" }],
});
