import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import {LANGUAGE_KEY, parseLanguage} from "@/lib/language";

export const metadata: Metadata = {
  title: "Al-Idrisi Atelier — Map Maker & Globe Studio",
  description:
    "Draw fantasy maps in your browser and print them as globe gores. An English and Arabic cartographic atelier.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = parseLanguage((await cookies()).get(LANGUAGE_KEY)?.value) ?? "en";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- one shared stylesheet for every page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
