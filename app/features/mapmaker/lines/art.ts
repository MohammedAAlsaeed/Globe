/**
 * Built-in line art: original vector pieces for the Line Tool's Stamp
 * Stroke, drawn by code with the same seeded, hand-inked `Pen` as the
 * stamps (../stamps/art), so walls and fences sit naturally beside them.
 *
 * Every piece is drawn lying along +x: it runs from x = 0 to its length and
 * its thickness spans y (the path runs through the middle). The renderer
 * repeats it along the path, stretched end to end, so a piece's two ends
 * must meet the next copy cleanly. Colours follow the stamp roles: `fill`
 * (body), `shade`, `light`, `ink` (outlines) and `solid` (small dark parts),
 * so a person recolours a whole wall with two colours.
 */
import { Pen, type Pt, type VectorArt } from "../stamps/art";

// ---- walls ----------------------------------------------------------------------
/** Dry-stone wall seen from above: a band of irregular stones in two courses. */
export function stoneWall(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 48,
    T = 12;
  const top = p.wobble([0, 0.6], [L, 0.6], 6, 0.5),
    bottom = p.wobble([L, T - 0.6], [0, T - 0.6], 6, 0.5);
  p.shape("fill", [...top, ...bottom]);
  p.shape("shade", [[0, T * 0.55], [L, T * 0.55], ...bottom]);
  // Two courses of stones, the joints staggered.
  for (let row = 0; row < 2; row++) {
    const y0 = row ? T / 2 : 0.8,
      y1 = row ? T - 0.8 : T / 2;
    let x = row ? -p.r(4, 8) : 0;
    while (x < L) {
      const w = p.r(7, 12),
        x0 = Math.max(0, x + 0.6),
        x1 = Math.min(L, x + w - 0.6);
      if (x1 - x0 > 2)
        p.line(
          p.blob(
            (x0 + x1) / 2,
            (y0 + y1) / 2,
            (x1 - x0) / 2,
            (y1 - y0) / 2 - 0.4,
            8,
            0.12,
          ),
          { closed: true, smooth: true, width: p.ink * 0.55 },
        );
      x += w;
    }
  }
  p.line(top, { width: p.ink * 0.9 });
  p.line(bottom, { width: p.ink * 0.9 });
  return p.finish();
}
/** A heavier stone block for the corners and ends of a stone wall. */
export function stoneWallBlock(seed: number): VectorArt {
  const p = new Pen(seed),
    s = 15;
  const pts = p.blob(s / 2, s / 2, s / 2, s / 2, 8, 0.06, Math.PI / 8);
  p.inked("fill", pts, true);
  p.shape(
    "shade",
    [
      [s * 0.15, s * 0.6],
      [s * 0.85, s * 0.6],
      [s * 0.7, s * 0.95],
      [s * 0.3, s * 0.95],
    ],
    true,
  );
  p.line(p.blob(s / 2, s / 2, s * 0.24, s * 0.24, 7, 0.1), {
    closed: true,
    smooth: true,
    width: p.ink * 0.55,
  });
  return p.finish();
}

/** Castle curtain wall from above: a walkway band with crenellations on one side. */
export function castleWall(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 40,
    T = 14,
    wall = 5;
  p.inked("fill", [
    [0, wall],
    [L, wall],
    [L, T],
    [0, T],
  ]);
  p.shape("shade", [
    [0, T - 3.5],
    [L, T - 3.5],
    [L, T],
    [0, T],
  ]);
  // Merlons along the outer (top) side.
  const n = 4,
    mw = L / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * mw + mw * 0.12,
      x1 = x0 + mw * 0.55;
    p.inked("light", [
      [x0, 0],
      [x1, 0],
      [x1, wall],
      [x0, wall],
    ]);
  }
  p.line(
    [
      [0, T - 3.5],
      [L, T - 3.5],
    ],
    { width: p.ink * 0.5 },
  );
  return p.finish();
}
/** A round tower: corners and ends of a castle wall. */
export function castleTower(seed: number): VectorArt {
  const p = new Pen(seed),
    r = 11;
  p.inked("fill", p.blob(r, r, r, r, 18, 0.015), true);
  p.shape(
    "shade",
    p.blob(r + 1.5, r + 1.5, r * 0.62, r * 0.62, 14, 0.02),
    true,
  );
  p.line(p.blob(r, r, r * 0.62, r * 0.62, 16, 0.02), {
    closed: true,
    smooth: true,
    width: p.ink * 0.7,
  });
  // Crenels round the parapet.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.line(
      [
        [r + Math.cos(a) * r * 0.66, r + Math.sin(a) * r * 0.66],
        [r + Math.cos(a) * r * 0.97, r + Math.sin(a) * r * 0.97],
      ],
      { width: p.ink * 0.55 },
    );
  }
  return p.finish();
}

