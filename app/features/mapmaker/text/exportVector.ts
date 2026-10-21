/**
 * Texts in vector exports (SVG and PDF): the same outlines the map draws
 * (./geometry), placed at the output size.
 *
 *   outlines   every text as filled paths — looks the same everywhere,
 *              whatever fonts the viewer has (the report's "Outlined Text");
 *   editable   straight texts as real <text> (selectable, searchable, still
 *              editable in Illustrator/Inkscape); curved ones stay outlines.
 *              The fonts can go inside the file, cut down to the letters
 *              used (./subset), so it looks the same without them installed.
 *
 * East Asian letters, which the browser draws on the map, get their
 * outlines from the same web-font files (./webOutlines) once loaded with
 * `prepareTextExport`.
 *
 * Shadows become an SVG filter (and a small picture in PDFs, which have no
 * blur); outlines a stroke behind the letters, cut out under a faded fill.
 */
import type { MMText } from "../types";
import { fontDef, fontProfile, profileSlot } from "./fonts";
import { textGeometry, type Ops, type TextGeometry } from "./geometry";
import { drawText } from "./render";
import type { LaidLine, PlacedGlyph } from "./shape";
import type { LoadedFace } from "./fontStore";
import { base64, subsetFont } from "./subset";
import {
  loadWebOutlines,
  parseCanvasFont,
  webFacesOf,
  webGlyphOps,
  type WebFace,
} from "./webOutlines";

export type TextExportMode = "outlines" | "editable";
type Matrix = [number, number, number, number, number, number];

/** em → output pixels for a text (its own place, turn and size). */
export function outputTransform(o: MMText, outW: number, outH: number): Matrix {
  const k = o.size * outW;
  if (o.curveMode === "path" && o.path) return [k, 0, 0, k, 0, 0];
  const r = (o.rotation * Math.PI) / 180,
    c = Math.cos(r) * k,
    s = Math.sin(r) * k;
  return [c, s, -s, c, o.x * outW, o.y * outH];
}

function transformOps(ops: Ops, m: Matrix): Ops {
  const out: Ops = [];
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    const n = op === 0 || op === 1 ? 1 : op === 2 ? 2 : op === 3 ? 3 : 0;
    out.push(op);
    for (let p = 0; p < n; p++) {
      const x = ops[i + 1 + p * 2],
        y = ops[i + 2 + p * 2];
      out.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    }
    i += 1 + n * 2;
  }
  return out;
}
function svgD(ops: Ops, digits = 2): string {
  const f = (v: number) => +v.toFixed(digits);
  const parts: string[] = [];
  for (let i = 0; i < ops.length; ) {
    const op = ops[i];
    if (op === 0) {
      parts.push(`M${f(ops[i + 1])} ${f(ops[i + 2])}`);
      i += 3;
    } else if (op === 1) {
      parts.push(`L${f(ops[i + 1])} ${f(ops[i + 2])}`);
      i += 3;
    } else if (op === 2) {
      parts.push(
        `Q${f(ops[i + 1])} ${f(ops[i + 2])} ${f(ops[i + 3])} ${f(ops[i + 4])}`,
      );
      i += 5;
    } else if (op === 3) {
      parts.push(
        `C${f(ops[i + 1])} ${f(ops[i + 2])} ${f(ops[i + 3])} ${f(ops[i + 4])} ${f(ops[i + 5])} ${f(ops[i + 6])}`,
      );
      i += 7;
    } else {
      parts.push("Z");
      i += 1;
    }
  }
  return parts.join("");
}
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A text's letters in em: the font outlines plus the browser-drawn ones (null while those aren't loaded). */
function letterOps(geo: TextGeometry): Ops | null {
  if (!geo.web.length) return geo.ops;
  const out = geo.ops.slice();
  for (const w of geo.web) {
    const ops = webGlyphOps(w);
    if (!ops) return null;
    for (const v of ops) out.push(v);
  }
  return out;
}

/** Fetches the outlines of browser-drawn letters, so those texts export as vectors too. */
export async function prepareTextExport(
  texts: MMText[],
  aspect: number,
): Promise<void> {
  const web = texts.flatMap((o) => textGeometry(o, aspect).web);
  if (web.length) await loadWebOutlines(web);
}

/** Whether a text can be exported as vectors (all its letters have outlines). */
export function isVectorText(o: MMText, aspect: number): boolean {
  const geo = textGeometry(o, aspect);
  if (!geo.ready) return false;
  const ops = letterOps(geo);
  return !!ops && ops.length > 0;
}

/** The text's letters at the output size, as one SVG path. */
export function textPathD(
  o: MMText,
  outW: number,
  outH: number,
): { d: string; geo: TextGeometry; scale: number } {
  const geo = textGeometry(o, outH / outW);
  return {
    d: svgD(
      transformOps(letterOps(geo) ?? geo.ops, outputTransform(o, outW, outH)),
    ),
    geo,
    scale: o.size * outW,
  };
}

