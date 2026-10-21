/**
 * Shaping and laying out a text, in em (the text's size = 1).
 *
 * The pipeline the Text Tool report asks for, in order:
 *
 *   1. the Unicode text as typed (capitals and kashida applied to a copy);
 *   2. paragraphs, and each paragraph's direction (Unicode BiDi, via bidi-js)
 *      — "auto" follows the first strong letter, as browsers do;
 *   3. script runs: every letter's writing system, shared characters (digits,
 *      punctuation, spaces, marks) taking their neighbours';
 *   4. a font for every letter: the text's own font, its profile's font for
 *      that script, the fonts' fallbacks, then the script's fallbacks —
 *      the first that really has the letter (marks stay with their base);
 *   5. OpenType shaping of each run (HarfBuzz): joined Arabic, marks,
 *      ligatures, kerning, the person's feature choices;
 *   6. spacing: letter spacing everywhere *except* inside joined Arabic
 *      (only where letters don't join), word spacing at spaces;
 *   7. lines: wrapping to the box, visual order of mixed-direction runs
 *      (BiDi L2), line heights from each font's real metrics, alignment.
 *
 * The result is a list of positioned glyphs; ./geometry turns them into
 * outlines (straight or curved) and ./render draws them.
 */
import bidiFactory from "bidi-js";
import type * as HB from "harfbuzzjs";
import type { TextLook } from "../types";
import { FONTS, SCRIPT_FALLBACK, fontDef, fontProfile, profileSlot, type FontDefinition, type ProfileSlot } from "./fonts";
import { FONT_INFO } from "./fontInfo.generated";
import { faceOf, fontsVersion, harfbuzz, hbFontAt, isFailed, loadHarfBuzz, loadWebFont, pickFile, webFontReady, type LoadedFace } from "./fontStore";
import { CURSIVE, SCRIPT_LANG, SCRIPT_TAG, addKashida, resolveScripts, toCaps, type Script } from "./scripts";

const bidi = bidiFactory();

/** A glyph from a shipped font (drawn from its outline). */
export interface HbGlyphRef {
  kind: "hb";
  face: LoadedFace;
  weight: number;
  gid: number;
  /** em per font unit (the profile's scale included). */
  k: number;
}
/** Letters drawn by the browser (East Asian web fonts, scripts no font covers). */
export interface WebGlyphRef {
  kind: "web";
  /** CSS font (family list, weight, style) at 100px. */
  css: string;
  text: string;
}
export interface PlacedGlyph {
  ref: HbGlyphRef | WebGlyphRef;
  /** Pen position (the glyph's origin on its baseline), em, y down. */
  x: number;
  y: number;
  adv: number;
  /** First UTF-16 index of its cluster in the shaped line. */
  cluster: number;
  script: Script;
  rtl: boolean;
  /** Index of the word (counted along the line) — for "words" curves. */
  word: number;
  line: number;
}
export interface LaidLine {
  glyphs: PlacedGlyph[];
  width: number;
  /** Left edge of the line (em, from the anchor). */
  x0: number;
  baseline: number;
  ascent: number;
  descent: number;
  rtl: boolean;
}
export interface ShapedText {
  lines: LaidLine[];
  /** The block: its box width and its visual top/bottom (em). */
  width: number;
  left: number;
  top: number;
  bottom: number;
  /** False while a font it needs is still loading (it's drawn when it arrives). */
  ready: boolean;
  /** Fonts used besides the text's own/profile's choice for a script (to tell people). */
  substitutes: { script: Script; font: string }[];
  /** Scripts no shipped font covers (drawn with the browser's fonts). */
  unsupported: Script[];
  /** The weight or italic asked for isn't in a font used (the nearest is used). */
  styleMissing: { font: string; weight: boolean; italic: boolean }[];
}

/** Cap height and descent used to centre a block on its anchor (em). */
export const CAP = 0.72;
export const DESC = 0.24;

// ---- language -------------------------------------------------------------------------------
const URDU = /[ٹڈڑںھہے]/;
const PERSIAN = /[پچژگکی]/;
/** The language for shaping: the text's own, or one guessed from its letters. */
export function shapingLang(look: Pick<TextLook, "lang">, text: string, script: Script): string {
  if (look.lang) return look.lang;
  if (script === "arabic") return URDU.test(text) ? "ur" : PERSIAN.test(text) && !/[كي]/.test(text) ? "fa" : "ar";
  return SCRIPT_LANG[script];
}

