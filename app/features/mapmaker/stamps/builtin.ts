/**
 * The built-in "Atelier" stamp pack: original art drawn by code.
 *
 * Each set is one kind of thing (mountains, pines, ships…) with several
 * variants; a variant is just a seed for the set's drawing function, so
 * every mountain is different but they all share one hand. Art is authored
 * with the light coming from the upper left (shade on the right).
 *
 * Plus the "Classic" pack: the original line-art map symbols, one variant
 * each, which older maps' icons are converted to (see ./migrate).
 */
import { ICONS, ICON_IDS, type IconId } from "../../studio/domain/icons";
import { Pen, type Pt, type VectorArt } from "./art";
import type { StampCategory } from "./catalog";

// ---- terrain ------------------------------------------------------------------
function mountain(seed: number, opts: { snow?: boolean } = {}): VectorArt {
  const p = new Pen(seed),
    w = p.r(88, 112),
    h = opts.snow ? p.r(80, 100) : p.r(58, 80),
    px = w * p.r(0.4, 0.58);
  const left = p.wobble([0, h], [px, 0], 6, 2.6),
    right = p.wobble([px, 0], [w, h], 6, 2.6),
    outline = [...left, ...right.slice(1)];
  // The crease runs from the peak down the middle; right of it is in shade.
  const creaseBase: Pt = [px + w * p.r(0.04, 0.14), h],
    crease = p.wobble([px, 0], creaseBase, 5, 2.2);
  p.shape("fill", outline);
  p.shape("shade", [...right, ...crease.slice().reverse()]);
  if (opts.snow) {
    const cut = p.r(0.28, 0.38),
      li = Math.round(left.length * (1 - cut)),
      ri = Math.round(right.length * cut),
      a = left[li],
      b = right[ri],
      teeth: Pt[] = [];
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      teeth.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + (i % 2 ? h * 0.07 : -h * 0.02)]);
    }
    const cap = [...left.slice(li), ...right.slice(1, ri + 1), ...teeth.reverse()];
    p.shape("light", cap);
    p.line([a, ...teeth.slice().reverse(), b], { width: p.ink * 0.6 });
  }
  p.line(outline);
  p.line(crease.slice(0, -1), { width: p.ink * 0.8 });
  // Hatching on the shaded side, following the slope.
  const hatches = 3 + Math.floor(p.r(0, 3));
  for (let i = 1; i <= hatches; i++) {
    const t = 0.25 + (i / (hatches + 1)) * 0.6,
      c = crease[Math.min(crease.length - 1, Math.round(t * (crease.length - 1)))],
      r = right[Math.min(right.length - 1, Math.round(t * (right.length - 1)))],
      k = p.r(0.45, 0.75);
    p.line([c, [c[0] + (r[0] - c[0]) * k, c[1] + (r[1] - c[1]) * k + 2]], { width: p.ink * 0.55 });
  }
  return p.finish();
}

function hill(seed: number): VectorArt {
  const p = new Pen(seed),
    w = p.r(70, 95),
    h = p.r(24, 36),
    top = w * p.r(0.4, 0.55),
    dome: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10,
      x = t * w,
      k = x < top ? x / top : (w - x) / (w - top);
    dome.push([x, h - Math.sin((k * Math.PI) / 2) * h + (i && i < 10 ? p.r(-1, 1) : 0)]);
  }
  p.shape("fill", dome, true);
  const shade = dome.filter((pt) => pt[0] >= top);
  p.shape("shade", [...shade, [top + (w - top) * 0.25, h]], true);
  p.line(dome, { smooth: true });
  for (let i = 0; i < 3; i++) {
    const x = top + (w - top) * (0.3 + i * 0.18);
    p.line([[x, h * (0.45 + i * 0.12)], [x + 4, h * (0.6 + i * 0.12)]], { width: p.ink * 0.55 });
  }
  return p.finish();
}

