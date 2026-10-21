/**
 * The rules for Text Tool data: a text's look (also what a saved style
 * holds) and a text object in a map. They mirror the server's checks
 * (api/app/Support/TextRules.php) — keep the two in step.
 */
import { validNodes } from "../lines/validate";

const BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "soft-light", "hard-light", "hue", "saturation", "color", "luminosity"];
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const id = (v: unknown) => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/.test(v);

export const TEXT_LIMITS = { maxChars: 2000, maxPathNodes: 2000 } as const;

export function validLook(v: unknown): boolean {
  if (!rec(v)) return false;
  const o = v.outline,
    s = v.shadow,
    // PHP sends an empty object back as [] (no features changed).
    f = Array.isArray(v.features) && v.features.length === 0 ? {} : v.features;
  return (
    id(v.profile) &&
    (v.font === null || id(v.font)) &&
    num(v.size, 0.001, 0.5) &&
    num(v.weight, 100, 900) &&
    typeof v.italic === "boolean" &&
    typeof v.caps === "boolean" &&
    num(v.letterSpacing, -0.2, 2) &&
    num(v.wordSpacing, -0.5, 3) &&
    num(v.lineHeight, 0.5, 4) &&
    ["start", "center", "end", "left", "right"].includes(v.align as string) &&
    ["auto", "ltr", "rtl"].includes(v.direction as string) &&
    // The server stores "" as null (Laravel turns empty strings into null).
    (v.lang == null || (typeof v.lang === "string" && (v.lang === "" || /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/.test(v.lang)))) &&
    rec(f) &&
    Object.keys(f).length <= 24 &&
    Object.entries(f).every(([k, x]) => /^[a-z0-9]{4}$/.test(k) && typeof x === "boolean") &&
    num(v.kashida, 0, 1) &&
    hex(v.fill) &&
    num(v.fillOpacity, 0, 1) &&
    num(v.opacity, 0, 1) &&
    (v.blend === undefined || BLENDS.includes(v.blend as string)) &&
    rec(o) &&
    typeof o.enabled === "boolean" &&
    hex(o.color) &&
    num(o.width, 0, 1) &&
    num(o.opacity, 0, 1) &&
    ["round", "miter", "bevel"].includes(o.join as string) &&
    (o.position === "outside" || o.position === "center") &&
    rec(s) &&
    typeof s.enabled === "boolean" &&
    hex(s.color) &&
    num(s.opacity, 0, 1) &&
    num(s.blur, 0, 2) &&
    num(s.offsetX, -2, 2) &&
    num(s.offsetY, -2, 2) &&
    ["straight", "arc", "path"].includes(v.curveMode as string) &&
    num(v.curve, -100, 100) &&
    ["auto", "warp", "letters", "words"].includes(v.letters as string)
  );
}

function validPath(p: unknown): boolean {
  return (
    rec(p) &&
    validNodes(p.nodes, false) &&
    typeof p.reverse === "boolean" &&
    ["start", "center", "end"].includes(p.align as string) &&
    num(p.offset, -1, 1) &&
    ["above", "center", "below"].includes(p.side as string) &&
    num(p.baseline, -5, 5) &&
    typeof p.smooth === "boolean"
  );
}

/** A text object of a map (look, words, place, curve, links). */
export function validText(v: Record<string, unknown>): boolean {
  return (
    typeof v.text === "string" &&
    v.text.length >= 1 &&
    v.text.length <= TEXT_LIMITS.maxChars &&
    num(v.x, -1, 2) &&
    num(v.y, -1, 2) &&
    num(v.rotation, -3600, 3600) &&
    (v.boxWidth === null || num(v.boxWidth, 0.002, 2)) &&
    (v.path === undefined || validPath(v.path)) &&
    (v.name === undefined || (typeof v.name === "string" && v.name.length <= 80)) &&
    (v.styleId === undefined || v.styleId === null || (typeof v.styleId === "string" && v.styleId.length <= 64)) &&
    (v.attach === undefined || v.attach === null || (rec(v.attach) && typeof v.attach.to === "string" && v.attach.to.length <= 64 && num(v.attach.dx, -2, 2) && num(v.attach.dy, -2, 2))) &&
    validLook(v)
  );
}
