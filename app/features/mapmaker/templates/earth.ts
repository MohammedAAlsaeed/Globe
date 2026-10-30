/**
 * The Earth template: turns the Natural Earth geography prepared by
 * scripts/build-earth-template.mjs into an ordinary map — every coast,
 * lake, river, border and name is a normal object the person can change,
 * erase or build on.
 *
 *   Land      continents and islands (Land Tool polygons, exact coasts)
 *             with lakes cut out as water, their islands added back
 *   Rivers    Line Tool lines
 *   Borders   Line Tool lines (disputed and similar ones dashed)
 *   Graticule the 15° grid, equator, tropics and polar circles
 *   Names     oceans, seas, great lakes and countries (Text Tool texts)
 *   Continents, Capitals (a dot and its name, joined)
 *
 * Equirectangular, 2:1: exactly what the globe print needs. Pure (no DOM):
 * the same function runs in the editor and in the tests.
 */
import {
  DEFAULT_BACKGROUND,
  RESOLUTIONS,
  computeCanvasSize,
  createLayer,
} from "../domain";
import { DEFAULT_LAND_TOOL } from "../brush/land";
import { DEFAULT_COAST } from "../brush/coastStyles";
import { newSeed } from "../brush/noise";
import { builtinLineStyles } from "../lines/state";
import { BUILTIN_TEXT_STYLES, FACTORY_TEXT_LOOK } from "../text/state";
import { builtinKey } from "../stamps/catalog";
import type {
  CoastEffect,
  LineColorStroke,
  LineLook,
  LineNode,
  MMLand,
  MMLayer,
  MMLine,
  MMProject,
  MMStamp,
  MMText,
  ResolutionTier,
  TextLook,
} from "../types";

// ---- the template file ----------------------------------------------------------------
/** Flat [x0, y0, dx1, dy1, …], map fractions × scale. */
export type EncodedPath = number[];
/** Points of view where a feature differs from the default: 1 shown, 0 hidden. */
export type PovExceptions = Record<string, 0 | 1>;
export type EarthLabelKind =
  "continent" | "ocean" | "sea" | "lake" | "country" | "capital";

export interface EarthData {
  format: 1;
  template: "earth";
  detail: string;
  source: { name: string; version: string; url: string; license: string };
  projection: "equirectangular";
  scale: number;
  land: EncodedPath[];
  lakes: { r: EncodedPath; k: number; i?: EncodedPath[] }[];
  rivers: { l: EncodedPath; k: number }[];
  borders: { l: EncodedPath; t?: number; v?: PovExceptions }[];
  labels: {
    t: EarthLabelKind;
    en: string;
    ar: string;
    x: number;
    y: number;
    k: number;
    /** Countries: the zoom Natural Earth starts labelling them at (ties). */
    m?: number;
    /** 0: not shown by default (only in the points of view in `v`). */
    d?: 0;
    v?: PovExceptions;
  }[];
  povs: string[];
}

/** The template's layers, bottom to top (Water and Land are always there). */
export const EARTH_LAYERS = [
  "rivers",
  "borders",
  "graticule",
  "names",
  "continents",
  "capitals",
] as const;
export type EarthLayer = (typeof EARTH_LAYERS)[number];

/** Shown when the map is created (the rest are there, hidden). */
export const EARTH_DEFAULT_SHOWN: Record<EarthLayer, boolean> = {
  rivers: true,
  borders: true,
  graticule: true,
  names: true,
  continents: false,
  capitals: false,
};

export interface EarthOptions {
  name: string;
  resolutionTier: ResolutionTier;
  /** Language of the names. */
  lang: "ar" | "en";
  /** Point of view for disputed areas (a code from EarthData.povs), or null
   * for Natural Earth's own (de facto) view. */
  pov: string | null;
  shown: Record<EarthLayer, boolean>;
  /** Layer names, in the person's language. */
  layerNames: Record<EarthLayer | "water" | "land", string>;
}

/** The template detail a resolution uses (simpler data for small maps). */
export function earthDetail(tier: ResolutionTier) {
  return tier === "low" ? "110m" : "50m";
}

/** Grid of the template's maps: 36 × 18 tiles of 10°. */
export const EARTH_COLS = 36;
export const EARTH_ROWS = 18;

// ---- decoding -------------------------------------------------------------------------
type Pt = { x: number; y: number };
const q5 = (v: number) => Math.round(v * 1e5) / 1e5;

export function decodePath(p: EncodedPath, scale: number): Pt[] {
  const out: Pt[] = [];
  let x = 0,
    y = 0;
  for (let i = 0; i + 1 < p.length; i += 2) {
    x += p[i];
    y += p[i + 1];
    out.push({ x: q5(x / scale), y: q5(y / scale) });
  }
  return out;
}