function volcano(seed: number): VectorArt {
  const p = new Pen(seed),
    w = p.r(90, 110),
    h = p.r(60, 75),
    lip = w * p.r(0.1, 0.14),
    cx = w * p.r(0.46, 0.54),
    left = p.wobble([0, h], [cx - lip, 0], 5, 2.4),
    right = p.wobble([cx + lip, 0], [w, h], 5, 2.4);
  p.shape("fill", [...left, ...right]);
  p.shape("shade", [...right, [cx + w * 0.06, h], [cx + lip * 0.4, 0]]);
  p.line([...left, ...right]);
  p.shape("solid", p.blob(cx, 0, lip * 0.95, 2.6, 10, 0.05), true);
  // Lava runs and a column of smoke.
  for (const dx of [-0.35, 0.3]) p.line(p.wobble([cx + lip * dx, 2], [cx + lip * dx * 3.4, h * 0.45], 4, 1.4), { width: p.ink * 0.7 });
  let y = -6;
  for (let i = 0; i < 3; i++) {
    const r = 6 + i * 2.5;
    const puff = p.blob(cx + p.r(-4, 4) + i * 3, y - r, r, r * 0.8, 9, 0.12);
    p.inked("light", puff, true, p.ink * 0.7);
    y -= r * 1.4;
  }
  return p.finish();
}

function rock(seed: number): VectorArt {
  const p = new Pen(seed),
    rx = p.r(14, 22),
    ry = rx * p.r(0.55, 0.8),
    pts = p.blob(0, 0, rx, ry, 7, 0.22, p.r(0, 1));
  p.shape("fill", pts);
  const shade = pts.filter(([x, y]) => x + y * 0.6 > rx * 0.05);
  if (shade.length >= 2) p.shape("shade", [...shade, [rx * 0.1, -ry * 0.1]]);
  p.line(pts, { closed: true });
  p.line(p.wobble([-rx * 0.2, -ry * 0.5], [rx * 0.15, ry * 0.3], 3, 1.2), { width: p.ink * 0.6 });
  return p.finish();
}

function dune(seed: number): VectorArt {
  const p = new Pen(seed),
    w = p.r(80, 110),
    h = p.r(18, 28),
    crestX = w * p.r(0.55, 0.7),
    back = p.wobble([0, h], [crestX, 0], 5, 1.2),
    face = p.wobble([crestX, 0], [w, h], 3, 0.8);
  p.shape("fill", [...back, ...face.slice(1)], true);
  p.shape("shade", [...face, [crestX - w * 0.04, h]], true);
  p.line(back, { smooth: true });
  p.line(face, { smooth: true, width: p.ink * 0.7 });
  for (let i = 0; i < 3; i++) {
    const x = w * (0.12 + i * 0.14);
    p.line([[x, h * 0.75], [x + 9, h * 0.6], [x + 16, h * 0.68]], { width: p.ink * 0.5, smooth: true });
  }
  return p.finish();
}

// ---- vegetation -----------------------------------------------------------------
/** A crescent of shade on the lower right of a round shape. */
function shadeCrescent(p: Pen, cx: number, cy: number, rx: number, ry: number) {
  const outer: Pt[] = [],
    inner: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = -0.35 * Math.PI + (i / 8) * 1.25 * Math.PI;
    outer.push([cx + Math.cos(a) * rx * 0.98, cy + Math.sin(a) * ry * 0.98]);
    inner.push([cx - rx * 0.22 + Math.cos(a) * rx * 0.72, cy - ry * 0.25 + Math.sin(a) * ry * 0.75]);
  }
  p.shape("shade", [...outer, ...inner.reverse()], true);
}

function tree(seed: number): VectorArt {
  const p = new Pen(seed),
    h = p.r(46, 56),
    rx = p.r(15, 19),
    ry = rx * p.r(0.95, 1.15),
    cy = ry + 1;
  p.shape("solid", [[-1.6, h], [-1, cy], [1, cy], [1.8, h]]);
  const canopy = p.blob(0, cy, rx, ry, 9, 0.1, p.r(0, 1));
  p.shape("fill", canopy, true);
  shadeCrescent(p, 0, cy, rx, ry);
  p.line(canopy, { closed: true, smooth: true });
  for (let i = 0; i < 2; i++) {
    const x = p.r(-rx * 0.5, rx * 0.2),
      y = cy + p.r(-ry * 0.4, ry * 0.2);
    p.line([[x, y], [x + 3, y - 2], [x + 6, y]], { width: p.ink * 0.55, smooth: true });
  }
  p.line([[-5, h], [6, h]], { width: p.ink * 0.6 });
  return p.finish();
}

