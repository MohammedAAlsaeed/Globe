/**
 * Builds the Earth map template from Natural Earth (public domain):
 *
 *   public/templates/earth-110m.json   small maps (1K)
 *   public/templates/earth-50m.json    everything larger
 *   features/mapmaker/templates/earthPreview.generated.ts
 *       the outline of the land for the template's card
 *
 * Natural Earth's vector data (land, lakes, rivers, country borders,
 * country / ocean / sea names, capitals) is projected to equirectangular
 * (2:1 — what the globe print needs), simplified for the size it is drawn
 * at, and stored compactly. The editor turns it into ordinary, editable
 * map objects when a map is created from the template
 * (features/mapmaker/templates/earth.ts), so the file holds geography
 * only — no looks, ids or seeds.
 *
 * Coordinates are map fractions × SCALE, as integers; a ring or line is
 * flat [x0, y0, dx1, dy1, …] (deltas after the first point).
 *
 * Points of view: Natural Earth records how some countries see disputed
 * areas (FCLASS_<POV>). Each name, capital and border keeps the points of
 * view that differ from the default (`v`: { POV: 0 hidden | 1 shown }), so
 * the person creating a map can pick one.
 *
 * Run (downloads the pinned release once, into scripts/.cache):
 *   npm run templates:earth
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "v5.1.2";
const BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${VERSION}/geojson`;
const root = fileURLToPath(new URL("..", import.meta.url));
const cache = join(root, "scripts", ".cache", `natural-earth-${VERSION}`);
const out = join(root, "public", "templates");
const SCALE = 100000;

/** Per detail level: simplification tolerance and smallest kept area
 * (degrees, degrees²) and which names make the cut. */
const LEVELS = {
  "110m": {
    tolerance: 0.1,
    minArea: 0.6,
    minLakeArea: 1.2,
    river: "110m",
    border: "110m",
    seaRank: 1,
    countryLabel: 4,
  },
  "50m": {
    tolerance: 0.025,
    minArea: 0.025,
    minLakeArea: 0.25,
    river: "50m",
    border: "50m",
    seaRank: 2,
    countryLabel: 5,
  },
};

/** The continents (Natural Earth has no continent names). */
const CONTINENTS = [
  { en: "Africa", ar: "أفريقيا", lon: 18, lat: 6 },
  { en: "Europe", ar: "أوروبا", lon: 15, lat: 54 },
  { en: "Asia", ar: "آسيا", lon: 90, lat: 48 },
  { en: "North America", ar: "أمريكا الشمالية", lon: -100, lat: 48 },
  { en: "South America", ar: "أمريكا الجنوبية", lon: -60, lat: -14 },
  { en: "Oceania", ar: "أوقيانوسيا", lon: 134, lat: -25 },
  { en: "Antarctica", ar: "القارة القطبية الجنوبية", lon: 40, lat: -80 },
];