/** Palisade of sharpened logs, seen from above. */
export function palisade(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 30,
    T = 10,
    n = 5,
    r = L / n / 2;
  for (let i = 0; i < n; i++) {
    const cx = r + i * r * 2,
      rr = r * p.r(0.92, 1.04);
    p.inked("fill", p.blob(cx, T / 2, rr, T / 2 - 0.4, 10, 0.05), true);
    p.shape(
      "shade",
      p.blob(cx + rr * 0.25, T / 2 + 1, rr * 0.55, T * 0.25, 8, 0.05),
      true,
    );
    p.dot("solid", cx - rr * 0.1, T / 2 - 0.6, 0.9);
  }
  return p.finish();
}

// ---- fences & roads ---------------------------------------------------------------
/** Post-and-rail fence: one post and two rails; the end piece is a post. */
export function woodenFence(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 36,
    T = 8;
  for (const y of [T * 0.32, T * 0.68])
    p.line(p.wobble([1.5, y], [L, y + p.r(-0.3, 0.3)], 4, 0.25), {
      width: p.ink * 0.85,
    });
  p.inked("fill", [
    [0, 0.5],
    [4, 0.5],
    [4, T - 0.5],
    [0, T - 0.5],
  ]);
  p.shape("shade", [
    [2.2, 0.5],
    [4, 0.5],
    [4, T - 0.5],
    [2.2, T - 0.5],
  ]);
  // Keeps the piece's box the full length, so copies meet end to end.
  p.line(
    [
      [L - 0.01, T * 0.32],
      [L, T * 0.32],
    ],
    { width: 0.01 },
  );
  return p.finish();
}
export function fencePost(seed: number): VectorArt {
  const p = new Pen(seed),
    T = 8;
  p.inked("fill", [
    [0, 0.5],
    [4, 0.5],
    [4, T - 0.5],
    [0, T - 0.5],
  ]);
  p.shape("shade", [
    [2.2, 0.5],
    [4, 0.5],
    [4, T - 0.5],
    [2.2, T - 0.5],
  ]);
  return p.finish();
}

/** Railway: two rails on wooden sleepers. */
export function railway(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 30,
    T = 14;
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 10 + p.r(-0.4, 0.4);
    p.inked(
      "fill",
      [
        [x, 0.4],
        [x + 5, 0.4],
        [x + 5, T - 0.4],
        [x, T - 0.4],
      ],
      false,
      p.ink * 0.6,
    );
  }
  for (const y of [T * 0.3, T * 0.7])
    p.line(
      [
        [0, y],
        [L, y],
      ],
      { width: p.ink * 1.1 },
    );
  return p.finish();
}

/** Footprints: a trail of steps, left and right. */
export function footprints(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 24,
    T = 10;
  const foot = (cx: number, cy: number, flip: number) => {
    p.shape("solid", p.blob(cx, cy, 3.2, 1.5, 10, 0.06), true);
    p.dot("solid", cx + 3.6, cy + 0.2 * flip, 0.8);
  };
  foot(5, T * 0.27, -1);
  foot(17, T * 0.73, 1);
  p.line(
    [
      [0, T / 2],
      [0.01, T / 2],
    ],
    { width: 0.01 },
  );
  p.line(
    [
      [L - 0.01, T / 2],
      [L, T / 2],
    ],
    { width: 0.01 },
  );
  return p.finish();
}

