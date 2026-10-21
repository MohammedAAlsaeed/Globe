/**
 * Loading fonts for the Text Tool, once each and only when a text uses them.
 *
 *   HarfBuzz       the shaping engine (WebAssembly, ~0.4 MB), loaded with
 *                  the first text;
 *   font files     fetched from /fonts, turned into HarfBuzz faces (one per
 *                  file) and fonts (one per weight of a variable file), and
 *                  registered with the browser too (FontFace), so the inline
 *                  editor and the picker show the very same letters;
 *   web fonts      East Asian families from Google Fonts' stylesheet, drawn
 *                  by the browser (see ./fonts).
 *
 * Everything is cached for the page's life. Whoever draws text asks for the
 * fonts it needs and is told when they arrive (`onFontsChange`), so a map
 * opens at once and its texts appear as their fonts load. Exports wait for
 * every font first (`ensureFonts`).
 */
import type * as HB from "harfbuzzjs";
import { FONTS, fontDef, type FontDefinition, type FontFile } from "./fonts";
import { FONT_FILE_INFO } from "./fontInfo.generated";

type HarfBuzz = typeof HB;
let hbModule: HarfBuzz | null = null;
let hbLoading: Promise<HarfBuzz> | null = null;

/** HarfBuzz, once it has loaded (null before). */
export function harfbuzz(): HarfBuzz | null {
  return hbModule;
}
export function loadHarfBuzz(): Promise<HarfBuzz> {
  hbLoading ??= import("harfbuzzjs").then((m) => {
    hbModule = m as HarfBuzz;
    changed();
    return hbModule;
  });
  return hbLoading;
}

/** A shipped font file, ready to shape and draw. */
export interface LoadedFace {
  path: string;
  fontId: string;
  file: FontFile;
  face: HB.Face;
  upem: number;
  /** Which code points it has. */
  unicodes: Set<number>;
  ascender: number;
  descender: number;
  lineGap: number;
  wghtAxis: [number, number, number] | null;
  /** One HarfBuzz font per weight used (variable files), keyed by weight. */
  fonts: Map<number, HB.Font>;
  /** The browser's name for it (FontFace), for the inline editor. */
  cssFamily: string;
}

const faces = new Map<string, LoadedFace>();
const loading = new Map<string, Promise<LoadedFace | null>>();
const failed = new Set<string>();
const webReady = new Set<string>();
const webLoading = new Map<string, Promise<void>>();

/** Where font bytes come from (tests read them from disk). */
let fetchBytes: (path: string) => Promise<ArrayBuffer> = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`font ${r.status}`);
  return r.arrayBuffer();
};
export function setFontFetcher(fn: (path: string) => Promise<ArrayBuffer>) {
  fetchBytes = fn;
}

// ---- change notifications ------------------------------------------------------------------
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  for (const l of [...listeners]) l();
}
/** Bumped whenever a font (or HarfBuzz) arrives. */
export function fontsVersion() {
  return version;
}
/** Calls `fn` whenever fonts arrive; returns the unsubscribe. */
export function onFontsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- files ----------------------------------------------------------------------------------
export function cssFamilyOf(fontId: string) {
  return `mm-${fontId}`;
}

/** The loaded face of a file, or null (and starts loading it). */
export function faceOf(path: string): LoadedFace | null {
  const f = faces.get(path);
  if (f) return f;
  if (!failed.has(path)) void loadFile(path);
  return null;
}
export function isFailed(path: string) {
  return failed.has(path);
}

function fileOf(path: string): { def: FontDefinition; file: FontFile } | null {
  for (const def of FONTS) for (const file of def.files) if (file.path === path) return { def, file };
  return null;
}

export function loadFile(path: string): Promise<LoadedFace | null> {
  const known = faces.get(path);
  if (known) return Promise.resolve(known);
  let p = loading.get(path);
  if (!p) {
    p = (async () => {
      const owner = fileOf(path);
      if (!owner) return null;
      try {
        const [hb, bytes] = await Promise.all([loadHarfBuzz(), fetchBytes(path)]);
        const face = new hb.Face(new hb.Blob(bytes), 0);
        const base = new hb.Font(face);
        const ext = base.hExtents();
        const axes = face.getAxisInfos();
        const w = axes.wght;
        const loaded: LoadedFace = {
          path,
          fontId: owner.def.id,
          file: owner.file,
          face,
          upem: face.upem,
          unicodes: new Set(face.collectUnicodes()),
          ascender: ext.ascender,
          descender: ext.descender,
          lineGap: ext.lineGap,
          wghtAxis: w ? [w.min, w.default, w.max] : null,
          fonts: new Map(),
          cssFamily: cssFamilyOf(owner.def.id),
        };
        faces.set(path, loaded);
        registerCss(loaded, bytes);
        changed();
        return loaded;
      } catch {
        failed.add(path);
        changed();
        return null;
      } finally {
        loading.delete(path);
      }
    })();
    loading.set(path, p);
  }
  return p;
}