function pine(seed: number): VectorArt {
  const p = new Pen(seed),
    tiers = 3 + Math.floor(p.r(0, 2)),
    h = p.r(50, 64),
    trunk = h * 0.12,
    body = h - trunk,
    halfBase = p.r(11, 14);
  p.shape("solid", [[-1.4, h], [-1.1, body - 2], [1.1, body - 2], [1.4, h]]);
  // Bottom tier first, so each higher tier overlaps the one below.
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers,
      baseY = body - t * body * 0.62,
      apexY = baseY - body * p.r(0.42, 0.5),
      half = halfBase * (1 - t * 0.55),
      teeth: Pt[] = [];
    for (let k = 0; k <= 4; k++) teeth.push([half - (2 * half * k) / 4, baseY + (k % 2 ? -2 : p.r(0, 1.5))]);
    const tier: Pt[] = [[0, apexY], ...teeth];
    p.shape("fill", tier);
    p.shape("shade", [[0, apexY], teeth[0], teeth[1], teeth[2]]);
    p.line(tier, { closed: true });
  }
  return p.finish();
}

function palm(seed: number): VectorArt {
  const p = new Pen(seed),
    h = p.r(50, 60),
    lean = p.r(-8, 8),
    crown: Pt = [lean, 8];
  const spine: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    spine.push([lean * (1 - t) ** 2 + Math.sin(t * 2) * 1.5, 8 + t * (h - 8)]);
  }
  const trunk = [...spine.map(([x, y], i): Pt => [x - 1.2 - i * 0.12, y]), ...spine.map(([x, y], i): Pt => [x + 1.2 + i * 0.12, y]).reverse()];
  p.inked("shade", trunk, false, p.ink * 0.7);
  for (let i = 1; i < 6; i++) p.line([[spine[i][0] - 1.5, spine[i][1]], [spine[i][0] + 1.5, spine[i][1] - 1]], { width: p.ink * 0.45 });
  const fronds = 5 + Math.floor(p.r(0, 2));
  for (let i = 0; i < fronds; i++) {
    const a = Math.PI + (i / (fronds - 1)) * Math.PI + p.r(-0.15, 0.15),
      len = p.r(16, 22),
      tip: Pt = [crown[0] + Math.cos(a) * len, crown[1] + Math.sin(a) * len * 0.55 + len * 0.35],
      mid: Pt = [(crown[0] + tip[0]) / 2, (crown[1] + tip[1]) / 2 - len * 0.18],
      nx = -(tip[1] - crown[1]) / len,
      ny = (tip[0] - crown[0]) / len;
    const leaf: Pt[] = [crown, [mid[0] + nx * 3.5, mid[1] + ny * 3.5], tip, [mid[0] - nx * 3.5, mid[1] - ny * 3.5]];
    p.inked("fill", leaf, true, p.ink * 0.7);
  }
  return p.finish();
}

function bush(seed: number): VectorArt {
  const p = new Pen(seed),
    rx = p.r(12, 17),
    ry = rx * p.r(0.6, 0.75),
    pts = p.blob(0, 0, rx, ry, 11, 0.13, p.r(0, 1)).map(([x, y]): Pt => [x, Math.min(y, ry * 0.75)]);
  p.shape("fill", pts, true);
  shadeCrescent(p, 0, 0, rx, ry * 0.85);
  p.line(pts, { closed: true, smooth: true });
  return p.finish();
}

function grass(seed: number): VectorArt {
  const p = new Pen(seed),
    blades = 4 + Math.floor(p.r(0, 3));
  for (let i = 0; i < blades; i++) {
    const x = (i - blades / 2) * 2.4 + p.r(-0.8, 0.8),
      hgt = p.r(7, 12),
      bend = p.r(-4, 4);
    p.line([[x, 12], [x + bend * 0.3, 12 - hgt * 0.6], [x + bend, 12 - hgt]], { smooth: true, width: p.ink * 0.7 });
  }
  return p.finish();
}

