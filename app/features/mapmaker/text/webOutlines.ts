/**
 * Outlines for letters the browser draws (East Asian web fonts), for vector
 * exports.
 *
 * On the map these letters are drawn with `fillText` from Google Fonts'
 * stylesheet, which serves each family in many small WOFF2 slices (one per
 * `unicode-range`). For an export the same slices are fetched, opened with
 * fontkit, and each letter's outline is placed exactly where the browser
 * drew it (`WebGlyph.m`), so these texts come out as vectors too.
 *
 * Everything is cached; nothing here runs until an SVG or PDF is saved.
 */
import type { Ops, WebGlyph } from "./geometry";
import { FONTS } from "./fonts";

/** One `@font-face` of a Google Fonts stylesheet. */
export interface WebFace {
  family: string;
  weight: [number, number];
  italic: boolean;
  ranges: [number, number][];
  url: string;
}

/** The `@font-face` rules of a stylesheet (only WOFF2/TTF/OTF sources). */
export function parseFontFaces(css: string): WebFace[] {
  const out: WebFace[] = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const prop = (name: string) =>
      new RegExp(`${name}\\s*:\\s*([^;]+);?`, "i").exec(block)?.[1].trim();
    const family = prop("font-family")?.replace(/^['"]|['"]$/g, "");
    const url =
      /url\(\s*['"]?([^'")]+)['"]?\s*\)\s*format\(\s*['"]?(woff2|truetype|opentype)/i.exec(
        block,
      )?.[1];
    if (!family || !url) continue;
    const w = (prop("font-weight") ?? "400").split(/\s+/).map(Number);
    const ranges: [number, number][] = [];
    for (const part of (prop("unicode-range") ?? "U+0-10FFFF").split(",")) {
      const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
      if (!m) continue;
      if (m[1].includes("?"))
        ranges.push([
          parseInt(m[1].replace(/\?/g, "0"), 16),
          parseInt(m[1].replace(/\?/g, "f"), 16),
        ]);
      else ranges.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
    }
    out.push({
      family,
      weight: [w[0] || 400, w[1] || w[0] || 400],
      italic: /italic|oblique/i.test(prop("font-style") ?? ""),
      ranges,
      url,
    });
  }
  return out;
}

/** Family, weight and style of a canvas font string ("italic 700 100px "Noto Serif JP", serif"). */
export function parseCanvasFont(css: string): {
  family: string | null;
  weight: number;
  italic: boolean;
} {
  const italic = /^italic\s/.test(css);
  const weight = Number(/(\d{3})\s+[\d.]+px/.exec(css)?.[1] ?? 400);
  const family = /px\s+"([^"]+)"/.exec(css)?.[1] ?? null;
  return { family, weight, italic };
}

/** The face of `faces` for a letter at a weight and style (nearest weight), or null. */
export function faceFor(
  faces: WebFace[],
  cp: number,
  weight: number,
  italic: boolean,
): WebFace | null {
  let best: WebFace | null = null,
    bestD = Infinity;
  for (const f of faces) {
    if (!f.ranges.some(([a, b]) => cp >= a && cp <= b)) continue;
    const d =
      (weight < f.weight[0]
        ? f.weight[0] - weight
        : weight > f.weight[1]
          ? weight - f.weight[1]
          : 0) + (f.italic !== italic ? 1000 : 0);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

// ---- loading ----------------------------------------------------------------------------------
type Fontkit = typeof import("@pdf-lib/fontkit");
type FKFont = import("@pdf-lib/fontkit").Font;
/** fontkit, whichever way the bundler hands over its default export. */
export async function loadFontkit(): Promise<Fontkit> {
  const m = (await import("@pdf-lib/fontkit")) as unknown as {
    default?: Fontkit;
  } & Fontkit;
  return m.default ?? m;
}

let fetchText: (url: string) => Promise<string> = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`css ${r.status}`);
  return r.text();
};
let fetchBytes: (url: string) => Promise<ArrayBuffer> = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font ${r.status}`);
  return r.arrayBuffer();
};
/** Where stylesheets and font files come from (tests serve them locally). */
export function setWebFetchers(
  text: typeof fetchText,
  bytes: typeof fetchBytes,
) {
  fetchText = text;
  fetchBytes = bytes;
}

const sheets = new Map<string, Promise<WebFace[]>>();
const sheetDone = new Map<string, WebFace[]>();
const fonts = new Map<string, Promise<FKFont | null>>();
const fontDone = new Map<string, FKFont | null>();
const fileBytes = new Map<string, Uint8Array>();

function stylesheetOf(family: string): string | null {
  const def = FONTS.find((f) => f.css?.family === family);
  return def?.css
    ? `https://fonts.googleapis.com/css2?family=${def.css.query}&display=swap`
    : null;
}

function loadSheet(family: string): Promise<WebFace[]> {
  let p = sheets.get(family);
  if (!p) {
    const href = stylesheetOf(family);
    p = (href ? fetchText(href).then(parseFontFaces) : Promise.resolve([]))
      .catch(() => [] as WebFace[])
      .then((faces) => {
        sheetDone.set(family, faces);
        return faces;
      });
    sheets.set(family, p);
  }
  return p;
}

