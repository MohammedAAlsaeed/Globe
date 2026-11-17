/**
 * The atelier's large texture library: 100 procedural textures across every
 * kind of map ground — fields and forests, soils, deserts, rock, waters,
 * snow and ice, volcanic ground, papers, built floors, and the fantastic.
 *
 * Like every built-in texture (see ./textures), each is a pure function of
 * tile coordinates built from periodic noise (./textureKit), so it tiles
 * without seams and renders sharp at any size. Names are translation keys
 * ("mmTexL_<id>"); the catalog's search words are in LIBRARY_TAGS.
 */
import type { TextureCategory, TextureDef } from "./textures";
import {
  aniso,
  bricks,
  cells,
  clamp01,
  field,
  frac,
  glow,
  grain,
  hash2,
  lattice,
  lit,
  mix,
  ramp,
  rgb,
  ridges,
  shade,
  smoothstep,
  spots,
  toLine,
  worley,
  type Gen,
  type RGB,
} from "./textureKit";

const T = (id: string, category: TextureCategory, gen: Gen): TextureDef => ({
  id,
  category,
  labelKey: `mmTexL_${id}`,
  gen,
});

// ---- shared recipes ---------------------------------------------------------------
/** A painted ground: a colour ramp over warped noise, with grain. */
function ground(
  stops: string[],
  seed: number,
  scale = 5,
  warp = 0.6,
  grainAmt = 0.12,
): Gen {
  const r = ramp(stops);
  return (u, v) =>
    shade(
      r(field(u, v, seed, scale, 5, warp)),
      grain(u, v, seed + 1, grainAmt),
    );
}
/** Grass: broad patches and fine blades. */
function grass(stops: string[], seed: number): Gen {
  const r = ramp(stops);
  return (u, v) => {
    const broad = field(u, v, seed, 5, 4, 0.5),
      fine = field(u, v, seed + 2, 48, 2),
      blade = hash2(Math.floor(u * 256), Math.floor(v * 256), seed + 3);
    return shade(r(broad * 0.75 + fine * 0.25), 0.9 + blade * 0.18);
  };
}
/** Tree crowns lit from the upper left. */
function crowns(
  stops: string[],
  seed: number,
  n: number,
  gapCol = "#1c2a16",
  gaps = 0.45,
): Gen {
  const r = ramp(stops),
    gapC = rgb(gapCol);
  return (u, v) => {
    const c = cells(u, v, seed, n, 0.4),
      l = cells(u - 0.18 / n, v - 0.18 / n, seed, n, 0.4),
      crown = 1 - smoothstep(0.05, 0.75, c.f1),
      light = smoothstep(-0.25, 0.25, c.f1 - l.f1),
      gap = smoothstep(0.55, 0.85, c.f1);
    const col = r(crown * 0.55 + c.id * 0.25 + light * 0.3);
    return shade(mix(col, gapC, gap * gaps), grain(u, v, seed + 9, 0.12));
  };
}
/** Rows across the tile (fields, vines): row index and position within it. */
function furrows(u: number, v: number, seed: number, n: number, wobble = 0.15) {
  const y = v * n + (field(u, v, seed, 2, 2) - 0.5) * wobble * n * 0.2,
    row = Math.floor(y);
  return { row: ((row % n) + n) % n, f: y - row };
}
/** A water surface with soft swell. */
function water(stops: string[], seed: number, swell = 0.08): Gen {
  const r = ramp(stops);
  return (u, v) => {
    const base = field(u, v, seed, 3, 4, 0.8),
      waves = aniso(u, v, seed + 5, 6, 24, 3);
    return shade(r(base), 1 - swell / 2 + waves * swell);
  };
}
/** Glowing cracks over a dark crust. */
function cracked(
  crust: string[],
  glowStops: string[],
  seed: number,
  n: number,
  width = 0.12,
): Gen {
  const c = ramp(crust),
    g = ramp(glowStops);
  return (u, v) => {
    const w = cells(u, v, seed, n, 0.8),
      seam = smoothstep(width, 0, w.edge);
    return mix(
      shade(c(field(u, v, seed + 2, 16, 3)), 0.85 + w.id * 0.3),
      g(seam),
      seam,
    );
  };
}
/** Stars on a dark sky. */
function stars(
  u: number,
  v: number,
  seed: number,
  n: number,
  density: number,
  radius = 0.14,
) {
  const w = worley(u * n, v * n, seed, n);
  return w.id < density
    ? smoothstep(radius, 0, w.f1) * (0.4 + (w.id / density) * 0.6)
    : 0;
}
/** Tiles with grout: a colour per tile from `pick`, flat bevel. */
function tiled(
  u: number,
  v: number,
  t: { i: number; j: number; edge: number },
  pick: (id: number) => RGB,
  seed: number,
  grout: RGB,
  width = 0.06,
) {
  const id = hash2(t.i, t.j, seed),
    base = shade(pick(id), grain(u, v, seed + 5, 0.14, 32)),
    bevel = smoothstep(0, width * 3, t.edge);
  return mix(
    grout,
    shade(base, 0.86 + bevel * 0.16),
    smoothstep(width * 0.5, width, t.edge),
  );
}

