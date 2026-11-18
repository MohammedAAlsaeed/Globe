/**
 * The interface's words, loaded by section. Every page gets the common
 * words (lib/i18n.ts: buttons, the account pages, service notices); the
 * rest arrive with the pages that use them — the editor's words with the
 * editor, the dashboard's with the dashboard — instead of every page
 * downloading all of them.
 *
 * A page names its sections with <Locales> (components/Locales.tsx).
 * Both languages of a section arrive together, so switching language never
 * waits. Should a page show a word whose section it forgot to name, every
 * section is loaded (lib/i18n.ts, `missingKeyHandler`) and the page fills
 * in a moment later — and, in development, the console says which word.
 */
import i18n from "../i18n";

type Words = Record<string, string>;
const pair = (en: Words, ar: Words) => ({ en, ar });

const LOADERS = {
  studio: () => import("./studio").then((m) => pair(m.studioEn, m.studioAr)),
  mapmaker: () =>
    Promise.all([import("./mapmaker.en"), import("./mapmaker.ar")]).then(
      ([en, ar]) => pair(en.mapmakerEn, ar.mapmakerAr),
    ),
  stamps: () => import("./stamps").then((m) => pair(m.stampsEn, m.stampsAr)),
  lines: () => import("./lines").then((m) => pair(m.linesEn, m.linesAr)),
  text: () => import("./text").then((m) => pair(m.textEn, m.textAr)),
  shapes: () => import("./shapes").then((m) => pair(m.shapesEn, m.shapesAr)),
  controls: () =>
    import("./controls").then((m) => pair(m.controlsEn, m.controlsAr)),
  shortcuts: () =>
    import("./shortcuts").then((m) => pair(m.shortcutsEn, m.shortcutsAr)),
  printing: () =>
    import("./printing").then((m) => pair(m.printingEn, m.printingAr)),
  admin: () => import("./admin").then((m) => pair(m.adminEn, m.adminAr)),
} satisfies Record<string, () => Promise<{ en: Words; ar: Words }>>;

export type LocaleSection = keyof typeof LOADERS;
export const ALL_SECTIONS = Object.keys(LOADERS) as LocaleSection[];
/** What the map editor (and pages showing its tools) need. */
export const EDITOR_SECTIONS: LocaleSection[] = ALL_SECTIONS.filter(
  (s) => s !== "admin",
);

/** A promise React's `use` reads without suspending once it has settled. */
type Tracked = Promise<void> & { status?: string; value?: void };
function tracked(p: Promise<void>): Tracked {
  const t = p as Tracked;
  t.status = "pending";
  p.then(
    () => {
      t.status = "fulfilled";
      t.value = undefined;
    },
    () => {
      t.status = "rejected";
    },
  );
  return t;
}

const sections = new Map<LocaleSection, Promise<void>>(),
  lists = new Map<string, Tracked>();
function loadSection(s: LocaleSection) {
  let p = sections.get(s);
  if (!p) {
    p = LOADERS[s]().then(({ en, ar }) => {
      // Later sections win a clash, as when every section was spread into
      // one dictionary (`qualityLow`: the studio's).
      i18n.addResourceBundle("en", "translation", en, true, true);
      i18n.addResourceBundle("ar", "translation", ar, true, true);
    });
    // A failed download (offline) may be tried again.
    p.catch(() => sections.delete(s));
    sections.set(s, p);
  }
  return p;
}

/** Loads sections (once each); the same promise for the same list. */
export function loadLocales(list: readonly LocaleSection[]): Tracked {
  const key = [...list].sort().join(",");
  let p = lists.get(key);
  if (!p || p.status === "rejected") {
    p = tracked(Promise.all(list.map(loadSection)).then(() => undefined));
    lists.set(key, p);
  }
  return p;
}
