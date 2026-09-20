/**
 * Map-creator icon set. Each icon is authored in a 24×24 box (matching the
 * app's existing ornament icons) using only M/L/Q/Z path commands, so the
 * same path data renders identically through Path2D (worker/export canvas)
 * and Konva.Path (interactive editor). `stroke` is drawn with the object's
 * color at a fixed local line width; `fill` (when present) is a small solid
 * accent drawn in the same color.
 */
export type IconId =
  | "mountain"
  | "hill"
  | "forest"
  | "tree"
  | "town"
  | "city"
  | "capital"
  | "castle"
  | "ruins"
  | "star"
  | "compass"
  | "volcano"
  | "lake"
  | "desert"
  | "cave"
  | "bridge"
  | "tower"
  | "temple"
  | "lighthouse"
  | "windmill"
  | "mine"
  | "farm"
  | "ship"
  | "camp";
export interface IconDefinition {
  id: IconId;
  stroke?: string;
  fill?: string;
  labelKey: string;
}
export const ICON_IDS: IconId[] = [
  "mountain",
  "hill",
  "volcano",
  "forest",
  "tree",
  "desert",
  "lake",
  "cave",
  "town",
  "city",
  "capital",
  "castle",
  "tower",
  "temple",
  "lighthouse",
  "windmill",
  "bridge",
  "mine",
  "farm",
  "ship",
  "camp",
  "ruins",
  "star",
  "compass",
];
export const ICONS: Record<IconId, IconDefinition> = {
  mountain: {
    id: "mountain",
    stroke: "M2 19L8 8L11 13L14 6L22 19Z",
    labelKey: "mountain",
  },
  hill: {
    id: "hill",
    stroke: "M2 19Q12 5 22 19Z",
    labelKey: "hill",
  },
  volcano: {
    id: "volcano",
    stroke: "M3 20L9 8L11 12L12 9L13 12L15 8L21 20Z",
    fill: "M12 5Q13.4 6.4 12 7.8Q10.6 6.4 12 5Z",
    labelKey: "volcano",
  },
  forest: {
    id: "forest",
    stroke:
      "M2 18L5 11L8 18ZM5 18L5 20M16 18L19 11L22 18ZM19 18L19 20M7 19L12 7L17 19ZM12 19L12 21",
    labelKey: "forest",
  },
  tree: {
    id: "tree",
    stroke: "M12 6Q18 6 18 12Q18 18 12 18Q6 18 6 12Q6 6 12 6ZM12 18L12 21",
    labelKey: "tree",
  },
  desert: {
    id: "desert",
    stroke: "M2 18Q7 11 12 18Q17 11 22 18",
    fill: "M18 4L19.4 5.4L18 6.8L16.6 5.4Z",
    labelKey: "desertIcon",
  },
  lake: {
    id: "lake",
    stroke: "M2 10Q7 7 12 10Q17 13 22 10M2 15Q7 12 12 15Q17 18 22 15",
    labelKey: "lake",
  },
  cave: {
    id: "cave",
    stroke: "M2 20L9 6L16 20ZM10.5 20L10.5 14Q12 11.5 13.5 14L13.5 20",
    labelKey: "cave",
  },
  town: {
    id: "town",
    stroke: "M4 20L4 12L12 5L20 12L20 20ZM12 20L12 15",
    labelKey: "town",
  },
  city: {
    id: "city",
    stroke:
      "M3 20L3 11L8 11L8 20M10 20L10 7L15 7L15 20M17 20L17 13L22 13L22 20",
    labelKey: "city",
  },
  capital: {
    id: "capital",
    stroke: "M3 21L3 15L7 15L7 21M9 21L9 12L13 12L13 21M15 21L15 16L19 16L19 21",
    fill: "M12 2L13.2 4.8L16 6L13.2 7.2L12 10L10.8 7.2L8 6L10.8 4.8Z",
    labelKey: "capital",
  },
  castle: {
    id: "castle",
    stroke:
      "M6 20L6 10L19 10L19 20M6 10L6 6L9 6L9 10M10.5 10L10.5 6L13.5 6L13.5 10M16 10L16 6L19 6L19 10M11 20L11 15L14 15L14 20",
    labelKey: "castle",
  },
  tower: {
    id: "tower",
    stroke:
      "M9 20L9 8L15 8L15 20ZM9 8L7 5L17 5L15 8M11 20L11 15L13 15L13 20",
    labelKey: "tower",
  },
  temple: {
    id: "temple",
    stroke:
      "M2 9L12 3L22 9ZM3 9L3 20M21 9L21 20M2 20L22 20M7 9L7 20M11 9L11 20M15 9L15 20M19 9L19 20",
    labelKey: "temple",
  },
  lighthouse: {
    id: "lighthouse",
    stroke:
      "M10 20L10 10L12 3L14 10L14 20ZM8 20L16 20M10 13L14 13M10 16L14 16",
    fill: "M12 3L15 1.5L15 4.5Z",
    labelKey: "lighthouse",
  },
  windmill: {
    id: "windmill",
    stroke:
      "M10 20L10 10L14 10L14 20ZM12 10L12 3M12 3L16.5 5M12 3L7.5 5M12 3L16.5 1M12 3L7.5 1",
    labelKey: "windmill",
  },
  bridge: {
    id: "bridge",
    stroke:
      "M2 16Q12 6 22 16M4 16L4 20M9 16L9 20M14 16L14 20M19 16L19 20",
    labelKey: "bridge",
  },
  mine: {
    id: "mine",
    stroke:
      "M4 20L4 12L8 8L16 8L20 12L20 20ZM4 14L20 14M9 20L9 14M15 20L15 14",
    labelKey: "mine",
  },
  farm: {
    id: "farm",
    stroke:
      "M4 20L4 11L12 5L20 11L20 20ZM4 11L20 11M9 20L9 14L15 14L15 20",
    labelKey: "farm",
  },
  ship: {
    id: "ship",
    stroke: "M4 16L20 16L17 21L7 21ZM12 16L12 4M12 5L18 9L12 9Z",
    labelKey: "ship",
  },
  camp: {
    id: "camp",
    stroke: "M4 20L12 6L20 20ZM8 20L12 12L16 20",
    labelKey: "camp",
  },
  ruins: {
    id: "ruins",
    stroke:
      "M2 20L22 20M6 20L6 13L8 11L6 9M12 20L12 15L14 13L12 11M16 19L22 19L22 21L16 21Z",
    labelKey: "ruins",
  },
  star: {
    id: "star",
    fill: "M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z",
    labelKey: "star",
  },
  compass: {
    id: "compass",
    stroke:
      "M12 3Q21 3 21 12Q21 21 12 21Q3 21 3 12Q3 3 12 3ZM12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z",
    labelKey: "compass",
  },
};
