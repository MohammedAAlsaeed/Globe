"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs and signed URLs */
/**
 * Picks what paint (or a land layer's base) is made of: a texture, or a
 * flat colour with recent colours.
 *
 * The panel stays light: the texture in use (its preview opens the Texture
 * Catalog, ./TextureCatalog), this map's recently used textures and the
 * person's favourites — each with the way it was drawn — then scale, turn
 * and offsets. Browsing, searching and filtering happen in the catalog.
 */
import { useState, useSyncExternalStore } from "react";
import { Slider } from "../components/EditorControls";
import { Glyph } from "../glyphs";
import {
  ensureTextures,
  subscribeTextures,
  textureLabel,
  textureThumb,
  texturesVersion,
} from "./textures";
import { LookSwatch, TextureCatalog } from "./TextureCatalog";
import {
  favoriteSource,
  sameTextureLook,
  toggleFavorite,
  useTextureFavorites,
} from "./textureLibrary";
import { useTextureUsage } from "./textureUsage";
import type { PaintSource } from "../types";
import { DEFAULT_SOURCE } from "./presets";

type T = (k: string, opts?: Record<string, unknown>) => string;

export function SourcePicker({
  source,
  onChange,
  t,
  recentColors,
  onCommitColor,
  showType = true,
}: {
  source: PaintSource;
  onChange: (patch: Partial<PaintSource>) => void;
  t: T;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  /** The texture / colour switch (off when the caller has its own). */
  showType?: boolean;
}) {
  const [catalog, setCatalog] = useState(false),
    usage = useTextureUsage(),
    favorites = useTextureFavorites();
  // Previews of uploaded textures sharpen once their pictures arrive.
  useSyncExternalStore(subscribeTextures, texturesVersion, () => 0);
  const favorite = favorites.find((f) => sameTextureLook(f.source, source)),
    recent = usage.recent
      .filter((r) => !sameTextureLook(r, source))
      .slice(0, 8);

  /** Applies a whole look (a recent or favourite one), its picture first. */
  async function applyLook(look: PaintSource) {
    await ensureTextures([look.texture]);
    const { color: _color, ...rest } = favoriteSource(look);
    void _color;
    onChange(rest);
  }

  return (
    <>
      {showType && (
        <div className="mm-bp-segment small">
          <button
            className={source.type === "texture" ? "active" : ""}
            onClick={() => onChange({ type: "texture" })}
          >
            {t("mmSourceTexture")}
          </button>
          <button
            className={source.type === "color" ? "active" : ""}
            onClick={() => onChange({ type: "color" })}
          >
            {t("mmSourceColor")}
          </button>
        </div>
      )}
      {source.type === "texture" ? (
        <>
          <div className="mm-tx-current">
            <button
              className="mm-tx-current-swatch"
              title={t("txcOpen")}
              onClick={() => setCatalog(true)}
            >
              <img
                src={textureThumb(source.texture, source)}
                alt=""
                draggable={false}
              />
            </button>
            <div className="mm-tx-current-info">
              <b>{textureLabel(source.texture, t)}</b>
              <div className="mm-tx-current-actions">
                <button className="mm-pill" onClick={() => setCatalog(true)}>
                  <Glyph name="grid" size={13} />
                  {t("txcBrowse")}
                </button>
                <button
                  className={`mm-pill mm-tx-star ${favorite ? "selected" : ""}`}
                  aria-pressed={!!favorite}
                  title={favorite ? t("txcFavorited") : t("txcFavoriteHint")}
                  aria-label={t("txcFavorite")}
                  onClick={() => toggleFavorite(source)}
                >
                  <Glyph name="star" size={13} />
                </button>
              </div>
            </div>
          </div>
          {recent.length > 0 && (
            <div className="mm-tx-row">
              <span className="mm-tx-row-title">{t("txcRecent")}</span>
              <div className="mm-tx-swatches">
                {recent.map((look, i) => (
                  <LookSwatch
                    key={`${look.texture}-${i}`}
                    look={look}
                    selected={false}
                    title={textureLabel(look.texture, t)}
                    onClick={() => void applyLook(look)}
                  />
                ))}
              </div>
            </div>
          )}
          {favorites.length > 0 && (
            <div className="mm-tx-row">
              <span className="mm-tx-row-title">
                {t("txcFavorites")}
                <small>{t("txcFavoritesHint")}</small>
              </span>
              <div className="mm-tx-swatches">
                {favorites.map((f) => (
                  <LookSwatch
                    key={f.id}
                    look={f.source}
                    selected={sameTextureLook(f.source, source)}
                    title={textureLabel(f.source.texture, t)}
                    onClick={() => void applyLook(f.source)}
                    onRemove={() => toggleFavorite(f.source)}
                  />
                ))}
              </div>
            </div>
          )}
          <Slider
            label={t("mmTextureScale")}
            defaultValue={DEFAULT_SOURCE.textureScale}
            value={source.textureScale}
            min={0.25}
            max={4}
            step={0.05}
            onChange={(v) => onChange({ textureScale: v })}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <Slider
            label={t("mmTextureRotation")}
            defaultValue={DEFAULT_SOURCE.textureRotation}
            value={source.textureRotation}
            min={0}
            max={359}
            step={1}
            onChange={(v) => onChange({ textureRotation: v })}
            format={(v) => `${v}°`}
          />
          <Slider
            label={t("txcOffsetX")}
            defaultValue={0}
            value={source.textureOffsetX ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChange({ textureOffsetX: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            parse={(v) => v / 100}
          />
          <Slider
            label={t("txcOffsetY")}
            defaultValue={0}
            value={source.textureOffsetY ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChange({ textureOffsetY: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            parse={(v) => v / 100}
          />
          {catalog && (
            <TextureCatalog
              source={source}
              onPick={onChange}
              onClose={() => setCatalog(false)}
            />
          )}
        </>
      ) : (
        <div className="mm-bp-color">
          <input
            type="color"
            value={source.color}
            onChange={(e) => onChange({ color: e.target.value })}
            onBlur={(e) => onCommitColor(e.target.value)}
          />
          <div className="mm-recents-row">
            {recentColors.map((c) => (
              <button
                key={c}
                className="mm-color-chip"
                style={{ background: c }}
                onClick={() => onChange({ color: c })}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