function shownIn(
  pov: string | null,
  byDefault: boolean,
  v: PovExceptions | undefined,
) {
  if (!pov || !v || v[pov] === undefined) return byDefault;
  return v[pov] === 1;
}

// ---- looks ----------------------------------------------------------------------------
function lineLook(stroke: Partial<LineColorStroke>, opacity: number): LineLook {
  const base =
    builtinLineStyles().find((s) => s.id === "p:river")?.look ??
    builtinLineStyles()[0].look;
  return {
    ...base,
    mode: "color",
    stroke: { ...base.stroke, blur: 0, casing: 0, ...stroke },
    opacity,
  };
}

function textStyle(id: string): TextLook {
  return (
    BUILTIN_TEXT_STYLES.find((s) => s.id === `t:${id}`)?.look ??
    FACTORY_TEXT_LOOK
  );
}

/** A name's look: the built-in style, sized for a whole-world map. Arabic
 * keeps its letters joined (no letter spacing, no capitals). */
function labelLook(
  styleId: string,
  size: number,
  lang: "ar" | "en",
  patch: Partial<TextLook> = {},
): TextLook {
  const s = textStyle(styleId),
    look: TextLook = {
      ...s,
      ...patch,
      size,
      lang,
      curveMode: "straight",
      curve: 0,
    };
  if (lang === "ar") {
    look.letterSpacing = 0;
    look.caps = false;
  }
  return look;
}

const countrySize = (rank: number) =>
  rank <= 2
    ? 0.0062
    : rank <= 3
      ? 0.0054
      : rank <= 4
        ? 0.0048
        : rank <= 5
          ? 0.0042
          : 0.0037;

/** The classic coast, drawn finer: on a whole world the decoration is
 * scaled to continents, not to a fantasy island. Real coasts keep their
 * shape (no smoothing, a hint of jaggedness). */
export const EARTH_COAST: CoastEffect = {
  ...DEFAULT_COAST,
  style: null,
  baseStyle: "classic",
  roughness: 0.2,
  detail: 0.6,
  smoothing: 0,
  outlineWidth: 0.0007,
  shoreWidth: 0.002,
  landShadeWidth: 0.005,
  glowWidth: 0.008,
  waves: 3,
  waveSpacing: 0.0032,
  waveOffset: 0.0028,
  waveWidth: 0.0007,
  waveOpacity: 0.45,
  depthDistance: 0.06,
};

// ---- names that keep apart ------------------------------------------------------------
type Box = { x0: number; y0: number; x1: number; y1: number };

/** A text's rough extent (map-width units): wide enough to keep names
 * from touching, without measuring the letters (no fonts at build time). */
function textBox(t: MMText, aspect: number): Box {
  const chars = [...t.text].length,
    w = chars * t.size * (0.5 + (t.caps ? 0.06 : 0) + t.letterSpacing),
    h = t.size * 1.3,
    y = t.y * aspect,
    x0 = t.align === "left" ? t.x : t.align === "right" ? t.x - w : t.x - w / 2;
  return { x0, y0: y - h / 2, x1: x0 + w, y1: y + h / 2 };
}
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The names, most important first, leaving out any that would overlap
 * one already placed; one that may shrink (`min`) tries smaller sizes
 * first, as an atlas sets small countries in small type. */
function placeApart(
  c: { t: MMText; rank: number; min?: number }[],
  aspect: number,
) {
  const placed: Box[] = [],
    out: MMText[] = [];
  const fits = (tt: MMText) => {
    const b = textBox(tt, aspect),
      pad = tt.size * 0.15,
      grown = {
        x0: b.x0 - pad,
        y0: b.y0 - pad,
        x1: b.x1 + pad,
        y1: b.y1 + pad,
      };
    return placed.some((p) => overlaps(p, grown)) ? null : b;
  };
  for (const { t, min } of [...c].sort((a, b) => a.rank - b.rank)) {
    let done = false;
    for (let size = t.size; !done; size *= 0.86) {
      const s = Math.max(size, min ?? t.size),
        sized = s === t.size ? t : { ...t, size: q5(s) },
        // where it belongs, else nudged a little up or down
        dy = (s * 1.1) / aspect;
      for (const y of [t.y, t.y - dy, t.y + dy]) {
        const tt = y === t.y ? sized : { ...sized, y: q5(y) },
          b = fits(tt);
        if (b) {
          placed.push(b);
          out.push(tt);
          done = true;
          break;
        }
      }
      if (s <= (min ?? t.size)) break;
    }
  }
  return out;
}

