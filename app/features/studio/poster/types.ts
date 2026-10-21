/**
 * A map printed flat: one sheet, or a poster across several sheets, with an
 * optional frame and title. Millimetres throughout.
 */
import { PAPER_IDS, type PaperId } from "../domain/paper";

export type FrameStyle = "none" | "line" | "double" | "ornate";
export const FRAME_STYLES: FrameStyle[] = ["none", "line", "double", "ornate"];

export interface PosterSettings {
  paper: PaperId;
  /** Custom paper size. */
  width: number;
  height: number;
  orientation: "auto" | "portrait" | "landscape";
  /** Fit one sheet, or print at a chosen width (across several sheets if needed). */
  size: "page" | "custom";
  /** The poster's width (the trimmed artwork, frame included) in custom size. */
  printWidth: number;
  /** The printer's margins on every sheet. */
  margin: number;
  /** How much neighbouring sheets overlap, for gluing. */
  overlap: number;
  /** Extra image past the trim edge, for printers that cut. */
  bleed: number;
  /** Corner marks showing where to cut. */
  cropMarks: boolean;
  frame: FrameStyle;
  frameColor: string;
  /** The border and title band around the map (when there is a frame or title). */
  mat: string;
  title: string;
  subtitle: string;
}

export const DEFAULT_POSTER: PosterSettings = {
  paper: "A3",
  width: 297,
  height: 420,
  orientation: "auto",
  size: "page",
  printWidth: 600,
  margin: 8,
  overlap: 10,
  bleed: 0,
  cropMarks: true,
  frame: "none",
  frameColor: "#3a2e22",
  mat: "#f4ecd8",
  title: "",
  subtitle: "",
};

const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Imported projects are untrusted. */
export function validPoster(v: unknown): v is PosterSettings {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    PAPER_IDS.includes(p.paper as PaperId) &&
    finite(p.width, 50, 1500) &&
    finite(p.height, 50, 1500) &&
    ["auto", "portrait", "landscape"].includes(p.orientation as string) &&
    ["page", "custom"].includes(p.size as string) &&
    finite(p.printWidth, 30, 5000) &&
    finite(p.margin, 0, 50) &&
    finite(p.overlap, 0, 40) &&
    finite(p.bleed, 0, 10) &&
    typeof p.cropMarks === "boolean" &&
    FRAME_STYLES.includes(p.frame as FrameStyle) &&
    hex(p.frameColor) &&
    hex(p.mat) &&
    typeof p.title === "string" &&
    p.title.length <= 120 &&
    typeof p.subtitle === "string" &&
    p.subtitle.length <= 160
  );
}