// ---- fonts per script -------------------------------------------------------------------------
interface Candidate {
  def: FontDefinition;
  slot: ProfileSlot;
}
/** The fonts to try, in order, for a script. */
export function candidates(look: Pick<TextLook, "profile" | "font">, script: Script): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined, slot?: ProfileSlot) => {
    const def = fontDef(id);
    if (!def || seen.has(def.id)) return;
    seen.add(def.id);
    out.push({ def, slot: slot ?? { font: def.id } });
  };
  if (script === "other") return out;
  const profile = fontProfile(look.profile);
  const chosen = fontDef(look.font);
  // A font picked by hand is used for every script it has.
  if (chosen && (FONT_INFO[chosen.id]?.scripts.includes(script) || (chosen.source === "web" && script === "cjk"))) add(chosen.id);
  const slot = profileSlot(profile, script);
  if (slot) add(slot.font, slot);
  // Greek and Cyrillic: the profile's Latin face first when it has them.
  if (script === "greek" || script === "cyrillic") {
    const latin = profileSlot(profile, "latin");
    if (latin && FONT_INFO[latin.font]?.scripts.includes(script)) add(latin.font, latin);
  }
  for (const c of [...out]) for (const f of c.def.fallback) if (FONT_INFO[f]?.scripts.includes(script)) add(f);
  for (const f of SCRIPT_FALLBACK[script]) add(f);
  return out;
}

/** Everything a text needs loaded before it can be shaped (for exports and previews). */
export function neededFiles(text: string, look: TextLook): { files: string[]; web: string[] } {
  const files = new Set<string>(),
    web = new Set<string>();
  const scripts = new Set(resolveScripts(text));
  for (const s of scripts) {
    const first = candidates(look, s)[0];
    if (!first) continue;
    if (first.def.source === "web") web.add(first.def.id);
    else {
      const f = pickFile(first.def, look.weight, look.italic);
      if (f) files.add(f.file.path);
    }
  }
  return { files: [...files], web: [...web] };
}

// ---- shaping -------------------------------------------------------------------------------------
interface Run {
  start: number;
  end: number;
  level: number;
  script: Script;
  cand: Candidate | null;
  face: LoadedFace | null;
}
interface ShapedRun extends Run {
  glyphs: PlacedGlyph[];
  width: number;
}

const SPACE = /\s/;
const MARK = /\p{M}/u;

function isPending(path: string) {
  return !faceOf(path) && !isFailed(path);
}

function featuresOf(look: TextLook): HB.Feature[] {
  const hb = harfbuzz()!;
  return Object.entries(look.features ?? {}).map(([tag, on]) => new hb.Feature(tag, on ? 1 : 0));
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Width (em) of letters drawn by the browser. */
function webWidth(css: string, text: string): number {
  if (measureCtx === undefined) measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!measureCtx) return [...text].length * (/[　-鿿가-힯]/.test(text) ? 1 : 0.6);
  measureCtx.font = css;
  return measureCtx.measureText(text).width / 100;
}
function webCss(def: FontDefinition | null, look: TextLook) {
  const family = def?.css ? `"${def.css.family}", ` : "";
  return `${look.italic ? "italic " : ""}${Math.round(look.weight)} 100px ${family}serif`;
}

/**
 * Picks a font for every UTF-16 index of a paragraph and cuts it into runs
 * of one level, script and font. `pending` collects files still loading.
 */
