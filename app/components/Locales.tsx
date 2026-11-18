"use client";
/**
 * Waits for a page's words (see lib/locales/sections.ts) before showing it.
 * On the server the page is rendered once they are in; in the browser the
 * server's page stays on screen while they download, then comes alive — so
 * no one ever sees a bare translation key.
 */
import { use, type ReactNode } from "react";
import { loadLocales, type LocaleSection } from "@/lib/locales/sections";

export function Locales({
  sections,
  children,
}: {
  sections: readonly LocaleSection[];
  children: ReactNode;
}) {
  use(loadLocales(sections) as Promise<void>);
  return children;
}
