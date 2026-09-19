import type { GlobeSettings, MapLayer } from "../domain/types";
export interface RenderRequest {
  source: Blob;
  globe: GlobeSettings;
  layers: MapLayer[];
  dpi: number;
  mode: "gores" | "panorama";
  preview: boolean;
  indices?: number[];
}
export type RenderResponse =
  | { type: "progress"; value: number }
  | { type: "asset"; index: number; blob: Blob; width: number; height: number }
  | { type: "done" }
  | { type: "error"; message: string };