function itemize(text: string, levels: Uint8Array, look: TextLook, baseScript: Script, report: Report): Run[] {
  const scripts = resolveScripts(text, baseScript);
  const n = text.length;
  const choice: (Candidate | null)[] = new Array(n).fill(null);
  const faceAt: (LoadedFace | null)[] = new Array(n).fill(null);
  const candCache = new Map<Script, Candidate[]>();
  for (let i = 0; i < n; i++) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const wide = cp > 0xffff;
    // Marks, joiners and spaces stay with the letter before them.
    if (i > 0 && (MARK.test(ch) || cp === 0x200c || cp === 0x200d || (SPACE.test(ch) && choice[i - 1]))) {
      choice[i] = choice[i - 1];
      faceAt[i] = faceAt[i - 1];
      if (wide) {
        choice[i + 1] = choice[i];
        faceAt[i + 1] = faceAt[i];
        i++;
      }
      continue;
    }
    const s = scripts[i];
    let list = candCache.get(s);
    if (!list) candCache.set(s, (list = candidates(look, s)));
    let picked: Candidate | null = null,
      face: LoadedFace | null = null;
    for (const c of list) {
      if (c.def.source === "web") {
        picked = c;
        break;
      }
      const f = pickFile(c.def, look.weight, look.italic);
      if (!f) continue;
      const loaded = faceOf(f.file.path);
      if (!loaded) {
        if (isPending(f.file.path)) {
          // Still loading: assume it has the letter if the catalog says it covers the script.
          if (FONT_INFO[c.def.id]?.scripts.includes(s) || SPACE.test(ch)) {
            report.pending = true;
            picked = c;
            break;
          }
        }
        continue;
      }
      if (loaded.unicodes.has(cp) || SPACE.test(ch)) {
        picked = c;
        face = loaded;
        if (!f.exactWeight || (look.italic && !f.exactStyle)) report.style(c.def.id, !f.exactWeight, look.italic && !f.exactStyle);
        break;
      }
    }
    // Tell people when their letters come from another font than the one they
    // chose (a Latin-only face asked to write Arabic) or the profile's own.
    if (picked && !SPACE.test(ch) && ((look.font && picked.def.id !== look.font) || (list[0] && picked.def.id !== list[0].def.id))) report.substitute(s, picked.def.id);
    if (!picked && !SPACE.test(ch) && s !== "other") report.unsupported(s);
    if (!picked && s === "other") report.unsupported("other");
    choice[i] = picked;
    faceAt[i] = face;
    if (wide) {
      choice[i + 1] = picked;
      faceAt[i + 1] = face;
      i++;
    }
  }
  // Leading spaces: the first chosen font.
  const firstChoice = choice.find((c) => c) ?? null,
    firstFace = faceAt.find((f) => f) ?? null;
  for (let i = 0; i < n && !choice[i]; i++) {
    if (!SPACE.test(text[i])) break;
    choice[i] = firstChoice;
    faceAt[i] = firstFace;
  }
  const runs: Run[] = [];
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && levels[j] === levels[i] && scripts[j] === scripts[i] && choice[j] === choice[i] && faceAt[j] === faceAt[i]) j++;
    runs.push({ start: i, end: j, level: levels[i], script: scripts[i], cand: choice[i], face: faceAt[i] });
    i = j;
  }
  return runs;
}

interface Report {
  pending: boolean;
  substitute(s: Script, font: string): void;
  unsupported(s: Script): void;
  style(font: string, weight: boolean, italic: boolean): void;
}

/**
 * Extra advance after each logical character index (letter and word spacing).
 *
 * Joined scripts (Arabic) are never spaced letter by letter — not even after
 * a letter that doesn't join (ا د ر و…), which would read as a broken word.
 * Their share of letter spacing goes to the spaces between words instead
 * (kashida is what stretches the words themselves).
 */
const CURSIVE_WORD_SHARE = 2;
function gapsFor(text: string, scripts: Script[], look: TextLook): Float64Array {
  const gaps = new Float64Array(text.length);
  const ls = look.letterSpacing || 0,
    ws = look.wordSpacing || 0;
  if (!ls && !ws) return gaps;
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];
    if (MARK.test(text[i + 1])) continue; // after the base: wait for its marks
    if (SPACE.test(ch)) {
      const nearCursive = CURSIVE.has(scripts[i - 1] ?? scripts[i]) || CURSIVE.has(scripts[i + 1] ?? scripts[i]);
      gaps[i] = ws + ls * (nearCursive ? CURSIVE_WORD_SHARE : 1);
      continue;
    }
    if (CURSIVE.has(scripts[i])) continue; // never pull a joined word apart
    gaps[i] = ls;
  }
  return gaps;
}

