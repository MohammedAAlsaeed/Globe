/**
 * The Text Tool's font library: every font the atelier ships, and the
 * *font profiles* people pick from (a matched Arabic + Latin pairing, plus
 * fallbacks for every other script).
 *
 * Fonts are self-hosted from `public/fonts/<id>/` — unmodified files from
 * the Google Fonts repository, all under the SIL Open Font License (each
 * folder keeps its OFL.txt). Nothing is loaded until a text uses it.
 *
 * Measured facts about each file (the scripts it really covers, its
 * OpenType features, variable axes, version and size) are not typed by hand:
 * `npm run fonts:catalog` reads the files and writes ./fontInfo.generated.ts.
 *
 * East Asian fonts are too large to ship whole (10–25 MB each); they come
 * from Google Fonts' stylesheet in small Unicode slices (`source: "web"`) and
 * are drawn by the browser, a glyph cluster at a time (see ./shape).
 */

/** How the library groups fonts (the picker's sections). */
export type FontCategory = "ancient" | "classical" | "arabicManuscript" | "arabicKufi" | "fantasy" | "multilingual" | "world";

export const FONT_CATEGORIES: FontCategory[] = ["arabicManuscript", "arabicKufi", "ancient", "classical", "fantasy", "multilingual", "world"];

/** The writing systems the engine picks fonts for. */
export type ScriptSlot = "arabic" | "latin" | "greek" | "cyrillic" | "hebrew" | "devanagari" | "cjk";

export const SCRIPT_SLOTS: ScriptSlot[] = ["arabic", "latin", "greek", "cyrillic", "hebrew", "devanagari", "cjk"];

export interface FontFile {
  /** Under public/ ("/fonts/amiri/Amiri-Regular.ttf"). */
  path: string;
  /** A static weight, or a variable font's [min, max] `wght` range. */
  weight: number | [number, number];
  italic: boolean;
}

export interface FontDefinition {
  id: string;
  /** The family's own name (shown in its own letters in the picker). */
  family: string;
  /** Its Arabic name, when it has a known one. */
  familyAr?: string;
  category: FontCategory;
  /** Civilizations and eras it suits (searchable). */
  tags: string[];
  /** "file": shipped and shaped by HarfBuzz. "web": East Asian, drawn by the browser. */
  source: "file" | "web";
  files: FontFile[];
  /** Web fonts: the CSS family and the Google Fonts css2 `family=` value. */
  css?: { family: string; query: string };
  /** Where the font comes from (its project), and its license. */
  sourceUrl: string;
  license: "OFL-1.1";
  /** Fonts to try for letters this one lacks (before the profile's own). */
  fallback: string[];
  /** Best for small labels, big titles, or both. */
  suits: "small" | "titles" | "both";
}

const ofl = "OFL-1.1" as const;
const file = (id: string, name: string, weight: number | [number, number] = 400, italic = false): FontFile => ({ path: `/fonts/${id}/${name}`, weight, italic });

