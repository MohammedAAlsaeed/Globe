/**
 * Paper sizes shared by the globe and poster prints, in millimetres
 * (portrait: width × height).
 */
export const PAPERS = {
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
} as const;

export type PaperId = keyof typeof PAPERS | "custom";
export const PAPER_IDS = [...(Object.keys(PAPERS) as (keyof typeof PAPERS)[]), "custom"] as PaperId[];

/** A paper's size (custom: the given one). */
export function paperSize(paper: PaperId, width: number, height: number): [number, number] {
  return paper === "custom" ? [width, height] : [PAPERS[paper][0], PAPERS[paper][1]];
}
