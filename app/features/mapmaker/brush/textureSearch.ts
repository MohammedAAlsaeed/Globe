/**
 * Searching the Texture Catalog — in English and Arabic.
 *
 * A query matches an item when every word of the query matches the start of
 * some word the item is known by (its names in both languages, pack, style,
 * category and tags), in any order. Words are compared in a plain form:
 *
 *   English  lower case; plural and -ed / -ing endings dropped
 *            ("Dunes" ~ "dune", "cracked" ~ "crack", "tiles" ~ "tile")
 *   Arabic   no diacritics or tatweel; أ إ آ ٱ → ا, ة → ه, ى → ي, ؤ → و,
 *            ئ → ي; the article ال and common suffixes dropped
 *            ("الأرض" ~ "ارض", "رمال" ~ "رمال", "الصخور" ~ "صخور")
 *
 * Pure (no DOM), so the same code runs in the catalog and in the tests.
 */

const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** The plain form of one word (see above). */
export function plainWord(word: string): string {
  let w = word.toLowerCase().normalize("NFKC").replace(ARABIC_MARKS, "");
  if (/[؀-ۿ]/.test(w)) {
    w = w
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي");
    // The article (also after و / ب / ف / ك / ل).
    w = w.replace(/^[وبفكل]?ال(?=..)/, "");
    // Sound plurals and the dual.
    if (w.length > 4) w = w.replace(/(?:ات|ون|ين|ان)$/, "");
    return w;
  }
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(?:ches|shes|sses|xes|zes)$/.test(w))
    return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  return w;
}

/** The plain words of a text. */
export function plainWords(text: string): string[] {
  return text
    .split(/[\s_\-.,/·:;()[\]{}'"«»،؛]+/u)
    .filter(Boolean)
    .map(plainWord)
    .filter(Boolean);
}

/** What an item is searched by: each field is a list of texts. */
export interface SearchFields {
  /** Its names (every language): matches here rank first. */
  names: string[];
  /** Pack, style, creator, category and tags. */
  other: string[];
}
export interface SearchIndex {
  names: string[];
  all: string[];
}

export function indexFor(fields: SearchFields): SearchIndex {
  const names = [...new Set(fields.names.flatMap(plainWords))],
    other = fields.other.flatMap(plainWords);
  return { names, all: [...new Set([...names, ...other])] };
}

/**
 * How well a query matches: 0 = no match; higher is better (every query
 * word found among the names beats one found only in tags). An empty query
 * matches everything with 1.
 */
export function matchScore(index: SearchIndex, query: string): number {
  const words = plainWords(query);
  if (!words.length) return 1;
  let score = 0;
  for (const q of words) {
    const exactName = index.names.includes(q),
      inName = exactName || index.names.some((w) => w.startsWith(q));
    if (inName) {
      score += exactName ? 4 : 3;
      continue;
    }
    if (index.all.includes(q)) score += 2;
    else if (index.all.some((w) => w.startsWith(q))) score += 1;
    else return 0;
  }
  return score + 1;
}

/** Whether a label (a pack or tag) matches a query — for filter suggestions. */
export function labelMatches(label: string, query: string) {
  const q = plainWords(query);
  if (!q.length) return false;
  const words = plainWords(label);
  return q.every((x) => words.some((w) => w.startsWith(x)));
}
