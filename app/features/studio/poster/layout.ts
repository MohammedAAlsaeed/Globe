/**
 * Where a poster goes on paper. Pure geometry (unit tested): the artwork
 * (map + border + title band), and the sheets it is printed on.
 *
 * The printed "canvas" is the artwork plus its bleed on every side; the
 * trim is the artwork itself. A poster larger than one sheet is split into
 * tiles that overlap by `overlap` for gluing, read row by row (A1, A2…).
 */
import { paperSize } from "../domain/paper";
import type { PosterSettings } from "./types";

/** The border around the map and the title band, as fractions of the artwork width. */
const BORDER = 0.045,
  TITLE = 0.075,
  SUBTITLE = 0.03;
/** Space kept at the foot of every sheet for its label. */
export const FOOTER = 6;
export const PAGE_LIMIT = 250;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Artwork {
  width: number;
  height: number;
  /** The map inside the artwork. */
  map: Rect;
  /** The title band (null: no title). */
  title: Rect | null;
  /** The mat around the map (0: the map fills the artwork). */
  border: number;
}

export interface PosterSheet {
  width: number;
  height: number;
  /** The printed area on the sheet. */
  clip: Rect;
  /** Which part of the canvas (artwork + bleed) it shows. */
  sourceX: number;
  sourceY: number;
  col: number;
  row: number;
}

export interface PosterPlan {
  artwork: Artwork;
  bleed: number;
  /** The artwork + bleed. */
  canvas: { width: number; height: number };
  sheets: PosterSheet[];
  cols: number;
  rows: number;
  /** The paper actually used (orientation applied). */
  paper: { width: number; height: number };
  error?: "layoutError" | "pageLimit";
}

const hasTitle = (s: Pick<PosterSettings, "title" | "subtitle">) =>
  !!(s.title.trim() || s.subtitle.trim());
const hasBorder = (s: Pick<PosterSettings, "frame" | "title" | "subtitle">) =>
  s.frame !== "none" || hasTitle(s);

/** Artwork height per millimetre of width, for a map of this aspect (w / h). */
export function heightPerWidth(
  aspect: number,
  s: Pick<PosterSettings, "frame" | "title" | "subtitle">,
): number {
  const b = hasBorder(s) ? BORDER : 0,
    t = hasTitle(s) ? TITLE + (s.subtitle.trim() ? SUBTITLE : 0) : 0;
  return (1 - 2 * b) / aspect + 2 * b + t;
}

/** The artwork at a width. */
export function artworkAt(
  width: number,
  aspect: number,
  s: Pick<PosterSettings, "frame" | "title" | "subtitle">,
): Artwork {
  const border = hasBorder(s) ? width * BORDER : 0,
    titleH = hasTitle(s)
      ? width * (TITLE + (s.subtitle.trim() ? SUBTITLE : 0))
      : 0,
    mapW = width - 2 * border,
    mapH = mapW / aspect;
  return {
    width,
    height: mapH + 2 * border + titleH,
    map: { x: border, y: border, width: mapW, height: mapH },
    title: titleH
      ? {
          x: border,
          y: border + mapH + border * 0.35,
          width: mapW,
          height: titleH,
        }
      : null,
    border,
  };
}