/** The face's HarfBuzz font at a weight (variable files are set to it). */
export function hbFontAt(face: LoadedFace, weight: number): HB.Font {
  const w = face.wghtAxis ? Math.round(Math.min(face.wghtAxis[2], Math.max(face.wghtAxis[0], weight))) : 0;
  let font = face.fonts.get(w);
  if (!font) {
    const hb = harfbuzz()!;
    font = new hb.Font(face.face);
    if (face.wghtAxis) font.setVariations([new hb.Variation("wght", w)]);
    face.fonts.set(w, font);
  }
  return font;
}

/** Makes the browser know the font too (same bytes), for the inline editor and previews. */
function registerCss(face: LoadedFace, bytes: ArrayBuffer) {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  try {
    const weight = Array.isArray(face.file.weight) ? `${face.file.weight[0]} ${face.file.weight[1]}` : String(face.file.weight);
    const ff = new FontFace(face.cssFamily, bytes.slice(0), { weight, style: face.file.italic ? "italic" : "normal" });
    void ff.load().then((loaded) => {
      document.fonts.add(loaded);
      changed();
    });
  } catch {
    // The canvas drawing never depends on this.
  }
}

// ---- choosing files ---------------------------------------------------------------------------
/**
 * The file of a font for a weight and style: an italic file when asked and
 * there is one, then the variable file covering the weight or the static
 * file nearest to it. Never a synthetic bold or slant.
 */
export function pickFile(def: FontDefinition, weight: number, italic: boolean): { file: FontFile; exactWeight: boolean; exactStyle: boolean } | null {
  if (!def.files.length) return null;
  const styled = def.files.filter((f) => f.italic === italic);
  const pool = styled.length ? styled : def.files.filter((f) => !f.italic).length ? def.files.filter((f) => !f.italic) : def.files;
  let best = pool[0],
    bestD = Infinity;
  for (const f of pool) {
    const d = Array.isArray(f.weight) ? (weight < f.weight[0] ? f.weight[0] - weight : weight > f.weight[1] ? weight - f.weight[1] : 0) : Math.abs(f.weight - weight);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return { file: best, exactWeight: bestD === 0, exactStyle: styled.length > 0 };
}

/** The weights a font really has: a range for variable files, the list for static ones. */
export function fontWeights(def: FontDefinition, italic = false): { range: [number, number] | null; list: number[] } {
  const files = def.files.filter((f) => f.italic === italic).length ? def.files.filter((f) => f.italic === italic) : def.files.filter((f) => !f.italic);
  const ranges = files.filter((f) => Array.isArray(f.weight)).map((f) => f.weight as [number, number]);
  if (ranges.length) return { range: [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))], list: [] };
  return { range: null, list: [...new Set(files.map((f) => f.weight as number))].sort((a, b) => a - b) };
}
export function hasItalic(def: FontDefinition) {
  return def.files.some((f) => f.italic);
}
/** Download size of a font's files (bytes), from the catalog. */
export function fontBytes(def: FontDefinition) {
  return def.files.reduce((s, f) => s + (FONT_FILE_INFO[f.path]?.bytes ?? 0), 0);
}

// ---- web fonts (East Asian) ----------------------------------------------------------------------
export function webFontReady(id: string) {
  return webReady.has(id);
}
/** Loads a web font's stylesheet and the slices `sample` needs. */
export function loadWebFont(id: string, sample: string): Promise<void> {
  const def = fontDef(id);
  if (!def?.css || typeof document === "undefined") return Promise.resolve();
  const key = `${id}|${sample}`;
  let p = webLoading.get(key);
  if (!p) {
    p = (async () => {
      const href = `https://fonts.googleapis.com/css2?family=${def.css!.query}&display=swap`;
      if (!document.querySelector(`link[data-mm-font="${id}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.mmFont = id;
        document.head.appendChild(link);
        await new Promise<void>((resolve) => {
          link.onload = () => resolve();
          link.onerror = () => resolve();
        });
      }
      try {
        await document.fonts.load(`400 32px "${def.css!.family}"`, sample || "中");
        await document.fonts.load(`700 32px "${def.css!.family}"`, sample || "中");
      } catch {}
      webReady.add(id);
      changed();
    })();
    webLoading.set(key, p);
  }
  return p;
}