function loadFont(url: string): Promise<FKFont | null> {
  let p = fonts.get(url);
  if (!p) {
    p = Promise.all([loadFontkit(), fetchBytes(url)])
      .then(([fk, bytes]) => {
        const u8 = new Uint8Array(bytes);
        fileBytes.set(url, u8);
        return fk.create(u8);
      })
      .catch(() => null)
      .then((font) => {
        fontDone.set(url, font);
        return font;
      });
    fonts.set(url, p);
  }
  return p;
}

/** Fetches what the letters need (stylesheets, then their slices). */
export async function loadWebOutlines(glyphs: WebGlyph[]): Promise<void> {
  const byFamily = new Map<string, WebGlyph[]>();
  for (const g of glyphs) {
    const { family } = parseCanvasFont(g.css);
    if (!family) continue;
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(g);
  }
  await Promise.all(
    [...byFamily].map(async ([family, list]) => {
      const faces = await loadSheet(family);
      const urls = new Set<string>();
      for (const g of list) {
        const { weight, italic } = parseCanvasFont(g.css);
        for (const ch of g.text) {
          const f = faceFor(faces, ch.codePointAt(0)!, weight, italic);
          if (f) urls.add(f.url);
        }
      }
      await Promise.all([...urls].map(loadFont));
    }),
  );
}

/** The slice files a letter is drawn from, with their `@font-face` (for embedding). */
export function webFacesOf(
  g: WebGlyph,
): { face: WebFace; bytes: Uint8Array }[] {
  const { family, weight, italic } = parseCanvasFont(g.css);
  const faces = family ? sheetDone.get(family) : undefined;
  if (!faces) return [];
  const out: { face: WebFace; bytes: Uint8Array }[] = [];
  for (const ch of g.text) {
    const f = faceFor(faces, ch.codePointAt(0)!, weight, italic);
    const bytes = f && fileBytes.get(f.url);
    if (f && bytes && !out.some((o) => o.face === f))
      out.push({ face: f, bytes });
  }
  return out;
}

const opsCache = new Map<string, Ops | null>();
/**
 * A browser-drawn letter's outline in em (as `geometry` places it), or null
 * when its font isn't loaded (see `loadWebOutlines`) or lacks the letter.
 */
export function webGlyphOps(g: WebGlyph): Ops | null {
  const { family, weight, italic } = parseCanvasFont(g.css);
  const faces = family ? sheetDone.get(family) : undefined;
  if (!faces) return null;
  const key = `${g.css}|${g.text}|${g.m.join(",")}`;
  if (opsCache.has(key)) return opsCache.get(key)!;
  const out: Ops = [];
  let pen = 0;
  for (const ch of g.text) {
    const cp = ch.codePointAt(0)!;
    const face = faceFor(faces, cp, weight, italic);
    const font = face ? fontDone.get(face.url) : undefined;
    if (!font) return null;
    let glyph = font.glyphForCodePoint(cp);
    if (!glyph || (glyph.id === 0 && !/\s/.test(ch))) return null;
    // A variable slice: the glyph of its instance at the weight drawn, when
    // fontkit can make one (Google serves the weights asked for as static
    // files, so this is rare); else the default instance.
    const axes = (
      font as unknown as {
        variationAxes?: Record<string, { min: number; max: number }>;
      }
    ).variationAxes;
    if (axes?.wght) {
      try {
        const inst = (
          font as unknown as { getVariation(v: Record<string, number>): FKFont }
        ).getVariation({
          wght: Math.min(axes.wght.max, Math.max(axes.wght.min, weight)),
        });
        glyph = inst.getGlyph(glyph.id) ?? glyph;
      } catch {
        // keep the default instance
      }
    }
    const s = 100 / font.unitsPerEm;
    const [a, b, c, d, e, f] = g.m;
    const P = (x: number, y: number) => {
      const px = pen + x * s,
        py = -y * s;
      out.push(a * px + c * py + e, b * px + d * py + f);
    };
    const commands = (
      glyph.path as unknown as {
        commands: { command: string; args: number[] }[];
      }
    ).commands;
    for (const cmd of commands) {
      const v = cmd.args;
      switch (cmd.command) {
        case "moveTo":
          out.push(0);
          P(v[0], v[1]);
          break;
        case "lineTo":
          out.push(1);
          P(v[0], v[1]);
          break;
        case "quadraticCurveTo":
          out.push(2);
          P(v[0], v[1]);
          P(v[2], v[3]);
          break;
        case "bezierCurveTo":
          out.push(3);
          P(v[0], v[1]);
          P(v[2], v[3]);
          P(v[4], v[5]);
          break;
        case "closePath":
          out.push(4);
          break;
      }
    }
    pen += glyph.advanceWidth * s;
  }
  opsCache.set(key, out);
  return out;
}
