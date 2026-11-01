import type { Metadata } from "next";
import { cookies } from "next/headers";
import { preconnect } from "react-dom";
import "./globals.css";
import { Providers } from "./providers";
// The site's Arabic fonts (thmanyah): importing adds their @font-face.
import "@/lib/fonts";
import { LANGUAGE_KEY, parseLanguage } from "@/lib/language";
import { IS_PRODUCTION, SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "Al-Idrisi Atelier — Map Maker & Globe Studio",
  DESCRIPTION =
    "Draw fantasy maps in your browser and print them as globe gores. An English and Arabic cartographic atelier.";

export const metadata: Metadata = {
  // Absolute links in shared previews come from the site's own domain
  // (NEXT_PUBLIC_SITE_URL).
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en",
    alternateLocale: ["ar"],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  // Only the customers' site is indexed (see ../lib/site.ts).
  robots: IS_PRODUCTION
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang =
    parseLanguage((await cookies()).get(LANGUAGE_KEY)?.value) ?? "en";
  preconnect("https://fonts.googleapis.com");
  preconnect("https://fonts.gstatic.com", { crossOrigin: "anonymous" });
  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body>
        {/* The English fonts (Amiri, IBM Plex): one shared stylesheet for
        every page. React puts it (and the preconnects above) in the
        document head: the page's <head> is Next's own, built from
        `metadata`. Arabic is thmanyah's, built into the site. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- one shared stylesheet for every page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
          precedence="default"
        />
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