// ---- settlements -------------------------------------------------------------------
function houseAt(p: Pen, x0: number, base: number, scale = 1) {
  const w = p.r(14, 19) * scale,
    wall = p.r(9, 12) * scale,
    roof = p.r(7, 10) * scale,
    over = 2 * scale,
    top = base - wall;
  const walls: Pt[] = [[x0, base], [x0, top], [x0 + w, top], [x0 + w, base]];
  p.inked("fill", walls);
  p.shape("shade", [[x0 + w * 0.72, base], [x0 + w * 0.72, top], [x0 + w, top], [x0 + w, base]]);
  const ridgeX = x0 + w * p.r(0.4, 0.6);
  const roofPts: Pt[] = [[x0 - over, top + 0.5], [ridgeX, top - roof], [x0 + w + over, top + 0.5]];
  p.inked("shade", roofPts);
  if (p.rand() < 0.5) p.inked("shade", [[x0 + w * 0.68, top - roof * 0.45], [x0 + w * 0.68, top - roof * 0.95], [x0 + w * 0.8, top - roof * 0.95], [x0 + w * 0.8, top - roof * 0.2]], false, p.ink * 0.6);
  const door = w * 0.18;
  p.shape("solid", [[x0 + w * 0.3, base], [x0 + w * 0.3, base - wall * 0.5], [x0 + w * 0.3 + door, base - wall * 0.5], [x0 + w * 0.3 + door, base]]);
  p.shape("solid", [[x0 + w * 0.62, top + wall * 0.25], [x0 + w * 0.62, top + wall * 0.5], [x0 + w * 0.78, top + wall * 0.5], [x0 + w * 0.78, top + wall * 0.25]]);
  return w;
}
function house(seed: number): VectorArt {
  const p = new Pen(seed);
  houseAt(p, 0, 20);
  return p.finish();
}
function village(seed: number): VectorArt {
  const p = new Pen(seed);
  // Back row first, then the front row overlapping it.
  houseAt(p, 6, 14, 0.8);
  houseAt(p, 22, 12, 0.75);
  houseAt(p, 0, 26);
  houseAt(p, 19 + p.r(0, 4), 28, 0.9);
  return p.finish();
}

