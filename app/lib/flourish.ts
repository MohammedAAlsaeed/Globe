/**
 * Flourishes for titles, written into the strings themselves:
 *
 *   ^عالَماً^      an extended fatha (الفتحة الممتدة): the fatha written in
 *                 the word is drawn long, over a kashida after its letter;
 *   ^3:عالَماً^    the same with 3 kashidas (1–5; 2 by default);
 *   ==كرة أرضية==  a gold highlight under a few words (any language).
 *
 * thmanyah's own rules (its "دليل جماليات" guide) are kept by checkFlourish
 * and the tests: titles only, at most one extended fatha and one highlight
 * per title, and the fatha only where Arabic allows it (a real fatha, on a
 * letter that joins the next one). The long fatha comes from the font's
 * stylistic sets: ss03 suits one kashida, ss04 two, … ss07 five.
 *
 * Strings with flourishes are shown with <Flourish> (components/ui/Flourish),
 * never as plain text; plainText() gives what a screen reader should hear.
 */

export const FATHA = "َ";
export const KASHIDA = "ـ";
const MARKS = /[ً-ٰٟ]/;

export type Piece =
  | { kind: "text"; text: string }
  | {
      kind: "fatha";
      /** The word as written (what it says). */
      word: string;
      /** The word with its kashidas (what is drawn). */
      drawn: string;
      kashidas: number;
      /** The OpenType feature that draws the long fatha. */
      feature: string;
    }
  | { kind: "mark"; text: string };

const TOKEN = /==(.+?)==|\^(?:([1-5]):)?([^^]+)\^/g;

/** Letters that don't join the letter after them (a kashida can't follow). */
const NON_JOINING = new Set(
  "ءآأؤإاةدذرزوٱٲٳٵٶٷڈډڊڋڌڍڎڏڐڑڒړڔڕږڗژڙۀۃۄۅۆۇۈۉۊۋۍۏےۓەۮۯ",
);

/** Where the kashidas go: after the letter that carries the fatha and any
 * other marks on it (a shadda), just before the fatha. */
function fathaAt(word: string) {
  const i = word.indexOf(FATHA);
  let base = i - 1;
  while (base >= 0 && MARKS.test(word[base])) base--;
  return { i, base };
}

export function parseFlourish(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last)
      pieces.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      pieces.push({ kind: "mark", text: m[1] });
    } else {
      const word = m[3],
        kashidas = m[2] ? Number(m[2]) : 2,
        { i } = fathaAt(word);
      pieces.push(
        i < 0
          ? { kind: "text", text: word }
          : {
              kind: "fatha",
              word,
              drawn:
                word.slice(0, i) + KASHIDA.repeat(kashidas) + word.slice(i),
              kashidas,
              feature: `ss0${kashidas + 2}`,
            },
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}

/** The text without its flourish markers (what it says). */
export const plainText = (text: string) =>
  parseFlourish(text)
    .map((p) => (p.kind === "fatha" ? p.word : p.text))
    .join("");

/** What's wrong with a string's flourishes, by thmanyah's rules ([] if
 * nothing). */
export function checkFlourish(text: string): string[] {
  const problems: string[] = [];
  const pieces = parseFlourish(text);
  const fathas = pieces.filter((p) => p.kind === "fatha");
  const marks = pieces.filter((p) => p.kind === "mark");
  const raw = [...text.matchAll(TOKEN)].filter((m) => m[1] === undefined);

  if (fathas.length !== raw.length)
    problems.push("an extended fatha with no fatha written in its word");
  if (fathas.length > 1) problems.push("more than one extended fatha");
  if (marks.length > 1) problems.push("more than one highlight");
  if (
    /\^|==/.test(pieces.map((p) => (p.kind === "text" ? p.text : "")).join(""))
  )
    problems.push("an unclosed marker");

  for (const p of fathas) {
    const { i, base } = fathaAt(p.word);
    if (p.word.indexOf(FATHA, i + 1) >= 0)
      problems.push(`"${p.word}": more than one fatha`);
    if (base < 0 || NON_JOINING.has(p.word[base]))
      problems.push(`"${p.word}": its letter doesn't join the next one`);
    if (!/[ؠ-يٮ-ۓ]/.test(p.word.slice(i + 1)))
      problems.push(`"${p.word}": no letter after the fatha`);
    if (/\s/.test(p.word)) problems.push(`"${p.word}": one word only`);
  }
  return problems;
}