async function load(name) {
  mkdirSync(cache, { recursive: true });
  const file = join(cache, `${name}.geojson`);
  if (!existsSync(file)) {
    process.stdout.write(`  downloading ${name}\n`);
    const res = await fetch(`${BASE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, "utf8")).features;
}

// ---- geometry (degrees: equirectangular is uniform in them) ---------------------------
const polygonsOf = (g) =>
  !g
    ? []
    : g.type === "Polygon"
      ? [g.coordinates]
      : g.type === "MultiPolygon"
        ? g.coordinates
        : [];
const linesOf = (g) =>
  !g
    ? []
    : g.type === "LineString"
      ? [g.coordinates]
      : g.type === "MultiLineString"
        ? g.coordinates
        : [];

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
}

/** Douglas–Peucker, iterative. Keeps the ends. */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length),
    t2 = tol * tol,
    stack = [[0, pts.length - 1]];
  keep[0] = keep[pts.length - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop(),
      [ax, ay] = pts[a],
      [bx, by] = pts[b],
      dx = bx - ax,
      dy = by - ay,
      l2 = dx * dx + dy * dy;
    let best = -1,
      bd = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - px,
        ey = ay + dy * t - py,
        d = ex * ex + ey * ey;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A closed ring, simplified; null when too little is left. */
function simplifyRing(ring, tol) {
  const open =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (open.length < 3) return null;
  // Split at the point farthest from the first, so both halves have fixed ends.
  let far = 1,
    fd = -1;
  for (let i = 1; i < open.length; i++) {
    const d = (open[i][0] - open[0][0]) ** 2 + (open[i][1] - open[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = simplify(open.slice(0, far + 1), tol),
    b = simplify([...open.slice(far), open[0]], tol),
    r = [...a, ...b.slice(1, -1)];
  return r.length >= 3 ? r : null;
}

/** Pole of inaccessibility (the polylabel method): the point inside the
 * polygon farthest from its edge — where a name fits best. */
function poleOf(rings, precision = 0.5) {
  const outer = rings[0];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const dist = (x, y) => {
    let inside = false,
      best = Infinity;
    for (const r of rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ax, ay] = r[i],
          [bx, by] = r[j];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
          inside = !inside;
        const dx = bx - ax,
          dy = by - ay,
          l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
      }
    return inside ? best : -best;
  };
  const cell = (x, y, h) => {
    const d = dist(x, y);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const size = Math.min(maxX - minX, maxY - minY);
  if (size <= 0) return [minX, minY];
  let h = size / 2;
  const queue = [];
  for (let x = minX; x < maxX; x += size)
    for (let y = minY; y < maxY; y += size) queue.push(cell(x + h, y + h, h));
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const c = queue.pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    queue.push(
      cell(c.x - h, c.y - h, h),
      cell(c.x + h, c.y - h, h),
      cell(c.x - h, c.y + h, h),
      cell(c.x + h, c.y + h, h),
    );
  }
  return [best.x, best.y];
}

/**
 * Joins lines that continue each other (an end shared by exactly two lines
 * with the same key) into longer ones: fewer, longer objects to edit.
 * `items`: { line, key }; returns { line, key } with joined lines.
 */
function chain(items) {
  const id = (p) => `${p[0]},${p[1]}`,
    ends = new Map(),
    add = (k, i) => ends.set(k, [...(ends.get(k) ?? []), i]);
  items.forEach((it, i) => {
    add(id(it.line[0]), i);
    add(id(it.line[it.line.length - 1]), i);
  });
  const used = new Uint8Array(items.length),
    out = [];
  const partner = (pt, i) => {
    const at = ends.get(id(pt)) ?? [];
    if (at.length !== 2) return -1;
    const j = at[0] === i ? at[1] : at[0];
    return j !== i && !used[j] && items[j].key === items[i].key ? j : -1;
  };
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let line = items[i].line.slice();
    // grow forward, then backward
    for (const dir of [1, -1]) {
      for (;;) {
        const end = dir === 1 ? line[line.length - 1] : line[0],
          j = partner(end, i);
        if (j < 0) break;
        used[j] = 1;
        let next = items[j].line;
        const sameStart = id(next[0]) === id(end);
        if (dir === 1) {
          if (!sameStart) next = next.slice().reverse();
          line = [...line, ...next.slice(1)];
        } else {
          if (sameStart) next = next.slice().reverse();
          line = [...next.slice(0, -1), ...line];
        }
      }
    }
    out.push({ line, key: items[i].key });
  }
  return out;
}

// ---- encoding ----------------------------------------------------------------------------
const qx = (lon) => Math.round(((lon + 180) / 360) * SCALE);
const qy = (lat) => Math.round(((90 - lat) / 180) * SCALE);

/** [x0, y0, dx, dy, …] with repeated points dropped. */
function encode(pts) {
  const out = [];
  let px = 0,
    py = 0,
    first = true;
  for (const [lon, lat] of pts) {
    const x = qx(lon),
      y = qy(lat);
    if (!first && x === px && y === py) continue;
    out.push(first ? x : x - px, first ? y : y - py);
    px = x;
    py = y;
    first = false;
  }
  return out;
}

const POVS = [];
/** Points of view in which a feature is shown or hidden, where they differ
 * from the default. `shownIn(cls)` says whether a class means "shown". */
function povExceptions(props, defaultShown, shownIn) {
  const v = {};
  for (const [k, cls] of Object.entries(props)) {
    if (!k.startsWith("FCLASS_") || k === "FCLASS_ISO" || k === "FCLASS_TLC")
      continue;
    const pov = k.slice(7);
    if (!POVS.includes(pov)) POVS.push(pov);
    if (cls == null) continue;
    const shown = shownIn(cls);
    if (shown !== defaultShown) v[pov] = shown ? 1 : 0;
  }
  return Object.keys(v).length ? v : undefined;
}

// ---- build ---------------------------------------------------------------------------------
async function build(level) {
  const L = LEVELS[level];
  const tpl = {
    format: 1,
    template: "earth",
    detail: level,
    source: {
      name: "Natural Earth",
      version: VERSION.slice(1),
      url: "https://www.naturalearthdata.com/",
      license: "Public domain",
    },
    projection: "equirectangular",
    scale: SCALE,
    land: [],
    lakes: [],
    rivers: [],
    borders: [],
    labels: [],
    povs: POVS,
  };

  // Land: outer rings (largest first); the odd hole becomes water.
  const land = [];
  for (const f of await load(`ne_${level}_land`))
    for (const poly of polygonsOf(f.geometry)) {
      const outer = simplifyRing(poly[0], L.tolerance);
      if (!outer || ringArea(outer) < L.minArea) continue;
      land.push({ area: ringArea(outer), r: outer });
      for (const hole of poly.slice(1)) {
        const h = simplifyRing(hole, L.tolerance);
        if (h && ringArea(h) >= L.minLakeArea)
          tpl.lakes.push({ r: encode(h), k: 9 });
      }
    }
  land.sort((a, b) => b.area - a.area);
  tpl.land = land.map((l) => encode(l.r));

  // Lakes (water cut out of the land), their islands land again.
  const lakeNames = [];
  const lakes = (await load(`ne_${level}_lakes`))
    .flatMap((f) =>
      polygonsOf(f.geometry).map((poly) => ({
        f,
        poly,
        area: ringArea(poly[0]),
      })),
    )
    .filter((l) => l.area >= L.minLakeArea)
    .sort((a, b) => b.area - a.area);
  for (const { f, poly, area } of lakes) {
    const r = simplifyRing(poly[0], L.tolerance);
    if (!r) continue;
    // The great lakes are named (the Caspian is named as a sea).
    const p = f.properties;
    if (area >= 2.5 && p.name && !/Caspian/i.test(p.name)) {
      const [lon, lat] = poleOf(poly, 0.1);
      lakeNames.push({
        t: "lake",
        en: p.name,
        ar: p.name_ar ?? p.name,
        x: qx(lon),
        y: qy(lat),
        k: p.scalerank ?? 9,
      });
    }
    const islands = poly
      .slice(1)
      .map((h) => simplifyRing(h, L.tolerance))
      .filter((h) => h && ringArea(h) >= L.minArea)
      .map(encode);
    tpl.lakes.push({
      r: encode(r),
      k: f.properties.scalerank ?? 9,
      ...(islands.length ? { i: islands } : {}),
    });
  }

  // Rivers (lake centre lines are left out: lakes are drawn).
  const rivers = [];
  for (const f of await load(`ne_${L.river}_rivers_lake_centerlines`)) {
    const p = f.properties;
    if (p.featurecla !== "River") continue;
    for (const line of linesOf(f.geometry))
      if (line.length >= 2) rivers.push({ line, key: p.scalerank ?? 9 });
  }
  for (const { line, key } of chain(rivers)) {
    const e = encode(simplify(line, L.tolerance));
    if (e.length >= 4) tpl.rivers.push({ l: e, k: key });
  }

  // Country borders on land; disputed and similar ones are marked.
  const borders = [];
  for (const f of await load(`ne_${L.border}_admin_0_boundary_lines_land`)) {
    const p = f.properties,
      t = /International/i.test(p.FEATURECLA ?? "") ? 0 : 1,
      v = povExceptions(p, true, (cls) => !/Unrecognized|Admin-1/i.test(cls));
    for (const line of linesOf(f.geometry))
      if (line.length >= 2)
        borders.push({ line, key: JSON.stringify({ t, v }) });
  }
  for (const { line, key } of chain(borders)) {
    const { t, v } = JSON.parse(key),
      e = encode(simplify(line, L.tolerance));
    if (e.length >= 4)
      tpl.borders.push({ l: e, ...(t ? { t } : {}), ...(v ? { v } : {}) });
  }

  // Names. Continents.
  for (const c of CONTINENTS)
    tpl.labels.push({
      t: "continent",
      en: c.en,
      ar: c.ar,
      x: qx(c.lon),
      y: qy(c.lat),
      k: 0,
    });
  // Oceans and seas, at the middle of their water.
  for (const f of await load("ne_50m_geography_marine_polys")) {
    const p = f.properties,
      ocean = p.featurecla === "ocean";
    if (!ocean && (p.scalerank ?? 9) > L.seaRank) continue;
    if (!["ocean", "sea", "gulf", "bay"].includes(p.featurecla)) continue;
    const polys = polygonsOf(f.geometry).sort(
        (a, b) => ringArea(b[0]) - ringArea(a[0]),
      ),
      [lon, lat] = poleOf(polys[0], 0.25);
    tpl.labels.push({
      t: ocean ? "ocean" : "sea",
      en: titleCase(p.name_en ?? p.name),
      ar: p.name_ar ?? p.name,
      x: qx(lon),
      y: qy(lat),
      k: p.scalerank ?? 9,
    });
  }
  tpl.labels.push(...lakeNames);
  // Countries (Natural Earth's label points).
  for (const f of await load("ne_50m_admin_0_countries")) {
    const p = f.properties;
    if ((p.MIN_LABEL ?? 99) > L.countryLabel) continue;
    const v = povExceptions(p, true, (cls) =>
      /Admin-0 (country|dependency|sovereignty|Lease)/i.test(cls),
    );
    tpl.labels.push({
      t: "country",
      en: p.NAME_EN ?? p.NAME,
      ar: p.NAME_AR ?? p.NAME,
      x: qx(p.LABEL_X),
      y: qy(p.LABEL_Y),
      k: p.LABELRANK ?? 9,
      // tie-break between names of one rank: Natural Earth's own label zoom
      m: p.MIN_LABEL ?? 9,
      ...(v ? { v } : {}),
    });
  }
  // Capitals.
  for (const f of await load("ne_110m_populated_places")) {
    const p = f.properties,
      capital = (cls) => /Admin-0 capital/i.test(cls),
      byDefault = capital(p.FEATURECLA ?? ""),
      v = povExceptions(p, byDefault, capital);
    if (!byDefault && !v) continue;
    tpl.labels.push({
      t: "capital",
      en: p.NAME_EN ?? p.NAME,
      ar: p.NAME_AR ?? p.NAME,
      x: qx(p.LONGITUDE),
      y: qy(p.LATITUDE),
      k: p.LABELRANK ?? 9,
      ...(byDefault ? {} : { d: 0 }),
      ...(v ? { v } : {}),
    });
  }
  tpl.povs = [...POVS].sort();

  mkdirSync(out, { recursive: true });
  const file = join(out, `earth-${level}.json`),
    json = JSON.stringify(tpl);
  writeFileSync(file, json + "\n");
  const pts = (a) => a.reduce((s, r) => s + r.length / 2, 0);
  console.log(
    `earth-${level}.json  ${(json.length / 1024).toFixed(0)} KB · land ${tpl.land.length} (${pts(tpl.land)} pts) · lakes ${tpl.lakes.length} · rivers ${tpl.rivers.length} · borders ${tpl.borders.length} · names ${tpl.labels.length}`,
  );
}

/** "SOUTHERN OCEAN" → "Southern Ocean" (Natural Earth mixes cases). */
function titleCase(s) {
  return s === s.toUpperCase()
    ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    : s;
}

/** The land outline drawn on the template's card, as SVG path data in a
 * 360 × 180 box (degrees). It ships as code, drawn inline by the dialog. */
async function preview() {
  const d = [];
  for (const f of await load("ne_110m_land"))
    for (const poly of polygonsOf(f.geometry)) {
      const r = simplifyRing(poly[0], 0.5);
      if (!r || ringArea(r) < 4) continue;
      d.push(
        "M" +
          r
            .map(
              ([lon, lat]) =>
                `${(lon + 180).toFixed(1)} ${(90 - lat).toFixed(1)}`,
            )
            .join("L") +
          "Z",
      );
    }
  const file = join(
      root,
      "features",
      "mapmaker",
      "templates",
      "earthPreview.generated.ts",
    ),
    code =
      "// Generated by scripts/build-earth-template.mjs (npm run templates:earth). Do not edit.\n" +
      "/** The land, as SVG path data in a 360 × 180 box (longitude + 180, 90 − latitude). */\n" +
      `export const EARTH_PREVIEW_LAND =\n  ${JSON.stringify(d.join(""))};\n`;
  writeFileSync(file, code);
  console.log(
    `earthPreview.generated.ts  ${(code.length / 1024).toFixed(0)} KB`,
  );
}

for (const level of Object.keys(LEVELS)) await build(level);
await preview();
