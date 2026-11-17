/**
 * The Navigators' textures: a hand-painted sea chart's materials — teal
 * seas ruled into squares, watercolour shallows, aged and crumpled papers,
 * rhumb lines, cel-shaded island grass, contoured hills and ochre lands.
 *
 * Like every built-in texture (see ./textures), each one is a pure function
 * of tile coordinates built from periodic noise, so it tiles without seams
 * and renders sharp at any size. Original work: no picture is copied.
 */
import { fbm, hash2, worley, smoothstep } from "./noise";
import type { TextureDef } from "./textures";

type RGB = [number, number, number];

const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const n01 = (n: number) => n * 0.5 + 0.5;
const frac = (x: number) => x - Math.floor(x);
/** Distance to the nearest whole number. */
const toLine = (x: number) => {
  const f = frac(x);
  return Math.min(f, 1 - f);
};
function ramp(stops: string[]) {
  const cols = stops.map(rgb);
  return (t: number): RGB => {
    const x = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1),
      i = Math.floor(x);
    return mix(cols[i], cols[i + 1], x - i);
  };
}

// ---- shared touches ---------------------------------------------------------------
/**
 * Crumpled paper: flat facets, each lit a little differently, with dark
 * creases between them. Returns a brightness offset (about -0.6…0.25).
 */
function crinkle(u: number, v: number, seed: number, cells: number) {
  const wx = fbm(u * 4, v * 4, seed, 2, 4) * 0.45,
    wy = fbm(u * 4, v * 4, seed + 1, 2, 4) * 0.45,
    w = worley(u * cells + wx, v * cells + wy, seed + 2, cells),
    // finer wrinkles inside each facet
    f = worley(
      u * cells * 3 + wy * 2,
      v * cells * 3 + wx * 2,
      seed + 3,
      cells * 3,
    ),
    crease = smoothstep(0.035, 0.0, w.f2 - w.f1),
    wrinkle = smoothstep(0.03, 0.0, f.f2 - f.f1) * (f.id < 0.5 ? 1 : 0);
  return (
    (w.id - 0.5) * 0.28 + (f.id - 0.5) * 0.1 - crease * 0.5 - wrinkle * 0.25
  );
}
/** Paper fibres: fine, slightly stretched grain (0…1). */
const fibres = (u: number, v: number, seed: number) =>
  n01(
    fbm(u * 96, v * 24, seed, 2, 24) * 0.6 +
      fbm(u * 64, v * 64, seed + 5, 2, 64) * 0.4,
  );
/** A hand-ruled square grid: 1 on a line, 0 between them. */
function handGrid(
  u: number,
  v: number,
  seed: number,
  cells: number,
  width: number,
) {
  const gx = u * cells + fbm(u * 3, v * 3, seed, 2, 3) * 0.06,
    gy = v * cells + fbm(u * 3, v * 3, seed + 3, 2, 3) * 0.06,
    // the pen presses unevenly along each line
    ink = 0.65 + 0.35 * n01(fbm(u * 12, v * 12, seed + 6, 2, 12));
  return (
    Math.max(
      smoothstep(width, width * 0.35, toLine(gx)),
      smoothstep(width, width * 0.35, toLine(gy)),
    ) * ink
  );
}
/** Rhumb lines: straight lines in eight compass directions (0…1). */
const RHUMBS: [number, number, number][] = [
  [1, 0, 0.13],
  [0, 1, 0.61],
  [1, 1, 0.37],
  [1, -1, 0.82],
  [2, 1, 0.29],
  [1, 2, 0.71],
  [2, -1, 0.05],
  [1, -2, 0.48],
];
function rhumbLines(u: number, v: number, width: number) {
  let line = 0;
  for (const [a, b, c] of RHUMBS) {
    const d = toLine(a * u + b * v + c) / Math.hypot(a, b);
    line = Math.max(line, smoothstep(width, width * 0.3, d));
  }
  return line;
}
/** Watercolour: soft blooms whose rims dry darker. Returns [fill, rim]. */
function watercolor(u: number, v: number, seed: number, scale: number) {
  const n = n01(fbm(u * scale, v * scale, seed, 4, scale)),
    rim =
      smoothstep(0.025, 0.0, Math.abs(n - 0.42)) * 0.6 +
      smoothstep(0.02, 0.0, Math.abs(n - 0.63)) * 0.8;
  return [n, rim] as const;
}

// ---- the textures -----------------------------------------------------------------
const seaTeal = ramp(["#3a9f98", "#4fb3aa", "#66c3b7", "#7ccfc0"]);
function tealSea(u: number, v: number, seed: number): RGB {
  const c = seaTeal(
    n01(fbm(u * 5, v * 5, seed, 4, 5)) * 0.8 + fibres(u, v, seed + 9) * 0.2,
  );
  return shade(c, 1 + crinkle(u, v, seed + 20, 7) * 0.22);
}