// ---- the library ---------------------------------------------------------------------
export const LIBRARY_TEXTURES: TextureDef[] = [
  // ======== Vegetation ========
  T(
    "lushGrass",
    "vegetation",
    grass(["#2f6b2a", "#3f8434", "#55a03f", "#6fb84c"], 501),
  ),
  T(
    "dryGrass",
    "vegetation",
    grass(["#8a8a4a", "#a39d5a", "#bcb26c", "#cfc584"], 502),
  ),
  T(
    "autumnGrass",
    "vegetation",
    grass(["#7a5a2a", "#9a6f30", "#b8893c", "#cfa04e"], 503),
  ),
  T(
    "clover",
    "vegetation",
    (() => {
      const g = grass(["#2e6a2c", "#3b7d34", "#4c923e"], 504);
      return (u, v) => {
        const leaf = spots(u, v, 505, 28, 0.32, 0.5);
        return mix(g(u, v), rgb("#8fd46e"), leaf * 0.75);
      };
    })(),
  ),
  T(
    "wildflowers",
    "vegetation",
    (() => {
      const g = grass(["#3d7a32", "#4d8f3a", "#62a447"], 506),
        petals = ["#f2d14a", "#e7e3f0", "#d9547a", "#8b6ed6", "#f08a3c"].map(
          rgb,
        );
      return (u, v) => {
        const w = worley(u * 48, v * 48, 507, 48),
          patch = smoothstep(0.45, 0.65, field(u, v, 508, 4, 3));
        if (w.f1 < 0.2 && w.id < 0.25 + patch * 0.5)
          return mix(
            g(u, v),
            petals[Math.floor(w.id * 997) % petals.length],
            0.9,
          );
        return g(u, v);
      };
    })(),
  ),
  T(
    "lavender",
    "vegetation",
    (() => {
      const soil = rgb("#6d5a3e"),
        r = ramp(["#5b4a9a", "#7a62b8", "#9a83d0"]);
      return (u, v) => {
        const { row, f } = furrows(u, v, 511, 12),
          bush = cells(u * 1, v, 512 + row, 24, 0.3),
          body =
            smoothstep(0.48, 0.2, Math.abs(f - 0.5)) *
            smoothstep(0.75, 0.35, bush.f1);
        const c = shade(
          r(field(u, v, 513, 32, 2) * 0.6 + bush.id * 0.4),
          0.85 + (0.5 - Math.abs(f - 0.5)) * 0.4,
        );
        return mix(shade(soil, grain(u, v, 514, 0.2, 48)), c, body);
      };
    })(),
  ),
  T(
    "wheat",
    "vegetation",
    (() => {
      const r = ramp(["#b88d3a", "#d1a84c", "#e3c163", "#efd585"]);
      return (u, v) => {
        const { row, f } = furrows(u, v, 521, 10, 0.2),
          stalks = aniso(u, v, 522 + row, 128, 8, 2),
          edge = smoothstep(0.08, 0, Math.min(f, 1 - f));
        const c = r(field(u, v, 523, 4, 3) * 0.5 + stalks * 0.5);
        return mix(c, rgb("#7c5c26"), edge * 0.6);
      };
    })(),
  ),
  T(
    "ricePaddies",
    "vegetation",
    (() => {
      const green = ramp(["#5f9a3c", "#77b04a", "#93c45e"]),
        wet = ramp(["#5d8f87", "#79a8a0"]),
        bund = rgb("#a59a6c");
      return (u, v) => {
        const c = cells(u, v, 531, 6, 1.6),
          dyke = smoothstep(0.06, 0.02, c.edge),
          flooded = c.id < 0.35;
        const base = flooded
          ? wet(field(u, v, 532, 6, 3))
          : shade(
              green(field(u, v, 533, 8, 3) * 0.6 + c.id * 0.4),
              grain(u, v, 534, 0.2, 96),
            );
        return mix(base, bund, dyke);
      };
    })(),
  ),
  T(
    "vineyard",
    "vegetation",
    (() => {
      const soil = ramp(["#7d6142", "#94754f", "#a88a60"]),
        vine = ramp(["#2f5a25", "#3f7330", "#57903f"]);
      return (u, v) => {
        const { f } = furrows(u, v, 541, 14, 0.1),
          leaf = aniso(u, v, 542, 64, 14, 2),
          on =
            smoothstep(0.32, 0.18, Math.abs(f - 0.5)) *
            smoothstep(0.3, 0.5, leaf);
        return mix(
          shade(soil(field(u, v, 543, 6, 3)), grain(u, v, 544, 0.2)),
          vine(leaf),
          on,
        );
      };
    })(),
  ),
  T(
    "orchard",
    "vegetation",
    (() => {
      const g = grass(["#5d8c3c", "#6f9f47", "#82b052"], 551),
        r = ramp(["#24501f", "#356b2b", "#4f8a3a"]);
      return (u, v) => {
        const L = lattice(u, v, 8, 8, true),
          sh = lattice(u - 0.02, v - 0.02, 8, 8, true),
          crown = smoothstep(0.34, 0.3, L.f1),
          shadow =
            smoothstep(0.38, 0.3, Math.hypot(L.dx - 0.08, L.dy - 0.08)) *
            (1 - crown);
        let c = shade(g(u, v), 1 - shadow * 0.35);
        if (crown > 0)
          c = mix(
            c,
            shade(
              r(hash2(L.i, L.j, 552)),
              0.85 + smoothstep(0.3, -0.3, sh.f1 - L.f1) * 0.3,
            ),
            crown,
          );
        return c;
      };
    })(),
  ),
  T(
    "autumnForest",
    "vegetation",
    crowns(["#6b2e14", "#a3461c", "#d0782a", "#e8b04a"], 561, 14, "#2a1a10"),
  ),
  T(
    "deadForest",
    "vegetation",
    (() => {
      const r = ramp(["#3a332c", "#4d453c", "#625849", "#776b5a"]),
        floor = ramp(["#3b3229", "#4a3f33"]);
      return (u, v) => {
        const c = cells(u, v, 571, 12, 0.5),
          // bare crowns: a ring of twigs around each trunk
          twigs = smoothstep(
            0.55,
            0.75,
            aniso(u, v, 572 + Math.floor(c.id * 7), 48, 48, 2),
          ),
          crown = smoothstep(0.7, 0.35, c.f1) * (0.35 + twigs * 0.65),
          trunk = smoothstep(0.12, 0.06, c.f1);
        const col = mix(
          shade(floor(field(u, v, 573, 8, 3)), grain(u, v, 574, 0.2)),
          r(c.id),
          crown,
        );
        return mix(col, rgb("#211b16"), trunk);
      };
    })(),
  ),
  T(
    "bamboo",
    "vegetation",
    (() => {
      const r = ramp(["#5e8a2e", "#7aa43c", "#9cbd52", "#bcd36e"]);
      return (u, v) => {
        const b = bricks(v, u, 1, 20, 0),
          // b.i / b.j: stalk (column) j; fx runs along the stalk
          stalk = b.j,
          node = toLine(v * 3 + hash2(stalk, 0, 581) * 3),
          round = Math.sin(b.fy * Math.PI),
          gap = smoothstep(0.08, 0.0, Math.min(b.fy, 1 - b.fy));
        let c = shade(
          r(hash2(stalk, 1, 582) * 0.7 + round * 0.3),
          0.75 + round * 0.35,
        );
        c = mix(c, rgb("#4a6b22"), smoothstep(0.03, 0.01, node) * 0.8);
        return mix(c, rgb("#26381a"), gap);
      };
    })(),
  ),
  T(
    "moss",
    "vegetation",
    (() => {
      const r = ramp(["#3a5a1e", "#4f7426", "#68902f", "#86ab3f"]);
      return (u, v) => {
        const tufts = cells(u, v, 591, 40, 0.3),
          dome = 1 - smoothstep(0, 0.8, tufts.f1);
        return shade(
          r(field(u, v, 592, 6, 4, 0.8) * 0.6 + dome * 0.4),
          0.8 + dome * 0.3,
        );
      };
    })(),
  ),

  // ======== Terrain (soils and plains) ========
  T(
    "clay",
    "terrain",
    ground(["#8e4a2e", "#a65a36", "#bb6d42", "#cc8456"], 601, 4),
  ),
  T(
    "loam",
    "terrain",
    ground(["#2f2218", "#43301f", "#574028", "#6b5133"], 602, 6, 0.4, 0.2),
  ),
  T(
    "gravel",
    "terrain",
    (() => {
      const r = ramp(["#6c665e", "#8a8379", "#a69e92", "#c1b9ac"]);
      return (u, v) => {
        const s = cells(u, v, 611, 48, 0.2),
          dome = 1 - smoothstep(0.1, 0.7, s.f1),
          gap = smoothstep(0.12, 0.02, s.edge);
        return mix(
          shade(r(s.id), 0.8 + dome * 0.35),
          rgb("#4b463f"),
          gap * 0.7,
        );
      };
    })(),
  ),
  T(
    "pebbles",
    "terrain",
    (() => {
      const r = ramp(["#7b7166", "#978b7d", "#b3a796", "#cfc3b0"]),
        sand = rgb("#b8a68a");
      return (u, v) => {
        const s = cells(u, v, 621, 18, 0.2),
          stone = smoothstep(0.62, 0.5, s.f1),
          lightUp = cells(u - 0.006, v - 0.006, 621, 18, 0.2),
          hl = smoothstep(-0.05, 0.05, s.f1 - lightUp.f1);
        return mix(
          shade(sand, grain(u, v, 622, 0.3, 96)),
          shade(r(s.id), 0.8 + hl * 0.35),
          stone,
        );
      };
    })(),
  ),
  T(
    "crackedEarth",
    "terrain",
    (() => {
      const r = ramp(["#9a7656", "#b38c66", "#c7a27a", "#d6b68f"]);
      return (u, v) => {
        const c = cells(u, v, 631, 7, 0.9),
          crack = smoothstep(0.06, 0.015, c.edge),
          curl = smoothstep(0.18, 0.06, c.edge);
        const base = shade(
          r(c.id * 0.5 + field(u, v, 632, 12, 3) * 0.5),
          1 + curl * 0.12,
        );
        return mix(base, rgb("#3d2a1c"), crack * 0.9);
      };
    })(),
  ),
  T(
    "plowedField",
    "terrain",
    (() => {
      const r = ramp(["#4a3322", "#5f432c", "#765637", "#8b6943"]);
      return (u, v) => {
        const { f } = furrows(u, v, 641, 16, 0.25),
          ridge = Math.sin(f * Math.PI);
        return shade(
          r(field(u, v, 642, 6, 3) * 0.6 + ridge * 0.4),
          (0.7 + ridge * 0.4) * grain(u, v, 643, 0.2, 96),
        );
      };
    })(),
  ),
  T(
    "peatBog",
    "terrain",
    (() => {
      const r = ramp(["#2a2016", "#3b2e1d", "#4d3d27"]),
        pool = rgb("#3c4a3a");
      return (u, v) => {
        const p = field(u, v, 651, 5, 4, 1);
        return mix(
          shade(r(field(u, v, 652, 20, 3)), grain(u, v, 653, 0.2)),
          pool,
          smoothstep(0.62, 0.66, p) * 0.8,
        );
      };
    })(),
  ),
  T(
    "steppe",
    "terrain",
    ground(
      ["#8f8d55", "#a8a165", "#bdb47a", "#cfc796", "#b49a62"],
      661,
      4,
      1,
      0.16,
    ),
  ),
  T(
    "redSoil",
    "terrain",
    ground(["#7a2e1c", "#963b22", "#ae4e2c", "#c4663c"], 671, 5, 0.8, 0.18),
  ),
  T(
    "chalk",
    "terrain",
    (() => {
      const g = ground(
        ["#c9c4b6", "#d8d4c7", "#e6e3d8", "#f1efe8"],
        681,
        5,
        0.6,
        0.08,
      );
      return (u, v) =>
        mix(
          g(u, v),
          rgb("#a8a294"),
          smoothstep(0.85, 0.95, ridges(u, v, 682, 6, 3)) * 0.5,
        );
    })(),
  ),
  T(
    "mudFlat",
    "terrain",
    (() => {
      const r = ramp(["#5b5446", "#706856", "#857c68", "#9a9180"]);
      return (u, v) => {
        const ripple = Math.sin(
            (v * 40 + field(u, v, 691, 4, 3) * 6) * Math.PI * 2,
          ),
          wet = smoothstep(0.55, 0.7, field(u, v, 692, 4, 4, 1));
        const c = shade(r(field(u, v, 693, 8, 3)), 0.93 + ripple * 0.07);
        return mix(c, rgb("#7b8a86"), wet * 0.55);
      };
    })(),
  ),
  T(
    "heath",
    "terrain",
    (() => {
      const r = ramp(["#4a3a3a", "#6a4b5a", "#875b77", "#7d6b4a"]);
      return (u, v) => {
        const tuft = cells(u, v, 701, 36, 0.4),
          dome = 1 - smoothstep(0, 0.8, tuft.f1);
        return shade(
          r(field(u, v, 702, 5, 4, 0.8) * 0.7 + tuft.id * 0.3),
          0.78 + dome * 0.35,
        );
      };
    })(),
  ),

  // ======== Desert ========
  T(
    "goldenSand",
    "desert",
    ground(["#d1a756", "#ddb766", "#e7c77d", "#f0d696"], 711, 4, 0.6, 0.14),
  ),
  T(
    "whiteSand",
    "desert",
    ground(["#ddd6c2", "#e7e1cf", "#efebdd", "#f7f4ea"], 712, 4, 0.6, 0.1),
  ),
  T(
    "redSand",
    "desert",
    ground(["#b2552c", "#c56634", "#d47a42", "#e19257"], 713, 4, 0.6, 0.14),
  ),
  T(
    "sandRipples",
    "desert",
    (() => {
      const r = ramp(["#c99f5c", "#d8b06c", "#e5c282", "#f0d49c"]);
      return (u, v) => {
        const w = field(u, v, 721, 3, 3),
          ph = v * 28 + w * 5 + field(u, v, 722, 8, 2) * 0.8,
          s = frac(ph),
          // ripples are steep on the lee side
          face = s < 0.75 ? s / 0.75 : (1 - s) / 0.25;
        return shade(r(field(u, v, 723, 4, 3)), 0.86 + face * 0.2);
      };
    })(),
  ),
  T(
    "saltFlat",
    "desert",
    (() => {
      const r = ramp(["#d9d6cf", "#e6e4de", "#f2f1ec", "#fbfaf7"]);
      return (u, v) => {
        const c = cells(u, v, 731, 6, 0.6),
          ridge = smoothstep(0.08, 0.0, c.edge);
        return mix(
          shade(r(field(u, v, 732, 10, 3)), 0.96 + c.id * 0.06),
          rgb("#c3beb2"),
          ridge * 0.6,
        );
      };
    })(),
  ),
  T(
    "badlands",
    "desert",
    (() => {
      const r = ramp([
        "#7c3a24",
        "#a5552f",
        "#c97b48",
        "#e0a36b",
        "#e9c79a",
        "#b8673a",
      ]);
      return (u, v) => {
        const layer = v * 6 + field(u, v, 741, 3, 3, 1) * 2.5;
        const c = r(frac(layer * 0.5 + field(u, v, 742, 10, 2) * 0.08));
        return shade(
          c,
          lit((x, y) => ridges(x, y, 743, 4, 3), u, v, 1 / 200, 3) *
            grain(u, v, 744, 0.12),
        );
      };
    })(),
  ),
  T(
    "mesa",
    "desert",
    (() => {
      const r = ramp(["#9a4e2a", "#c06a38", "#d98a4e", "#e8ae72"]);
      return (u, v) => {
        const h = field(u, v, 751, 3, 5, 1),
          level = Math.floor(h * 6) / 5,
          step = smoothstep(0.1, 0, toLine(h * 6));
        return shade(
          r(level),
          (0.92 + field(u, v, 752, 24, 2) * 0.12) * (1 - step * 0.35),
        );
      };
    })(),
  ),
  T(
    "stonyDesert",
    "desert",
    (() => {
      const sand = ground(["#c7a679", "#d4b68a", "#dfc59d"], 761, 4),
        r = ramp(["#6e5a46", "#86705a", "#9c8670"]);
      return (u, v) => {
        const s = cells(u, v, 762, 22, 0.3),
          stone = s.id < 0.45 ? smoothstep(0.42, 0.3, s.f1) : 0;
        return mix(sand(u, v), shade(r(s.id * 2), 0.9 + (0.4 - s.f1)), stone);
      };
    })(),
  ),
  T(
    "duneSea",
    "desert",
    (() => {
      const r = ramp(["#c27a3e", "#d6914c", "#e6a95e", "#f1c27a"]);
      return (u, v) => {
        const ph = u * 3 + v * 2 + field(u, v, 771, 2, 3) * 2.2,
          s = frac(ph),
          lee = s > 0.7 ? smoothstep(0.7, 0.78, s) : 0;
        return shade(
          r(s * 0.7 + field(u, v, 772, 8, 2) * 0.3),
          (1 - lee * 0.3) * grain(u, v, 773, 0.08),
        );
      };
    })(),
  ),
  T(
    "desertCrust",
    "desert",
    (() => {
      const g = ground(["#b89a72", "#c8ab83", "#d5bb95"], 781, 5);
      return (u, v) => {
        const crust =
          smoothstep(0.55, 0.62, field(u, v, 782, 12, 3)) *
          smoothstep(0.4, 0.6, field(u, v, 783, 3, 3));
        return mix(
          g(u, v),
          shade(rgb("#4d4334"), grain(u, v, 784, 0.4, 128)),
          crust * 0.8,
        );
      };
    })(),
  ),

  // ======== Mountains & rock ========
  T(
    "granite",
    "mountains",
    (() => {
      const r = ramp(["#7c7774", "#97928d", "#b3aea7"]);
      return (u, v) => {
        const s = worley(u * 90, v * 90, 801, 90),
          speck =
            s.id < 0.18 ? rgb("#2e2b2b") : s.id > 0.9 ? rgb("#d8b8a8") : null;
        const c = shade(r(field(u, v, 802, 6, 4)), grain(u, v, 803, 0.2, 128));
        return speck ? mix(c, speck, smoothstep(0.5, 0.2, s.f1) * 0.85) : c;
      };
    })(),
  ),
  T(
    "slate",
    "mountains",
    (() => {
      const r = ramp(["#2f3439", "#3d434a", "#4d545b", "#5f666c"]);
      return (u, v) => {
        const layer = aniso(u, v, 811, 4, 40, 3),
          cleave = smoothstep(
            0.06,
            0,
            toLine(v * 10 + field(u, v, 812, 3, 2) * 2),
          ),
          chip = cells(u, v, 814, 10, 0.5);
        return shade(
          r(layer * 0.5 + chip.id * 0.3 + field(u, v, 813, 6, 3) * 0.2),
          (1 - cleave * 0.45) * (1 - smoothstep(0.05, 0, chip.edge) * 0.25),
        );
      };
    })(),
  ),
  T(
    "basalt",
    "mountains",
    (() => {
      const r = ramp(["#25272a", "#33363a", "#43464b", "#54575c"]);
      return (u, v) => {
        const L = lattice(u, v, 9, 10, true),
          joint = smoothstep(0.1, 0.03, L.edge),
          top = hash2(L.i, L.j, 821);
        return mix(
          shade(
            r(top * 0.7 + field(u, v, 822, 20, 2) * 0.3),
            0.9 + (0.5 - L.f1) * 0.25,
          ),
          rgb("#111214"),
          joint,
        );
      };
    })(),
  ),
  T(
    "sandstone",
    "mountains",
    (() => {
      const r = ramp(["#b9784a", "#cc8c5a", "#dca46e", "#e9bd88"]);
      return (u, v) => {
        const bed = frac(v * 5 + field(u, v, 831, 3, 3, 1) * 1.5),
          line = smoothstep(0.06, 0, Math.min(bed, 1 - bed));
        return shade(
          r(bed * 0.6 + field(u, v, 832, 12, 3) * 0.4),
          (1 - line * 0.25) * grain(u, v, 833, 0.14),
        );
      };
    })(),
  ),
  T(
    "limestone",
    "mountains",
    (() => {
      const r = ramp(["#a8a294", "#bdb7a8", "#d0cbbd", "#e0dccf"]);
      return (u, v) => {
        const pit = spots(u, v, 841, 30, 0.18, 0.35),
          crack = smoothstep(0.04, 0.01, cells(u, v, 842, 4, 1).edge);
        return mix(
          mix(
            shade(r(field(u, v, 843, 6, 4)), grain(u, v, 844, 0.12)),
            rgb("#8a8476"),
            pit * 0.6,
          ),
          rgb("#6e6a5e"),
          crack * 0.6,
        );
      };
    })(),
  ),
  T(
    "marble",
    "mountains",
    (() => {
      const r = ramp(["#e5e2dc", "#efece6", "#f8f6f2"]);
      return (u, v) => {
        const vein = smoothstep(
            0.05,
            0,
            toLine((u + v) * 2 + field(u, v, 851, 2, 5) * 2.5),
          ),
          fine = smoothstep(
            0.025,
            0,
            toLine(u * 2 - v + field(u, v, 852, 3, 4) * 3),
          );
        return mix(
          mix(r(field(u, v, 853, 4, 3)), rgb("#7d7772"), vein * 0.8),
          rgb("#a9a29b"),
          fine * 0.55,
        );
      };
    })(),
  ),
  T(
    "scree",
    "mountains",
    (() => {
      const r = ramp(["#5e5a55", "#78736c", "#928c84", "#aaa49b"]);
      return (u, v) => {
        const s = cells(u, v, 861, 26, 0.6),
          l = cells(u - 0.004, v - 0.004, 861, 26, 0.6),
          facet = smoothstep(-0.06, 0.06, s.f1 - l.f1),
          gap = smoothstep(0.08, 0.02, s.edge);
        return mix(
          shade(r(s.id), 0.75 + facet * 0.4),
          rgb("#2f2c29"),
          gap * 0.8,
        );
      };
    })(),
  ),
  T(
    "ridgedRock",
    "mountains",
    (() => {
      const r = ramp(["#4f4840", "#6a6158", "#857b70", "#a1968a"]),
        h = (x: number, y: number) => ridges(x, y, 871, 5, 5);
      return (u, v) =>
        shade(r(h(u, v)), lit(h, u, v, 1 / 256, 5) * grain(u, v, 872, 0.1));
    })(),
  ),
  T(
    "alpineRock",
    "mountains",
    (() => {
      const r = ramp(["#55524f", "#6e6a66", "#8a8580"]),
        h = (x: number, y: number) => ridges(x, y, 881, 4, 5);
      return (u, v) => {
        const height = h(u, v),
          rock = shade(r(height), lit(h, u, v, 1 / 256, 5)),
          snow = smoothstep(0.8, 0.88, height + field(u, v, 882, 8, 3) * 0.2);
        return mix(rock, shade(rgb("#eef3f7"), lit(h, u, v, 1 / 256, 2)), snow);
      };
    })(),
  ),
  T(
    "mossyRock",
    "mountains",
    (() => {
      const r = ramp(["#5a5650", "#726d65", "#8b857c"]),
        mossC = ramp(["#3f5a22", "#55752c", "#6f9038"]),
        h = (x: number, y: number) => ridges(x, y, 891, 4, 4);
      return (u, v) => {
        const height = h(u, v),
          m = smoothstep(
            0.5,
            0.62,
            field(u, v, 892, 6, 4, 1) + (0.5 - height) * 0.4,
          );
        return mix(
          shade(r(height), lit(h, u, v)),
          shade(mossC(field(u, v, 893, 30, 2)), grain(u, v, 894, 0.2)),
          m,
        );
      };
    })(),
  ),

  // ======== Water ========
  T(
    "tropicalSea",
    "water",
    (() => {
      const r = ramp(["#1fa3b0", "#33bcc0", "#55d0c8", "#86e0d2"]);
      return (u, v) => {
        const c = cells(u, v, 901, 10, 1),
          caustic = smoothstep(0.08, 0, c.edge);
        return glow(
          r(field(u, v, 902, 3, 4, 0.8)),
          [180, 240, 230],
          caustic * 0.18,
        );
      };
    })(),
  ),
  T(
    "lagoon",
    "water",
    (() => {
      const r = ramp(["#3c9e9a", "#58b4a6", "#7ec7b0", "#b6dcbe"]);
      return (u, v) => {
        const sandbar = smoothstep(0.62, 0.72, field(u, v, 911, 3, 4, 1));
        return mix(
          water(["#3c9e9a", "#58b4a6", "#7ec7b0"], 912, 0.05)(u, v),
          r(0.95),
          sandbar * 0.6,
        );
      };
    })(),
  ),
  T(
    "calmLake",
    "water",
    water(["#2d5f86", "#3a7099", "#4a83aa", "#5c95b8"], 921, 0.05),
  ),
  T(
    "riverFlow",
    "water",
    (() => {
      const r = ramp(["#2f6a7e", "#3c7d8f", "#4d91a0"]);
      return (u, v) => {
        const flow = aniso(u, v + field(u, v, 931, 3, 2) * 0.05, 932, 2, 32, 3),
          streak = smoothstep(0.72, 0.85, flow);
        return glow(
          r(field(u, v, 933, 4, 3) * 0.6 + flow * 0.4),
          [140, 190, 200],
          streak * 0.25,
        );
      };
    })(),
  ),
  T(
    "stormSea",
    "water",
    (() => {
      const r = ramp(["#1d2a33", "#27373f", "#33454e", "#41545c"]);
      return (u, v) => {
        const swell = Math.sin(
            (v * 10 + field(u, v, 941, 3, 3, 1) * 3) * Math.PI * 2,
          ),
          caps =
            Math.pow(Math.max(0, swell), 10) *
            smoothstep(0.45, 0.7, field(u, v, 942, 12, 3));
        return mix(
          shade(r(field(u, v, 943, 4, 4)), 0.9 + swell * 0.1),
          rgb("#d9e2e4"),
          caps * 0.8,
        );
      };
    })(),
  ),
  T(
    "arcticSea",
    "water",
    (() => {
      const sea = ramp(["#13283a", "#1b3549", "#244259"]),
        ice = ramp(["#c9dce6", "#dbe8ef", "#eef5f8"]);
      return (u, v) => {
        const c = cells(u, v, 951, 7, 0.8),
          floe = c.id < 0.6 ? smoothstep(0.05, 0.12, c.edge) : 0;
        return mix(
          sea(field(u, v, 952, 4, 3)),
          shade(ice(field(u, v, 953, 12, 3)), 0.9 + c.id * 0.15),
          floe,
        );
      };
    })(),
  ),
  T(
    "coralReef",
    "water",
    (() => {
      const sea = ramp(["#2aa6b2", "#45bcbf", "#66cfc6"]),
        coral = ["#e0775e", "#e9a15a", "#c9628a", "#d8c06a"].map(rgb);
      return (u, v) => {
        const c = cells(u, v, 961, 14, 1.2),
          cluster = smoothstep(0.5, 0.6, field(u, v, 962, 4, 3, 1)),
          polyp = cluster * smoothstep(0.55, 0.25, c.f1);
        return mix(
          sea(field(u, v, 963, 3, 3)),
          shade(coral[Math.floor(c.id * 4)], 0.8 + (0.6 - c.f1) * 0.5),
          polyp * 0.85,
        );
      };
    })(),
  ),
  T(
    "kelpForest",
    "water",
    (() => {
      const sea = ramp(["#123a3a", "#1a4a46", "#225a52"]),
        kelp = ramp(["#3d5a1e", "#56752a", "#6f8f36"]);
      return (u, v) => {
        const k = aniso(u + field(u, v, 971, 3, 2) * 0.05, v, 972, 24, 3, 3),
          on = smoothstep(0.6, 0.7, k);
        return mix(sea(field(u, v, 973, 4, 3)), kelp(k), on * 0.8);
      };
    })(),
  ),
  T(
    "murkyWater",
    "water",
    water(["#3c4a32", "#4b5a3b", "#5d6b45", "#6f7b52"], 981, 0.06),
  ),
  T(
    "ripples",
    "water",
    (() => {
      const r = ramp(["#2f7aa0", "#3d8db0", "#55a2c0"]);
      return (u, v) => {
        const w = worley(u * 3, v * 3, 991, 3),
          ring = Math.sin(w.f1 * 40) * smoothstep(0.7, 0.1, w.f1);
        return shade(r(field(u, v, 992, 3, 3)), 1 + ring * 0.08);
      };
    })(),
  ),
  T(
    "surfFoam",
    "water",
    (() => {
      const sea = ramp(["#2fa0ae", "#46b4bb", "#62c6c4"]);
      return (u, v) => {
        const c = cells(u, v, 1001, 9, 1.4),
          lace =
            smoothstep(0.1, 0.02, c.edge) *
            smoothstep(0.35, 0.6, field(u, v, 1002, 3, 3));
        return mix(sea(field(u, v, 1003, 4, 3)), rgb("#f2fbfa"), lace * 0.85);
      };
    })(),
  ),
  T(
    "nightSea",
    "water",
    (() => {
      const r = ramp(["#060f22", "#0b1a33", "#122545"]);
      return (u, v) =>
        glow(
          shade(
            r(field(u, v, 1011, 3, 4, 1)),
            0.85 + aniso(u, v, 1012, 4, 30, 2) * 0.3,
          ),
          [170, 200, 255],
          smoothstep(0.8, 0.95, aniso(u, v, 1014, 3, 40, 2)) * 0.35 +
            stars(u, v, 1013, 24, 0.15) * 0.8,
        );
    })(),
  ),

  // ======== Snow & ice ========
  T(
    "freshSnow",
    "snow",
    (() => {
      const r = ramp(["#d6e0ea", "#e4ebf2", "#f0f4f8", "#fbfcfe"]);
      return (u, v) => {
        const h = (x: number, y: number) => field(x, y, 1101, 5, 4, 0.8);
        return shade(
          r(h(u, v)),
          lit(h, u, v, 1 / 128, 2) * grain(u, v, 1102, 0.04, 128),
        );
      };
    })(),
  ),
  T(
    "snowDrifts",
    "snow",
    (() => {
      const r = ramp(["#c9d6e3", "#dce5ee", "#eef3f8", "#fbfdff"]);
      return (u, v) => {
        const ph = frac(u * 2 + v * 4 + field(u, v, 1111, 3, 3, 1) * 2),
          crest = ph < 0.8 ? ph / 0.8 : (1 - ph) / 0.2;
        return r(crest * 0.7 + field(u, v, 1112, 8, 2) * 0.3);
      };
    })(),
  ),
  T(
    "packedIce",
    "snow",
    (() => {
      const r = ramp(["#7fb3cf", "#9ac6dc", "#b8d9e8", "#d6eaf3"]);
      return (u, v) => {
        const c = cells(u, v, 1121, 5, 0.6),
          crack = smoothstep(0.03, 0.005, c.edge),
          fine =
            smoothstep(0.02, 0, toLine(ridges(u, v, 1122, 6, 3) * 4)) * 0.4;
        return mix(
          r(field(u, v, 1123, 4, 4) * 0.7 + c.id * 0.3),
          rgb("#f4fbff"),
          Math.max(crack, fine),
        );
      };
    })(),
  ),
  T(
    "glacier",
    "snow",
    (() => {
      const r = ramp(["#c7dbe8", "#dae8f0", "#ecf4f8"]);
      return (u, v) => {
        const crev =
            smoothstep(
              0.035,
              0.0,
              toLine(u * 6 + field(u, v, 1131, 3, 3, 1) * 3),
            ) * smoothstep(0.4, 0.6, field(u, v, 1134, 4, 3)),
          flow = aniso(u, v, 1132, 12, 2, 2);
        return mix(
          mix(
            r(flow * 0.5 + field(u, v, 1133, 6, 3) * 0.5),
            rgb("#9cc6de"),
            field(u, v, 1135, 3, 3) * 0.4,
          ),
          rgb("#2f6f99"),
          crev * 0.85,
        );
      };
    })(),
  ),
  T(
    "frost",
    "snow",
    (() => {
      const r = ramp(["#a9c9dc", "#c2dae8", "#dbeaf3"]);
      return (u, v) => {
        const lines = Math.max(
          smoothstep(0.05, 0.0, cells(u, v, 1141, 10, 1.6).edge),
          smoothstep(0.06, 0.0, cells(u, v, 1142, 28, 1).edge) * 0.6,
        );
        return mix(r(field(u, v, 1143, 4, 3)), rgb("#ffffff"), lines * 0.85);
      };
    })(),
  ),
  T(
    "slush",
    "snow",
    (() => {
      const snow = ramp(["#b7bfc4", "#c9d0d4", "#dde2e4"]),
        wet = rgb("#7c8a91");
      return (u, v) =>
        mix(
          snow(field(u, v, 1151, 8, 4)),
          wet,
          smoothstep(0.5, 0.65, field(u, v, 1152, 5, 4, 1)) * 0.7,
        );
    })(),
  ),
  T(
    "permafrost",
    "snow",
    (() => {
      const tundra = ramp(["#6b6a50", "#7f7c5e", "#93906e"]),
        snow = rgb("#e7edf1");
      return (u, v) => {
        const c = cells(u, v, 1161, 6, 0.6),
          trough = smoothstep(0.12, 0.02, c.edge);
        return mix(
          shade(
            tundra(field(u, v, 1162, 20, 3) * 0.6 + c.id * 0.4),
            grain(u, v, 1163, 0.15),
          ),
          snow,
          trough * 0.85,
        );
      };
    })(),
  ),
  T(
    "snowyForest",
    "snow",
    (() => {
      const snow = ramp(["#dfe7ee", "#ecf1f5", "#f7f9fb"]),
        pine = ramp(["#1d3326", "#26402f", "#30503a"]);
      return (u, v) => {
        const c = cells(u, v, 1171, 20, 0.3),
          tree = c.id < 0.7 ? smoothstep(0.42, 0.3, c.f1) : 0,
          shadow =
            c.id < 0.7 ? smoothstep(0.5, 0.35, Math.hypot(c.f1, 0)) * 0.25 : 0;
        return mix(
          shade(snow(field(u, v, 1172, 5, 3)), 1 - shadow),
          pine(c.id),
          tree,
        );
      };
    })(),
  ),

  // ======== Volcanic ========
  T(
    "obsidian",
    "volcanic",
    (() => {
      const r = ramp(["#0b0a0f", "#15131c", "#211d2b"]);
      return (u, v) => {
        const c = cells(u, v, 1201, 6, 0.4),
          sheen = smoothstep(0.3, 0.0, Math.abs(c.f1 - 0.35)) * c.id;
        return glow(r(field(u, v, 1202, 4, 3)), [90, 80, 120], sheen * 0.35);
      };
    })(),
  ),
  T(
    "cooledLava",
    "volcanic",
    cracked(
      ["#1b1716", "#2a2422", "#3a322e"],
      ["#3a2a22", "#6b3a22", "#a04a20"],
      1211,
      6,
      0.08,
    ),
  ),
  T(
    "magmaFlow",
    "volcanic",
    (() => {
      const crust = ramp(["#1a1210", "#2b1c16", "#3a261c"]),
        hot = ramp(["#9b2410", "#e0581a", "#ffb33a", "#fff09a"]);
      return (u, v) => {
        const flow = ridges(u + field(u, v, 1221, 3, 2) * 0.1, v, 1222, 4, 4),
          river = smoothstep(0.6, 0.85, flow);
        return mix(crust(field(u, v, 1223, 16, 3)), hot(river), river);
      };
    })(),
  ),
  T(
    "sulfurField",
    "volcanic",
    (() => {
      const r = ramp(["#9b8a2a", "#c7b23a", "#e2cf52", "#f1e48a"]);
      return (u, v) => {
        const vent = spots(u, v, 1231, 10, 0.3, 0.3),
          ring = spots(u, v, 1231, 10, 0.5, 0.3) - vent;
        return mix(
          mix(
            shade(r(field(u, v, 1232, 6, 4, 0.8)), grain(u, v, 1233, 0.15)),
            rgb("#c96a2a"),
            ring * 0.6,
          ),
          rgb("#f7f3e0"),
          vent,
        );
      };
    })(),
  ),
  T(
    "pumice",
    "volcanic",
    (() => {
      const r = ramp(["#8d8780", "#a39d95", "#b8b2aa"]);
      return (u, v) => {
        const hole =
          spots(u, v, 1241, 60, 0.35, 0.5) * 0.6 +
          spots(u, v, 1242, 24, 0.3, 0.4) * 0.4;
        return mix(
          shade(r(field(u, v, 1243, 6, 3)), grain(u, v, 1244, 0.15, 96)),
          rgb("#4e4943"),
          hole * 0.8,
        );
      };
    })(),
  ),
  T(
    "blackSand",
    "volcanic",
    ground(["#16161a", "#222226", "#2f2f33", "#3d3d42"], 1251, 5, 0.6, 0.3),
  ),
  T(
    "embers",
    "volcanic",
    (() => {
      const ash = ramp(["#1d1b1a", "#2b2826", "#3a3633"]);
      return (u, v) => {
        const e = stars(u, v, 1261, 20, 0.3, 0.22),
          heat = smoothstep(0.55, 0.75, field(u, v, 1262, 4, 3, 1));
        return glow(
          shade(ash(field(u, v, 1263, 10, 3)), grain(u, v, 1264, 0.2)),
          [255, 120, 40],
          e * 0.9 + heat * 0.25,
        );
      };
    })(),
  ),

  // ======== Paper & ink ========
  T(
    "vellum",
    "paper",
    (() => {
      const r = ramp(["#e8dcc0", "#efe5cd", "#f5eedb"]);
      return (u, v) =>
        shade(r(field(u, v, 1301, 3, 4, 0.6)), grain(u, v, 1302, 0.05, 96));
    })(),
  ),
  T(
    "burntPaper",
    "paper",
    (() => {
      const r = ramp(["#d6bf8e", "#e2cfa3", "#ebdcb6"]),
        burn = ramp(["#2a1a10", "#6b3f1e", "#a5732e"]);
      return (u, v) => {
        const b = field(u, v, 1311, 2, 5, 0.6),
          scorch = smoothstep(0.6, 0.75, b);
        return mix(
          shade(r(field(u, v, 1312, 6, 3)), grain(u, v, 1313, 0.06)),
          burn(1 - scorch),
          scorch,
        );
      };
    })(),
  ),
  T(
    "linen",
    "paper",
    (() => {
      const r = ramp(["#d9d0bb", "#e4dcc9", "#eee8d8"]);
      return (u, v) => {
        const warp = Math.sin(u * 160 * Math.PI) * 0.5 + 0.5,
          weft = Math.sin(v * 160 * Math.PI) * 0.5 + 0.5,
          over = (Math.floor(u * 80) + Math.floor(v * 80)) % 2 ? warp : weft,
          slub = aniso(u, v, 1321, 2, 64, 2);
        return shade(
          r(field(u, v, 1322, 4, 3) * 0.6 + slub * 0.4),
          0.88 + over * 0.14,
        );
      };
    })(),
  ),
  T(
    "leather",
    "paper",
    (() => {
      const r = ramp(["#5a3520", "#6e4228", "#835232", "#97633e"]);
      return (u, v) => {
        const c = cells(u, v, 1331, 40, 0.6),
          crease = smoothstep(0.06, 0.0, c.edge);
        return shade(
          r(field(u, v, 1332, 4, 4, 0.8)),
          (0.95 + c.id * 0.08) * (1 - crease * 0.3),
        );
      };
    })(),
  ),
  T(
    "sepiaWash",
    "paper",
    (() => {
      const r = ramp(["#7a5a3a", "#9a7650", "#b8946a", "#d2b38a", "#e6d0aa"]);
      return (u, v) => {
        const n = field(u, v, 1341, 3, 4, 1.2),
          rim = smoothstep(0.02, 0, Math.abs(n - 0.5)) * 0.5;
        return shade(r(n), (1 - rim * 0.3) * grain(u, v, 1342, 0.06));
      };
    })(),
  ),
  T(
    "blueprint",
    "paper",
    (() => {
      const r = ramp(["#1d4a7c", "#24568c", "#2c629a"]),
        line = rgb("#cfe0f0");
      return (u, v) => {
        const fine = Math.max(
            smoothstep(0.03, 0.01, toLine(u * 32)),
            smoothstep(0.03, 0.01, toLine(v * 32)),
          ),
          major = Math.max(
            smoothstep(0.012, 0.004, toLine(u * 4)),
            smoothstep(0.012, 0.004, toLine(v * 4)),
          );
        return mix(
          mix(r(field(u, v, 1351, 3, 3)), line, fine * 0.25),
          line,
          major * 0.7,
        );
      };
    })(),
  ),
  T(
    "engraving",
    "paper",
    (() => {
      const paper = rgb("#efe6cf"),
        ink = rgb("#2a2420");
      return (u, v) => {
        const tone = field(u, v, 1361, 3, 4, 1),
          x = u * 90 + v * 30 + field(u, v, 1362, 6, 2) * 0.6,
          width = smoothstep(0.75, 0.25, tone) * 0.42,
          hatch = smoothstep(width, width - 0.08, toLine(x));
        return mix(shade(paper, grain(u, v, 1363, 0.05)), ink, hatch * 0.85);
      };
    })(),
  ),
  T(
    "inkStipple",
    "paper",
    (() => {
      const paper = rgb("#f1ead8"),
        ink = rgb("#2b2621");
      return (u, v) => {
        const tone = field(u, v, 1371, 3, 4, 1),
          w = worley(u * 70, v * 70, 1372, 70),
          r = smoothstep(0.7, 0.2, tone) * 0.4;
        return mix(paper, ink, smoothstep(r, r - 0.06, w.f1) * 0.9);
      };
    })(),
  ),

  // ======== Floors, walls & roads ========
  T(
    "bricks",
    "details",
    (() => {
      const r = ramp(["#7c3424", "#94402c", "#a84e34", "#b8603e"]);
      return (u, v) =>
        tiled(
          u,
          v,
          bricks(u, v, 8, 16),
          (id) => r(id),
          1401,
          rgb("#c9bfae"),
          0.09,
        );
    })(),
  ),
  T(
    "terracotta",
    "details",
    (() => {
      const r = ramp(["#a8532e", "#bd6438", "#cc7544", "#d88a58"]);
      return (u, v) =>
        tiled(
          u,
          v,
          bricks(u, v, 6, 6, 0),
          (id) => r(id),
          1411,
          rgb("#ddd2bd"),
          0.05,
        );
    })(),
  ),
  T(
    "mosaic",
    "details",
    (() => {
      const pal = [
        "#2c6e8a",
        "#3a8aa6",
        "#e1c06a",
        "#c9553f",
        "#f0ead8",
        "#3d7a4a",
      ].map(rgb);
      return (u, v) => {
        const b = bricks(u + field(u, v, 1421, 4, 2) * 0.01, v, 32, 32, 0),
          pick = (id: number) => pal[Math.floor(id * pal.length * 0.999)];
        return tiled(u, v, b, pick, 1422, rgb("#6e6658"), 0.1);
      };
    })(),
  ),
  T(
    "hexTiles",
    "details",
    (() => {
      const r = ramp(["#6b5f53", "#807365", "#968877"]);
      return (u, v) => {
        const L = lattice(u, v, 8, 9, true),
          grout = smoothstep(0.05, 0.1, L.edge);
        return mix(
          rgb("#3a342e"),
          shade(r(hash2(L.i, L.j, 1431)), grain(u, v, 1432, 0.12)),
          grout,
        );
      };
    })(),
  ),
  T(
    "stoneWall",
    "details",
    (() => {
      const r = ramp(["#6f6a62", "#857f75", "#9a9387", "#ada699"]);
      return (u, v) => {
        const b = bricks(
            u + field(u, v, 1441, 4, 2) * 0.02,
            v + field(u, v, 1442, 4, 2) * 0.02,
            5,
            8,
            0.37,
          ),
          round = smoothstep(0, 0.25, b.edge);
        return tiled(
          u,
          v,
          b,
          (id) => shade(r(id), 0.85 + round * 0.2),
          1443,
          rgb("#3c3833"),
          0.1,
        );
      };
    })(),
  ),
  T(
    "roofTiles",
    "details",
    (() => {
      const r = ramp(["#7d2e20", "#943a28", "#a84a30"]);
      return (u, v) => {
        // Fish scales: rows overlap downwards; the lower row is on top.
        const cols = 10,
          rows = 14,
          y = v * rows,
          j = Math.floor(y);
        for (const dj of [1, 0]) {
          const row = j + dj,
            sh = (((row % rows) + rows) % rows) % 2 ? 0.5 : 0,
            x = u * cols - sh,
            i = Math.round(x),
            dx = x - i,
            dy = (y - row) * (cols / rows) * 1.2,
            d = Math.hypot(dx, dy);
          if (dy <= 0.05 && d < 0.62) {
            const id = hash2(
              ((i % cols) + cols) % cols,
              ((row % rows) + rows) % rows,
              1451,
            );
            return shade(
              r(id),
              0.7 + (0.62 - d) * 0.6 - smoothstep(0.5, 0.62, d) * 0.3,
            );
          }
        }
        return rgb("#3a1a14");
      };
    })(),
  ),
  T(
    "thatch",
    "details",
    (() => {
      const r = ramp(["#8a6a32", "#a9843f", "#c49d52", "#d8b56a"]);
      return (u, v) => {
        const straw = aniso(u, v, 1461, 6, 96, 3),
          course = smoothstep(
            0.12,
            0,
            frac(v * 8 + field(u, v, 1462, 4, 2) * 0.4),
          );
        return shade(r(straw), 0.8 + straw * 0.3 - course * 0.25);
      };
    })(),
  ),
  T(
    "marbleFloor",
    "details",
    (() => {
      const light = ramp(["#e7e3dc", "#f2efe9"]),
        dark = ramp(["#3a3634", "#4a4542"]);
      return (u, v) => {
        const b = bricks(u, v, 4, 4, 0),
          black = (b.i + b.j) % 2 === 1,
          vein = smoothstep(
            0.03,
            0,
            toLine((u - v) * 3 + field(u, v, 1471, 3, 4, 1) * 2.5),
          );
        const c = black
          ? mix(dark(field(u, v, 1472, 6, 3)), rgb("#8a8580"), vein * 0.5)
          : mix(light(field(u, v, 1473, 6, 3)), rgb("#9a948d"), vein * 0.5);
        return mix(rgb("#2a2624"), c, smoothstep(0.004, 0.012, b.edge));
      };
    })(),
  ),
  T(
    "dirtRoad",
    "details",
    (() => {
      const r = ramp(["#7a6145", "#8d7252", "#a08562", "#b39874"]);
      return (u, v) => {
        const rut = Math.max(
            smoothstep(
              0.05,
              0,
              Math.abs(v - 0.3 - (field(u, v, 1481, 3, 2) - 0.5) * 0.04),
            ),
            smoothstep(
              0.05,
              0,
              Math.abs(v - 0.7 - (field(u, v, 1482, 3, 2) - 0.5) * 0.04),
            ),
          ),
          stones = spots(u, v, 1483, 40, 0.25, 0.15);
        const c = shade(
          r(field(u, v, 1484, 6, 4)),
          grain(u, v, 1485, 0.2, 96) * (1 - rut * 0.25),
        );
        return mix(c, rgb("#c9bba2"), stones * 0.7);
      };
    })(),
  ),
  T(
    "parquet",
    "details",
    (() => {
      const r = ramp(["#6e4526", "#87572f", "#9f6a3a", "#b67f48"]);
      return (u, v) => {
        // Basket weave: 2×2 blocks of three planks, turned every other block.
        const bx = Math.floor(u * 4),
          by = Math.floor(v * 4),
          turned = (bx + by) % 2 === 1,
          lx = frac(u * 4),
          ly = frac(v * 4),
          a = turned ? ly : lx,
          b = turned ? lx : ly,
          plank = Math.floor(b * 3),
          fb = b * 3 - plank,
          id = hash2(bx * 3 + plank, by, 1491),
          woodgrain = aniso(
            turned ? v : u,
            turned ? u : v,
            1492 + plank,
            2,
            48,
            2,
          ),
          seam = Math.max(
            smoothstep(0.05, 0, Math.min(fb, 1 - fb)),
            smoothstep(0.015, 0, Math.min(a, 1 - a)),
          );
        return mix(r(id * 0.6 + woodgrain * 0.4), rgb("#3a2414"), seam * 0.8);
      };
    })(),
  ),

  // ======== Fantasy ========
  T(
    "crystal",
    "fantasy",
    (() => {
      const r = ramp(["#3b2466", "#5a3a92", "#8060c0", "#b39ae6"]);
      return (u, v) => {
        const c = cells(u, v, 1501, 8, 0.2),
          l = cells(u - 0.01, v - 0.01, 1501, 8, 0.2),
          facet = smoothstep(-0.1, 0.1, c.f1 - l.f1),
          edge = smoothstep(0.05, 0, c.edge);
        return glow(r(c.id * 0.5 + facet * 0.5), [200, 180, 255], edge * 0.5);
      };
    })(),
  ),
  T(
    "arcane",
    "fantasy",
    (() => {
      const r = ramp(["#0d1430", "#16204a", "#202e66"]);
      return (u, v) => {
        const w = cells(u, v, 1511, 4, 2),
          vein =
            smoothstep(0.06, 0, w.edge) +
            smoothstep(0.03, 0, Math.abs(w.f1 - 0.3)) * 0.6;
        return glow(
          r(field(u, v, 1512, 4, 4, 1)),
          [90, 200, 255],
          vein * 0.8 + stars(u, v, 1513, 20, 0.1) * 0.7,
        );
      };
    })(),
  ),
  T(
    "corruption",
    "fantasy",
    (() => {
      const r = ramp(["#140a18", "#231029", "#35173b"]);
      return (u, v) => {
        const w = cells(u, v, 1521, 5, 1.2),
          vein = smoothstep(0.08, 0, w.edge),
          pulse = field(u, v, 1522, 3, 3);
        return glow(
          r(field(u, v, 1523, 8, 4)),
          [220, 60, 200],
          vein * (0.4 + pulse * 0.6),
        );
      };
    })(),
  ),
  T(
    "fairyMeadow",
    "fantasy",
    (() => {
      const g = grass(["#2c6a5a", "#38806a", "#4a967a", "#62ad8c"], 1531);
      return (u, v) =>
        glow(g(u, v), [200, 255, 180], stars(u, v, 1532, 20, 0.15, 0.2) * 0.9);
    })(),
  ),
  T(
    "mushrooms",
    "fantasy",
    (() => {
      const g = grass(["#3b5a26", "#4a6e2e", "#5b8238"], 1541);
      return (u, v) => {
        const c = cells(u, v, 1542, 10, 0.2),
          cap = c.id < 0.4 ? smoothstep(0.38, 0.32, c.f1) : 0,
          dot = spots(u, v, 1543, 60, 0.4, 0.5);
        if (!cap) return g(u, v);
        const col = c.id < 0.25 ? rgb("#c8352a") : rgb("#d8a24a");
        return mix(
          g(u, v),
          mix(shade(col, 0.8 + (0.38 - c.f1) * 0.8), rgb("#f6efe2"), dot * 0.9),
          cap,
        );
      };
    })(),
  ),
  T(
    "voidSpace",
    "fantasy",
    (() => {
      const neb = ramp(["#05040c", "#140c2a", "#2a1450", "#3c1f6a", "#1a3a70"]);
      return (u, v) =>
        glow(
          neb(field(u, v, 1551, 3, 5, 1.4) * 0.9),
          [255, 255, 255],
          stars(u, v, 1552, 36, 0.25) + stars(u, v, 1553, 10, 0.15, 0.2) * 0.8,
        );
    })(),
  ),
  T(
    "goldCoins",
    "fantasy",
    (() => {
      const gold = ramp(["#7a5414", "#a8771f", "#d4a336", "#f2d071"]);
      return (u, v) => {
        const c = cells(u, v, 1561, 14, 0.1),
          coin = smoothstep(0.62, 0.55, c.f1),
          rim = smoothstep(0.08, 0, Math.abs(c.f1 - 0.48)),
          l = cells(u - 0.006, v - 0.006, 1561, 14, 0.1),
          light = smoothstep(-0.08, 0.08, c.f1 - l.f1);
        return mix(
          rgb("#3a2808"),
          shade(gold(0.3 + light * 0.6 + c.id * 0.1), 1 - rim * 0.25),
          coin,
        );
      };
    })(),
  ),
  T(
    "bioluminescence",
    "fantasy",
    (() => {
      const r = ramp(["#031418", "#062228", "#0a3038"]);
      return (u, v) => {
        const swirl =
          smoothstep(0.07, 0, cells(u, v, 1572, 5, 2.2).edge) *
          field(u, v, 1571, 3, 3);
        return glow(
          r(field(u, v, 1573, 4, 3)),
          [40, 230, 210],
          swirl * 0.8 + stars(u, v, 1574, 40, 0.1) * 0.6,
        );
      };
    })(),
  ),
  T(
    "cloudSea",
    "fantasy",
    (() => {
      const r = ramp(["#8ea5c4", "#b4c6dc", "#d9e3ef", "#f7f9fc"]),
        h = (x: number, y: number) => field(x, y, 1581, 4, 5, 1);
      return (u, v) =>
        shade(r(clamp01(h(u, v) * 1.3 - 0.15)), lit(h, u, v, 1 / 128, 3));
    })(),
  ),
];

