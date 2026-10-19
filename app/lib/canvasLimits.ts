/**
 * The largest canvas this device's browser can draw.
 *
 * On iPhone and iPad every browser is WebKit, and WebKit refuses a canvas
 * above 16,777,216 pixels (4096 × 4096): drawing into it silently does
 * nothing, so a print comes out blank. Computers go far higher; Firefox,
 * the strictest, stops near 124 million. Every canvas made for an export or
 * a print is sized within these limits.
 */

/** iPhone / iPad (WebKit) — a little under the hard limit, for safety. */
export const APPLE_MOBILE_CANVAS_PIXELS = 16_000_000;
/** Computers and other phones. */
export const DEFAULT_CANVAS_PIXELS = 120_000_000;
/** The longest side any browser draws. */
export const MAX_CANVAS_SIDE = 32_767;

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). */
export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

/** The largest canvas area (pixels) on a device. */
export function canvasPixelsFor(userAgent: string, maxTouchPoints = 0): number {
  return isAppleMobile(userAgent, maxTouchPoints) ? APPLE_MOBILE_CANVAS_PIXELS : DEFAULT_CANVAS_PIXELS;
}

/** The largest canvas area (pixels) on this device. Works in workers too. */
export function maxCanvasPixels(): number {
  if (typeof navigator === "undefined") return DEFAULT_CANVAS_PIXELS;
  return canvasPixelsFor(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Whether a width × height canvas can be drawn within `limit`. */
export function canvasFits(width: number, height: number, limit = maxCanvasPixels()): boolean {
  return width * height <= limit && Math.max(width, height) <= MAX_CANVAS_SIDE;
}