export const FONTS: FontDefinition[] = [
  // ---- Arabic: naskh, manuscript and Persian styles ----
  {
    id: "amiri",
    family: "Amiri",
    familyAr: "أميري",
    category: "arabicManuscript",
    tags: ["naskh", "bulaq", "islamic", "andalusian", "ottoman", "manuscript", "classical"],
    source: "file",
    files: [file("amiri", "Amiri-Regular.ttf"), file("amiri", "Amiri-Bold.ttf", 700), file("amiri", "Amiri-Italic.ttf", 400, true), file("amiri", "Amiri-BoldItalic.ttf", 700, true)],
    sourceUrl: "https://github.com/aliftype/amiri",
    license: ofl,
    fallback: ["noto-naskh-arabic"],
    suits: "both",
  },
  {
    id: "noto-naskh-arabic",
    family: "Noto Naskh Arabic",
    familyAr: "نوتو نسخ",
    category: "arabicManuscript",
    tags: ["naskh", "persian", "urdu", "readable", "modern"],
    source: "file",
    files: [file("noto-naskh-arabic", "NotoNaskhArabic-VF.ttf", [400, 700])],
    sourceUrl: "https://github.com/notofonts/arabic",
    license: ofl,
    fallback: ["amiri"],
    suits: "both",
  },
  {
    id: "scheherazade-new",
    family: "Scheherazade New",
    familyAr: "شهرزاد",
    category: "arabicManuscript",
    tags: ["naskh", "traditional", "african", "manuscript", "scholarly"],
    source: "file",
    files: [file("scheherazade-new", "ScheherazadeNew-Regular.ttf"), file("scheherazade-new", "ScheherazadeNew-Bold.ttf", 700)],
    sourceUrl: "https://software.sil.org/scheherazade/",
    license: ofl,
    fallback: ["noto-naskh-arabic"],
    suits: "both",
  },
  {
    id: "lateef",
    family: "Lateef",
    familyAr: "لطيف",
    category: "arabicManuscript",
    tags: ["naskh", "sindhi", "south asia", "manuscript"],
    source: "file",
    files: [file("lateef", "Lateef-Regular.ttf"), file("lateef", "Lateef-Bold.ttf", 700)],
    sourceUrl: "https://software.sil.org/lateef/",
    license: ofl,
    fallback: ["noto-naskh-arabic"],
    suits: "both",
  },
  {
    id: "markazi-text",
    family: "Markazi Text",
    familyAr: "مركزي",
    category: "arabicManuscript",
    tags: ["naskh", "bilingual", "scholarly", "andalusian", "book"],
    source: "file",
    files: [file("markazi-text", "MarkaziText-VF.ttf", [400, 700])],
    sourceUrl: "https://github.com/BornaIz/markazitext",
    license: ofl,
    fallback: ["noto-naskh-arabic"],
    suits: "both",
  },
  {
    id: "aref-ruqaa",
    family: "Aref Ruqaa",
    familyAr: "عارف رقعة",
    category: "arabicManuscript",
    tags: ["ruqaa", "handwritten", "ottoman", "notes", "letters"],
    source: "file",
    files: [file("aref-ruqaa", "ArefRuqaa-Regular.ttf"), file("aref-ruqaa", "ArefRuqaa-Bold.ttf", 700)],
    sourceUrl: "https://github.com/alif-type/aref-ruqaa",
    license: ofl,
    fallback: ["amiri", "noto-naskh-arabic"],
    suits: "both",
  },
  {
    id: "noto-nastaliq-urdu",
    family: "Noto Nastaliq Urdu",
    familyAr: "نوتو نستعليق",
    category: "arabicManuscript",
    tags: ["nastaliq", "persian", "urdu", "mughal", "safavid", "miniature"],
    source: "file",
    files: [file("noto-nastaliq-urdu", "NotoNastaliqUrdu-VF.ttf", [400, 700])],
    sourceUrl: "https://github.com/notofonts/nastaliq",
    license: ofl,
    fallback: ["noto-naskh-arabic"],
    suits: "titles",
  },
  // ---- Arabic: kufic and geometric ----
  {
    id: "noto-kufi-arabic",
    family: "Noto Kufi Arabic",
    familyAr: "نوتو كوفي",
    category: "arabicKufi",
    tags: ["kufi", "geometric", "empire", "titles"],
    source: "file",
    files: [file("noto-kufi-arabic", "NotoKufiArabic-VF.ttf", [100, 900])],
    sourceUrl: "https://github.com/notofonts/arabic",
    license: ofl,
    fallback: ["noto-naskh-arabic"],
    suits: "both",
  },
  {
    id: "reem-kufi",
    family: "Reem Kufi",
    familyAr: "ريم كوفي",
    category: "arabicKufi",
    tags: ["kufi", "fatimid", "geometric", "inscription"],
    source: "file",
    files: [file("reem-kufi", "ReemKufi-VF.ttf", [400, 700])],
    sourceUrl: "https://github.com/aliftype/reem-kufi",
    license: ofl,
    fallback: ["noto-kufi-arabic", "noto-naskh-arabic"],
    suits: "titles",
  },
  {
    id: "kufam",
    family: "Kufam",
    familyAr: "كوفام",
    category: "arabicKufi",
    tags: ["kufi", "bilingual", "display", "desert"],
    source: "file",
    files: [file("kufam", "Kufam-VF.ttf", [400, 900])],
    sourceUrl: "https://github.com/originaltype/kufam",
    license: ofl,
    fallback: ["noto-kufi-arabic"],
    suits: "titles",
  },
  // ---- Ancient & historical Latin ----
  {
    id: "cinzel",
    family: "Cinzel",
    category: "ancient",
    tags: ["roman", "inscription", "classical antiquity", "empire", "capitals"],
    source: "file",
    files: [file("cinzel", "Cinzel-VF.ttf", [400, 900])],
    sourceUrl: "https://github.com/NDISCOVER/Cinzel",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "titles",
  },
  {
    id: "cinzel-decorative",
    family: "Cinzel Decorative",
    category: "ancient",
    tags: ["roman", "decorative", "kingdom", "capitals"],
    source: "file",
    files: [file("cinzel-decorative", "CinzelDecorative-Regular.ttf"), file("cinzel-decorative", "CinzelDecorative-Bold.ttf", 700)],
    sourceUrl: "https://github.com/NDISCOVER/Cinzel",
    license: ofl,
    fallback: ["cinzel", "noto-serif"],
    suits: "titles",
  },
  {
    id: "im-fell-english",
    family: "IM Fell English",
    category: "ancient",
    tags: ["17th century", "english", "printing", "old maps", "notes"],
    source: "file",
    files: [file("im-fell-english", "IMFeENrm28P.ttf"), file("im-fell-english", "IMFeENit28P.ttf", 400, true)],
    sourceUrl: "https://iginomarini.com/fell/",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "both",
  },
  {
    id: "im-fell-english-sc",
    family: "IM Fell English SC",
    category: "ancient",
    tags: ["17th century", "small capitals", "old maps", "regions"],
    source: "file",
    files: [file("im-fell-english-sc", "IMFeENsc28P.ttf")],
    sourceUrl: "https://iginomarini.com/fell/",
    license: ofl,
    fallback: ["im-fell-english", "noto-serif"],
    suits: "both",
  },
  // ---- Classical Latin (book faces) ----
  {
    id: "eb-garamond",
    family: "EB Garamond",
    category: "classical",
    tags: ["renaissance", "garamont", "16th century", "european", "book", "greek", "cyrillic"],
    source: "file",
    files: [file("eb-garamond", "EBGaramond-VF.ttf", [400, 800]), file("eb-garamond", "EBGaramond-Italic-VF.ttf", [400, 800], true)],
    sourceUrl: "https://github.com/octaviopardo/EBGaramond12",
    license: ofl,
    fallback: ["noto-serif"],
    suits: "both",
  },
  {
    id: "cormorant-garamond",
    family: "Cormorant Garamond",
    category: "classical",
    tags: ["garamond", "elegant", "seas", "islands", "display"],
    source: "file",
    files: [file("cormorant-garamond", "CormorantGaramond-VF.ttf", [300, 700]), file("cormorant-garamond", "CormorantGaramond-Italic-VF.ttf", [300, 700], true)],
    sourceUrl: "https://github.com/CatharsisFonts/Cormorant",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "titles",
  },
  // ---- Fantasy & medieval ----
  {
    id: "unifraktur-maguntia",
    family: "UnifrakturMaguntia",
    category: "fantasy",
    tags: ["blackletter", "fraktur", "gothic", "medieval", "german"],
    source: "file",
    files: [file("unifraktur-maguntia", "UnifrakturMaguntia-Book.ttf")],
    sourceUrl: "http://unifraktur.sourceforge.net/maguntia.html",
    license: ofl,
    fallback: ["unifraktur-cook", "eb-garamond"],
    suits: "titles",
  },
  {
    id: "unifraktur-cook",
    family: "UnifrakturCook",
    category: "fantasy",
    tags: ["blackletter", "textura", "gothic", "medieval", "titles"],
    source: "file",
    files: [file("unifraktur-cook", "UnifrakturCook-Bold.ttf", 700)],
    sourceUrl: "http://unifraktur.sourceforge.net/cook.html",
    license: ofl,
    fallback: ["unifraktur-maguntia", "eb-garamond"],
    suits: "titles",
  },
  {
    id: "uncial-antiqua",
    family: "Uncial Antiqua",
    category: "fantasy",
    tags: ["uncial", "celtic", "insular", "early medieval", "legends"],
    source: "file",
    files: [file("uncial-antiqua", "UncialAntiqua-Regular.ttf")],
    sourceUrl: "https://fonts.google.com/specimen/Uncial+Antiqua",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "titles",
  },
  {
    id: "medieval-sharp",
    family: "MedievalSharp",
    category: "fantasy",
    tags: ["medieval", "fantasy", "hand-lettered", "rpg"],
    source: "file",
    files: [file("medieval-sharp", "MedievalSharp.ttf")],
    sourceUrl: "https://fonts.google.com/specimen/MedievalSharp",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "both",
  },
  {
    id: "almendra",
    family: "Almendra",
    category: "fantasy",
    tags: ["calligraphic", "fantasy", "enchanted", "gothic"],
    source: "file",
    files: [file("almendra", "Almendra-Regular.ttf"), file("almendra", "Almendra-Bold.ttf", 700)],
    sourceUrl: "https://fonts.google.com/specimen/Almendra",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "both",
  },
  {
    id: "pirata-one",
    family: "Pirata One",
    category: "fantasy",
    tags: ["pirate", "sea charts", "blackletter", "display"],
    source: "file",
    files: [file("pirata-one", "PirataOne-Regular.ttf")],
    sourceUrl: "https://fonts.google.com/specimen/Pirata+One",
    license: ofl,
    fallback: ["eb-garamond", "noto-serif"],
    suits: "titles",
  },
  // ---- Multilingual and world scripts ----
  {
    id: "noto-serif",
    family: "Noto Serif",
    category: "multilingual",
    tags: ["latin", "greek", "cyrillic", "vietnamese", "readable", "universal"],
    source: "file",
    files: [file("noto-serif", "NotoSerif-VF.ttf", [100, 900]), file("noto-serif", "NotoSerif-Italic-VF.ttf", [100, 900], true)],
    sourceUrl: "https://github.com/notofonts/latin-greek-cyrillic",
    license: ofl,
    fallback: [],
    suits: "both",
  },
  {
    id: "noto-serif-hebrew",
    family: "Noto Serif Hebrew",
    category: "world",
    tags: ["hebrew", "levant", "biblical"],
    source: "file",
    files: [file("noto-serif-hebrew", "NotoSerifHebrew-VF.ttf", [100, 900])],
    sourceUrl: "https://github.com/notofonts/hebrew",
    license: ofl,
    fallback: ["noto-serif"],
    suits: "both",
  },
  {
    id: "noto-serif-devanagari",
    family: "Noto Serif Devanagari",
    category: "world",
    tags: ["hindi", "sanskrit", "devanagari", "india", "mughal"],
    source: "file",
    files: [file("noto-serif-devanagari", "NotoSerifDevanagari-VF.ttf", [100, 900])],
    sourceUrl: "https://github.com/notofonts/devanagari",
    license: ofl,
    fallback: ["noto-serif"],
    suits: "both",
  },
  ...(
    [
      ["noto-serif-jp", "Noto Serif JP", "日本", ["japanese", "kana", "kanji", "edo"]],
      ["noto-serif-sc", "Noto Serif SC", "中文", ["chinese", "simplified", "han"]],
      ["noto-serif-tc", "Noto Serif TC", "中文", ["chinese", "traditional", "han", "tang", "song"]],
      ["noto-serif-kr", "Noto Serif KR", "한국", ["korean", "hangul", "joseon"]],
    ] as const
  ).map(
    ([id, family, , tags]): FontDefinition => ({
      id,
      family,
      category: "world",
      tags: [...tags, "east asia"],
      source: "web",
      files: [],
      css: { family, query: `${family.replace(/ /g, "+")}:wght@400;700` },
      sourceUrl: "https://github.com/notofonts/noto-cjk",
      license: ofl,
      fallback: [],
      suits: "both",
    }),
  ),
];

