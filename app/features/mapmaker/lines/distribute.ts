/**
 * Stamp Stroke layout: where each piece of a wall, fence or row of trees
 * goes along a line.
 *
 * Pieces are placed by *distance travelled along the path* (arc length),
 * never by pointer samples, so spacing stays even on long roads, tight
 * curves and at any zoom. Each piece spans a stretch [d, d + length] of the
 * path; it is drawn on the *chord* between those two points — centred on
 * it, turned along it, and stretched to its exact length — so neighbouring
 * pieces always meet end to end, even round bends.
 *
 *   corners "continuous"  one run of pieces along the whole line
 *   corners "split"       a new run between each sharp corner, each run
 *                         fitted to its own length, with an optional corner
 *                         piece (a post, a tower) on each corner
 *   fit                   adjusts each run's spacing a little so a whole
 *                         number of pieces fills it (no half piece left)
 *
 * Pure math, unit-tested (tests/lines.test.mjs).
 */
import { mulberry32 } from "../brush/noise";
import { angleAt, pointAt, type Polyline } from "./geometry";

export type PieceRole = "seg" | "start" | "end" | "corner";
export interface Placement {
  role: PieceRole;
  /** Which variant of the role's art (index into its list). */
  variant: number;
  /** Centre of the piece, pixels. */
  x: number;
  y: number;
  /** Rotation, radians. */
  angle: number;
  /** Drawn length and thickness, pixels. */
  len: number;
  thick: number;
  flip: boolean;
}

export interface LayoutOptions {
  /** A piece's own length and thickness at this zoom, pixels. */
  pieceLen: number;
  thick: number;
  /** Gap between pieces, as a fraction of the piece length (<0 overlaps). */
  spacing: number;
  fit: boolean;
  corners: "continuous" | "split";
  /** Point indices (into poly) of the sharp corner nodes. */
  cornerAt: number[];
  /** Cap and corner piece lengths (0 = none). */
  startLen: number;
  endLen: number;
  cornerLen: number;
  /** Turn pieces with the path (else they keep `rotation`). */
  followPath: boolean;
  /** Extra rotation, radians. */
  rotation: number;
  /** Shift sideways, in thicknesses (+ = right of the travel direction). */
  offset: number;
  flip: boolean;
  /** Random size / rotation variation, 0..1, and how many segment variants. */
  scaleJitter: number;
  rotationJitter: number;
  variants: number;
  /** Side-view art (trees, ridges) stands on the line instead of straddling it. */
  anchor: "center" | "base";
  seed: number;
  /** Hard cap on pieces (protects the editor from absurd settings). */
  max: number;
}

/** Lays out every piece of a Stamp Stroke along a flattened line. */
export function layoutPieces(poly: Polyline, o: LayoutOptions): Placement[] {
  const out: Placement[] = [],
    L = poly.length;
  if (L <= 0 || o.pieceLen <= 0.5 || o.thick <= 0.25) return out;
  const rand = mulberry32(o.seed >>> 0 || 1),
    gap = o.pieceLen * Math.max(-0.9, o.spacing);

  // Runs of the path to fill: the whole line, or the stretches between corners.
  const corners =
    o.corners === "split"
      ? o.cornerAt.map((i) => poly.cum[i]).filter((d) => d > 0.5 && d < L - 0.5)
      : [];
  const stops = [0, ...corners, L];
  // Open lines reserve room for their caps.
  const startPad = !poly.closed && o.startLen > 0 ? o.startLen : 0,
    endPad = !poly.closed && o.endLen > 0 ? o.endLen : 0;
  // A closed loop that starts on a sharp corner has a corner where it
  // begins and ends, too.
  const startCorner =
    poly.closed && o.corners === "split" && o.cornerAt.includes(0);
  // Corner pieces take half their length out of the runs on either side.
  const halfCorner =
    (corners.length || startCorner) && o.cornerLen > 0 ? o.cornerLen / 2 : 0;

  // Distances wrap round a closed loop (the corner piece at its start).
  const at = (d: number) => pointAt(poly, poly.closed ? ((d % L) + L) % L : d);
  const place = (role: PieceRole, d0: number, d1: number, variant: number) => {
    if (out.length >= o.max) return;
    const len0 = d1 - d0;
    let x: number, y: number, angle: number, len: number;
    if (o.followPath) {
      const a = at(d0),
        b = at(d1);
      x = (a.x + b.x) / 2;
      y = (a.y + b.y) / 2;
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      // Very short chords (a hairpin) fall back to the path's own direction.
      angle =
        chord > len0 * 0.2
          ? Math.atan2(b.y - a.y, b.x - a.x)
          : angleAt(poly, (d0 + d1) / 2);
      len = Math.max(chord, len0 * 0.2);
    } else {
      const m = pointAt(poly, (d0 + d1) / 2);
      x = m.x;
      y = m.y;
      angle = 0;
      len = len0;
    }
    // Sideways offset, along the path's normal (right of travel).
    const dir = o.followPath ? angle : angleAt(poly, (d0 + d1) / 2),
      sideways = o.offset * o.thick;
    x += -Math.sin(dir) * sideways;
    y += Math.cos(dir) * sideways;
    const k =
        role === "seg" && o.scaleJitter > 0
          ? 1 - rand() * o.scaleJitter * 0.5
          : 1,
      jitter =
        role === "seg" && o.rotationJitter > 0
          ? (rand() - 0.5) * o.rotationJitter * Math.PI
          : 0;
    let thick = o.thick * k;
    if (o.anchor === "base") {
      // Stand on the line: lift the piece by half its height ("up" is the
      // piece's own −y, which turns with it).
      const up = (o.followPath ? angle : o.rotation) - Math.PI / 2;
      x += Math.cos(up) * thick * 0.5;
      y += Math.sin(up) * thick * 0.5;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    len *= k;
    thick = Math.max(0.25, thick);
    out.push({
      role,
      variant,
      x,
      y,
      angle: angle + o.rotation + jitter,
      len,
      thick,
      flip: o.flip,
    });
  };

  const nextVariant = () =>
    o.variants <= 1 ? 0 : Math.floor(rand() * o.variants) % o.variants;

  for (let r = 0; r < stops.length - 1; r++) {
    let a = stops[r],
      b = stops[r + 1];
    if (r === 0) a += startPad;
    if (r === stops.length - 2) b -= endPad;
    if (r > 0 || startCorner) a += halfCorner;
    if (r < stops.length - 2 || startCorner) b -= halfCorner;
    const span = b - a;
    if (span <= 0.5) continue;
    const unit = o.pieceLen + gap;
    let count: number, len: number, step: number;
    if (unit <= 0.5) continue;
    if (o.fit) {
      count = Math.max(1, Math.round((span + gap) / unit));
      // Scale piece and gap together so `count` pieces fill the span exactly.
      const k = span / (count * o.pieceLen + (count - 1) * gap);
      len = o.pieceLen * k;
      step = (o.pieceLen + gap) * k;
    } else {
      count = Math.max(0, Math.floor((span + gap) / unit + 1e-6));
      len = o.pieceLen;
      step = unit;
    }
    count = Math.min(count, o.max - out.length);
    for (let i = 0; i < count; i++) {
      const d0 = a + i * step;
      place("seg", d0, Math.min(b, d0 + len), nextVariant());
    }
  }
  if (startPad) place("start", 0, o.startLen, 0);
  if (endPad) place("end", L - o.endLen, L, 0);
  if (halfCorner) {
    for (const d of corners) place("corner", d - halfCorner, d + halfCorner, 0);
    if (startCorner) place("corner", -halfCorner, halfCorner, 0);
  }
  return out;
}
