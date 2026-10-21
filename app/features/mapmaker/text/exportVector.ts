/**
 * Texts in vector exports (SVG and PDF): the same outlines the map draws
 * (./geometry), placed at the output size.
 *
 *   outlines   every text as filled paths — looks the same everywhere,
 *              whatever fonts the viewer has (the report's "Outlined Text");
 *   editable   straight texts as real <text> (selectable, searchable, still
 *              editable in Illustrator/Inkscape — they need the same fonts
 *              installed to look the same); curved ones stay outlines.
 *
 * Shadows become an SVG filter (and a small picture in PDFs, which have no
 * blur); outlines a stroke behind the letters, cut out under a faded fill.
 */
import type { MMText } from "../types";
import { fontDef, fontProfile, profileSlot } from "./fonts";
import { textGeometry, type Ops, type TextGeometry } from "./geometry";
import { drawText } from "./render";

export type TextExportMode = "outlines" | "editable";

/** em → output pixels for a text (its own place, turn and size). */
export function outputTransform(
  o: MMText,
  outW: number,
  outH: number,
): [number, number, number, number, number, number] {
  const k = o.size * outW;
  if (o.curveMode === "path" && o.path) return [k, 0, 0, k, 0, 0];
  const r = (o.rotation * Math.PI) / 180,
    c = Math.cos(r) * k,
    s = Math.sin(r) * k;
  return [c, s, -s, c, o.x * outW, o.y * outH];
}

