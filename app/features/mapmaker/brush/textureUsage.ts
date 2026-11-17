/**
 * The textures a map uses: the "Recently used" row (this map's own looks,
 * newest first) and the catalog's "Used in this map" filter. Derived from
 * the map itself, so it is always right and needs no storage.
 */
import { createContext, useContext } from "react";
import type { MMLayer, PaintSource } from "../types";
import { favoriteSource, sameTextureLook } from "./textureLibrary";

export interface TextureUsage {
  /** Looks (texture + how it is drawn) in this map, newest first. */
  recent: PaintSource[];
  /** Every texture id in this map. */
  used: ReadonlySet<string>;
}
export const NO_USAGE: TextureUsage = { recent: [], used: new Set() };
export const TextureUsageContext = createContext<TextureUsage>(NO_USAGE);
export const useTextureUsage = () => useContext(TextureUsageContext);

/** The paint sources a layer holds, in drawing order (oldest first). */
export function layerSources(layer: MMLayer): PaintSource[] {
  const out: PaintSource[] = [];
  if (layer.land?.base) out.push(layer.land.base);
  for (const o of layer.objects) {
    if (o.kind === "paint") out.push(o.source);
    else if (o.kind === "stamp" && o.clip === "texture" && o.clipSource)
      out.push(o.clipSource);
    else if (o.kind === "shape" && o.fill.type === "texture")
      out.push(o.fill.source);
  }
  return out;
}

/** A map's texture usage (see TextureUsage). */
export function textureUsage(layers: MMLayer[], max = 10): TextureUsage {
  const used = new Set<string>(),
    recent: PaintSource[] = [];
  const all = layers.flatMap(layerSources).filter((s) => s.type === "texture");
  for (const s of all) used.add(s.texture);
  for (let i = all.length - 1; i >= 0 && recent.length < max; i--)
    if (!recent.some((r) => sameTextureLook(r, all[i])))
      recent.push(favoriteSource(all[i]));
  return { recent, used };
}