export const NAVIGATOR_TEXTURES: TextureDef[] = [
  {
    // A teal chart sea ruled into squares, on crumpled paper.
    id: "navSeaGrid",
    category: "navigators",
    labelKey: "mmTexNavSeaGrid",
    gen: (u, v) =>
      mix(
        tealSea(u, v, 301),
        [26, 86, 88],
        handGrid(u, v, 302, 6, 0.028) * 0.85,
      ),
  },
  {
    // The same teal sea without the grid.
    id: "navSeaTeal",
    category: "navigators",
    labelKey: "mmTexNavSeaTeal",
    gen: (u, v) => tealSea(u, v, 311),
  },
  {
    // Teal sea with little hand-drawn wave marks.
    id: "navWaveMarks",
    category: "navigators",
    labelKey: "mmTexNavWaveMarks",
    gen: (u, v) => {
      const N = 6,
        x = u * N,
        y = v * N,
        i = Math.floor(x),
        j = Math.floor(y),
        hi = ((i % N) + N) % N,
        hj = ((j % N) + N) % N;
      let c = tealSea(u, v, 321);
      if (hash2(hi, hj, 322) < 0.5) {
        const ox = 0.33 + 0.34 * hash2(hi, hj, 323),
          oy = 0.3 + 0.4 * hash2(hi, hj, 324),
          lx = x - i - ox,
          ly = y - j - oy,
          crest = 0.06 * Math.sin((lx / 0.14) * Math.PI),
          stroke =
            smoothstep(0.03, 0.012, Math.abs(ly - crest)) *
            smoothstep(0.3, 0.24, Math.abs(lx));
        c = mix(c, [30, 92, 94], stroke * 0.8);
      }
      return c;
    },
  },
  {
    // A pale watercolour chart sea with faint rhumb lines.
    id: "navSeaChart",
    category: "navigators",
    labelKey: "mmTexNavSeaChart",
    gen: (() => {
      const r = ramp(["#86c2b0", "#9fd1bd", "#b9dec7", "#cde6c9"]);
      return (u, v) => {
        const [n, rim] = watercolor(u, v, 331, 3);
        let c = r(n * 0.85 + fibres(u, v, 332) * 0.15);
        c = mix(c, [92, 156, 138], rim * 0.35);
        return mix(c, [120, 98, 64], rhumbLines(u, v, 0.0022) * 0.45);
      };
    })(),
  },
  {
    // Old yellowed parchment: stains, rings and foxing.
    id: "navParchment",
    category: "navigators",
    labelKey: "mmTexNavParchment",
    gen: (() => {
      const r = ramp(["#d3ad63", "#e0c07c", "#ebd298", "#f2e1b3"]);
      return (u, v) => {
        const [n, rim] = watercolor(u, v, 341, 2),
          w = worley(u * 14, v * 14, 342, 14),
          fox = w.id < 0.12 ? smoothstep(0.22, 0.05, w.f1) : 0;
        let c = r(n * 0.7 + fibres(u, v, 343) * 0.3);
        c = mix(c, [168, 116, 52], rim * 0.4 + fox * 0.35);
        return shade(c, 1 + crinkle(u, v, 344, 5) * 0.12);
      };
    })(),
  },
  {
    // The same parchment crossed by a navigator's rhumb lines.
    id: "navRhumbParchment",
    category: "navigators",
    labelKey: "mmTexNavRhumb",
    gen: (() => {
      const r = ramp(["#d8b46c", "#e4c788", "#eed8a4", "#f4e5bd"]);
      return (u, v) => {
        const [n, rim] = watercolor(u, v, 351, 2);
        let c = r(n * 0.7 + fibres(u, v, 352) * 0.3);
        c = mix(c, [168, 116, 52], rim * 0.3);
        return mix(c, [118, 82, 44], rhumbLines(u, v, 0.0028) * 0.6);
      };
    })(),
  },
  {
    // Cream paper, crumpled and smoothed out again.
    id: "navCreamPaper",
    category: "navigators",
    labelKey: "mmTexNavCream",
    gen: (() => {
      const r = ramp(["#e2d7b6", "#ece3c8", "#f4eedb"]);
      return (u, v) =>
        shade(
          r(n01(fbm(u * 4, v * 4, 361, 3, 4)) * 0.6 + fibres(u, v, 362) * 0.4),
          1 + crinkle(u, v, 363, 6) * 0.3,
        );
    })(),
  },
  {
    // Fibrous rice paper, near white.
    id: "navRicePaper",
    category: "navigators",
    labelKey: "mmTexNavRice",
    gen: (() => {
      const r = ramp(["#e6dfcd", "#efe9da", "#f8f4ea"]);
      return (u, v) => {
        const strands = smoothstep(
          0.62,
          0.8,
          n01(fbm(u * 40, v * 10, 371, 3, 10)),
        );
        let c = r(
          fibres(u, v, 372) * 0.7 + n01(fbm(u * 3, v * 3, 373, 3, 3)) * 0.3,
        );
        c = mix(c, [214, 204, 178], strands * 0.5);
        return shade(c, 1 + crinkle(u, v, 374, 9) * 0.12);
      };
    })(),
  },
  {
    // Island grass in flat, cartoon-painted tones.
    id: "navIslandGrass",
    category: "navigators",
    labelKey: "mmTexNavGrass",
    gen: (() => {
      const r = ramp(["#5b8f43", "#73a651", "#8dbc62", "#a3cb70"]);
      return (u, v) => {
        const n = n01(fbm(u * 4, v * 4, 381, 4, 4)),
          level = Math.floor(n * 4) / 3,
          soft = n * 4 - Math.floor(n * 4),
          edge = smoothstep(0.08, 0.0, Math.min(soft, 1 - soft));
        let c = r(level * 0.85 + fibres(u, v, 382) * 0.15);
        c = mix(c, [62, 100, 46], edge * 0.35);
        return shade(c, 1 + crinkle(u, v, 383, 6) * 0.15);
      };
    })(),
  },
  {
    // Brown highlands drawn as contour rings around each hill.
    id: "navHills",
    category: "navigators",
    labelKey: "mmTexNavHills",
    gen: (() => {
      const r = ramp(["#d2b07b", "#bf955f", "#a67a4b", "#8b603a", "#6f492c"]);
      return (u, v) => {
        const warp = fbm(u * 3, v * 3, 391, 3, 3) * 0.35,
          w = worley(u * 3 + warp, v * 3 - warp, 392, 3),
          h = Math.max(0, 1 - w.f1 / 0.75) * (0.7 + 0.3 * w.id),
          bands = 5,
          x = h * bands,
          level = Math.floor(x) / (bands - 1),
          outline = smoothstep(0.1, 0.0, toLine(x)) * (h > 0.05 ? 1 : 0);
        let c = r(level);
        c = mix(c, [72, 46, 26], outline * 0.75);
        c = shade(c, 0.94 + fibres(u, v, 393) * 0.1);
        return shade(c, 1 + crinkle(u, v, 394, 6) * 0.12);
      };
    })(),
  },
  {
    // Yellow-ochre land, painted, with stippling and pen hatching.
    id: "navOchreLand",
    category: "navigators",
    labelKey: "mmTexNavOchre",
    gen: (() => {
      const r = ramp(["#c4923f", "#d4a854", "#e2be6f", "#ecd08e"]);
      return (u, v) => {
        const [n, rim] = watercolor(u, v, 401, 3),
          patch = smoothstep(0.55, 0.7, n01(fbm(u * 5, v * 5, 402, 3, 5))),
          dots = worley(u * 36, v * 36, 403, 36),
          dot = dots.id < 0.5 ? smoothstep(0.2, 0.1, dots.f1) * patch : 0,
          hatch =
            smoothstep(0.12, 0.04, toLine((u + v) * 48)) *
            smoothstep(0.62, 0.78, n01(fbm(u * 4, v * 4, 404, 3, 4)));
        let c = r(n * 0.75 + fibres(u, v, 405) * 0.25);
        c = mix(c, [176, 112, 48], rim * 0.35);
        c = mix(c, [178, 92, 46], dot * 0.7);
        return mix(c, [120, 74, 36], hatch * 0.5);
      };
    })(),
  },
  {
    // The pale sandy rim of a cartoon island.
    id: "navShore",
    category: "navigators",
    labelKey: "mmTexNavShore",
    gen: (() => {
      const r = ramp(["#e5d6b2", "#efe4c8", "#f7f1df"]);
      return (u, v) => {
        const grains = worley(u * 60, v * 60, 411, 60),
          grain = grains.id < 0.25 ? smoothstep(0.25, 0.1, grains.f1) : 0;
        let c = r(
          n01(fbm(u * 5, v * 5, 412, 4, 5)) * 0.7 + fibres(u, v, 413) * 0.3,
        );
        c = mix(c, [196, 172, 130], grain * 0.35);
        return shade(c, 1 + crinkle(u, v, 414, 6) * 0.14);
      };
    })(),
  },
];