// ---- building -------------------------------------------------------------------------
/** Splits a path into runs a line can hold (sharing their ends). */
function chunks(pts: Pt[], max = 1900): Pt[][] {
  if (pts.length <= max) return [pts];
  const out: Pt[][] = [];
  for (let i = 0; i < pts.length - 1; i += max - 1)
    out.push(pts.slice(i, Math.min(pts.length, i + max)));
  return out;
}

function line(
  pts: Pt[],
  look: LineLook,
  styleId: string | null,
  name?: string,
): MMLine {
  return {
    id: crypto.randomUUID(),
    kind: "line",
    closed: false,
    nodes: pts.map((p): LineNode => ({ x: p.x, y: p.y })),
    ...look,
    styleId,
    ...(name ? { name } : {}),
  };
}

function land(points: Pt[], erase: boolean): MMLand {
  return {
    id: crypto.randomUUID(),
    kind: "land",
    mode: "polygon",
    erase,
    points,
    edge: DEFAULT_LAND_TOOL.edge,
    rough: false,
    seed: newSeed(),
  };
}

function text(
  words: string,
  x: number,
  y: number,
  look: TextLook,
  styleId: string,
): MMText {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text: words,
    x: q5(x),
    y: q5(y),
    rotation: 0,
    boxWidth: null,
    ...look,
    styleId,
  };
}

function graticule(): MMLine[] {
  const grid = lineLook(
      { color: "#20384c", width: 0.00035, pattern: "solid", cap: "butt" },
      0.32,
    ),
    equator = lineLook(
      { color: "#20384c", width: 0.0006, pattern: "solid", cap: "butt" },
      0.5,
    ),
    circle = lineLook(
      {
        color: "#20384c",
        width: 0.00045,
        pattern: "dashed",
        dash: 6,
        gap: 4,
        cap: "butt",
      },
      0.45,
    ),
    y = (lat: number) => q5((90 - lat) / 180),
    x = (lon: number) => q5((lon + 180) / 360),
    out: MMLine[] = [];
  for (let lon = -165; lon <= 165; lon += 15)
    out.push(
      line(
        [
          { x: x(lon), y: 0 },
          { x: x(lon), y: 1 },
        ],
        grid,
        null,
      ),
    );
  for (let lat = -75; lat <= 75; lat += 15)
    out.push(
      line(
        [
          { x: 0, y: y(lat) },
          { x: 1, y: y(lat) },
        ],
        lat === 0 ? equator : grid,
        null,
      ),
    );
  // Tropics and polar circles (23.44°, 66.56°).
  for (const lat of [23.44, -23.44, 66.56, -66.56])
    out.push(
      line(
        [
          { x: 0, y: y(lat) },
          { x: 1, y: y(lat) },
        ],
        circle,
        null,
      ),
    );
  return out;
}

