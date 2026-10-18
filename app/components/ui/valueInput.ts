/**
 * Typing a slider's value by hand: reading what people type, and turning a
 * number as shown ("160 px", "35%", "−30°", "×1.5") back into the slider's
 * own value (a fraction of the map, 0–1, degrees…).
 *
 * Sliders format their value for display; most formats are linear (px =
 * value × map width, % = value × 100, ° = value). So the typed number is
 * mapped back through two sample points of the slider's own format, which
 * works for every slider without each one having to describe its units. A
 * slider whose display isn't linear passes its own `parse` instead.
 */

const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** The first number in a text: "160 px" → 160, "−30°" → −30, "+25" → 25,
 * "١٢٫٥" → 12.5, "1,5" → 1.5, "1,200 px" → 1200. NaN when there is none. */
export function firstNumber(text: string): number {
  const t = text
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d])
    .replace(/[٫]/g, ".")
    .replace(/[٬]/g, ",")
    .replace(/[−–—]/g, "-");
  const m = /([-+]?)\s*(\d+(?:[.,]\d+)*)/.exec(t);
  if (!m) return NaN;
  let digits = m[2];
  const commas = (digits.match(/,/g) ?? []).length,
    dots = (digits.match(/\./g) ?? []).length;
  if (commas && dots) digits = digits.replace(/,/g, "");
  // "1,5" is a decimal comma; "1,200" (three digits after) a thousands one.
  else if (commas === 1 && !/,\d{3}$/.test(digits)) digits = digits.replace(",", ".");
  else digits = digits.replace(/,/g, "");
  const n = Number(digits);
  return m[1] === "-" ? -n : n;
}

/**
 * The slider value that shows as `shown` (in the display's own units).
 *
 * The display is sampled across the slider. Displays are nearly always
 * value × a whole factor (map width in px, 100 for %, 1 for degrees), shown
 * rounded: so the whole factor that explains every sample within its
 * rounding is used, and 160 px becomes exactly 160 / width. Otherwise a
 * straight line fitted through the samples is used.
 */
export function valueFromDisplay(shown: number, min: number, max: number, format?: (v: number) => string): number {
  if (!format || !(max > min)) return shown;
  const xs: number[] = [],
    ys: number[] = [];
  let decimals = 0;
  // The middle of the range: ends may be clamped ("at least 1 px") or say a word ("None").
  for (let i = 6; i <= 58; i++) {
    const v = min + ((max - min) * i) / 64,
      text = format(v),
      d = firstNumber(text);
    if (!Number.isFinite(d)) continue;
    xs.push(v);
    ys.push(d);
    const frac = /\d[.,٫](\d+)/.exec(text);
    if (frac) decimals = Math.max(decimals, frac[1].length);
  }
  if (xs.length < 2) return shown;
  const n = xs.length,
    mx = xs.reduce((a, b) => a + b) / n,
    my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const k = sxy / sxx;
  if (!Number.isFinite(k) || k === 0) return shown;
  // A whole factor that every sample agrees with, to its rounding.
  const half = 0.5 * 10 ** -decimals + 1e-9,
    lo = Math.ceil(Math.min(k * 0.97, k * 1.03)),
    hi = Math.floor(Math.max(k * 0.97, k * 1.03));
  let best: number | null = null,
    bestErr = Infinity;
  for (let w = lo; w <= hi && hi - lo < 10000; w++) {
    if (w === 0 || !xs.every((x, i) => Math.abs(ys[i] - w * x) <= half)) continue;
    const err = xs.reduce((sum, x, i) => sum + (ys[i] - w * x) ** 2, 0);
    if (err < bestErr) [best, bestErr] = [w, err];
  }
  if (best !== null) return shown / best;
  return (shown - (my - k * mx)) / k;
}

/**
 * Keeps a typed value within the slider. Whole-number steps (px, degrees,
 * counts, even gore counts) are kept on their step; fine steps keep the
 * exact value typed.
 */
export function settleValue(v: number, min: number, max: number, step: number): number {
  let out = Math.min(max, Math.max(min, v));
  if (step >= 1) out = Math.min(max, Math.max(min, min + Math.round((out - min) / step) * step));
  // Float noise from the unit conversion (0.35000000000000003).
  return Number(out.toPrecision(12));
}

/** The number to put in the box while typing ("160" for "160 px"), with what surrounds it. */
export function editParts(display: string): { number: string; prefix: string; suffix: string } {
  const m = /^(\D*?)([-+−]?\s*[\d٠-٩۰-۹][\d٠-٩۰-۹.,٫٬]*)(.*)$/.exec(display);
  if (!m) return { number: display, prefix: "", suffix: "" };
  const short = (s: string) => (s.trim().length <= 3 ? s.trim() : "");
  return { number: m[2].replace(/\s/g, "").replace("−", "-").replace(/^\+/, ""), prefix: short(m[1]), suffix: short(m[3]) };
}