function crenels(p: Pen, x0: number, x1: number, y: number, size: number): Pt[] {
  const n = Math.max(3, Math.round((x1 - x0) / (size * 2))),
    step = (x1 - x0) / (n * 2 - 1),
    out: Pt[] = [];
  for (let i = 0; i < n * 2 - 1; i++) {
    const xa = x0 + i * step,
      yy = i % 2 ? y : y - size;
    out.push([xa, yy], [xa + step, yy]);
  }
  return out;
}
function towerAt(p: Pen, x0: number, base: number, w: number, hgt: number, roof: boolean) {
  const top = base - hgt;
  const body: Pt[] = roof
    ? [[x0, base], [x0, top], [x0 + w, top], [x0 + w, base]]
    : [[x0, base], ...crenels(p, x0, x0 + w, top, w * 0.14), [x0 + w, base]];
  p.inked("fill", body);
  p.shape("shade", [[x0 + w * 0.68, base], [x0 + w * 0.68, top], [x0 + w, top], [x0 + w, base]]);
  if (roof) p.inked("shade", [[x0 - 1.5, top + 0.5], [x0 + w / 2, top - w * p.r(0.9, 1.3)], [x0 + w + 1.5, top + 0.5]]);
  p.shape("solid", [[x0 + w * 0.4, top + hgt * 0.2], [x0 + w * 0.4, top + hgt * 0.32], [x0 + w * 0.56, top + hgt * 0.32], [x0 + w * 0.56, top + hgt * 0.2]]);
}
function castle(seed: number): VectorArt {
  const p = new Pen(seed),
    base = 40,
    wallW = p.r(30, 38),
    tw = p.r(9, 11),
    roofs = p.rand() < 0.5;
  // Curtain wall, the keep behind it, then the two flanking towers.
  towerAt(p, tw * 0.5 + wallW * 0.3, base - 8, wallW * 0.4, p.r(26, 32), roofs);
  const wallTop = base - p.r(13, 16);
  p.inked("fill", [[tw * 0.5, base], ...crenels(p, tw * 0.5, tw * 0.5 + wallW, wallTop, 2.2), [tw * 0.5 + wallW, base]]);
  const gate = wallW * 0.18,
    gx = tw * 0.5 + wallW / 2 - gate / 2;
  p.shape("solid", [[gx, base], [gx, base - 6], [gx + gate / 2, base - 8.5], [gx + gate, base - 6], [gx + gate, base]], true);
  towerAt(p, 0, base, tw, p.r(22, 27), roofs);
  towerAt(p, wallW - tw * 0.5 + tw * 0.5, base, tw, p.r(22, 27), roofs);
  const fx = tw * 0.5 + wallW * 0.5,
    fy = base - 8 - 30 - 8;
  p.line([[fx, fy + 10], [fx, fy]], { width: p.ink * 0.7 });
  p.shape("solid", [[fx, fy], [fx + 6, fy + 1.8], [fx, fy + 3.6]]);
  return p.finish();
}
function tower(seed: number): VectorArt {
  const p = new Pen(seed);
  towerAt(p, 0, 40, p.r(9, 12), p.r(26, 34), p.rand() < 0.6);
  return p.finish();
}
function mosque(seed: number): VectorArt {
  const p = new Pen(seed),
    base = 40,
    w = p.r(26, 32),
    hall = p.r(10, 13),
    top = base - hall;
  // Minaret behind, then the hall and its dome.
  const mx = w + p.r(2, 4),
    mw = 4.2,
    mh = p.r(34, 40);
  p.inked("fill", [[mx, base], [mx, base - mh], [mx + mw, base - mh], [mx + mw, base]]);
  p.shape("shade", [[mx + mw * 0.6, base], [mx + mw * 0.6, base - mh], [mx + mw, base - mh], [mx + mw, base]]);
  p.inked("fill", [[mx - 1, base - mh * 0.7], [mx + mw + 1, base - mh * 0.7], [mx + mw + 1, base - mh * 0.66], [mx - 1, base - mh * 0.66]], false, p.ink * 0.6);
  p.inked("light", [[mx - 0.6, base - mh], [mx + mw / 2, base - mh - 6], [mx + mw + 0.6, base - mh]], true, p.ink * 0.7);
  p.inked("fill", [[0, base], [0, top], [w, top], [w, base]]);
  p.shape("shade", [[w * 0.72, base], [w * 0.72, top], [w, top], [w, base]]);
  const dome: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    dome.push([w / 2 + Math.cos(a) * w * 0.32, top + Math.sin(a) * w * 0.36]);
  }
  dome[5] = [w / 2, top - w * 0.46]; // an onion-dome point
  p.inked("light", dome, true);
  p.line([[w / 2, top - w * 0.42], [w / 2, top - w * 0.42 - 5]], { width: p.ink * 0.7 });
  for (const k of [0.2, 0.42, 0.64]) {
    const x = w * k;
    p.shape("solid", [[x, base - 1.5], [x, base - hall * 0.6], [x + 1.6, base - hall * 0.72], [x + 3.2, base - hall * 0.6], [x + 3.2, base - 1.5]], true);
  }
  return p.finish();
}
function tent(seed: number): VectorArt {
  const p = new Pen(seed),
    w = p.r(18, 24),
    h = p.r(13, 17),
    apex: Pt = [w * p.r(0.45, 0.55), 0];
  p.inked("fill", [[0, h], apex, [w, h]]);
  p.shape("shade", [apex, [w, h], [apex[0] + w * 0.08, h]]);
  p.shape("solid", [[apex[0] - w * 0.12, h], [apex[0], h * 0.4], [apex[0] + w * 0.12, h]]);
  p.line([apex, [apex[0], -4]], { width: p.ink * 0.7 });
  return p.finish();
}