/** The whole map, ready to open in the editor. */
export function buildEarthProject(data: EarthData, o: EarthOptions): MMProject {
  const S = data.scale,
    res = RESOLUTIONS.find((r) => r.key === o.resolutionTier) ?? RESOLUTIONS[1],
    { width, height } = computeCanvasSize(res.longEdge, EARTH_COLS, EARTH_ROWS),
    lang = o.lang,
    name = (l: { en: string; ar: string }) =>
      (lang === "ar" ? l.ar : l.en) || l.en,
    layer = (key: EarthLayer, objects: MMLayer["objects"]): MMLayer => ({
      ...createLayer(o.layerNames[key]),
      visible: o.shown[key],
      objects,
    });

  // Land: continents and islands, lakes cut out, their islands back.
  const landObjects: MMLand[] = data.land.map((r) =>
    land(decodePath(r, S), false),
  );
  for (const lake of data.lakes) {
    landObjects.push(land(decodePath(lake.r, S), true));
    for (const isl of lake.i ?? [])
      landObjects.push(land(decodePath(isl, S), false));
  }

  // Rivers: wider for the big ones.
  const riverLook = (k: number) =>
    lineLook(
      {
        color: "#3f7aa6",
        width: k <= 2 ? 0.0008 : k <= 4 ? 0.0006 : 0.00042,
        pattern: "solid",
        cap: "round",
      },
      0.9,
    );
  const rivers = data.rivers.flatMap((r) =>
    chunks(decodePath(r.l, S)).map((pts) => line(pts, riverLook(r.k), null)),
  );

  // Borders.
  const border = lineLook(
      { color: "#5b4636", width: 0.0005, pattern: "solid", cap: "round" },
      0.75,
    ),
    disputed = lineLook(
      {
        color: "#5b4636",
        width: 0.0005,
        pattern: "dashed",
        dash: 3,
        gap: 2.5,
        cap: "butt",
      },
      0.75,
    );
  const borders = data.borders
    .filter((b) => shownIn(o.pov, true, b.v))
    .flatMap((b) =>
      chunks(decodePath(b.l, S)).map((pts) =>
        line(pts, b.t ? disputed : border, null),
      ),
    );

  // Names. Where two would overlap, the more important one is kept
  // (oceans, then big countries, seas, the other countries, lakes).
  const labels = data.labels.filter((l) => shownIn(o.pov, l.d !== 0, l.v)),
    at = (l: { x: number; y: number }) => ({ x: l.x / S, y: l.y / S }),
    aspect = height / width;
  const candidates: { t: MMText; rank: number; min?: number }[] = [];
  for (const l of labels) {
    const p = at(l);
    if (l.t === "ocean")
      candidates.push({
        rank: 0,
        t: text(
          name(l),
          p.x,
          p.y,
          labelLook("ocean", 0.0125, lang, { letterSpacing: 0.3 }),
          "t:ocean",
        ),
      });
    else if (l.t === "sea")
      candidates.push({
        rank: 10 + l.k,
        min: 0.0042,
        t: text(
          name(l),
          p.x,
          p.y,
          labelLook("sea", l.k <= 1 ? 0.0068 : 0.0056, lang, {
            letterSpacing: 0.1,
          }),
          "t:sea",
        ),
      });
    else if (l.t === "lake")
      candidates.push({
        rank: 40 + l.k,
        t: text(
          name(l),
          p.x,
          p.y,
          labelLook("sea", 0.0042, lang, { letterSpacing: 0.04 }),
          "t:sea",
        ),
      });
    else if (l.t === "country")
      candidates.push({
        rank: (l.k <= 3 ? 5 : 20) + l.k + (l.m ?? 9) / 100,
        min: 0.0032,
        t: text(
          name(l),
          p.x,
          p.y,
          labelLook("region", countrySize(l.k), lang, {
            letterSpacing: 0.14,
            fillOpacity: 0.85,
          }),
          "t:region",
        ),
      });
  }
  const names = placeApart(candidates, aspect);
  const continents = labels
    .filter((l) => l.t === "continent")
    .map((l) => {
      const p = at(l);
      return text(
        name(l),
        p.x,
        p.y,
        labelLook("region", 0.016, lang, {
          letterSpacing: 0.5,
          fillOpacity: 0.55,
        }),
        "t:region",
      );
    });

  // Capitals: a dot, and its name beside it (they move together); the
  // larger cities first where names would overlap.
  const capitals: (MMStamp | MMText)[] = [],
    taken: Box[] = [];
  for (const l of labels
    .filter((c) => c.t === "capital")
    .sort((a, b) => a.k - b.k)) {
    const p = at(l),
      dot: MMStamp = {
        id: crypto.randomUUID(),
        kind: "stamp",
        asset: builtinKey("classic-city", 0),
        x: q5(p.x),
        y: q5(p.y),
        size: 0.0055,
        rotation: 0,
        flipX: false,
        flipY: false,
        ink: "#3b2a1a",
        fill: null,
        opacity: 1,
        hue: 0,
        saturation: 0,
        brightness: 0,
        contrast: 0,
        shadow: "none",
        pivot: "center",
      },
      dx = 0.0038;
    const label: MMText = {
      ...text(
        name(l),
        p.x + dx,
        p.y,
        labelLook("city", 0.0036, lang, {
          align: "left",
          outline: { ...textStyle("city").outline, width: 0.09, opacity: 0.7 },
        }),
        "t:city",
      ),
      attach: { to: dot.id, dx, dy: 0 },
    };
    const box = textBox(label, aspect);
    box.x0 = p.x - dot.size / 2;
    if (taken.some((t) => overlaps(t, box))) continue;
    taken.push(box);
    capitals.push(dot, label);
  }

  const waterLayer = createLayer(o.layerNames.water, "water"),
    landLayer: MMLayer = {
      ...createLayer(o.layerNames.land, "land"),
      coast: EARTH_COAST,
      objects: landObjects,
    };
  return {
    id: crypto.randomUUID(),
    name: o.name.trim() || "Earth",
    width,
    height,
    tileCols: EARTH_COLS,
    tileRows: EARTH_ROWS,
    resolutionTier: o.resolutionTier,
    aspect: "custom",
    background: DEFAULT_BACKGROUND,
    snapToGrid: false,
    seamless: true,
    layers: [
      waterLayer,
      landLayer,
      layer("rivers", rivers),
      layer("borders", borders),
      layer("graticule", graticule()),
      layer("names", names),
      layer("continents", continents),
      layer("capitals", capitals),
    ],
    updatedAt: Date.now(),
  };
}
