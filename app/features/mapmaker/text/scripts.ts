/**
 * Writing systems in a text: which script each letter belongs to, the runs
 * of one script, and the Arabic joining rules the engine needs for spacing
 * and kashida. Pure functions (no fonts, no canvas), unit tested.
 */
import type { ScriptSlot } from "./fonts";

/** A letter's script: one of the slots fonts are picked for, or "other"
 * (a script no shipped font covers — drawn by the browser's own fonts). */
export type Script = ScriptSlot | "other";

const RE: [Script, RegExp][] = [
  ["arabic", /\p{Script=Arabic}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["greek", /\p{Script=Greek}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  [
    "cjk",
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}　-〿＀-￯]/u,
  ],
  ["latin", /\p{Script=Latin}/u],
];
const COMMON = /[\p{Script=Common}]/u;
const INHERITED = /[\p{Script=Inherited}‌‍]/u;

/** The script of one character; null for characters shared by every script
 * (digits, punctuation, spaces, marks), which take their neighbours'. */
export function charScript(ch: string): Script | null {
  if (INHERITED.test(ch)) return null;
  for (const [s, re] of RE) if (re.test(ch)) return s;
  if (COMMON.test(ch)) return null;
  return "other";
}

/** Scripts whose letters join (a run of them must never be cut into separate letters). */
export const CURSIVE: ReadonlySet<Script> = new Set<Script>([
  "arabic",
  "devanagari",
]);

/** HarfBuzz/ISO 15924 script tags. */
export const SCRIPT_TAG: Record<Script, string> = {
  arabic: "Arab",
  latin: "Latn",
  greek: "Grek",
  cyrillic: "Cyrl",
  hebrew: "Hebr",
  devanagari: "Deva",
  cjk: "Hani",
  other: "Zyyy",
};
/** A default language per script (for shaping rules), when the text names none. */
export const SCRIPT_LANG: Record<Script, string> = {
  arabic: "ar",
  latin: "en",
  greek: "el",
  cyrillic: "ru",
  hebrew: "he",
  devanagari: "hi",
  cjk: "zh",
  other: "",
};

/**
 * Every UTF-16 index's script. Shared characters take the script before
 * them (a digit after Arabic letters is drawn with the Arabic font), or the
 * one after them at the start, or `fallback` when the text has no letters.
 * Low surrogates share their high surrogate's script.
 */
export function resolveScripts(
  text: string,
  fallback: Script = "latin",
): Script[] {
  const n = text.length,
    raw: (Script | null)[] = new Array(n).fill(null),
    out: Script[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    raw[i] = charScript(ch);
    if (cp > 0xffff) {
      raw[i + 1] = raw[i];
      i++;
    }
  }
  let prev: Script | null = null;
  for (let i = 0; i < n; i++) {
    if (raw[i]) prev = raw[i];
    out[i] = prev as Script;
  }
  // Leading shared characters: the first real script after them.
  const first = raw.find((s) => s !== null) ?? fallback;
  for (let i = 0; i < n && out[i] === null; i++) out[i] = first;
  return out;
}

/** The scripts a text uses (letters only). */
export function scriptsIn(text: string): Set<Script> {
  const out = new Set<Script>();
  for (const ch of text) {
    const s = charScript(ch);
    if (s) out.add(s);
  }
  return out;
}

/** Arabic letters' joining types (Unicode ArabicShaping): R joins only to
 * the letter before it, D on both sides, U never, C (tatweel) joins both,
 * T (marks) is skipped. */
const RIGHT_JOINING = new Set([
  0x622, 0x623, 0x624, 0x625, 0x627, 0x629, 0x62f, 0x630, 0x631, 0x632, 0x648,
  0x671, 0x672, 0x673, 0x675, 0x676, 0x677, 0x688, 0x689, 0x68a, 0x68b, 0x68c,
  0x68d, 0x68e, 0x68f, 0x690, 0x691, 0x692, 0x693, 0x694, 0x695, 0x696, 0x697,
  0x698, 0x699, 0x6c0, 0x6c3, 0x6c4, 0x6c5, 0x6c6, 0x6c7, 0x6c8, 0x6c9, 0x6ca,
  0x6cb, 0x6cd, 0x6cf, 0x6d2, 0x6d3, 0x6d5, 0x6ee, 0x6ef, 0x759, 0x75a, 0x75b,
  0x76b, 0x76c, 0x771, 0x773, 0x774, 0x778, 0x779,
]);
const NON_JOINING = new Set([0x621, 0x674, 0x6dd]);
export type Joining = "R" | "D" | "U" | "C" | "T";