function layout(
  aspect: number,
  s: PosterSettings,
  pw: number,
  ph: number,
): PosterPlan {
  const aw = pw - 2 * s.margin,
    ah = ph - 2 * s.margin - FOOTER,
    k = heightPerWidth(aspect, s),
    bleed = s.bleed;
  const empty = (error: PosterPlan["error"]): PosterPlan => ({
    artwork: artworkAt(0, aspect, s),
    bleed,
    canvas: { width: 0, height: 0 },
    sheets: [],
    cols: 0,
    rows: 0,
    paper: { width: pw, height: ph },
    error,
  });
  if (aw < 20 || ah < 20) return empty("layoutError");
  const width =
    s.size === "page"
      ? Math.min(aw - 2 * bleed, (ah - 2 * bleed) / k)
      : s.printWidth;
  if (!(width > 10)) return empty("layoutError");
  const artwork = artworkAt(width, aspect, s),
    cw = artwork.width + 2 * bleed,
    ch = artwork.height + 2 * bleed;
  // One sheet: centred in the printable area.
  if (cw <= aw + 1e-6 && ch <= ah + 1e-6)
    return {
      artwork,
      bleed,
      canvas: { width: cw, height: ch },
      sheets: [
        {
          width: pw,
          height: ph,
          clip: {
            x: s.margin + (aw - cw) / 2,
            y: s.margin + (ah - ch) / 2,
            width: cw,
            height: ch,
          },
          sourceX: 0,
          sourceY: 0,
          col: 0,
          row: 0,
        },
      ],
      cols: 1,
      rows: 1,
      paper: { width: pw, height: ph },
    };
  if (s.overlap >= Math.min(aw, ah) - 5) return empty("layoutError");
  const stepX = aw - s.overlap,
    stepY = ah - s.overlap,
    cols = Math.max(1, Math.ceil((cw - s.overlap) / stepX)),
    rows = Math.max(1, Math.ceil((ch - s.overlap) / stepY));
  if (cols * rows > PAGE_LIMIT)
    return {
      ...empty("pageLimit"),
      artwork,
      canvas: { width: cw, height: ch },
      cols,
      rows,
    };
  const sheets: PosterSheet[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const sx = col * stepX,
        sy = row * stepY;
      sheets.push({
        width: pw,
        height: ph,
        clip: {
          x: s.margin,
          y: s.margin,
          width: Math.min(aw, cw - sx),
          height: Math.min(ah, ch - sy),
        },
        sourceX: sx,
        sourceY: sy,
        col,
        row,
      });
    }
  return {
    artwork,
    bleed,
    canvas: { width: cw, height: ch },
    sheets,
    cols,
    rows,
    paper: { width: pw, height: ph },
  };
}

/** The best plan: fewest sheets (then the larger poster, for a single sheet). */
export function planPoster(aspect: number, s: PosterSettings): PosterPlan {
  const [a, b] = paperSize(s.paper, s.width, s.height),
    portrait: [number, number] = [Math.min(a, b), Math.max(a, b)],
    landscape: [number, number] = [portrait[1], portrait[0]];
  const options =
    s.orientation === "portrait"
      ? [portrait]
      : s.orientation === "landscape"
        ? [landscape]
        : [portrait, landscape];
  const plans = options.map(([w, h]) => layout(aspect, s, w, h));
  const ok = plans.filter((p) => !p.error);
  if (!ok.length) return plans.find((p) => p.error === "pageLimit") ?? plans[0];
  return ok.sort(
    (x, y) =>
      x.sheets.length - y.sheets.length || y.artwork.width - x.artwork.width,
  )[0];
}

/** "A1", "B3"…: row letter, column number. */
export function sheetName(sheet: Pick<PosterSheet, "row" | "col">): string {
  let n = sheet.row,
    letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${letters}${sheet.col + 1}`;
}

/** The trim corners (where crop marks go) on a sheet, in sheet coordinates. */
export function trimCorners(
  plan: PosterPlan,
  sheet: PosterSheet,
): { x: number; y: number; h: -1 | 1; v: -1 | 1 }[] {
  const { bleed, artwork } = plan,
    corners: { x: number; y: number; h: -1 | 1; v: -1 | 1 }[] = [];
  for (const [cx, h] of [
    [bleed, -1],
    [bleed + artwork.width, 1],
  ] as const)
    for (const [cy, v] of [
      [bleed, -1],
      [bleed + artwork.height, 1],
    ] as const) {
      const x = sheet.clip.x + cx - sheet.sourceX,
        y = sheet.clip.y + cy - sheet.sourceY;
      if (
        x >= sheet.clip.x - 1e-6 &&
        x <= sheet.clip.x + sheet.clip.width + 1e-6 &&
        y >= sheet.clip.y - 1e-6 &&
        y <= sheet.clip.y + sheet.clip.height + 1e-6
      )
        corners.push({ x, y, h, v });
    }
  return corners;
}

/** The print resolution a source image gives the map (pixels per inch). */
export function posterPpi(plan: PosterPlan, sourceWidthPx: number): number {
  return plan.artwork.map.width > 0
    ? sourceWidthPx / (plan.artwork.map.width / 25.4)
    : 0;
}