/** Chevrons pointing along the path (routes, marches, currents). */
export function chevrons(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 16,
    T = 10;
  p.line(
    [
      [4, 1],
      [11, T / 2],
      [4, T - 1],
    ],
    { width: p.ink * 1.3 },
  );
  p.line(
    [
      [0, T / 2],
      [0.01, T / 2],
    ],
    { width: 0.01 },
  );
  p.line(
    [
      [L - 0.01, T / 2],
      [L, T / 2],
    ],
    { width: 0.01 },
  );
  return p.finish();
}

// ---- nature --------------------------------------------------------------------
/** A hedgerow: a band of bushy clumps. */
export function hedge(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 40,
    T = 14,
    n = 5;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * (L / n) + p.r(-1, 1),
      rx = (L / n) * p.r(0.62, 0.75),
      ry = T / 2 - p.r(0.3, 1.4);
    const pts = p.blob(cx, T / 2, rx, ry, 11, 0.12);
    p.shape("fill", pts, true);
    p.shape(
      "shade",
      p.blob(cx + rx * 0.25, T / 2 + ry * 0.3, rx * 0.6, ry * 0.45, 9, 0.12),
      true,
    );
    p.line(
      pts.filter(([, y]) => y < T / 2 + ry * 0.4),
      { smooth: true, width: p.ink * 0.7 },
    );
  }
  p.line(
    [
      [0, T / 2],
      [0.01, T / 2],
    ],
    { width: 0.01 },
  );
  p.line(
    [
      [L - 0.01, T / 2],
      [L, T / 2],
    ],
    { width: 0.01 },
  );
  return p.finish();
}

/** Cliff edge: the brink inked on one side, the drop hatched on the other. */
export function cliff(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 50,
    T = 18,
    edge = p.wobble([0, 3], [L, 3], 10, 1.1);
  const foot: Pt[] = [];
  for (let i = 0; i <= 10; i++) foot.push([(i / 10) * L, T - p.r(0.5, 4)]);
  p.shape("fill", [...edge, ...foot.slice().reverse()]);
  p.shape("shade", [
    ...edge.map(([x, y]) => [x, y + 3] as Pt),
    ...foot.slice().reverse(),
  ]);
  // Hatching down the slope, long and short alternating.
  for (let i = 0; i < 12; i++) {
    const x = 1 + i * (L / 12) + p.r(-0.5, 0.5),
      y0 = 3.5 + p.r(0, 1),
      len = (i % 2 ? 0.5 : 0.9) * (T - 5);
    p.line(
      [
        [x, y0],
        [x + p.r(-0.6, 0.6), y0 + len],
      ],
      { width: p.ink * 0.6 },
    );
  }
  p.line(edge, { width: p.ink * 1.1 });
  return p.finish();
}

/** A mountain ridge: small peaks in a row, standing on the line. */
export function ridge(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 60,
    T = 26,
    peaks = 2 + Math.floor(p.r(0, 2)),
    w = L / peaks;
  for (let i = 0; i < peaks; i++) {
    const x0 = i * w - w * 0.15,
      x1 = (i + 1) * w + w * 0.15,
      h = T * p.r(0.7, 1),
      px = x0 + (x1 - x0) * p.r(0.42, 0.58),
      left = p.wobble([Math.max(0, x0), T], [px, T - h], 4, 1.4),
      right = p.wobble([px, T - h], [Math.min(L, x1), T], 4, 1.4),
      crease = p.wobble([px, T - h], [px + w * 0.12, T], 3, 1);
    p.shape("fill", [...left, ...right.slice(1)]);
    p.shape("shade", [...right, ...crease.slice().reverse()]);
    p.line([...left, ...right.slice(1)]);
    p.line(crease.slice(0, -1), { width: p.ink * 0.7 });
  }
  return p.finish();
}

/** Surf: a line of breaking wave crests (coasts, currents). */
export function waveLine(seed: number): VectorArt {
  const p = new Pen(seed),
    L = 28,
    T = 8;
  p.line(
    [
      [0, T * 0.7],
      [5, T * 0.2],
      [10, T * 0.15],
      [13, T * 0.55],
      [11, T * 0.75],
      [9.5, T * 0.5],
    ],
    { smooth: true, width: p.ink * 0.9 },
  );
  p.line(
    [
      [13, T * 0.55],
      [20, T * 0.8],
      [L, T * 0.7],
    ],
    { smooth: true, width: p.ink * 0.7 },
  );
  return p.finish();
}