/** Straight texts (no arc, no path) keep their lines as laid out. */
export function isStraight(o: MMText) {
  return o.curveMode === "straight" || (o.curveMode === "arc" && !o.curve);
}

// ---- runs: the letters of a line by the font that draws them ------------------------------------
export interface FaceRun {
  /** The shipped font file that draws it (null: letters the browser draws). */
  face: LoadedFace | null;
  /** For browser-drawn letters, their canvas font. */
  css: string | null;
  weight: number;
  /** Its letters in reading order. */
  text: string;
  /** Left and right edges on the line (em). */
  x0: number;
  x1: number;
}

/**
 * Cuts a line into runs of one font, left to right as drawn, each with the
 * letters it draws (the clusters of its glyphs, in reading order).
 */
export function faceRuns(line: LaidLine): FaceRun[] {
  const clusters = [...new Set(line.glyphs.map((g) => g.cluster))].sort(
    (a, b) => a - b,
  );
  const end = (c: number) => {
    const i = clusters.indexOf(c);
    return i + 1 < clusters.length ? clusters[i + 1] : line.text.length;
  };
  const keyOf = (g: PlacedGlyph) =>
    g.ref.kind === "hb"
      ? `hb:${g.ref.face.path}:${Math.round(g.ref.weight)}`
      : `web:${g.ref.css}`;
  const runs: (FaceRun & { key: string; cl: Set<number> })[] = [];
  for (const g of line.glyphs) {
    const key = keyOf(g);
    let run = runs[runs.length - 1];
    if (!run || run.key !== key) {
      run = {
        key,
        cl: new Set(),
        face: g.ref.kind === "hb" ? g.ref.face : null,
        css: g.ref.kind === "web" ? g.ref.css : null,
        weight:
          g.ref.kind === "hb"
            ? g.ref.weight
            : parseCanvasFont(g.ref.css).weight,
        text: "",
        x0: g.x,
        x1: g.x + g.adv,
      };
      runs.push(run);
    }
    run.cl.add(g.cluster);
    run.x0 = Math.min(run.x0, g.x);
    run.x1 = Math.max(run.x1, g.x + g.adv);
  }
  return runs.map((r) => ({
    face: r.face,
    css: r.css,
    weight: r.weight,
    x0: r.x0,
    x1: r.x1,
    text: [...r.cl]
      .sort((a, b) => a - b)
      .map((c) => line.text.slice(c, end(c)))
      .join(""),
  }));
}

// ---- fonts inside SVGs -----------------------------------------------------------------------------
/** The family an embedded font goes by in an exported SVG. */
const embeddedFamily = (fontId: string) => `mm-${fontId}`;

/**
 * `@font-face` rules for the editable texts of an SVG: every font file
 * used, cut down to the letters it draws there (web-font slices as they
 * are). Empty when nothing needs a font.
 */
export async function svgFontFaces(
  texts: MMText[],
  aspect: number,
): Promise<string> {
  const files = new Map<string, { face: LoadedFace; cps: Set<number> }>();
  const slices = new Map<string, { face: WebFace; bytes: Uint8Array }>();
  for (const o of texts) {
    if (!isStraight(o)) continue;
    const geo = textGeometry(o, aspect);
    for (const line of geo.shaped.lines)
      for (const run of faceRuns(line)) {
        if (!run.face) continue;
        let f = files.get(run.face.path);
        if (!f)
          files.set(run.face.path, (f = { face: run.face, cps: new Set() }));
        for (const ch of run.text) f.cps.add(ch.codePointAt(0)!);
      }
    for (const w of geo.web)
      for (const s of webFacesOf(w)) slices.set(s.face.url, s);
  }
  const rules: string[] = [];
  for (const { face, cps } of files.values()) {
    const bytes = await subsetFont(face.bytes, cps);
    if (!bytes) continue;
    const w = face.file.weight;
    rules.push(
      `@font-face{font-family:"${embeddedFamily(face.fontId)}";src:url(data:font/ttf;base64,${base64(bytes)}) format("truetype");font-weight:${Array.isArray(w) ? `${w[0]} ${w[1]}` : w};font-style:${face.file.italic ? "italic" : "normal"}}`,
    );
  }
  for (const { face, bytes } of slices.values())
    rules.push(
      `@font-face{font-family:"${face.family}";src:url(data:font/woff2;base64,${base64(bytes)}) format("woff2");font-weight:${face.weight[0]} ${face.weight[1]};font-style:${face.italic ? "italic" : "normal"};unicode-range:${face.ranges.map(([a, b]) => `U+${a.toString(16)}-${b.toString(16)}`).join(",")}}`,
    );
  return rules.join("");
}