// ---- water -------------------------------------------------------------------------
function ship(seed: number): VectorArt {
  const p = new Pen(seed),
    w = p.r(40, 50),
    deck = 26,
    hullH = p.r(6, 8),
    masts = 1 + Math.floor(p.r(0, 2.5));
  for (let m = 0; m < masts; m++) {
    const mx = w * (masts === 1 ? 0.5 : 0.3 + (m / (masts - 1)) * 0.4),
      mh = p.r(20, 25) * (m === Math.floor(masts / 2) ? 1 : 0.85),
      sw = w * (masts === 1 ? 0.34 : 0.22);
    p.line([[mx, deck], [mx, deck - mh - 3]], { width: p.ink * 0.8 });
    // A square sail, bellied by the wind (its sides bow outward).
    const top = deck - mh,
      foot = deck - mh * 0.35,
      bow = sw * 0.12;
    const sail: Pt[] = [
      [mx - sw / 2, top],
      [mx + sw / 2, top],
      [mx + sw / 2 + bow, (top + foot) / 2],
      [mx + sw / 2 + 1.5, foot],
      [mx, foot + bow],
      [mx - sw / 2 + 1.5, foot],
      [mx - sw / 2 - bow * 0.6, (top + foot) / 2],
    ];
    p.inked("light", sail, false, p.ink * 0.7);
    p.shape("solid", [[mx, deck - mh - 3], [mx + 5, deck - mh - 2], [mx, deck - mh - 1]]);
  }
  const hull: Pt[] = [[0, deck], [w, deck], [w * 0.88, deck + hullH], [w * 0.12, deck + hullH]];
  p.inked("shade", hull);
  p.line([[w * 0.1, deck + hullH * 0.45], [w * 0.9, deck + hullH * 0.45]], { width: p.ink * 0.5 });
  return p.finish();
}
function boat(seed: number): VectorArt {
  const p = new Pen(seed),
    w = p.r(18, 24);
  p.line([[w * 0.45, 12], [w * 0.45, -4]], { width: p.ink * 0.7 });
  p.inked("light", [[w * 0.45, -4], [w * 0.45, 10], [w * 0.45 + p.r(8, 11), 10]]);
  p.inked("shade", [[0, 12], [w, 12], [w * 0.82, 16], [w * 0.15, 16]]);
  return p.finish();
}
function waves(seed: number): VectorArt {
  const p = new Pen(seed),
    n = 2 + Math.floor(p.r(0, 2));
  for (let i = 0; i < n; i++) {
    const x = i * p.r(9, 12),
      y = (i % 2) * 5;
    p.line([[x, y + 4], [x + 3, y], [x + 7, y + 1], [x + 8, y + 4], [x + 6, y + 5], [x + 5, y + 3]], { smooth: true, width: p.ink * 0.8 });
    p.line([[x + 8, y + 4], [x + 12, y + 5]], { width: p.ink * 0.6 });
  }
  return p.finish();
}
function whirlpool(seed: number): VectorArt {
  const p = new Pen(seed),
    pts: Pt[] = [],
    turns = p.r(2.2, 3);
  for (let i = 0; i <= 60; i++) {
    const t = i / 60,
      a = t * turns * Math.PI * 2,
      r = 2 + t * 16;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.6]);
  }
  p.line(pts, { smooth: true });
  return p.finish();
}

// ---- registry ---------------------------------------------------------------------------
export interface BuiltinSet {
  id: string;
  pack: "atelier" | "classic" | "lines";
  category: StampCategory;
  labelKey: string;
  tags: string[];
  /** Variant count; each variant's art is `draw(variant)`. */
  variants: number;
  draw: (variant: number) => VectorArt;
  ink: string;
  fill: string | null;
  /** Default size, fraction of the map width. */
  size: number;
  /** Ground shadow the set uses by default (shadow mode "default"). */
  shadow: boolean;
  /** Placement defaults: random rotation (degrees either way), flips. */
  rotationJitter: number;
  randomFlip: boolean;
  /** Side-view art stands on its base; top-down art turns about its center. */
  pivot: "base" | "center";
}
const INK = "#3a2e22";
const seedOf = (id: string, v: number) => {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h ^ (v * 2654435761)) >>> 0;
};
const set = (
  id: string,
  category: StampCategory,
  variants: number,
  draw: (seed: number) => VectorArt,
  look: Partial<Omit<BuiltinSet, "id" | "category" | "variants" | "draw">>,
): BuiltinSet => ({
  id,
  pack: "atelier",
  category,
  labelKey: `stamp_${id}`,
  tags: [],
  variants,
  draw: (v) => draw(seedOf(id, v)),
  ink: INK,
  fill: "#e6d8b8",
  size: 0.04,
  shadow: true,
  rotationJitter: 0,
  randomFlip: true,
  pivot: "base",
  ...look,
});

