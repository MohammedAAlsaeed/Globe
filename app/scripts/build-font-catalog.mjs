/**
 * Measures every shipped font and writes what the Text Tool needs to know
 * about it before loading it:
 *
 *   features/mapmaker/text/fontInfo.generated.ts
 *       per file: version, units per em, line metrics, variable axes,
 *       OpenType features, size; per font: the scripts it really covers
 *   public/fonts/previews.json
 *       each family's name drawn in its own letters (SVG paths), so the
 *       font picker shows every font without downloading them
 *   public/wasm/harfbuzz-subset.wasm
 *       HarfBuzz's subsetter (from harfbuzzjs), for fonts embedded in
 *       exports (features/mapmaker/text/subset.ts)
 *
 * Run after adding or updating a font in ./features/mapmaker/text/fonts.ts:
 *   npm run fonts:catalog
 */
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as hb from "harfbuzzjs";
import { FONTS } from "../features/mapmaker/text/fonts.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "public");

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** Letters a font must have to count as covering a script (95% or more). */
const SETS = {
  latin: [...range(0x41, 0x5a), ...range(0x61, 0x7a)],
  latinExt: [
    0xc0, 0xc1, 0xc2, 0xc7, 0xc8, 0xc9, 0xd1, 0xd6, 0xdc, 0xdf, 0xe0, 0xe1,
    0xe7, 0xe8, 0xe9, 0xea, 0xed, 0xf1, 0xf3, 0xf6, 0xfa, 0xfc,
  ],
  greek: [
    ...range(0x391, 0x3a1),
    ...range(0x3a3, 0x3a9),
    ...range(0x3b1, 0x3c9),
  ],
  cyrillic: range(0x410, 0x44f),
  arabic: [...range(0x621, 0x63a), ...range(0x641, 0x64a)],
  arabicMarks: range(0x64b, 0x652),
  persian: [0x67e, 0x686, 0x698, 0x6af, 0x6a9, 0x6cc],
  urdu: [0x679, 0x688, 0x691, 0x6ba, 0x6be, 0x6c1, 0x6d2],
  hebrew: range(0x5d0, 0x5ea),
  devanagari: range(0x905, 0x939),
  digits: range(0x30, 0x39),
  arabicDigits: range(0x660, 0x669),
  persianDigits: range(0x6f0, 0x6f9),
};
const FEATURES = [
  "liga",
  "dlig",
  "calt",
  "kern",
  "smcp",
  "c2sc",
  "onum",
  "lnum",
  "pnum",
  "tnum",
  "swsh",
  "salt",
  "ss01",
  "ss02",
  "ss03",
  "ss04",
  "ss05",
  "frac",
  "hlig",
  "cswh",
];

