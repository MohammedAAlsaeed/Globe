/**
 * Brush tips — the alpha "dab" stamped repeatedly along a stroke.
 *
 * Each tip is a white-on-transparent mask drawn once into a small canvas
 * (cached per tip × softness step) and then stamped, scaled and rotated, by
 * the engine. The round tip is special-cased in the engine as a radial
 * gradient, which stays perfectly crisp at any size. Any stamp from the
 * icon set can become a tip (`stamp:<iconId>`) — Inkarnate's "stamp to
 * brush shape" — via the same path data the Stamp tool draws.
 */
import { ICONS, type IconId } from "../../studio/domain/icons";
import { hash2, mulberry32 } from "./noise";
import type { BrushTip } from "../types";

export const TIP_SIZE = 128;

export const TIP_LIST: { key: BrushTip; labelKey: string }[] = [
  { key: "round", labelKey: "mmTipRound" },
  { key: "square", labelKey: "mmTipSquare" },
  { key: "chalk", labelKey: "mmTipChalk" },
  { key: "rough", labelKey: "mmTipRough" },
  { key: "cloud", labelKey: "mmTipCloud" },
  { key: "splatter", labelKey: "mmTipSplatter" },
  { key: "bristle", labelKey: "mmTipBristle" },
  { key: "stipple", labelKey: "mmTipStipple" },
  { key: "leaf", labelKey: "mmTipLeaf" },
];

/** Gaussian-ish blur of a canvas via the shadow trick: the shape is drawn far
 * off-canvas and only its blurred shadow lands in view. Works in every
 * browser (no `ctx.filter` needed). */
export function blurInto(
  dst: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  blurPx: number,
  x = 0,
  y = 0,
  color = "#fff",
) {
  if (blurPx < 0.5) {
    dst.drawImage(src, x, y);
    return;
  }
  const off = src.width + blurPx * 4 + 100;
  dst.save();
  dst.shadowColor = color;
  dst.shadowBlur = blurPx;
  dst.shadowOffsetX = off;
  dst.drawImage(src, x - off, y);
  dst.restore();
}

function drawTipShape(
  ctx: CanvasRenderingContext2D,
  tip: BrushTip,
  seed: number,
) {
  const S = TIP_SIZE,
    c = S / 2,
    rnd = mulberry32(seed);
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  switch (tip) {
    case "square":
      ctx.fillRect(S * 0.16, S * 0.16, S * 0.68, S * 0.68);
      break;
    case "chalk": {
      // Round body with a grainy, broken-up interior and ragged rim.
      const img = ctx.createImageData(S, S);
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const dx = (i - c) / (c * 0.86),
            dy = (j - c) / (c * 0.86),
            r = Math.hypot(dx, dy) + (hash2(i >> 1, j >> 1, seed) - 0.5) * 0.22;
          const grain = hash2(i, j, seed + 1);
          const a =
            r < 1 ? (grain > 0.28 ? 1 : 0.25) * Math.min(1, (1 - r) * 6) : 0;
          img.data[(j * S + i) * 4 + 3] = a * 255;
          img.data[(j * S + i) * 4] =
            img.data[(j * S + i) * 4 + 1] =
            img.data[(j * S + i) * 4 + 2] =
              255;
        }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case "rough": {
      // Irregular blob: a circle whose radius wobbles with low-frequency noise.
      ctx.beginPath();
      const n = 48;
      const amps = [rnd(), rnd(), rnd(), rnd()];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2,
          r =
            c *
            0.78 *
            (1 +
              0.12 * Math.sin(a * 3 + amps[0] * 6) +
              0.08 * Math.sin(a * 5 + amps[1] * 6) +
              0.05 * Math.sin(a * 9 + amps[2] * 6));
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.fill();
      break;
    }
    case "cloud": {
      for (let k = 0; k < 14; k++) {
        const a = rnd() * Math.PI * 2,
          d = rnd() * c * 0.45,
          r = c * (0.18 + rnd() * 0.22),
          g = ctx.createRadialGradient(
            c + Math.cos(a) * d,
            c + Math.sin(a) * d,
            0,
            c + Math.cos(a) * d,
            c + Math.sin(a) * d,
            r,
          );
        g.addColorStop(0, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
      }
      break;
    }
    case "splatter": {
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2,
          d = Math.pow(rnd(), 0.7) * c * 0.85,
          r = c * (0.03 + Math.pow(rnd(), 2.2) * 0.16);
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "bristle": {
      ctx.lineCap = "round";
      for (let k = 0; k < 22; k++) {
        const x = S * (0.18 + rnd() * 0.64);
        ctx.globalAlpha = 0.45 + rnd() * 0.55;
        ctx.lineWidth = S * (0.012 + rnd() * 0.03);
        ctx.beginPath();
        ctx.moveTo(x, S * (0.15 + rnd() * 0.12));
        ctx.lineTo(x + (rnd() - 0.5) * S * 0.05, S * (0.73 + rnd() * 0.12));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "stipple": {
      for (let k = 0; k < 70; k++) {
        const a = rnd() * Math.PI * 2,
          d = Math.sqrt(rnd()) * c * 0.82;
        ctx.beginPath();
        ctx.arc(
          c + Math.cos(a) * d,
          c + Math.sin(a) * d,
          S * 0.018,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      break;
    }
    case "leaf": {
      // A small clump of leaf shapes — reads as foliage when scattered.
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + rnd() * 0.6;
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(S * 0.16, -S * 0.12, S * 0.4, 0);
        ctx.quadraticCurveTo(S * 0.16, S * 0.12, 0, 0);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    default: {
      if (tip.startsWith("stamp:")) {
        const def = ICONS[tip.slice(6) as IconId];
        if (!def) break;
        ctx.save();
        ctx.scale(S / 24, S / 24);
        if (def.fill) ctx.fill(new Path2D(def.fill));
        if (def.stroke) {
          ctx.lineWidth = 1.8;
          ctx.lineCap = ctx.lineJoin = "round";
          ctx.stroke(new Path2D(def.stroke));
        }
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(c, c, c * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

const tipCache = new Map<string, HTMLCanvasElement>();

/** Cached tip mask for a tip + softness (softness quantized to 10 steps). */
export function tipCanvas(tip: BrushTip, softness: number) {
  const step = Math.round(Math.max(0, Math.min(1, softness)) * 10),
    key = `${tip}|${step}`;
  let canvas = tipCache.get(key);
  if (canvas) return canvas;
  const raw = document.createElement("canvas");
  raw.width = raw.height = TIP_SIZE;
  drawTipShape(raw.getContext("2d")!, tip, 9137);
  canvas = raw;
  if (step > 0) {
    // Softness: shrink a little and blur, so soft tips fade *inside* the box.
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = TIP_SIZE;
    const ctx = canvas.getContext("2d")!,
      k = 1 - step * 0.035;
    const shrunk = document.createElement("canvas");
    shrunk.width = shrunk.height = TIP_SIZE;
    const sctx = shrunk.getContext("2d")!;
    sctx.translate((TIP_SIZE * (1 - k)) / 2, (TIP_SIZE * (1 - k)) / 2);
    sctx.scale(k, k);
    sctx.drawImage(raw, 0, 0);
    blurInto(ctx, shrunk, step * 2.2);
  }
  tipCache.set(key, canvas);
  return canvas;
}
