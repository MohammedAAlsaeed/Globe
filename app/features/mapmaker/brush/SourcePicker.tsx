"use client";
/**
 * Picks what paint (or a land layer's base) is made of: a texture from the
 * catalog — filtered by category, with scale and rotation — or a flat
 * colour with recent colours.
 */
import { useState } from "react";
import { Slider } from "../components/EditorControls";
import {
  TEXTURES,
  TEXTURE_CATEGORIES,
  textureDef,
  textureThumb,
  type TextureCategory,
} from "./textures";
import type { PaintSource } from "../types";

type T = (k: string, opts?: Record<string, unknown>) => string;

export function SourcePicker({
  source,
  onChange,
  t,
  recentColors,
  onCommitColor,
}: {
  source: PaintSource;
  onChange: (patch: Partial<PaintSource>) => void;
  t: T;
  recentColors: string[];
  onCommitColor: (c: string) => void;
}) {
  const [texCategory, setTexCategory] = useState<TextureCategory | "all">(
    "all",
  );
  const textures =
    texCategory === "all"
      ? TEXTURES
      : TEXTURES.filter((x) => x.category === texCategory);
  return (
    <>
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
      {source.type === "texture" ? (
        <>
          <div className="mm-bp-chips">
            <button
              className={texCategory === "all" ? "active" : ""}
              onClick={() => setTexCategory("all")}
            >
              {t("mmTexCatAll")}
            </button>
            {TEXTURE_CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={texCategory === c.key ? "active" : ""}
                onClick={() => setTexCategory(c.key)}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
          <div className="mm-bp-texture-grid">
            {textures.map((x) => (
              <button
                key={x.id}
                className={source.texture === x.id ? "selected" : ""}
                title={t(x.labelKey)}
                onClick={() => onChange({ texture: x.id })}
                style={{ backgroundImage: `url(${textureThumb(x.id)})` }}
              >
                <span>{t(x.labelKey)}</span>
              </button>
            ))}
          </div>
          <div className="mm-bp-current">
            {t(textureDef(source.texture).labelKey)}
          </div>
          <Slider
            label={t("mmTextureScale")}
            value={source.textureScale}
            min={0.25}
            max={4}
            step={0.05}
            onChange={(v) => onChange({ textureScale: v })}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <Slider
            label={t("mmTextureRotation")}
            value={source.textureRotation}
            min={0}
            max={359}
            step={1}
            onChange={(v) => onChange({ textureRotation: v })}
            format={(v) => `${v}°`}
          />
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