export function joiningType(cp: number): Joining {
  if (cp === 0x640 || cp === 0x200d) return "C";
  if (
    (cp >= 0x64b && cp <= 0x65f) ||
    cp === 0x670 ||
    (cp >= 0x6d6 &&
      cp <= 0x6ed &&
      cp !== 0x6dd &&
      cp !== 0x6de &&
      cp !== 0x6e5 &&
      cp !== 0x6e6 &&
      cp !== 0x6e9)
  )
    return "T";
  if (RIGHT_JOINING.has(cp)) return "R";
  if (NON_JOINING.has(cp)) return "U";
  if (
    (cp >= 0x620 && cp <= 0x64a) ||
    (cp >= 0x66e && cp <= 0x6d3) ||
    (cp >= 0x6fa && cp <= 0x6ff) ||
    (cp >= 0x750 && cp <= 0x77f) ||
    (cp >= 0x8a0 && cp <= 0x8c9)
  )
    return "D";
  return "U";
}

/**
 * Whether the letter at `i` joins the next letter (marks are skipped): the
 * place where a gap would break a joined word apart.
 */
export function joinsNext(text: string, i: number): boolean {
  const a = text.codePointAt(i);
  if (a === undefined) return false;
  const ta = joiningType(a);
  if (ta !== "D" && ta !== "C") return false;
  let j = i + (a > 0xffff ? 2 : 1);
  while (j < text.length && joiningType(text.codePointAt(j)!) === "T") j++;
  if (j >= text.length) return false;
  const tb = joiningType(text.codePointAt(j)!);
  return tb === "D" || tb === "R" || tb === "C";
}

const LAM = 0x644;
const ALEFS = new Set([0x622, 0x623, 0x625, 0x627, 0x671, 0x672, 0x673]);
/** Seen-family letters: a kashida after them is the most natural. */
const SEEN = new Set([0x633, 0x634, 0x635, 0x636]);

/**
 * Inserts kashida (tatweel, U+0640) into Arabic words, only where letters
 * already join, never inside lam-alef, never in words of fewer than three
 * letters. `intensity` 0..1: none, one, then two places per word, each up
 * to three tatweels long. Returns the new text (marks keep their letters).
 */
export function addKashida(text: string, intensity: number): string {
  if (intensity <= 0) return text;
  const per = Math.max(1, Math.round(intensity * 3)),
    places = intensity > 0.66 ? 2 : 1;
  // Candidate joins per Arabic word, as indices after which to insert.
  const out: string[] = [];
  const words = text.split(/(\s+)/);
  for (const word of words) {
    if (!/\p{Script=Arabic}/u.test(word)) {
      out.push(word);
      continue;
    }
    const letters = [...word].filter(
      (c) => joiningType(c.codePointAt(0)!) !== "T",
    ).length;
    if (letters < 3) {
      out.push(word);
      continue;
    }
    const candidates: { at: number; score: number }[] = [];
    for (let i = 0; i < word.length; i++) {
      const cp = word.codePointAt(i)!;
      if (joiningType(cp) === "T" || !joinsNext(word, i)) continue;
      let j = i + 1;
      while (j < word.length && joiningType(word.codePointAt(j)!) === "T") j++;
      const next = word.codePointAt(j)!;
      if (cp === LAM && ALEFS.has(next)) continue;
      if (cp === 0x640 || next === 0x640) continue;
      // Insert after the letter's marks.
      // Prefer the join before the last letter, then after seen-like letters.
      const lastJoin = !word
        .slice(j + 1)
        .split("")
        .some((c) => joiningType(c.codePointAt(0)!) !== "T");
      candidates.push({
        at: j,
        score: (lastJoin ? 3 : 0) + (SEEN.has(cp) ? 2 : 0) + i / word.length,
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates
      .slice(0, places)
      .map((c) => c.at)
      .sort((a, b) => b - a);
    let w = word;
    for (const at of chosen) w = w.slice(0, at) + "ـ".repeat(per) + w.slice(at);
    out.push(w);
  }
  return out.join("");
}

/** Upper-cases scripts that have capitals, leaving Arabic and the others alone. */
export function toCaps(text: string, lang: string): string {
  try {
    return text.toLocaleUpperCase(lang || undefined);
  } catch {
    return text.toUpperCase();
  }
}
