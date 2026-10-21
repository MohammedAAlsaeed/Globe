/**
 * The interface language, remembered per browser. It is kept in a cookie so
 * the server renders pages in the right language from the first paint (no
 * flash, no hydration mismatch), and in localStorage for older pages that
 * read it there.
 */
export type Language = "en" | "ar";

export const LANGUAGE_KEY = "atelier-language";

export function parseLanguage(
  value: string | null | undefined,
): Language | null {
  return value === "ar" || value === "en" ? value : null;
}

export function rememberLanguage(lang: Language) {
  document.cookie = `${LANGUAGE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {}
}
