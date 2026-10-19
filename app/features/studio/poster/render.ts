/**
 * Draws a poster's artwork — the map, its bleed, the mat, the frame and the
 * title — onto one canvas (see ./layout for the geometry). The sheets, the
 * preview and the PDF are all cut from this one picture, so what is
 * previewed is what prints.
 *
 * The title is drawn by the browser (Amiri, which shapes Arabic properly),
 * not by the PDF library, so Arabic and English titles both print right.
 */
import type { PosterPlan } from "./layout";
import type { PosterSettings } from "./types";

/** The largest artwork canvas (pixels): enough for 300 DPI on large posters. */
export const MAX_POSTER_PIXELS = 90_000_000;

/** Pixels per millimetre for a print: the map's own detail, at most 300 DPI. */
export function printScale(plan: PosterPlan, sourceWidthPx: number, maxDpi = 300): number {
  const native = plan.artwork.map.width > 0 ? sourceWidthPx / plan.artwork.map.width : maxDpi / 25.4,
    byPixels = Math.sqrt(MAX_POSTER_PIXELS / Math.max(1, plan.canvas.width * plan.canvas.height));
  return Math.max(0.5, Math.min(maxDpi / 25.4, native, byPixels));
}

const ARABIC = /[؀-ۿ]/;

function frame(ctx: CanvasRenderingContext2D, plan: PosterPlan, s: PosterSettings, k: number) {
  const { artwork, bleed } = plan,
    m = artwork.map,
    b = artwork.border,
    // The frame sits in the mat, a little outside the map.
    gap = b * 0.38,
    x = (bleed + m.x - gap) * k,
    y = (bleed + m.y - gap) * k,
    w = (m.width + 2 * gap) * k,
    h = (artwork.title ? artwork.title.y + artwork.title.height - m.y + 2 * gap : m.height + 2 * gap) * k,
    unit = artwork.width * k * 0.0012;
  ctx.save();
  ctx.strokeStyle = s.frameColor;
  ctx.fillStyle = s.frameColor;
  if (s.frame === "line") {
    ctx.lineWidth = unit * 1.6;
    ctx.strokeRect(x, y, w, h);
  } else if (s.frame === "double" || s.frame === "ornate") {
    ctx.lineWidth = unit * 3.2;
    ctx.strokeRect(x, y, w, h);
    const inset = unit * 7;
    ctx.lineWidth = unit;
    ctx.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
    if (s.frame === "ornate") {
      // A neatline of alternating bars between the two rules (as on old
      // engraved maps), and a diamond at each corner.
      const band = inset * 0.55,
        bx = x + inset * 0.22,
        by = y + inset * 0.22,
        bw = w - inset * 0.44,
        bh = h - inset * 0.44,
        step = Math.max(unit * 14, Math.min(bw, bh) / 40);
      ctx.lineWidth = unit * 0.6;
      ctx.strokeRect(bx, by, bw, bh);
      for (let i = 0, t = 0; t < bw; i++, t += step) if (i % 2 === 0) {
        ctx.fillRect(bx + t, by, Math.min(step, bw - t), band * 0.5);
        ctx.fillRect(bx + t, by + bh - band * 0.5, Math.min(step, bw - t), band * 0.5);
      }
      for (let i = 0, t = 0; t < bh; i++, t += step) if (i % 2 === 0) {
        ctx.fillRect(bx, by + t, band * 0.5, Math.min(step, bh - t));
        ctx.fillRect(bx + bw - band * 0.5, by + t, band * 0.5, Math.min(step, bh - t));
      }
      const d = inset * 1.1;
      for (const [cx, cy] of [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - d);
        ctx.lineTo(cx + d, cy);
        ctx.lineTo(cx, cy + d);
        ctx.lineTo(cx - d, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function title(ctx: CanvasRenderingContext2D, plan: PosterPlan, s: PosterSettings, k: number) {
  const band = plan.artwork.title;
  if (!band) return;
  const cx = (plan.bleed + band.x + band.width / 2) * k,
    top = (plan.bleed + band.y) * k,
    hasSub = !!s.subtitle.trim(),
    titleSize = band.height * k * (hasSub ? 0.42 : 0.55),
    subSize = band.height * k * 0.2;
  ctx.save();
  ctx.fillStyle = s.frameColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = (text: string, size: number, weight: string) => {
    let f = size;
    ctx.font = `${weight} ${f}px Amiri, Georgia, serif`;
    while (ctx.measureText(text).width > band.width * k * 0.94 && f > 4) {
      f *= 0.92;
      ctx.font = `${weight} ${f}px Amiri, Georgia, serif`;
    }
  };
  if (s.title.trim()) {
    ctx.direction = ARABIC.test(s.title) ? "rtl" : "ltr";
    fit(s.title.trim(), titleSize, "700");
    ctx.fillText(s.title.trim(), cx, top + band.height * k * (hasSub ? 0.36 : 0.5));
  }
  if (hasSub) {
    ctx.direction = ARABIC.test(s.subtitle) ? "rtl" : "ltr";
    fit(s.subtitle.trim(), subSize, "400");
    ctx.globalAlpha = 0.8;
    ctx.fillText(s.subtitle.trim(), cx, top + band.height * k * (s.title.trim() ? 0.76 : 0.5));
  }
  ctx.restore();
}

/** Draws the image into a rectangle and repeats its edge pixels outward by `bleed` (all in pixels). */
function drawWithBleed(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, bleed: number) {
  ctx.drawImage(img, x, y, w, h);
  if (bleed <= 0) return;
  const iw = img.width,
    ih = img.height;
  // Edges: a one-pixel strip of the source, stretched into the bleed.
  ctx.drawImage(img, 0, 0, 1, ih, x - bleed, y, bleed, h);
  ctx.drawImage(img, iw - 1, 0, 1, ih, x + w, y, bleed, h);
  ctx.drawImage(img, 0, 0, iw, 1, x, y - bleed, w, bleed);
  ctx.drawImage(img, 0, ih - 1, iw, 1, x, y + h, w, bleed);
  // Corners.
  ctx.drawImage(img, 0, 0, 1, 1, x - bleed, y - bleed, bleed, bleed);
  ctx.drawImage(img, iw - 1, 0, 1, 1, x + w, y - bleed, bleed, bleed);
  ctx.drawImage(img, 0, ih - 1, 1, 1, x - bleed, y + h, bleed, bleed);
  ctx.drawImage(img, iw - 1, ih - 1, 1, 1, x + w, y + h, bleed, bleed);
}

/** The poster's artwork at `k` pixels per millimetre. */
export async function renderPoster(image: ImageBitmap, plan: PosterPlan, s: PosterSettings, k: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(plan.canvas.width * k));
  canvas.height = Math.max(1, Math.round(plan.canvas.height * k));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const m = plan.artwork.map,
    bordered = plan.artwork.border > 0;
  if (bordered) {
    // The mat fills the artwork and its bleed; the map sits on it.
    ctx.fillStyle = s.mat;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, (plan.bleed + m.x) * k, (plan.bleed + m.y) * k, m.width * k, m.height * k);
  } else drawWithBleed(ctx, image, plan.bleed * k, plan.bleed * k, m.width * k, m.height * k, plan.bleed * k);
  if (s.frame !== "none") frame(ctx, plan, s, k);
  if (plan.artwork.title) {
    try {
      await Promise.all([document.fonts.load(`700 40px Amiri`), document.fonts.load(`400 20px Amiri`)]);
    } catch {
      // Offline: the serif fallback is used.
    }
    title(ctx, plan, s, k);
  }
  return canvas;
}