const BY_ID = new Map(FONTS.map((f) => [f.id, f]));
export function fontDef(id: string | null | undefined): FontDefinition | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/**
 * The fonts tried for a script when neither the text's font nor its profile
 * has the letters (the last resort before the browser's own fonts).
 */
export const SCRIPT_FALLBACK: Record<ScriptSlot, string[]> = {
  arabic: ["noto-naskh-arabic", "amiri", "scheherazade-new"],
  latin: ["noto-serif", "eb-garamond"],
  greek: ["noto-serif", "eb-garamond"],
  cyrillic: ["noto-serif", "eb-garamond"],
  hebrew: ["noto-serif-hebrew"],
  devanagari: ["noto-serif-devanagari"],
  cjk: ["noto-serif-sc", "noto-serif-jp", "noto-serif-tc", "noto-serif-kr"],
};

// ---- Font profiles -------------------------------------------------------------------------

/** A profile's font for one script, optionally nudged so mixed scripts match. */
export interface ProfileSlot {
  font: string;
  /** Size relative to the text's size (Arabic often needs a little more to sit evenly with Latin). */
  scale?: number;
  /** Raises (+) or lowers the baseline, in em. */
  shift?: number;
}

export interface FontProfile {
  id: string;
  /** i18n keys: txProfile_<id>, txProfileHint_<id>. */
  slots: Partial<Record<ScriptSlot, ProfileSlot>>;
  tags: string[];
}

