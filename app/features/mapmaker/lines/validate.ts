/**
 * Validation of line data from outside the editor: imported map files,
 * cloud documents, saved styles and the browser's remembered tool settings.
 * Every number is range-checked and every enum is checked, so malformed or
 * hostile data never reaches the renderer. The API checks the same rules
 * (api/app/Support/LineRules.php) — keep the two in step.
 */
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const bool = (v: unknown) => typeof v === "boolean";
const rec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export const LINE_LIMITS = {
  /** Nodes per line. */
  maxNodes: 2000,
  /** Line width / piece thickness, fraction of the map width. */
  maxWidth: 0.2,
} as const;

const PATTERNS = ["solid", "dashed", "dotted", "dashdot", "custom"];
const CAPS = ["round", "butt", "square"];
const JOINS = ["round", "miter", "bevel"];
const BLENDS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "hue",
  "saturation",
  "color",
  "luminosity",
];
/** Stamp-catalog asset keys: built-in vector art or an uploaded image. */
export const ASSET_KEY = /^(b:[\w-]{1,40}:\d{1,3}|u:[0-9A-Za-z]{10,40})$/;
const key = (v: unknown) => typeof v === "string" && ASSET_KEY.test(v);
const optKey = (v: unknown) => v === undefined || v === null || key(v);

export function validStroke(v: unknown) {
  return (
    rec(v) &&
    hex(v.color) &&
    finite(v.width, 0.0002, LINE_LIMITS.maxWidth) &&
    PATTERNS.includes(v.pattern as string) &&
    finite(v.dash, 0.1, 50) &&
    finite(v.gap, 0.1, 50) &&
    CAPS.includes(v.cap as string) &&
    JOINS.includes(v.join as string) &&
    finite(v.blur, 0, 1) &&
    finite(v.casing, 0, 0.05) &&
    hex(v.casingColor)
  );
}

export function validStamp(v: unknown) {
  if (!rec(v) || !rec(v.parts)) return false;
  const parts = v.parts;
  return (
    typeof v.set === "string" &&
    v.set.length <= 120 &&
    Array.isArray(parts.seg) &&
    parts.seg.length >= 1 &&
    parts.seg.length <= 32 &&
    parts.seg.every(key) &&
    optKey(parts.start) &&
    optKey(parts.end) &&
    optKey(parts.corner) &&
    hex(v.ink) &&
    (v.fill === null || hex(v.fill)) &&
    finite(v.size, 0.0005, LINE_LIMITS.maxWidth) &&
    finite(v.spacing, -0.9, 10) &&
    finite(v.rotation, -360, 360) &&
    bool(v.followPath) &&
    finite(v.offset, -10, 10) &&
    bool(v.flip) &&
    bool(v.fit) &&
    (v.corners === "continuous" || v.corners === "split") &&
    bool(v.caps) &&
    finite(v.scaleJitter, 0, 1) &&
    finite(v.rotationJitter, 0, 1) &&
    (v.anchor === "center" || v.anchor === "base") &&
    finite(v.seed, 0, 2 ** 32)
  );
}

/** A complete look (tool settings, a saved style, or a line's own). */
export function validLook(v: unknown) {
  return (
    rec(v) &&
    (v.mode === "color" || v.mode === "stamp") &&
    validStroke(v.stroke) &&
    validStamp(v.stamp) &&
    finite(v.opacity, 0, 1) &&
    (v.blend === undefined || BLENDS.includes(v.blend as string))
  );
}

function validHandle(v: unknown) {
  return (
    v === undefined || (rec(v) && finite(v.x, -4, 4) && finite(v.y, -4, 4))
  );
}
export function validNodes(v: unknown, closed: boolean) {
  return (
    Array.isArray(v) &&
    v.length >= (closed ? 3 : 2) &&
    v.length <= LINE_LIMITS.maxNodes &&
    v.every(
      (n) =>
        rec(n) &&
        finite(n.x, -1, 2) &&
        finite(n.y, -1, 2) &&
        (n.t === undefined || n.t === "corner" || n.t === "smooth") &&
        validHandle(n.hi) &&
        validHandle(n.ho),
    )
  );
}

/** A line object (its id and the shared flags are checked by the caller). */
export function validLine(o: Record<string, unknown>) {
  return (
    bool(o.closed) &&
    validNodes(o.nodes, o.closed as boolean) &&
    validLook(o) &&
    (o.name === undefined ||
      (typeof o.name === "string" && o.name.length <= 80)) &&
    (o.styleId === undefined ||
      o.styleId === null ||
      (typeof o.styleId === "string" && o.styleId.length <= 64))
  );
}