function shapeRun(text: string, run: Run, look: TextLook, gaps: Float64Array, lineIdx: number, words: Int32Array): ShapedRun {
  const rtl = run.level % 2 === 1;
  const glyphs: PlacedGlyph[] = [];
  let pen = 0;
  const slot = run.cand?.slot;
  const scale = slot?.scale ?? 1,
    shift = slot?.shift ?? 0;
  if (run.cand && run.cand.def.source === "file" && run.face) {
    const hb = harfbuzz()!;
    const face = run.face;
    const font = hbFontAt(face, look.weight);
    const buf = new hb.Buffer();
    buf.addText(text, run.start, run.end - run.start);
    buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
    buf.setScript(SCRIPT_TAG[run.script]);
    const lang = shapingLang(look, text, run.script);
    if (lang) buf.setLanguage(lang);
    hb.shape(font, buf, featuresOf(look));
    const k = scale / face.upem;
    const info = buf.getGlyphInfosAndPositions();
    // Cluster ends (logical), to place the gap after each cluster.
    const clusters = [...new Set(info.map((g) => g.cluster))].sort((a, b) => a - b);
    const clusterEnd = new Map<number, number>();
    clusters.forEach((c, i) => clusterEnd.set(c, (clusters[i + 1] ?? run.end) - 1));
    for (let gi = 0; gi < info.length; gi++) {
      const g = info[gi];
      const end = clusterEnd.get(g.cluster)!;
      const gap = end < text.length - 1 ? gaps[end] : 0;
      const firstOfCluster = gi === 0 || info[gi - 1].cluster !== g.cluster;
      const lastOfCluster = gi === info.length - 1 || info[gi + 1].cluster !== g.cluster;
      // RTL: the gap after a cluster lies to its left (before it, going left to right).
      if (rtl && firstOfCluster) pen += gap;
      glyphs.push({
        ref: { kind: "hb", face, weight: look.weight, gid: g.codepoint, k },
        x: pen + (g.xOffset ?? 0) * k,
        y: -shift - (g.yOffset ?? 0) * k,
        adv: (g.xAdvance ?? 0) * k,
        cluster: g.cluster,
        script: run.script,
        rtl,
        word: words[g.cluster] ?? 0,
        line: lineIdx,
      });
      pen += (g.xAdvance ?? 0) * k;
      if (!rtl && lastOfCluster) pen += gap;
    }
  } else {
    // Browser-drawn letters, one grapheme at a time (visual order for RTL).
    const def = run.cand?.def ?? null;
    if (def?.source === "web" && !webFontReady(def.id)) void loadWebFont(def.id, text.slice(run.start, run.end));
    const css = webCss(def, look);
    const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
    const piece = text.slice(run.start, run.end);
    const parts: { s: string; i: number }[] = seg ? [...seg.segment(piece)].map((p) => ({ s: p.segment, i: run.start + p.index })) : [...piece].map((s, idx) => ({ s, i: run.start + idx }));
    if (rtl) parts.reverse();
    for (const p of parts) {
      const w = webWidth(css, p.s) * scale;
      const gap = gaps[p.i + p.s.length - 1] ?? 0;
      if (rtl) pen += gap;
      glyphs.push({ ref: { kind: "web", css, text: p.s }, x: pen, y: -shift, adv: w, cluster: p.i, script: run.script, rtl, word: words[p.i] ?? 0, line: lineIdx });
      pen += w;
      if (!rtl) pen += gap;
    }
  }
  return { ...run, glyphs, width: pen };
}

/** BiDi L2: the runs of a line in visual order. */
function visualOrder<T extends { level: number }>(runs: T[]): T[] {
  if (!runs.length) return runs;
  const out = [...runs];
  const max = Math.max(...out.map((r) => r.level)),
    minOdd = Math.min(...out.map((r) => r.level).filter((l) => l % 2 === 1), Infinity);
  for (let lvl = max; lvl >= minOdd && lvl > 0; lvl--) {
    for (let i = 0; i < out.length; ) {
      if (out[i].level < lvl) {
        i++;
        continue;
      }
      let j = i;
      while (j < out.length && out[j].level >= lvl) j++;
      out.splice(i, j - i, ...out.slice(i, j).reverse());
      i = j;
    }
  }
  return out;
}