export const BUILTIN_SETS: BuiltinSet[] = [
  set("mountain", "terrain", 6, (s) => mountain(s), { size: 0.07, tags: ["peak", "range"] }),
  set("snowMountain", "terrain", 4, (s) => mountain(s, { snow: true }), { size: 0.075, fill: "#d9cdb2", tags: ["peak", "snow", "alpine"] }),
  set("hill", "terrain", 4, hill, { size: 0.06, fill: "#c9c48f", tags: ["mound"] }),
  set("volcano", "terrain", 3, volcano, { size: 0.075, fill: "#b9a58c", tags: ["lava", "fire"] }),
  set("rock", "terrain", 5, rock, { size: 0.02, fill: "#aaa08e", rotationJitter: 180, pivot: "center", tags: ["stone", "boulder"] }),
  set("dune", "terrain", 3, dune, { size: 0.06, fill: "#dcc189", shadow: false, tags: ["desert", "sand"] }),
  set("tree", "vegetation", 6, tree, { size: 0.026, ink: "#26301c", fill: "#71904a", tags: ["forest", "oak", "wood"] }),
  set("pine", "vegetation", 6, pine, { size: 0.026, ink: "#1f2a1c", fill: "#4c6b3e", tags: ["forest", "conifer", "fir"] }),
  set("palm", "vegetation", 4, palm, { size: 0.03, ink: "#2c2a1a", fill: "#7d9c46", tags: ["tropical", "oasis", "date"] }),
  set("bush", "vegetation", 4, bush, { size: 0.014, ink: "#26301c", fill: "#6f8c48", tags: ["shrub"] }),
  set("grass", "vegetation", 4, grass, { size: 0.008, ink: "#4a5a2c", fill: null, shadow: false, tags: ["tuft", "meadow"] }),
  set("house", "settlements", 6, house, { size: 0.02, fill: "#dcc6a0", tags: ["home", "hut", "building"] }),
  set("village", "settlements", 3, village, { size: 0.045, fill: "#dcc6a0", tags: ["hamlet", "town", "buildings"] }),
  set("castle", "settlements", 3, castle, { size: 0.055, fill: "#d3c4a6", randomFlip: false, tags: ["fort", "fortress", "keep", "capital"] }),
  set("tower", "settlements", 3, tower, { size: 0.024, fill: "#d3c4a6", tags: ["watchtower", "keep"] }),
  set("mosque", "settlements", 3, mosque, { size: 0.05, fill: "#e4d6b6", tags: ["dome", "minaret", "temple"] }),
  set("tent", "settlements", 3, tent, { size: 0.02, fill: "#d8c08e", tags: ["camp", "nomad"] }),
  set("ship", "water", 3, ship, { size: 0.045, ink: "#2c2418", fill: "#efe6cf", tags: ["sail", "galleon", "boat"] }),
  set("boat", "water", 3, boat, { size: 0.022, ink: "#2c2418", fill: "#efe6cf", tags: ["dhow", "sail"] }),
  set("waves", "water", 4, waves, { size: 0.03, ink: "#d6e4ea", fill: null, shadow: false, pivot: "center", tags: ["sea", "ocean"] }),
  set("whirlpool", "water", 2, whirlpool, { size: 0.035, ink: "#d6e4ea", fill: null, shadow: false, rotationJitter: 180, pivot: "center", tags: ["vortex", "maelstrom"] }),
];

/** The original line-art symbols as one-variant sets ("classic/<icon>"). */
export const CLASSIC_SETS: BuiltinSet[] = ICON_IDS.map((icon: IconId) => ({
  id: `classic-${icon}`,
  pack: "classic",
  category: "symbols",
  labelKey: ICONS[icon].labelKey,
  tags: [icon],
  variants: 1,
  draw: () => classicArt(icon),
  ink: INK,
  fill: null,
  size: 0.05,
  shadow: false,
  rotationJitter: 0,
  randomFlip: false,
  pivot: "center",
}));

/** A classic symbol: its 24×24 line art, unchanged. */
function classicArt(icon: IconId): VectorArt {
  const def = ICONS[icon];
  return {
    w: 24,
    h: 24,
    parts: [
      ...(def.stroke ? [{ role: "ink" as const, d: def.stroke, width: 1.6 }] : []),
      ...(def.fill ? [{ role: "solid" as const, d: def.fill }] : []),
    ],
  };
}