/** Words each library texture is also found by, in English and Arabic. */
export const LIBRARY_TAGS: Record<string, string[]> = {
  lushGrass: ["grass", "green", "lawn", "عشب", "أخضر"],
  dryGrass: ["grass", "dry", "straw", "عشب", "جاف"],
  autumnGrass: ["grass", "autumn", "golden", "عشب", "خريف", "ذهبي"],
  clover: ["grass", "clover", "green", "برسيم", "عشب"],
  wildflowers: ["flowers", "meadow", "spring", "زهور", "مرج", "ربيع"],
  lavender: [
    "flowers",
    "purple",
    "rows",
    "field",
    "خزامى",
    "لافندر",
    "بنفسجي",
    "حقل",
  ],
  wheat: ["field", "crops", "farm", "golden", "قمح", "حقل", "مزرعة"],
  ricePaddies: ["rice", "terraces", "farm", "wet", "أرز", "مدرجات", "حقول"],
  vineyard: ["grapes", "vines", "rows", "farm", "كروم", "عنب", "مزرعة"],
  orchard: ["trees", "fruit", "farm", "بستان", "أشجار", "فواكه"],
  autumnForest: [
    "forest",
    "trees",
    "autumn",
    "orange",
    "غابة",
    "خريف",
    "أشجار",
  ],
  deadForest: [
    "forest",
    "dead",
    "trees",
    "grey",
    "غابة ميتة",
    "أشجار",
    "رمادي",
  ],
  bamboo: ["bamboo", "stalks", "asia", "خيزران", "بامبو"],
  moss: ["moss", "green", "damp", "طحالب", "أخضر"],
  clay: ["clay", "soil", "red", "طين", "تربة"],
  loam: ["soil", "dark", "earth", "تربة", "داكن"],
  gravel: ["stones", "gravel", "path", "حصى", "حجارة"],
  pebbles: ["stones", "pebbles", "beach", "river", "حصى", "شاطئ", "نهر"],
  crackedEarth: ["dry", "cracks", "drought", "mud", "تشقق", "جفاف", "طين"],
  plowedField: [
    "farm",
    "field",
    "furrows",
    "soil",
    "حقل محروث",
    "أخاديد",
    "تربة",
  ],
  peatBog: ["bog", "marsh", "peat", "dark", "مستنقع", "خث"],
  steppe: ["plain", "grassland", "dry", "سهوب", "سهل"],
  redSoil: ["soil", "red", "laterite", "تربة حمراء"],
  chalk: ["chalk", "white", "cliff", "طباشير", "أبيض"],
  mudFlat: ["mud", "tidal", "wet", "coast", "وحل", "مد وجزر", "ساحل"],
  heath: ["heather", "moor", "purple", "خلنج", "أراضي بور"],
  goldenSand: ["sand", "beach", "desert", "رمل", "شاطئ", "صحراء"],
  whiteSand: ["sand", "beach", "white", "رمل أبيض", "شاطئ"],
  redSand: ["sand", "red", "desert", "رمل أحمر", "صحراء"],
  sandRipples: ["sand", "ripples", "wind", "dunes", "تموجات", "رمل", "رياح"],
  saltFlat: ["salt", "flat", "white", "سبخة", "ملح", "أبيض"],
  badlands: [
    "strata",
    "canyon",
    "layers",
    "eroded",
    "طبقات",
    "وادي",
    "أرض وعرة",
  ],
  mesa: ["mesa", "plateau", "terraces", "canyon", "هضبة", "مدرجات"],
  stonyDesert: ["desert", "stones", "hamada", "صحراء حجرية", "حجارة"],
  duneSea: ["dunes", "sand sea", "erg", "كثبان", "بحر رمال"],
  desertCrust: ["desert", "crust", "dry", "قشرة", "صحراء"],
  granite: ["granite", "stone", "speckled", "جرانيت", "حجر"],
  slate: ["slate", "dark", "layers", "أردواز", "صخر داكن"],
  basalt: ["basalt", "columns", "hexagons", "بازلت", "أعمدة", "سداسي"],
  sandstone: ["sandstone", "layers", "orange", "حجر رملي", "طبقات"],
  limestone: ["limestone", "pale", "rock", "حجر جيري", "صخر"],
  marble: ["marble", "veins", "white", "رخام", "عروق"],
  scree: ["scree", "rubble", "rocks", "ركام", "صخور"],
  ridgedRock: ["rock", "ridges", "mountain", "صخر", "نتوءات", "جبل"],
  alpineRock: ["alpine", "snow", "peaks", "rock", "جبال ثلجية", "قمم"],
  mossyRock: ["rock", "moss", "green", "صخر", "طحالب"],
  tropicalSea: ["sea", "tropical", "turquoise", "بحر", "استوائي", "فيروزي"],
  lagoon: ["lagoon", "shallow", "sandbar", "بحيرة شاطئية", "ضحل"],
  calmLake: ["lake", "calm", "blue", "بحيرة", "هادئ", "أزرق"],
  riverFlow: ["river", "flow", "current", "نهر", "جريان", "تيار"],
  stormSea: ["sea", "storm", "waves", "dark", "بحر", "عاصفة", "أمواج"],
  arcticSea: ["sea", "ice", "floes", "arctic", "بحر", "جليد", "قطبي"],
  coralReef: ["reef", "coral", "tropical", "شعاب", "مرجان"],
  kelpForest: ["kelp", "seaweed", "deep", "أعشاب بحرية", "عميق"],
  murkyWater: ["swamp", "murky", "water", "مستنقع", "ماء عكر"],
  ripples: ["ripples", "water", "rings", "تموجات", "ماء", "حلقات"],
  surfFoam: ["foam", "surf", "waves", "رغوة", "أمواج"],
  nightSea: ["sea", "night", "dark", "stars", "بحر", "ليل", "نجوم"],
  freshSnow: ["snow", "white", "winter", "ثلج", "أبيض", "شتاء"],
  snowDrifts: ["snow", "drifts", "wind", "ثلج", "كثبان ثلجية"],
  packedIce: ["ice", "frozen", "cracks", "جليد", "متجمد", "تشقق"],
  glacier: ["glacier", "ice", "crevasses", "نهر جليدي", "شقوق"],
  frost: ["frost", "ice", "crystals", "صقيع", "بلورات"],
  slush: ["slush", "wet snow", "grey", "ثلج ذائب", "رمادي"],
  permafrost: ["tundra", "polygons", "cold", "تندرا", "تربة متجمدة"],
  snowyForest: ["forest", "snow", "pines", "taiga", "غابة", "ثلج", "صنوبر"],
  obsidian: ["obsidian", "glass", "black", "سبج", "زجاج بركاني", "أسود"],
  cooledLava: ["lava", "cooled", "basalt", "cracks", "حمم باردة", "تشقق"],
  magmaFlow: ["lava", "magma", "fire", "flow", "حمم", "صهارة", "نار"],
  sulfurField: ["sulfur", "vents", "yellow", "كبريت", "فوهات", "أصفر"],
  pumice: ["pumice", "porous", "stone", "حجر الخفاف", "مسامي"],
  blackSand: ["sand", "black", "beach", "volcanic", "رمل أسود", "بركاني"],
  embers: ["embers", "ash", "fire", "جمر", "رماد", "نار"],
  vellum: ["paper", "vellum", "smooth", "رق", "ورق ناعم"],
  burntPaper: ["paper", "burnt", "old", "ورق محروق", "قديم"],
  linen: ["canvas", "linen", "fabric", "قماش", "كتان"],
  leather: ["leather", "hide", "brown", "جلد", "بني"],
  sepiaWash: ["sepia", "wash", "ink", "watercolor", "بني داكن", "ألوان مائية"],
  blueprint: ["blueprint", "grid", "blue", "مخطط", "شبكة", "أزرق"],
  engraving: ["engraving", "hatching", "ink", "lines", "نقش", "تظليل", "حبر"],
  inkStipple: ["stipple", "dots", "ink", "تنقيط", "حبر"],
  bricks: ["bricks", "wall", "red", "طوب", "جدار"],
  terracotta: ["tiles", "terracotta", "floor", "بلاط", "فخار", "أرضية"],
  mosaic: ["mosaic", "tiles", "colorful", "فسيفساء", "بلاط", "ملون"],
  hexTiles: ["tiles", "hexagons", "floor", "بلاط سداسي", "أرضية"],
  stoneWall: ["wall", "stones", "masonry", "جدار حجري", "بناء"],
  roofTiles: ["roof", "tiles", "scales", "سقف", "قرميد"],
  thatch: ["thatch", "straw", "roof", "قش", "سقف"],
  marbleFloor: ["floor", "marble", "checker", "أرضية رخام", "شطرنج"],
  dirtRoad: ["road", "dirt", "path", "ruts", "طريق ترابي", "ممر"],
  parquet: ["wood", "floor", "parquet", "باركيه", "خشب", "أرضية"],
  crystal: [
    "crystal",
    "gems",
    "purple",
    "magic",
    "كريستال",
    "أحجار كريمة",
    "سحر",
  ],
  arcane: ["magic", "arcane", "runes", "glow", "سحر", "طاقة", "توهج"],
  corruption: ["corruption", "dark", "evil", "veins", "فساد", "ظلام", "شر"],
  fairyMeadow: ["fairy", "magic", "meadow", "glow", "جنية", "سحري", "مرج"],
  mushrooms: ["mushrooms", "fungi", "forest", "فطر", "عيش الغراب"],
  voidSpace: ["space", "void", "stars", "nebula", "فضاء", "نجوم", "سديم"],
  goldCoins: ["gold", "coins", "treasure", "ذهب", "عملات", "كنز"],
  bioluminescence: ["glow", "sea", "bioluminescent", "توهج", "بحر مضيء"],
  cloudSea: ["clouds", "sky", "heaven", "غيوم", "سماء", "سحاب"],
};