/**
 * Matched pairings: one Arabic and one Latin face chosen to sit together,
 * plus the world-script fallbacks every profile shares. These pairings are
 * a first visual proposal; the scale/shift values were set by eye on the
 * test maps and are easy to adjust here.
 */
export const FONT_PROFILES: FontProfile[] = [
  { id: "universal-classical", slots: { arabic: { font: "noto-naskh-arabic", scale: 1.06 }, latin: { font: "noto-serif" } }, tags: ["default", "readable"] },
  { id: "ancient-manuscript", slots: { arabic: { font: "amiri", scale: 1.12 }, latin: { font: "eb-garamond" } }, tags: ["manuscript", "islamic", "renaissance"] },
  { id: "royal-kingdom", slots: { arabic: { font: "noto-naskh-arabic", scale: 1.05 }, latin: { font: "cinzel" } }, tags: ["kingdom", "empire", "titles"] },
  { id: "old-atlas", slots: { arabic: { font: "amiri", scale: 1.04 }, latin: { font: "cormorant-garamond" } }, tags: ["atlas", "seas", "elegant"] },
  { id: "geometric-empire", slots: { arabic: { font: "noto-kufi-arabic", scale: 0.92 }, latin: { font: "cinzel" } }, tags: ["kufi", "empire", "geometric"] },
  { id: "historical-notes", slots: { arabic: { font: "aref-ruqaa", scale: 1.05 }, latin: { font: "im-fell-english" } }, tags: ["notes", "ruqaa", "handwritten"] },
  { id: "andalusian-scholar", slots: { arabic: { font: "markazi-text", scale: 1.04 }, latin: { font: "markazi-text" } }, tags: ["andalusian", "bilingual", "scholarly"] },
  { id: "fatimid-kufic", slots: { arabic: { font: "reem-kufi" }, latin: { font: "cinzel-decorative", scale: 0.9 } }, tags: ["fatimid", "kufi", "inscription"] },
  { id: "persian-miniature", slots: { arabic: { font: "noto-nastaliq-urdu", scale: 0.92 }, latin: { font: "cormorant-garamond" } }, tags: ["persian", "nastaliq", "mughal", "safavid"] },
  { id: "scholarly-naskh", slots: { arabic: { font: "scheherazade-new", scale: 1.04 }, latin: { font: "eb-garamond" } }, tags: ["scholarly", "naskh", "book"] },
  { id: "explorers-chart", slots: { arabic: { font: "noto-naskh-arabic", scale: 1.05 }, latin: { font: "im-fell-english-sc" } }, tags: ["explorer", "17th century", "charts"] },
  { id: "gothic-chronicle", slots: { arabic: { font: "amiri", scale: 1.08 }, latin: { font: "unifraktur-maguntia" } }, tags: ["gothic", "blackletter", "medieval"] },
  { id: "celtic-legends", slots: { arabic: { font: "lateef", scale: 1.2 }, latin: { font: "uncial-antiqua" } }, tags: ["celtic", "uncial", "legends"] },
  { id: "pirate-charts", slots: { arabic: { font: "aref-ruqaa", scale: 1.05 }, latin: { font: "pirata-one" } }, tags: ["pirate", "sea", "charts"] },
  { id: "enchanted-realm", slots: { arabic: { font: "kufam", scale: 0.95 }, latin: { font: "almendra" } }, tags: ["fantasy", "enchanted"] },
  { id: "dark-ages", slots: { arabic: { font: "noto-kufi-arabic", scale: 0.92 }, latin: { font: "medieval-sharp" } }, tags: ["fantasy", "medieval", "rpg"] },
];

/** Every profile shares these for the scripts it doesn't name. */
const WORLD_SLOTS: Partial<Record<ScriptSlot, ProfileSlot>> = {
  greek: { font: "noto-serif" },
  cyrillic: { font: "noto-serif" },
  hebrew: { font: "noto-serif-hebrew" },
  devanagari: { font: "noto-serif-devanagari" },
  cjk: { font: "noto-serif-sc" },
};

export const DEFAULT_PROFILE = "universal-classical";

const PROFILES_BY_ID = new Map(FONT_PROFILES.map((p) => [p.id, p]));
export function fontProfile(id: string | null | undefined): FontProfile {
  return (id && PROFILES_BY_ID.get(id)) || PROFILES_BY_ID.get(DEFAULT_PROFILE)!;
}
/** A profile's font for a script (the shared world fonts where it names none). */
export function profileSlot(profile: FontProfile, script: ScriptSlot): ProfileSlot | undefined {
  return profile.slots[script] ?? WORLD_SLOTS[script];
}