function wordIndex(text: string): Int32Array {
  const out = new Int32Array(text.length);
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    if (SPACE.test(text[i])) {
      out[i] = -1;
      if (i > 0 && !SPACE.test(text[i - 1])) w++;
    } else out[i] = w;
  }
  return out;
}

interface LineDraft {
  runs: ShapedRun[];
  width: number;
  rtl: boolean;
  text: string;
}

/** Shapes one line of text (already one paragraph's piece). */
function shapeLine(text: string, look: TextLook, dir: "ltr" | "rtl" | "auto", lineIdx: number, report: Report): LineDraft {
  const emb = bidi.getEmbeddingLevels(text, dir);
  const paraLevel = emb.paragraphs[0]?.level ?? (dir === "rtl" ? 1 : 0);
  const rtl = paraLevel % 2 === 1;
  const scripts = resolveScripts(text, rtl ? "arabic" : "latin");
  const runs = itemize(text, emb.levels, look, rtl ? "arabic" : "latin", report);
  if (report.pending) return { runs: [], width: 0, rtl, text };
  const gaps = gapsFor(text, scripts, look);
  const words = wordIndex(text);
  const shaped = runs.map((r) => shapeRun(text, r, look, gaps, lineIdx, words));
  return { runs: shaped, width: shaped.reduce((s, r) => s + r.width, 0), rtl, text };
}

/** Logical break points of a paragraph wrapped to `max` em. */
function wrap(text: string, look: TextLook, dir: "ltr" | "rtl" | "auto", max: number, report: Report): string[] {
  const whole = shapeLine(text, look, dir, 0, report);
  if (report.pending || whole.width <= max) return [text];
  // Width of each logical character's glyphs (+ gaps), from the whole paragraph's shaping.
  const w = new Float64Array(text.length + 1);
  for (const r of whole.runs) for (const g of r.glyphs) w[g.cluster] += g.adv;
  const out: string[] = [];
  let start = 0,
    acc = 0,
    lastSpace = -1;
  for (let i = 0; i < text.length; i++) {
    if (SPACE.test(text[i])) lastSpace = i;
    acc += w[i];
    if (acc > max && lastSpace > start) {
      out.push(text.slice(start, lastSpace));
      start = lastSpace + 1;
      acc = 0;
      for (let j = start; j <= i; j++) acc += w[j];
      lastSpace = -1;
    }
  }
  out.push(text.slice(start));
  return out;
}

function physical(align: TextLook["align"], rtl: boolean): "left" | "center" | "right" {
  if (align === "left" || align === "right" || align === "center") return align;
  return (align === "start") !== rtl ? "left" : "right";
}

/** The text as typed, prepared for shaping (capitals, kashida). */
export function prepared(text: string, look: TextLook): string {
  let t = text.replace(/\r\n?/g, "\n");
  if (look.caps) t = toCaps(t, look.lang);
  if (look.kashida > 0) t = addKashida(t, look.kashida);
  return t;
}

const cache = new Map<string, ShapedText>();
/** What changes shaping (colour, effects and curves don't). */
export function shapeKey(text: string, look: TextLook, boxWidthEm: number | null) {
  return [text, look.profile, look.font, look.weight, look.italic, look.caps, look.letterSpacing, look.wordSpacing, look.lineHeight, look.align, look.direction, look.lang, JSON.stringify(look.features ?? {}), look.kashida, boxWidthEm ?? "", fontsVersion()].join("\u0001");
}

/**
 * Lays out a text in em. Returns `ready: false` (and starts loading what's
 * missing) until HarfBuzz and the text's fonts are in.
 */
