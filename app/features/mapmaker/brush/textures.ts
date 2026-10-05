/**
 * The brush texture catalog — 26 original, procedurally generated, seamless
 * terrain textures (no image assets, nothing licensed).
 *
 * Every texture is a pure function of tile coordinates (u, v ∈ [0, 1)), built
 * from periodic noise, so it tiles perfectly and can be generated at *any*
 * resolution: the editor uses a 256–512 px tile, a 4K print gets a 1024 px
 * tile with exactly the same features, just sharper. Tiles are generated
 * lazily on first use and cached, together with any Hue / Saturation /
 * Brightness / Contrast filtered variants.
 */
import { fbm, gradientNoise, hash2, ridged, smoothstep, worley } from "./noise";
import type { PaintSource } from "../types";

export type TextureCategory = "terrain" | "vegetation" | "water" | "special";
type RGB = [number, number, number];
type Generator = (u: number, v: number) => RGB;

export interface TextureDef {
  id: string;
  category: TextureCategory;
  labelKey: string;
  gen: Generator;
}

/** Tile edge length (px) at the reference display width; see engine.ts. */
export const TEXTURE_BASE_PX = 256;

// ---- color helpers ----------------------------------------------------------
export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]: RGB) {
  const h = (c: number) =>
    Math.round(Math.max(0, Math.min(255, c)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Piecewise-linear color ramp over [0, 1]. */
function ramp(stops: string[]) {
  const cols = stops.map(hexToRgb);
  return (t: number): RGB => {
    const x = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1),
      i = Math.floor(x);
    return mix(cols[i], cols[i + 1], x - i);
  };
}
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const n01 = (n: number) => n * 0.5 + 0.5;

// ---- the catalog --------------------------------------------------------------
// Each generator works in tile units: x = u·P wraps cleanly when the noise
// period equals P. Seeds are fixed per texture so the catalog is stable.

function grassLike(stops: string[], seed: number, flowers = 0): Generator {
  const r = ramp(stops);
  return (u, v) => {
    const broad = n01(fbm(u * 6, v * 6, seed, 4, 6)),
      fine = n01(fbm(u * 48, v * 48, seed + 7, 2, 48)),
      blade = hash2(Math.floor(u * 256), Math.floor(v * 256), seed + 3);
    let c = r(broad * 0.75 + fine * 0.25);
    c = shade(c, 0.9 + blade * 0.18);
    if (flowers) {
      const w = worley(u * 40, v * 40, seed + 11, 40);
      if (w.f1 < 0.11 && w.id < flowers)
        c = mix(
          c,
          w.id < flowers / 2 ? [244, 226, 120] : [246, 240, 236],
          0.85,
        );
    }
    return c;
  };
}

function canopy(
  stops: string[],
  cells: number,
  seed: number,
  light = 0.35,
): Generator {
  const r = ramp(stops);
  return (u, v) => {
    const x = u * cells,
      y = v * cells,
      warp = fbm(u * 8, v * 8, seed + 5, 2, 8) * 0.35,
      w = worley(x + warp, y + warp, seed, cells),
      // light from the upper-left: compare the cell distance a bit towards the light
      wl = worley(x + warp - 0.18, y + warp - 0.18, seed, cells),
      crown = 1 - smoothstep(0.05, 0.75, w.f1),
      lit = smoothstep(-0.25, 0.25, w.f1 - wl.f1),
      gap = smoothstep(0.55, 0.85, w.f1);
    let c = r(crown * 0.55 + w.id * 0.25 + lit * light);
    c = shade(c, 1 - gap * 0.45);
    return shade(c, 0.94 + n01(fbm(u * 64, v * 64, seed + 9, 2, 64)) * 0.12);
  };
}

const TEXTURE_DEFS: TextureDef[] = [
  // Vegetation
  {
    id: "grass",
    category: "vegetation",
    labelKey: "mmTexGrass",
    gen: grassLike(["#3f6a30", "#5b8a3c", "#7fae4f", "#9cc363"], 101),
  },
  {
    id: "meadow",
    category: "vegetation",
    labelKey: "mmTexMeadow",
    gen: grassLike(["#5f8f3c", "#7fae4a", "#a2c862", "#bcd77a"], 102, 0.18),
  },
  {
    id: "savanna",
    category: "vegetation",
    labelKey: "mmTexSavanna",
    gen: grassLike(["#8a8442", "#b2a253", "#cdb86a", "#ddc882"], 103),
  },
  {
    id: "forest",
    category: "vegetation",
    labelKey: "mmTexForest",
    gen: canopy(["#16301c", "#24482a", "#356537", "#4f8445"], 14, 104),
  },
  {
    id: "pine",
    category: "vegetation",
    labelKey: "mmTexPine",
    gen: canopy(["#0f2620", "#1a3a30", "#285040", "#3b6a52"], 22, 105, 0.3),
  },
  {
    id: "jungle",
    category: "vegetation",
    labelKey: "mmTexJungle",
    gen: canopy(["#0f3a1d", "#1b5a26", "#2f7d2f", "#56a33b"], 10, 106, 0.45),
  },
  {
    id: "swamp",
    category: "vegetation",
    labelKey: "mmTexSwamp",
    gen: (() => {
      const land = ramp(["#3c4428", "#566036", "#6f7444"]),
        water = ramp(["#2c4440", "#3d5a52"]);
      return (u, v) => {
        const n = fbm(u * 5, v * 5, 107, 5, 5),
          pool = smoothstep(0.05, 0.16, n),
          grain = n01(fbm(u * 40, v * 40, 108, 2, 40));
        return mix(land(grain), water(grain), pool);
      };
    })(),
  },
  {
    id: "farmland",
    category: "vegetation",
    labelKey: "mmTexFarmland",
    gen: (() => {
      const fields: RGB[] = [
        "#c9b264",
        "#8fa64a",
        "#a4874d",
        "#6f9441",
        "#d2c07d",
      ].map(hexToRgb);
      return (u, v) => {
        const P = 4,
          jx = gradientNoise(u * 3, v * 3, 110, 3) * 0.12,
          x = u * P + jx,
          y = v * P - jx,
          cx = Math.floor(x),
          cy = Math.floor(y),
          id = hash2(((cx % P) + P) % P, ((cy % P) + P) % P, 109),
          base = fields[Math.floor(id * fields.length)],
          fx = x - cx,
          fy = y - cy,
          furrow = 0.5 + 0.5 * Math.sin((id > 0.5 ? fx : fy) * Math.PI * 18),
          hedge = smoothstep(0.03, 0.0, Math.min(fx, fy, 1 - fx, 1 - fy));
        let c = shade(base, 0.88 + furrow * 0.16);
        c = mix(c, [74, 96, 52], hedge * 0.85);
        return shade(c, 0.95 + n01(fbm(u * 32, v * 32, 111, 2, 32)) * 0.1);
      };
    })(),
  },
  // Terrain
  {
    id: "sand",
    category: "terrain",
    labelKey: "mmTexSand",
    gen: (() => {
      const r = ramp(["#c9ad74", "#dcc38c", "#ead6a6"]);
      return (u, v) =>
        shade(
          r(n01(fbm(u * 6, v * 6, 120, 3, 6))),
          0.93 + hash2(Math.floor(u * 512), Math.floor(v * 512), 121) * 0.12,
        );
    })(),
  },
  {
    id: "dunes",
    category: "terrain",
    labelKey: "mmTexDunes",
    gen: (() => {
      const r = ramp(["#b98a4e", "#d4a868", "#e9c88e", "#f1d9a8"]);
      return (u, v) => {
        const warp = fbm(u * 3, v * 3, 122, 3, 3),
          ridge = Math.sin((v * 7 + warp * 1.6) * Math.PI * 2),
          crest = Math.pow(n01(ridge), 3);
        return shade(
          r(n01(ridge) * 0.7 + 0.15),
          0.9 +
            crest * 0.18 +
            hash2(Math.floor(u * 400), Math.floor(v * 400), 123) * 0.06,
        );
      };
    })(),
  },
  {
    id: "desert",
    category: "terrain",
    labelKey: "mmTexDesert",
    gen: (() => {
      const r = ramp(["#b78f5f", "#cfa877", "#dfbf8f"]);
      return (u, v) => {
        const w = worley(u * 9, v * 9, 124, 9),
          crack = smoothstep(0.07, 0.0, w.f2 - w.f1),
          c = r(n01(fbm(u * 5, v * 5, 125, 3, 5)) * 0.8 + w.id * 0.2);
        return mix(c, [120, 88, 58], crack * 0.75);
      };
    })(),
  },
  {
    id: "dirt",
    category: "terrain",
    labelKey: "mmTexDirt",
    gen: (() => {
      const r = ramp(["#5a4130", "#7a5a40", "#957154", "#a8876a"]);
      return (u, v) => {
        let c = r(n01(fbm(u * 6, v * 6, 126, 5, 6)));
        const w = worley(u * 28, v * 28, 127, 28);
        if (w.f1 < 0.16 && w.id > 0.72)
          c = mix(c, [150, 140, 128], 0.6 * (1 - w.f1 / 0.16));
        return c;
      };
    })(),
  },
  {
    id: "mud",
    category: "terrain",
    labelKey: "mmTexMud",
    gen: (() => {
      const r = ramp(["#2f2419", "#45352a", "#5a4636"]);
      return (u, v) => {
        const n = fbm(u * 5, v * 5, 128, 5, 5),
          wet = smoothstep(0.15, 0.4, n);
        return mix(
          r(n01(fbm(u * 24, v * 24, 129, 3, 24))),
          [92, 86, 78],
          wet * 0.45,
        );
      };
    })(),
  },
  {
    id: "rock",
    category: "terrain",
    labelKey: "mmTexRock",
    gen: (() => {
      const r = ramp(["#55524d", "#6f6b64", "#8c877e", "#a8a399"]);
      return (u, v) =>
        r(
          ridged(u * 6, v * 6, 130, 5, 6) * 0.85 +
            n01(fbm(u * 40, v * 40, 131, 2, 40)) * 0.15,
        );
    })(),
  },
  {
    id: "mountains",
    category: "terrain",
    labelKey: "mmTexMountains",
    gen: (() => {
      const r = ramp(["#4b443c", "#6d6255", "#8c7f6e", "#b1a490", "#e7e6e2"]);
      return (u, v) => {
        const h = ridged(u * 4, v * 4, 132, 6, 4),
          hl = ridged(u * 4 - 0.02, v * 4 - 0.02, 132, 6, 4);
        return shade(r(h), 0.88 + smoothstep(-0.12, 0.12, h - hl) * 0.24);
      };
    })(),
  },
  {
    id: "cliffs",
    category: "terrain",
    labelKey: "mmTexCliffs",
    gen: (() => {
      const r = ramp(["#3f3a35", "#5d5650", "#7b736a", "#958c80"]);
      return (u, v) => {
        const strata = Math.sin(
          (v * 10 + fbm(u * 4, v * 4, 133, 3, 4) * 0.9) * Math.PI * 2,
        );
        return r(n01(strata) * 0.45 + ridged(u * 8, v * 8, 134, 3, 8) * 0.55);
      };
    })(),
  },
  {
    id: "snow",
    category: "terrain",
    labelKey: "mmTexSnow",
    gen: (() => {
      const r = ramp(["#c9d6e3", "#e1e9f1", "#f5f8fb"]);
      return (u, v) =>
        shade(
          r(n01(fbm(u * 5, v * 5, 135, 4, 5))),
          0.97 + hash2(Math.floor(u * 512), Math.floor(v * 512), 136) * 0.04,
        );
    })(),
  },
  {
    id: "ice",
    category: "terrain",
    labelKey: "mmTexIce",
    gen: (() => {
      const r = ramp(["#8fbfd4", "#b5d9e7", "#dbeef5"]);
      return (u, v) => {
        const w = worley(u * 6, v * 6, 137, 6),
          crack = smoothstep(0.05, 0.0, w.f2 - w.f1);
        return mix(
          r(n01(fbm(u * 4, v * 4, 138, 4, 4)) * 0.7 + w.id * 0.3),
          [245, 252, 255],
          crack * 0.8,
        );
      };
    })(),
  },
  {
    id: "tundra",
    category: "terrain",
    labelKey: "mmTexTundra",
    gen: grassLike(["#6c6c56", "#83826a", "#9a9a82", "#b3b4a0"], 139),
  },
  {
    id: "ash",
    category: "terrain",
    labelKey: "mmTexAsh",
    gen: (() => {
      const r = ramp(["#262423", "#3a3735", "#4f4b48"]);
      return (u, v) => {
        let c = r(n01(fbm(u * 7, v * 7, 140, 5, 7)));
        if (hash2(Math.floor(u * 300), Math.floor(v * 300), 141) > 0.996)
          c = [214, 96, 40];
        return c;
      };
    })(),
  },
  // Water
  {
    id: "shallows",
    category: "water",
    labelKey: "mmTexShallows",
    gen: (() => {
      const r = ramp(["#3f9aa6", "#57b3ba", "#77c8c6"]);
      return (u, v) => {
        const w = worley(
            u * 16 + fbm(u * 4, v * 4, 142, 2, 4) * 0.9,
            v * 16 + fbm(u * 4, v * 4, 158, 2, 4) * 0.9,
            143,
            16,
          ),
          caustic = smoothstep(0.07, 0.0, w.f2 - w.f1);
        return mix(
          r(n01(fbm(u * 4, v * 4, 144, 4, 4))),
          [196, 238, 232],
          caustic * 0.3,
        );
      };
    })(),
  },
  {
    id: "ocean",
    category: "water",
    labelKey: "mmTexOcean",
    gen: (() => {
      const r = ramp(["#1d5279", "#2a6890", "#3a7ea5"]);
      return (u, v) => {
        const warp = fbm(u * 3, v * 3, 145, 3, 3),
          swell = Math.sin(
            (v * 12 + warp * 2.2 + gradientNoise(u * 6, v * 6, 156, 6) * 0.35) *
              Math.PI *
              2,
          ),
          // break the swell lines into short, irregular crests
          crest =
            Math.pow(n01(swell), 8) *
            smoothstep(-0.1, 0.45, fbm(u * 10, v * 10, 157, 2, 10));
        return shade(r(n01(fbm(u * 3, v * 3, 146, 4, 3))), 0.96 + crest * 0.1);
      };
    })(),
  },
  {
    id: "deep",
    category: "water",
    labelKey: "mmTexDeep",
    gen: (() => {
      const r = ramp(["#0c2540", "#14365a", "#1d4770"]);
      return (u, v) => r(n01(fbm(u * 3, v * 3, 147, 5, 3)));
    })(),
  },
  // Special
  {
    id: "lava",
    category: "special",
    labelKey: "mmTexLava",
    gen: (() => {
      const crust = ramp(["#1f1411", "#33211a", "#4a2e22"]),
        glow = ramp(["#b8321a", "#f07a1e", "#ffd25a"]);
      return (u, v) => {
        const w = worley(
            u * 7 + fbm(u * 4, v * 4, 148, 2, 4) * 0.4,
            v * 7,
            149,
            7,
          ),
          seam = smoothstep(0.16, 0.0, w.f2 - w.f1);
        return mix(
          crust(n01(fbm(u * 20, v * 20, 150, 3, 20))),
          glow(seam),
          seam,
        );
      };
    })(),
  },
  {
    id: "parchment",
    category: "special",
    labelKey: "mmTexParchment",
    gen: (() => {
      const r = ramp(["#cbb48a", "#ddc9a0", "#ebdcb9"]);
      return (u, v) => {
        const stain = smoothstep(0.25, 0.6, fbm(u * 3, v * 3, 151, 4, 3));
        return mix(
          r(n01(fbm(u * 8, v * 8, 152, 5, 8))),
          [176, 140, 92],
          stain * 0.35,
        );
      };
    })(),
  },
  {
    id: "cobblestone",
    category: "special",
    labelKey: "mmTexCobble",
    gen: (() => {
      const r = ramp(["#5f5a54", "#7a746c", "#958e84"]);
      return (u, v) => {
        const w = worley(u * 12, v * 12, 153, 12),
          mortar = smoothstep(0.12, 0.02, w.f2 - w.f1),
          dome = 1 - smoothstep(0.0, 0.7, w.f1);
        return mix(shade(r(w.id), 0.85 + dome * 0.25), [52, 48, 44], mortar);
      };
    })(),
  },
  {
    id: "inkwash",
    category: "special",
    labelKey: "mmTexInkWash",
    gen: (() => {
      const r = ramp(["#3a3f4a", "#59606c", "#7d838d", "#a5a9b0"]);
      return (u, v) =>
        r(n01(fbm(u * 3 + fbm(u * 2, v * 2, 154, 2, 2), v * 3, 155, 5, 3)));
    })(),
  },
];

export const TEXTURES: readonly TextureDef[] = TEXTURE_DEFS;
export const TEXTURE_IDS = TEXTURE_DEFS.map((t) => t.id);
export const TEXTURE_CATEGORIES: { key: TextureCategory; labelKey: string }[] =
  [
    { key: "terrain", labelKey: "mmTexCatTerrain" },
    { key: "vegetation", labelKey: "mmTexCatVegetation" },
    { key: "water", labelKey: "mmTexCatWater" },
    { key: "special", labelKey: "mmTexCatSpecial" },
  ];
const BY_ID = new Map(TEXTURE_DEFS.map((t) => [t.id, t]));
export function textureDef(id: string) {
  return BY_ID.get(id) ?? TEXTURE_DEFS[0];
}

// ---- color filters --------------------------------------------------------------
type Filters = Pick<
  PaintSource,
  "hue" | "saturation" | "brightness" | "contrast"
>;
export const NO_FILTERS: Filters = {
  hue: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
};
export function hasFilters(f: Filters) {
  return (
    f.hue !== 0 || f.saturation !== 0 || f.brightness !== 0 || f.contrast !== 0
  );
}

/** Hue (rotation), Saturation, Brightness and Contrast on one RGB pixel —
 * applied in HSL space for hue/saturation, then brightness and contrast. */
export function filterRgb(r: number, g: number, b: number, f: Filters): RGB {
  r /= 255;
  g /= 255;
  b /= 255;
  if (f.hue !== 0 || f.saturation !== 0) {
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      l = (max + min) / 2;
    let h = 0,
      s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h =
        max === r
          ? (g - b) / d + (g < b ? 6 : 0)
          : max === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
      h /= 6;
    }
    h = (((h + f.hue / 360) % 1) + 1) % 1;
    s = Math.max(
      0,
      Math.min(
        1,
        f.saturation >= 0
          ? s + (1 - s) * f.saturation * s
          : s * (1 + f.saturation),
      ),
    );
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q,
      hk = (t: number) => {
        t = ((t % 1) + 1) % 1;
        return t < 1 / 6
          ? p + (q - p) * 6 * t
          : t < 0.5
            ? q
            : t < 2 / 3
              ? p + (q - p) * (2 / 3 - t) * 6
              : p;
      };
    if (s > 0) {
      r = hk(h + 1 / 3);
      g = hk(h);
      b = hk(h - 1 / 3);
    } else r = g = b = l;
  }
  if (f.brightness !== 0) {
    const k = f.brightness;
    const adj = (c: number) => (k > 0 ? c + (1 - c) * k : c * (1 + k));
    r = adj(r);
    g = adj(g);
    b = adj(b);
  }
  if (f.contrast !== 0) {
    const k = f.contrast > 0 ? 1 + f.contrast * 2 : 1 + f.contrast;
    r = (r - 0.5) * k + 0.5;
    g = (g - 0.5) * k + 0.5;
    b = (b - 0.5) * k + 0.5;
  }
  return [r * 255, g * 255, b * 255];
}
export function filterHex(hex: string, f: Filters) {
  if (!hasFilters(f)) return hex;
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(filterRgb(r, g, b, f));
}

// ---- tiles ------------------------------------------------------------------------
const tileCache = new Map<string, HTMLCanvasElement>();

/** Smallest tile level (256 · 2^level px) that holds `pxPerTile` crisply. */
export function tileLevelFor(pxPerTile: number) {
  // On screen a mild upscale of the base tile is invisible in noisy terrain,
  // and keeps first use of a texture fast; prints get the sharper levels.
  return pxPerTile <= TEXTURE_BASE_PX * 1.6
    ? 0
    : pxPerTile <= TEXTURE_BASE_PX * 3.2
      ? 1
      : 2;
}

function generateTile(def: TextureDef, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!,
    img = ctx.createImageData(size, size),
    d = img.data;
  for (let j = 0, k = 0; j < size; j++)
    for (let i = 0; i < size; i++, k += 4) {
      const [r, g, b] = def.gen((i + 0.5) / size, (j + 0.5) / size);
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A seamless tile of `id` at `level` resolution, color-filtered if asked. */
export function textureTile(
  id: string,
  level: number,
  filters: Filters = NO_FILTERS,
) {
  const def = textureDef(id),
    size = TEXTURE_BASE_PX << level as number,
    filtered = hasFilters(filters),
    key = filtered
      ? `${def.id}@${level}|${filters.hue}|${filters.saturation}|${filters.brightness}|${filters.contrast}`
      : `${def.id}@${level}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  let tile: HTMLCanvasElement;
  if (!filtered) tile = generateTile(def, size);
  else {
    const base = textureTile(id, level);
    tile = document.createElement("canvas");
    tile.width = tile.height = size;
    const ctx = tile.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    const img = ctx.getImageData(0, 0, size, size),
      d = img.data;
    for (let k = 0; k < d.length; k += 4) {
      const [r, g, b] = filterRgb(d[k], d[k + 1], d[k + 2], filters);
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    // Keep the cache bounded: filtered variants are cheap to rebuild.
    if (tileCache.size > 160) {
      for (const k of tileCache.keys())
        if (k.includes("|")) {
          tileCache.delete(k);
          break;
        }
    }
  }
  tileCache.set(key, tile);
  return tile;
}

const thumbCache = new Map<string, string>();
const THUMB = 72;
/** Small data-URL swatch for the catalog grid — generated directly at swatch
 * size (a ~1/3-tile window, so grain stays visible), which is ~20× cheaper
 * than building the full tile just to show a preview. */
export function textureThumb(id: string, filters: Filters = NO_FILTERS) {
  const key = `${id}|${filters.hue}|${filters.saturation}|${filters.brightness}|${filters.contrast}`;
  let url = thumbCache.get(key);
  if (!url) {
    const def = textureDef(id),
      c = document.createElement("canvas");
    c.width = c.height = THUMB;
    const ctx = c.getContext("2d")!,
      img = ctx.createImageData(THUMB, THUMB),
      d = img.data,
      filtered = hasFilters(filters);
    for (let j = 0, k = 0; j < THUMB; j++)
      for (let i = 0; i < THUMB; i++, k += 4) {
        let [r, g, b] = def.gen(
          ((i + 0.5) / THUMB) * 0.36,
          ((j + 0.5) / THUMB) * 0.36,
        );
        if (filtered) [r, g, b] = filterRgb(r, g, b, filters);
        d[k] = r;
        d[k + 1] = g;
        d[k + 2] = b;
        d[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    url = c.toDataURL("image/png");
    thumbCache.set(key, url);
  }
  return url;
}
