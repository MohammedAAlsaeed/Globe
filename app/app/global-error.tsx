"use client";
/**
 * The last line: the site's own frame (the root layout or its providers)
 * failed. It replaces the whole document, so it brings its own <html>, its
 * own few styles and both languages, and depends on nothing that may be
 * what broke (no translations, no account, no stylesheet). Its fonts are
 * the site's own (lib/fonts.ts), built in, so they need nothing either.
 */
import { useEffect, useSyncExternalStore } from "react";
import { reportError } from "@/lib/reportError";
import { LANGUAGE_KEY } from "@/lib/language";
// The site's Arabic fonts (thmanyah): importing adds their @font-face.
import "@/lib/fonts";
import { Flourish } from "@/components/ui/Flourish";
import { plainText } from "@/lib/flourish";

const TEXT = {
  en: {
    title: "The atelier hit an unexpected problem",
    lead: "Something went wrong while loading the site. It has been reported. Your maps are kept on this device and in your account.",
    retry: "Try again",
    reload: "Reload",
    home: "Home",
    reference: "Reference",
  },
  ar: {
    title: "واجه ^المرسَم^ مشكلة غير متوقعة",
    lead: "حدث خطأ أثناء تحميل الموقع، وأُبلغنا به. خرائطك محفوظة على هذا الجهاز وفي حسابك.",
    retry: "أعد المحاولة",
    reload: "أعد التحميل",
    home: "الرئيسية",
    reference: "الرقم المرجعي",
  },
};

/** The site's type (app/fonts.css), written out: this page has no stylesheet. */
const FONTS = {
  en: `--sans: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
    --display: Amiri, Georgia, serif;`,
  ar: `--sans: thmanyahSans, "thmanyahSans Fallback", "Segoe UI", Tahoma, sans-serif;
    --display: thmanyahDisplay, "thmanyahDisplay Fallback", Georgia, serif;`,
};

const CSS = `
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 40%, #1a2a66 0%, #0d1636 65%);
    color: #f3e8cc; font-family: var(--sans); }
  main { max-width: 34rem; padding: 32px 20px; text-align: center; }
  img { width: 120px; height: 120px; transform: rotate(-24deg); opacity: .9;
    filter: drop-shadow(0 10px 28px rgba(0,0,0,.45)); }
  h1 { font-family: var(--display); font-size: 2rem; color: #f1d58a; margin: 18px 0 8px; }
  p { line-height: 1.7; color: #a9b0cf; margin: 0 0 22px; }
  .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  button, a { font: inherit; font-size: 15px; padding: 10px 18px; border-radius: 999px;
    border: 1px solid rgba(217,169,59,.45); color: #f1d58a; background: transparent;
    cursor: pointer; text-decoration: none; }
  .primary { background: #d9a93b; color: #0d1636; border-color: #d9a93b; font-weight: 600; }
  button:focus-visible, a:focus-visible { outline: 2px solid #f1d58a; outline-offset: 2px; }
  small { display: block; margin-top: 22px; color: #a9b0cf; }
  code { color: #f3e8cc; }
  .fl-word { white-space: nowrap; }
`;

/** The language the person chose (a cookie); English while hydrating. */
const readLanguage = (): "en" | "ar" =>
  document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LANGUAGE_KEY}=(en|ar)`),
  )?.[1] === "ar"
    ? "ar"
    : "en";
const noSubscribe = () => () => {};

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const lang = useSyncExternalStore<"en" | "ar">(
    noSubscribe,
    readLanguage,
    () => "en",
  );
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "") || undefined
      : undefined;

  useEffect(() => {
    reportError("global", error, digest);
  }, [error, digest]);

  const t = TEXT[lang];
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <head>
        <title>{plainText(t.title)}</title>
        <meta name="robots" content="noindex" />
        <style
          dangerouslySetInnerHTML={{ __html: `:root{${FONTS[lang]}}${CSS}` }}
        />
      </head>
      <body>
        <main role="alert">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand artwork */}
          <img src="/brand/compass-512.webp" alt="" />
          <h1>
            <Flourish text={t.title} />
          </h1>
          <p>{t.lead}</p>
          <div className="actions">
            <button className="primary" onClick={() => retry()}>
              {t.retry}
            </button>
            <button onClick={() => window.location.reload()}>{t.reload}</button>
            {/* A full page load: the router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
            <a href="/">{t.home}</a>
          </div>
          {digest && (
            <small>
              {t.reference}: <code>{digest}</code>
            </small>
          )}
        </main>
      </body>
    </html>
  );
}