/**
 * Font families for a text's editable SVG letters, in the order the engine
 * used them (embedded ones first when the file carries its fonts), then the
 * real family names and a generic fallback.
 */
function familyStack(o: MMText, geo: TextGeometry, embedded: boolean): string {
  const names: string[] = [];
  for (const line of geo.shaped.lines)
    for (const g of line.glyphs) {
      if (g.ref.kind === "hb") {
        if (embedded) names.push(embeddedFamily(g.ref.face.fontId));
        names.push(fontDef(g.ref.face.fontId)?.family ?? g.ref.face.fontId);
      } else {
        const fam = parseCanvasFont(g.ref.css).family;
        if (fam) names.push(fam);
      }
    }
  const p = fontProfile(o.profile);
  for (const id of [
    o.font,
    profileSlot(p, "latin")?.font,
    profileSlot(p, "arabic")?.font,
  ])
    if (id) names.push(fontDef(id)?.family ?? id);
  return [...new Set(names)]
    .map((f) => `'${f}'`)
    .concat("serif")
    .join(", ");
}

/** One text as SVG (a group, plus the defs it needs). `embedded`: the SVG carries the fonts (see svgFontFaces). */
export function textToSvg(
  o: MMText,
  outW: number,
  outH: number,
  mode: TextExportMode,
  id: string,
  embedded = false,
): { defs: string; body: string } {
  const { d, geo, scale } = textPathD(o, outW, outH);
  const defs: string[] = [];
  const parts: string[] = [];
  const blend =
    o.blend && o.blend !== "normal" ? ` style="mix-blend-mode:${o.blend}"` : "";
  const outline =
    o.outline.enabled && o.outline.width > 0 && o.outline.opacity > 0;
  const ow = +(
    o.outline.width *
    scale *
    (o.outline.position === "outside" ? 2 : 1)
  ).toFixed(2);
  const join = o.outline.join;
  const shadow = o.shadow.enabled && o.shadow.opacity > 0;
  if (shadow)
    defs.push(
      `<filter id="${id}-sh" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${+(o.shadow.blur * scale * 0.5).toFixed(2)}"/><feOffset dx="${+(o.shadow.offsetX * scale).toFixed(2)}" dy="${+(o.shadow.offsetY * scale).toFixed(2)}" result="b"/><feFlood flood-color="${o.shadow.color}" flood-opacity="${o.shadow.opacity}"/><feComposite in2="b" operator="in"/></filter>`,
    );
  const strokeAttrs = `stroke="${o.outline.color}" stroke-opacity="${o.outline.opacity}" stroke-width="${ow}" stroke-linejoin="${join}"`;

  if (mode === "editable" && isStraight(o) && geo.shaped.ready) {
    // Real text, a <text> a line, centred where the engine centred the line
    // (so a small difference in widths shifts nothing). Outline and shadow
    // come from the same text, so they always match its letters.
    const [a, b, , , e, f] = outputTransform(o, outW, outH);
    const deg = (Math.atan2(b, a) * 180) / Math.PI;
    const family = esc(familyStack(o, geo, embedded));
    const common = `font-family="${family}" font-size="${+scale.toFixed(2)}" font-weight="${Math.round(o.weight)}" font-style="${o.italic ? "italic" : "normal"}" letter-spacing="${+(o.letterSpacing * scale).toFixed(2)}" text-anchor="middle"`;
    const lines = geo.shaped.lines
      .filter((l) => l.text.trim())
      .map((l) => ({
        x: +((l.x0 + l.width / 2) * scale).toFixed(2),
        y: +(l.baseline * scale).toFixed(2),
        dir: l.rtl ? "rtl" : "ltr",
        text: esc(l.text),
      }));
    const textEl = (paint: string) =>
      lines
        .map(
          (l) =>
            `<text x="${l.x}" y="${l.y}" direction="${l.dir}" ${paint}>${l.text}</text>`,
        )
        .join("");
    const g = (inner: string, extra = "") =>
      `<g transform="translate(${+e.toFixed(2)} ${+f.toFixed(2)}) rotate(${+deg.toFixed(3)})" ${common}${extra}>${inner}</g>`;
    if (shadow)
      parts.push(
        g(
          textEl(
            `fill="#000"${outline ? ` stroke="#000" stroke-width="${ow}" stroke-linejoin="${join}"` : ""}`,
          ),
          ` filter="url(#${id}-sh)"`,
        ),
      );
    const stroke = outline
      ? ` ${strokeAttrs}${o.outline.position === "outside" ? ' paint-order="stroke"' : ""}`
      : "";
    parts.push(
      g(textEl(`fill="${o.fill}" fill-opacity="${o.fillOpacity}"${stroke}`)),
    );
  } else {
    if (shadow)
      parts.push(
        `<path d="${d}" fill="#000"${outline ? ` stroke="#000" stroke-width="${ow}" stroke-linejoin="${join}"` : ""} filter="url(#${id}-sh)"/>`,
      );
    if (outline && o.outline.position === "outside") {
      // Under a faded fill, the outline is cut out where the letters are.
      let mask = "";
      if (o.fillOpacity < 0.999) {
        defs.push(
          `<mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${outW}" height="${outH}"><rect width="${outW}" height="${outH}" fill="#fff"/><path d="${d}" fill="#000"/></mask>`,
        );
        mask = ` mask="url(#${id}-cut)"`;
      }
      parts.push(
        `<path d="${d}" fill="none" ${strokeAttrs} stroke-linecap="round"${mask}/>`,
      );
    }
    parts.push(
      `<path d="${d}" fill="${o.fill}" fill-opacity="${o.fillOpacity}"/>`,
    );
    if (outline && o.outline.position === "center")
      parts.push(`<path d="${d}" fill="none" ${strokeAttrs}/>`);
  }
  return {
    defs: defs.join(""),
    body: `<g id="${id}" opacity="${o.opacity}"${blend}><title>${esc(o.text)}</title>${parts.join("")}</g>`,
  };
}