function transformOps(
  ops: Ops,
  m: [number, number, number, number, number, number],
): Ops {
  const out: Ops = [];
  for (let i = 0; i < ops.length;) {
    const op = ops[i];
    const n = op === 0 || op === 1 ? 1 : op === 2 ? 2 : op === 3 ? 3 : 0;
    out.push(op);
    for (let p = 0; p < n; p++) {
      const x = ops[i + 1 + p * 2],
        y = ops[i + 2 + p * 2];
      out.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    }
    i += 1 + n * 2;
  }
  return out;
}
function svgD(ops: Ops, digits = 2): string {
  const f = (v: number) => +v.toFixed(digits);
  const parts: string[] = [];
  for (let i = 0; i < ops.length;) {
    const op = ops[i];
    if (op === 0) {
      parts.push(`M${f(ops[i + 1])} ${f(ops[i + 2])}`);
      i += 3;
    } else if (op === 1) {
      parts.push(`L${f(ops[i + 1])} ${f(ops[i + 2])}`);
      i += 3;
    } else if (op === 2) {
      parts.push(
        `Q${f(ops[i + 1])} ${f(ops[i + 2])} ${f(ops[i + 3])} ${f(ops[i + 4])}`,
      );
      i += 5;
    } else if (op === 3) {
      parts.push(
        `C${f(ops[i + 1])} ${f(ops[i + 2])} ${f(ops[i + 3])} ${f(ops[i + 4])} ${f(ops[i + 5])} ${f(ops[i + 6])}`,
      );
      i += 7;
    } else {
      parts.push("Z");
      i += 1;
    }
  }
  return parts.join("");
}
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Whether a text can be exported as vectors (letters drawn by the browser can't). */
export function isVectorText(o: MMText, aspect: number): boolean {
  const geo = textGeometry(o, aspect);
  return geo.ready && geo.web.length === 0 && geo.ops.length > 0;
}

/** The text's letters at the output size, as one SVG path. */
export function textPathD(
  o: MMText,
  outW: number,
  outH: number,
): { d: string; geo: TextGeometry; scale: number } {
  const geo = textGeometry(o, outH / outW);
  return {
    d: svgD(transformOps(geo.ops, outputTransform(o, outW, outH))),
    geo,
    scale: o.size * outW,
  };
}

/** Real font family names (for editable SVG text), in the order the engine prefers them. */
function familyStack(o: MMText): string {
  const p = fontProfile(o.profile);
  const ids = [
    o.font,
    profileSlot(p, "latin")?.font,
    profileSlot(p, "arabic")?.font,
  ].filter((x): x is string => !!x);
  return [...new Set(ids.map((id) => fontDef(id)?.family ?? id))]
    .map((f) => `'${f}'`)
    .concat("serif")
    .join(", ");
}

/** One text as SVG (a group, plus the defs it needs). */
export function textToSvg(
  o: MMText,
  outW: number,
  outH: number,
  mode: TextExportMode,
  id: string,
): { defs: string; body: string } {
  const { d, geo, scale } = textPathD(o, outW, outH);
  const defs: string[] = [];
  const parts: string[] = [];
  const blend =
    o.blend && o.blend !== "normal" ? ` style="mix-blend-mode:${o.blend}"` : "";
  const outline =
    o.outline.enabled && o.outline.width > 0 && o.outline.opacity > 0;
  const ow = +(
    o.outline.width *
    scale *
    (o.outline.position === "outside" ? 2 : 1)
  ).toFixed(2);
  const join = o.outline.join;
  const shadow = o.shadow.enabled && o.shadow.opacity > 0;
  if (shadow)
    defs.push(
      `<filter id="${id}-sh" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${+(o.shadow.blur * scale * 0.5).toFixed(2)}"/><feOffset dx="${+(o.shadow.offsetX * scale).toFixed(2)}" dy="${+(o.shadow.offsetY * scale).toFixed(2)}" result="b"/><feFlood flood-color="${o.shadow.color}" flood-opacity="${o.shadow.opacity}"/><feComposite in2="b" operator="in"/></filter>`,
    );
  const strokeAttrs = `stroke="${o.outline.color}" stroke-opacity="${o.outline.opacity}" stroke-width="${ow}" stroke-linejoin="${join}"`;
  const straight =
    o.curveMode === "straight" || (o.curveMode === "arc" && !o.curve);

  if (mode === "editable" && straight && geo.shaped.ready) {
    // Real text, one line at a time at the engine's line positions; its
    // outline and shadow come from the same text, so they always match the
    // letters the viewer draws (in the installed fonts).
    const [a, b, , , e, f] = outputTransform(o, outW, outH);
    const deg = (Math.atan2(b, a) * 180) / Math.PI;
    const anchor =
      o.align === "center"
        ? "middle"
        : o.align === "right" || o.align === "end"
          ? "end"
          : "start";
    const sh = geo.shaped;
    const tx =
      (o.align === "center"
        ? sh.left + sh.width / 2
        : o.align === "right" || o.align === "end"
          ? sh.left + sh.width
          : sh.left) * scale;
    const tspans = o.text
      .split("\n")
      .map(
        (line, i) =>
          `<tspan x="${+tx.toFixed(2)}" y="${+((sh.lines[i]?.baseline ?? 0) * scale).toFixed(2)}">${esc(line)}</tspan>`,
      )
      .join("");
    const attrs = `transform="translate(${+e.toFixed(2)} ${+f.toFixed(2)}) rotate(${+deg.toFixed(3)})" font-family="${esc(familyStack(o))}" font-size="${+scale.toFixed(2)}" font-weight="${Math.round(o.weight)}" font-style="${o.italic ? "italic" : "normal"}" letter-spacing="${+(o.letterSpacing * scale).toFixed(2)}" text-anchor="${anchor}" direction="${o.direction === "rtl" ? "rtl" : "ltr"}" unicode-bidi="plaintext"${o.caps ? ' style="text-transform:uppercase"' : ""}`;
    if (shadow)
      parts.push(
        `<text ${attrs} fill="#000"${outline ? ` stroke="#000" stroke-width="${ow}" stroke-linejoin="${join}"` : ""} filter="url(#${id}-sh)">${tspans}</text>`,
      );
    const stroke = outline
      ? ` ${strokeAttrs}${o.outline.position === "outside" ? ' paint-order="stroke"' : ""}`
      : "";
    parts.push(
      `<text ${attrs} fill="${o.fill}" fill-opacity="${o.fillOpacity}"${stroke}>${tspans}</text>`,
    );
  } else {
    if (shadow)
      parts.push(
        `<path d="${d}" fill="#000"${outline ? ` stroke="#000" stroke-width="${ow}" stroke-linejoin="${join}"` : ""} filter="url(#${id}-sh)"/>`,
      );
    if (outline && o.outline.position === "outside") {
      // Under a faded fill, the outline is cut out where the letters are.
      let mask = "";
      if (o.fillOpacity < 0.999) {
        defs.push(
          `<mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${outW}" height="${outH}"><rect width="${outW}" height="${outH}" fill="#fff"/><path d="${d}" fill="#000"/></mask>`,
        );
        mask = ` mask="url(#${id}-cut)"`;
      }
      parts.push(
        `<path d="${d}" fill="none" ${strokeAttrs} stroke-linecap="round"${mask}/>`,
      );
    }
    parts.push(
      `<path d="${d}" fill="${o.fill}" fill-opacity="${o.fillOpacity}"/>`,
    );
    if (outline && o.outline.position === "center")
      parts.push(`<path d="${d}" fill="none" ${strokeAttrs}/>`);
  }
  return {
    defs: defs.join(""),
    body: `<g id="${id}" opacity="${o.opacity}"${blend}><title>${esc(o.text)}</title>${parts.join("")}</g>`,
  };
}

/**
 * A text's shadow alone, as a picture (PDFs have no blur): the canvas and
 * where it goes (output pixels). Null when it has none.
 */
export function shadowPicture(
  o: MMText,
  outW: number,
  outH: number,
): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  if (!o.shadow.enabled || o.shadow.opacity <= 0) return null;
  const geo = textGeometry(o, outH / outW);
  const m = outputTransform(o, outW, outH),
    k = o.size * outW;
  const pad =
    (o.shadow.blur * 2 +
      Math.abs(o.shadow.offsetX) +
      Math.abs(o.shadow.offsetY) +
      o.outline.width * 2) *
      k +
    4;
  const corners = [
    [geo.bounds.x0, geo.bounds.y0],
    [geo.bounds.x1, geo.bounds.y0],
    [geo.bounds.x0, geo.bounds.y1],
    [geo.bounds.x1, geo.bounds.y1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const x0 = Math.floor(Math.min(...corners.map((c) => c[0])) - pad),
    y0 = Math.floor(Math.min(...corners.map((c) => c[1])) - pad),
    x1 = Math.ceil(Math.max(...corners.map((c) => c[0])) + pad),
    y1 = Math.ceil(Math.max(...corners.map((c) => c[1])) + pad);
  const w = x1 - x0,
    h = y1 - y0;
  if (w <= 0 || h <= 0 || w * h > 40e6) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4] - x0, m[5] - y0);
  ctx.globalAlpha = o.opacity;
  // The shadow only: the letters themselves are drawn as vectors on top.
  drawText(ctx, geo, {
    ...o,
    fillOpacity: 0,
    outline: { ...o.outline, enabled: false },
  });
  return { canvas, x: x0, y: y0 };
}
