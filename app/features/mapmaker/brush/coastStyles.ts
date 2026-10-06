/**
 * Coast-effect defaults and ready-made styles (Inkarnate-style land layer
 * coastlines), plus resolving a layer's effective settings.
 */
import type { CoastEffect, MMLayer } from "../types";

export const DEFAULT_COAST: CoastEffect = {
  enabled: true,
  style: "classic",
  roughness: 0.5,
  detail: 0.7,
  smoothing: 0.4,
  islets: 0.35,
  outlineWidth: 0.0011,
  outlineColor: "#3a2f24",
  shoreWidth: 0.004,
  shoreStrength: 0.7,
  shoreColor: "#e6d3a3",
  landShade: 0,
  landShadeWidth: 0.01,
  glowWidth: 0.016,
  glowOpacity: 0.55,
  glowColor: "#8fd2d4",
  waves: 4,
  waveSpacing: 0.0065,
  waveOffset: 0.006,
  waveWidth: 0.0011,
  waveOpacity: 0.5,
  waveFade: 0.35,
  waveBreakup: 0.15,
  waveColor: "#e9f2f1",
  depthStrength: 0.45,
  depthDistance: 0.12,
  depthColor: "#0b2238",
};

export const COAST_STYLES: {
  id: string;
  labelKey: string;
  fx: Partial<CoastEffect>;
}[] = [
  { id: "classic", labelKey: "mmCoastClassic", fx: {} },
  {
    // Wide turquoise lagoons, pale beaches, gentle surf.
    id: "tropical",
    labelKey: "mmCoastTropical",
    fx: {
      roughness: 0.45,
      islets: 0.45,
      outlineWidth: 0.0008,
      outlineColor: "#4a3b2a",
      shoreWidth: 0.006,
      shoreStrength: 0.9,
      shoreColor: "#f1e2b6",
      glowWidth: 0.032,
      glowOpacity: 0.75,
      glowColor: "#76dcd2",
      waves: 2,
      waveOpacity: 0.35,
      waveOffset: 0.012,
      depthStrength: 0.5,
      depthDistance: 0.09,
      depthColor: "#0d3354",
    },
  },
  {
    // Old parchment map: inked coast and many fine inked wave lines.
    id: "ink",
    labelKey: "mmCoastInk",
    fx: {
      roughness: 0.6,
      detail: 0.85,
      outlineWidth: 0.0018,
      outlineColor: "#2b231b",
      shoreStrength: 0,
      landShade: 0.25,
      landShadeWidth: 0.008,
      glowOpacity: 0,
      waves: 6,
      waveSpacing: 0.0045,
      waveOffset: 0.004,
      waveWidth: 0.0008,
      waveOpacity: 0.55,
      waveFade: 0.25,
      waveBreakup: 0,
      waveColor: "#2b231b",
      depthStrength: 0,
    },
  },
  {
    // Rugged rocky coast: heavy detail, dark rim, a little surf.
    id: "cliffs",
    labelKey: "mmCoastCliffs",
    fx: {
      roughness: 0.85,
      detail: 1,
      smoothing: 0.2,
      islets: 0.5,
      outlineWidth: 0.0015,
      outlineColor: "#241d17",
      shoreStrength: 0,
      landShade: 0.5,
      landShadeWidth: 0.012,
      glowWidth: 0.007,
      glowOpacity: 0.45,
      glowColor: "#b9dfe0",
      waves: 2,
      waveSpacing: 0.005,
      waveOffset: 0.004,
      depthStrength: 0.4,
    },
  },
  {
    // Icy northern shores.
    id: "arctic",
    labelKey: "mmCoastArctic",
    fx: {
      roughness: 0.55,
      outlineColor: "#4b5b66",
      shoreColor: "#f4f7fb",
      shoreStrength: 0.8,
      glowWidth: 0.02,
      glowOpacity: 0.6,
      glowColor: "#d7f1f8",
      waves: 3,
      waveColor: "#ffffff",
      depthColor: "#1b3a52",
      depthStrength: 0.35,
    },
  },
  {
    // Watercolor: no lines, soft glow and beach.
    id: "soft",
    labelKey: "mmCoastSoft",
    fx: {
      roughness: 0.35,
      smoothing: 0.7,
      islets: 0.15,
      outlineWidth: 0,
      shoreWidth: 0.006,
      shoreStrength: 0.5,
      glowWidth: 0.03,
      glowOpacity: 0.45,
      waves: 0,
      depthStrength: 0.3,
    },
  },
  {
    // Just a natural edge and a thin outline.
    id: "minimal",
    labelKey: "mmCoastMinimal",
    fx: {
      roughness: 0.4,
      islets: 0,
      outlineWidth: 0.0009,
      shoreStrength: 0,
      glowOpacity: 0,
      waves: 0,
      depthStrength: 0,
    },
  },
];

export function coastStyle(id: string): CoastEffect {
  const s = COAST_STYLES.find((x) => x.id === id) ?? COAST_STYLES[0];
  return { ...DEFAULT_COAST, ...s.fx, enabled: true, style: s.id };
}

/** The layer's effective coast settings, or null when the effect is off.
 * Land layers have it on by default; any layer can switch it on. */
// Same input object → same resolved object, so effects that depend on it
// only re-run when the layer's coast settings really change.
const resolved = new WeakMap<CoastEffect, CoastEffect>();
export function resolveCoast(layer: MMLayer): CoastEffect | null {
  const own = layer.coast;
  if (!own) return layer.role === "land" ? DEFAULT_COAST : null;
  if (!own.enabled) return null;
  let fx = resolved.get(own);
  if (!fx) {
    fx = { ...DEFAULT_COAST, ...own };
    resolved.set(own, fx);
  }
  return fx;
}

/** Stable per-layer seed, so a layer's coastline never changes between renders. */
export function layerSeed(layerId: string) {
  let h = 2166136261;
  for (let i = 0; i < layerId.length; i++)
    h = Math.imul(h ^ layerId.charCodeAt(i), 16777619);
  return h >>> 0;
}