function analyse(path) {
  const bytes = readFileSync(join(pub, path));
  const blob = new hb.Blob(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const face = new hb.Face(blob, 0);
  const font = new hb.Font(face);
  const unicodes = new Set(face.collectUnicodes());
  const cover = {};
  for (const [k, set] of Object.entries(SETS))
    cover[k] =
      Math.round(
        (set.filter((u) => unicodes.has(u)).length / set.length) * 100,
      ) / 100;
  const ext = font.hExtents();
  const feats = new Set([
    ...face.getTableFeatureTags("GSUB"),
    ...face.getTableFeatureTags("GPOS"),
  ]);
  const axes = face.getAxisInfos();
  return {
    face,
    font,
    info: {
      bytes: statSync(join(pub, path)).size,
      version: (face.getName(5, "en") || "")
        .replace(/^Version\s*/i, "")
        .split(";")[0]
        .trim(),
      upem: face.upem,
      ascender: ext.ascender,
      descender: ext.descender,
      lineGap: ext.lineGap,
      axes: Object.fromEntries(
        Object.entries(axes).map(([tag, a]) => [
          tag,
          [a.min, a.default, a.max],
        ]),
      ),
      features: FEATURES.filter((f) => feats.has(f)),
      cover,
      glyphs: unicodes.size,
    },
  };
}

/** A text drawn in a font: one SVG path at 100 units per em, and its width. */
function preview(font, upem, text) {
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(font, buf);
  const k = 100 / upem;
  let x = 0;
  const parts = [];
  for (const g of buf.getGlyphInfosAndPositions()) {
    const cmds = font.glyphToJson(g.codepoint);
    const ox = x + (g.xOffset ?? 0),
      oy = g.yOffset ?? 0;
    const P = (px, py) =>
      `${Math.round((ox + px) * k)} ${Math.round(-(oy + py) * k)}`;
    for (const c of cmds) {
      const v = c.values;
      if (c.type === "M") parts.push(`M${P(v[0], v[1])}`);
      else if (c.type === "L") parts.push(`L${P(v[0], v[1])}`);
      else if (c.type === "Q") parts.push(`Q${P(v[0], v[1])} ${P(v[2], v[3])}`);
      else if (c.type === "C")
        parts.push(`C${P(v[0], v[1])} ${P(v[2], v[3])} ${P(v[4], v[5])}`);
      else if (c.type === "Z") parts.push("Z");
    }
    x += g.xAdvance ?? 0;
  }
  return { d: parts.join(""), w: Math.round(x * k) };
}

const files = {};
const fonts = {};
const previews = {};
for (const def of FONTS) {
  if (def.source !== "file") continue;
  let cover = null;
  for (const f of def.files) {
    const { info, font, face } = analyse(f.path);
    files[f.path] = info;
    // A family covers what its regular (first) file covers.
    if (!cover) {
      cover = info.cover;
      const latin = info.cover.latin >= 0.95;
      const arabic = info.cover.arabic >= 0.95;
      previews[def.id] = {
        ...(latin ? { latin: preview(font, face.upem, def.family) } : {}),
        ...(arabic && def.familyAr
          ? { arabic: preview(font, face.upem, def.familyAr) }
          : {}),
        ...(!latin && !arabic
          ? {
              other: preview(
                font,
                face.upem,
                def.id === "noto-serif-hebrew" ? "עברית" : "देवनागरी",
              ),
            }
          : {}),
      };
    }
  }
  const scripts = [];
  if (cover.latin >= 0.95) scripts.push("latin");
  if (cover.greek >= 0.95) scripts.push("greek");
  if (cover.cyrillic >= 0.95) scripts.push("cyrillic");
  if (cover.arabic >= 0.95) scripts.push("arabic");
  if (cover.hebrew >= 0.95) scripts.push("hebrew");
  if (cover.devanagari >= 0.95) scripts.push("devanagari");
  const languages = [];
  if (cover.latin >= 0.95) languages.push("en");
  if (cover.latinExt >= 0.95) languages.push("fr", "es", "de");
  if (cover.arabic >= 0.95 && cover.arabicMarks >= 0.95) languages.push("ar");
  if (cover.arabic >= 0.95 && cover.persian >= 0.95) languages.push("fa");
  if (cover.arabic >= 0.95 && cover.urdu >= 0.95) languages.push("ur");
  if (cover.greek >= 0.95) languages.push("el");
  if (cover.cyrillic >= 0.95) languages.push("ru");
  if (cover.hebrew >= 0.95) languages.push("he");
  if (cover.devanagari >= 0.95) languages.push("hi");
  fonts[def.id] = { scripts, languages, cover };
}

const header = `// Generated by scripts/build-font-catalog.mjs — do not edit by hand.
// Run \`npm run fonts:catalog\` after changing the fonts in ./fonts.ts.
`;
writeFileSync(
  join(root, "features/mapmaker/text/fontInfo.generated.ts"),
  `${header}
export interface FontFileInfo {
  bytes: number;
  version: string;
  upem: number;
  ascender: number;
  descender: number;
  lineGap: number;
  /** Variable axes: tag → [min, default, max]. */
  axes: Record<string, [number, number, number]>;
  /** Optional OpenType features the file has (the ones the panel offers). */
  features: string[];
  /** Share (0..1) of each test set of letters the file has. */
  cover: Record<string, number>;
  glyphs: number;
}
export interface FontInfo {
  /** Scripts it covers (95% of the test letters or more). */
  scripts: string[];
  /** Languages whose letters it has (en, fr, es, de, ar, fa, ur, el, ru, he, hi). */
  languages: string[];
  cover: Record<string, number>;
}
export const FONT_FILE_INFO: Record<string, FontFileInfo> = ${JSON.stringify(files, null, 1)};
export const FONT_INFO: Record<string, FontInfo> = ${JSON.stringify(fonts, null, 1)};
`,
);
writeFileSync(join(pub, "fonts/previews.json"), JSON.stringify(previews));
mkdirSync(join(pub, "wasm"), { recursive: true });
copyFileSync(
  join(root, "node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm"),
  join(pub, "wasm/harfbuzz-subset.wasm"),
);
console.log(
  `${Object.keys(files).length} files, ${Object.keys(fonts).length} fonts`,
);
for (const [id, f] of Object.entries(fonts))
  console.log(id.padEnd(24), f.scripts.join(","), "|", f.languages.join(","));