export function shapeText(text: string, look: TextLook, boxWidthEm: number | null = null): ShapedText {
  const key = shapeKey(text, look, boxWidthEm);
  const hit = cache.get(key);
  if (hit) return hit;
  const empty: ShapedText = { lines: [], width: 0, left: 0, top: -CAP / 2, bottom: CAP / 2, ready: false, substitutes: [], unsupported: [], styleMissing: [] };
  if (!harfbuzz()) {
    void loadHarfBuzz();
    return empty;
  }
  const subs = new Map<string, { script: Script; font: string }>(),
    unsupported = new Set<Script>(),
    styles = new Map<string, { font: string; weight: boolean; italic: boolean }>();
  const report: Report = {
    pending: false,
    substitute: (script, font) => subs.set(`${script}:${font}`, { script, font }),
    unsupported: (s) => unsupported.add(s),
    style: (font, weight, italic) => styles.set(font, { font, weight, italic }),
  };
  const src = prepared(text, look);
  const dir = look.direction === "auto" ? "auto" : look.direction;
  const drafts: LineDraft[] = [];
  for (const para of src.split("\n")) {
    const pieces = boxWidthEm ? wrap(para, look, dir, boxWidthEm, report) : [para];
    if (report.pending) break;
    // A wrapped paragraph keeps its own direction on every line.
    const paraDir = dir === "auto" ? ((bidi.getEmbeddingLevels(para, "auto").paragraphs[0]?.level ?? 0) % 2 ? "rtl" : "ltr") : dir;
    for (const piece of pieces) drafts.push(shapeLine(piece, look, paraDir, drafts.length, report));
    if (report.pending) break;
  }
  if (report.pending) {
    cache.set(key, empty);
    return empty;
  }

  // Vertical: each line's ascent/descent from the fonts in it.
  const lines: LaidLine[] = [];
  const primary = candidates(look, "latin")[0];
  const primaryFile = primary ? pickFile(primary.def, look.weight, look.italic) : null;
  const primaryFace = primaryFile ? faceOf(primaryFile.file.path) : null;
  const metric = (face: LoadedFace | null, scale: number) =>
    face ? { asc: (face.ascender / face.upem) * scale, desc: (-face.descender / face.upem) * scale, gap: (face.lineGap / face.upem) * scale } : { asc: 0.9, desc: 0.3, gap: 0 };
  let y = 0;
  drafts.forEach((d, i) => {
    let asc = 0,
      desc = 0,
      natural = 0;
    const faces = d.runs.length ? d.runs.map((r) => metric(r.face, r.cand?.slot.scale ?? 1)) : [metric(primaryFace, 1)];
    for (const m of faces) {
      asc = Math.max(asc, m.asc);
      desc = Math.max(desc, m.desc);
      natural = Math.max(natural, m.asc + m.desc + m.gap);
    }
    // Baseline to baseline: the line height relative to the fonts' natural height
    // (1.2 being "normal"), so Arabic marks and Nastaliq's tall words get the room they need.
    const step = (look.lineHeight / 1.2) * Math.max(1.0, natural);
    y = i === 0 ? 0 : y + step;
    const ordered = visualOrder(d.runs);
    const glyphs: PlacedGlyph[] = [];
    let pen = 0;
    for (const r of ordered) {
      for (const g of r.glyphs) glyphs.push({ ...g, x: g.x + pen, y: g.y + y });
      pen += r.width;
    }
    lines.push({ glyphs, width: d.width, x0: 0, baseline: y, ascent: asc, descent: desc, rtl: d.rtl });
  });

  const box = boxWidthEm ?? Math.max(0, ...lines.map((l) => l.width));
  const firstRtl = lines[0]?.rtl ?? false;
  const anchorAlign = physical(look.align, firstRtl);
  const anchorX = anchorAlign === "left" ? 0 : anchorAlign === "center" ? box / 2 : box;
  for (const l of lines) {
    const a = physical(look.align, l.rtl);
    l.x0 = (a === "left" ? 0 : a === "center" ? (box - l.width) / 2 : box - l.width) - anchorX;
    for (const g of l.glyphs) g.x += l.x0;
  }
  // Centre the block vertically on the anchor (cap height above the first
  // baseline to the descent below the last), so it doesn't jump as letters change.
  const top = (lines[0]?.baseline ?? 0) - CAP,
    bottom = (lines[lines.length - 1]?.baseline ?? 0) + DESC,
    mid = (top + bottom) / 2;
  for (const l of lines) {
    l.baseline -= mid;
    for (const g of l.glyphs) g.y -= mid;
  }
  const out: ShapedText = {
    lines,
    width: box,
    left: -anchorX,
    top: top - mid,
    bottom: bottom - mid,
    ready: true,
    substitutes: [...subs.values()],
    unsupported: [...unsupported],
    styleMissing: [...styles.values()],
  };
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}

/** Fonts in the library a text's look can use, for the picker (shipped first). */
export function libraryFonts() {
  return FONTS;
}