/**
 * A text's shadow alone, as a picture (PDFs have no blur): the canvas and
 * where it goes (output pixels). Null when it has none.
 */
export function shadowPicture(
  o: MMText,
  outW: number,
  outH: number,
): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  if (!o.shadow.enabled || o.shadow.opacity <= 0) return null;
  const geo = textGeometry(o, outH / outW);
  const m = outputTransform(o, outW, outH),
    k = o.size * outW;
  const pad =
    (o.shadow.blur * 2 +
      Math.abs(o.shadow.offsetX) +
      Math.abs(o.shadow.offsetY) +
      o.outline.width * 2) *
      k +
    4;
  const corners = [
    [geo.bounds.x0, geo.bounds.y0],
    [geo.bounds.x1, geo.bounds.y0],
    [geo.bounds.x0, geo.bounds.y1],
    [geo.bounds.x1, geo.bounds.y1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const x0 = Math.floor(Math.min(...corners.map((c) => c[0])) - pad),
    y0 = Math.floor(Math.min(...corners.map((c) => c[1])) - pad),
    x1 = Math.ceil(Math.max(...corners.map((c) => c[0])) + pad),
    y1 = Math.ceil(Math.max(...corners.map((c) => c[1])) + pad);
  const w = x1 - x0,
    h = y1 - y0;
  if (w <= 0 || h <= 0 || w * h > 40e6) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4] - x0, m[5] - y0);
  ctx.globalAlpha = o.opacity;
  // The shadow only: the letters themselves are drawn as vectors on top.
  drawText(ctx, geo, {
    ...o,
    fillOpacity: 0,
    outline: { ...o.outline, enabled: false },
  });
  return { canvas, x: x0, y: y0 };
}

/** A run of a text placed in output pixels (y down): its baseline start, and one em along the baseline and up. */
export interface PlacedRun {
  run: FaceRun;
  origin: [number, number];
  along: [number, number];
  up: [number, number];
  /** Its width, in ems of `along`. */
  width: number;
}

/**
 * Where each run of a text sits in output pixels, for a PDF's invisible
 * (selectable, searchable) text. Curved texts are laid along the middle
 * of their box (their letters themselves are outlines).
 */
export function textRunsPlaced(
  o: MMText,
  outW: number,
  outH: number,
): PlacedRun[] {
  const geo = textGeometry(o, outH / outW);
  const m = outputTransform(o, outW, outH);
  const P = (x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  const out: PlacedRun[] = [];
  if (isStraight(o)) {
    for (const line of geo.shaped.lines)
      for (const run of faceRuns(line))
        out.push({
          run,
          origin: P(run.x0, line.baseline),
          along: [m[0], m[1]],
          up: [-m[2], -m[3]],
          width: run.x1 - run.x0,
        });
    return out;
  }
  const b = geo.bounds;
  const runs = geo.shaped.lines.flatMap((l) => faceRuns(l));
  const total = runs.reduce((s, r) => s + (r.x1 - r.x0), 0) || 1;
  const k = (b.x1 - b.x0) / total;
  const size = Math.max(0.05, Math.min(1, (b.y1 - b.y0) * 0.7));
  let x = b.x0;
  const y = (b.y0 + b.y1) / 2 + size * 0.35;
  for (const run of runs) {
    const w = (run.x1 - run.x0) * k;
    out.push({
      run,
      origin: P(x, y),
      along: [m[0] * size, m[1] * size],
      up: [-m[2] * size, -m[3] * size],
      width: w / size,
    });
    x += w;
  }
  return out;
}
