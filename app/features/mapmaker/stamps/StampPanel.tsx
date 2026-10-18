"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails are data URLs drawn at runtime */
/**
 * The Stamp Tool panel (left of the canvas while the Stamp tool is active,
 * or while stamps are selected): the catalog (search, categories, sets and
 * their variants), how stamps are placed and varied, and how they look —
 * size, rotation, flips, colors, color filters, opacity and shadow.
 *
 * The look controls edit the next stamps placed or, while stamps are
 * selected, those stamps (`editing`).
 */
import { useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Glyph } from "../glyphs";
import { ColorControl, Section, Slider, Toggle } from "../components/EditorControls";
import { BLEND_MODES } from "../brush/BrushPanel";
import { SourcePicker } from "../brush/SourcePicker";
import type { BlendMode, PaintSource, ShadowSettings, StampClip, StampShadowMode } from "../types";
import {
  STAMP_CATEGORIES,
  catalogVersion,
  searchSets,
  stampSet,
  subscribeCatalog,
  type StampCategory,
  type StampSet,
} from "./catalog";
import { DEFAULT_SHADOW, stampThumb } from "./render";
import { STAMP_TOOL_DEFAULTS, factoryLook, selectSet, type StampLook, type StampPlacement, type StampToolState } from "./state";

type T = (k: string, opts?: Record<string, unknown>) => string;

const PLACEMENTS: { key: StampPlacement; labelKey: string; hintKey: string; glyph: string }[] = [
  { key: "single", labelKey: "stPlaceSingle", hintKey: "stPlaceSingleHint", glyph: "stamp" },
  { key: "multiple", labelKey: "stPlaceMultiple", hintKey: "stPlaceMultipleHint", glyph: "scatter" },
  { key: "auto", labelKey: "stPlaceAuto", hintKey: "stPlaceAutoHint", glyph: "auto" },
];
const SHADOW_MODES: { key: StampShadowMode; labelKey: string }[] = [
  { key: "none", labelKey: "stShadowNone" },
  { key: "default", labelKey: "stShadowDefault" },
  { key: "layer", labelKey: "stShadowLayer" },
  { key: "custom", labelKey: "stShadowCustom" },
];
const CLIPS: { key: StampClip; labelKey: string }[] = [
  { key: "none", labelKey: "stClipNone" },
  { key: "texture", labelKey: "stClipTexture" },
  { key: "erase", labelKey: "stClipErase" },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

/** A catalog thumbnail (uploaded images may arrive a moment later). */
function Thumb({ asset, ink, fill }: { asset: string; ink?: string; fill?: string | null }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const url = stampThumb(asset, ink, fill, redraw);
  return url ? <img src={url} alt="" draggable={false} /> : <span className="mm-st-thumb-wait" />;
}

export interface StampUploads {
  signedIn: boolean;
  /** Bytes used / allowed by the plan. */
  used: number;
  quota: number;
  busy: boolean;
  error: string | null;
  onUpload: (files: File[], asSet: boolean) => void;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** "My stamps": upload your own pictures, within the plan's storage. */
function UploadBox({ u, t }: { u: StampUploads; t: T }) {
  const input = useRef<HTMLInputElement>(null),
    asSet = useRef(false);
  if (!u.signedIn)
    return (
      <div className="mm-st-upload">
        <p>{t("stUploadSignIn")}</p>
        <Link className="mm-pill" href={`/login?next=${encodeURIComponent("/editor")}`}>
          {t("acSignIn")}
        </Link>
      </div>
    );
  const pick = (set: boolean) => {
    asSet.current = set;
    input.current?.click();
  };
  return (
    <div className="mm-st-upload">
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) u.onUpload(files, asSet.current);
        }}
      />
      <div className="mm-st-upload-actions">
        <button className="mm-pill" disabled={u.busy} onClick={() => pick(false)}>
          <Glyph name="upload" size={13} />
          {t("stUpload")}
        </button>
        <button className="mm-pill" disabled={u.busy} onClick={() => pick(true)} title={t("stUploadSetHint")}>
          {t("stUploadSet")}
        </button>
      </div>
      <p className="mm-bp-hint">{u.busy ? t("stUploading") : t("stUploadHint")}</p>
      {u.error && (
        <p className="mm-st-upload-error" role="alert">
          {u.error}
        </p>
      )}
      {u.quota > 0 && (
        <div className="mm-st-quota" title={t("stQuota", { used: mb(u.used), quota: mb(u.quota) })}>
          <span>{t("stQuota", { used: mb(u.used), quota: mb(u.quota) })}</span>
          <div className={u.used >= u.quota ? "full" : ""}>
            <i style={{ width: `${Math.min(100, (u.used / u.quota) * 100)}%` }} />
          </div>
        </div>
      )}
      <Link className="mm-st-manage" href="/library">
        {t("stManage")}
      </Link>
    </div>
  );
}

export function setLabel(t: T, s: StampSet) {
  return s.labelKey ? t(s.labelKey) : (s.name ?? s.id);
}

export function StampPanel({
  state,
  onChange,
  editing,
  onEditLook,
  onDoneEditing,
  t,
  mapWidthPx,
  recentColors,
  onCommitColor,
  target,
  floating = false,
  uploads,
  defaultClipSource,
  layerBlends,
}: {
  state: StampToolState;
  onChange: (next: StampToolState) => void;
  /** Selected stamps being edited (their shared look), or null. */
  editing: { count: number; look: StampLook; vector: boolean; setId: string | null } | null;
  onEditLook: (patch: Partial<StampLook>) => void;
  onDoneEditing: () => void;
  t: T;
  mapWidthPx: number;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  target: ReactNode;
  /** Shown over the canvas (editing a selection with the Select tool). */
  floating?: boolean;
  /** Your own stamps: upload state, storage quota and the upload action. */
  uploads: StampUploads;
  /** Clip "texture" starts from this (the land texture of the layer below). */
  defaultClipSource: PaintSource;
  /** The layer blends as a whole: stamps' own blend modes don't apply. */
  layerBlends: boolean;
}) {
  // Server packs can arrive while the panel is open.
  const version = useSyncExternalStore(subscribeCatalog, catalogVersion, catalogVersion);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<StampCategory | "all">("all");
  const s = state,
    set = stampSet(s.set);
  const results = useMemo(
    () => searchSets(query, (x) => setLabel(t, x), query ? "all" : category),
    // `version` changes when server sets are added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, category, t, version],
  );

  const patch = (p: Partial<StampToolState>) => onChange({ ...s, ...p });
  const look = editing ? editing.look : s.look,
    vector = editing ? editing.vector : (set?.vector ?? true),
    // The set's own values: what each Reset returns to, and 100% size.
    factory = factoryLook(editing ? (editing.setId ? stampSet(editing.setId) : undefined) : set);
  const setLook = (p: Partial<StampLook>) => (editing ? onEditLook(p) : patch({ look: { ...s.look, ...p } }));
  const setShadow = (p: Partial<ShadowSettings>) => setLook({ customShadow: { ...look.customShadow, ...p } });
  const px = (v: number) => `${Math.max(1, Math.round(v * mapWidthPx))} px`;
  const placement = PLACEMENTS.find((p) => p.key === s.placement)!;

  return (
    <aside className={`mm-brush-panel mm-stamp-panel ${floating ? "floating" : ""}`} aria-label={t("stPanel")}>
      {target}
      {editing && (
        <div className="mm-st-editing">
          <span>{t("stEditing", { count: editing.count })}</span>
          <button className="mm-pill" onClick={onDoneEditing}>
            {t("stDone")}
          </button>
        </div>
      )}

      {!editing && (
        <>
          {/* ---- catalog ---- */}
          <div className="mm-st-search">
            <Glyph name="search" size={14} />
            <input
              type="search"
              value={query}
              placeholder={t("stSearch")}
              aria-label={t("stSearch")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {!query && (
            <div className="mm-bp-chips" role="tablist" aria-label={t("stCategories")}>
              {[{ key: "all" as const, labelKey: "stCatAll" }, ...STAMP_CATEGORIES].map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={category === c.key}
                  className={category === c.key ? "active" : ""}
                  onClick={() => setCategory(c.key)}
                >
                  {t(c.labelKey)}
                </button>
              ))}
            </div>
          )}
          {!query && category === "custom" && <UploadBox u={uploads} t={t} />}
          <div className="mm-st-sets" role="listbox" aria-label={t("stSets")}>
            {results.map((x) => (
              <button
                key={x.id}
                role="option"
                aria-selected={x.id === s.set}
                className={`mm-st-set ${x.id === s.set ? "selected" : ""} ${x.locked ? "locked" : ""}`}
                title={x.locked ? t("stLocked") : setLabel(t, x)}
                disabled={x.locked}
                onClick={() => onChange(selectSet(s, x))}
              >
                <Thumb asset={x.assets[0]} />
                <span>{setLabel(t, x)}</span>
                {x.assets.length > 1 && <small>{x.assets.length}</small>}
                {x.locked && <Glyph name="lock" size={12} />}
              </button>
            ))}
            {results.length === 0 && (
              <p className="mm-bp-hint">{t(!query && category === "custom" ? "stNoUploads" : "stNoResults")}</p>
            )}
          </div>

          {set && set.assets.length > 1 && (
            <div className="mm-st-variants">
              <button
                className={`mm-st-variant random ${s.randomVariant ? "selected" : ""}`}
                title={t("stRandomVariantHint")}
                onClick={() => patch({ randomVariant: true })}
              >
                <Glyph name="shuffle" size={16} />
              </button>
              {set.assets.map((a, i) => (
                <button
                  key={a}
                  className={`mm-st-variant ${!s.randomVariant && s.variant === i ? "selected" : ""}`}
                  title={t("stVariant", { n: i + 1 })}
                  onClick={() => patch({ variant: i, randomVariant: false })}
                >
                  <Thumb asset={a} ink={s.look.ink} fill={vector ? s.look.fill : undefined} />
                </button>
              ))}
            </div>
          )}

          {/* ---- placement ---- */}
          <div className="mm-bp-modes" role="radiogroup" aria-label={t("stPlacement")}>
            {PLACEMENTS.map((m) => (
              <button
                key={m.key}
                className={s.placement === m.key ? "active" : ""}
                onClick={() => patch({ placement: m.key })}
                role="radio"
                aria-checked={s.placement === m.key}
              >
                <Glyph name={m.glyph} size={18} />
                <span>{t(m.labelKey)}</span>
              </button>
            ))}
          </div>
          <p className="mm-bp-hint">{t(placement.hintKey)}</p>
          {s.placement !== "multiple" && (
            <Toggle label={t("stAutoSelect")} checked={s.autoSelect} onChange={(v) => patch({ autoSelect: v })} />
          )}
          {s.placement !== "single" && (
            <Section title={t("stScatter")} open>
              <Slider label={t("stSpacing")} defaultValue={STAMP_TOOL_DEFAULTS.spacing} value={s.spacing} min={0.2} max={3} step={0.05} onChange={(v) => patch({ spacing: v })} format={(v) => `×${v.toFixed(2)}`} />
              <Slider label={t("stSpread")} defaultValue={STAMP_TOOL_DEFAULTS.spread} value={s.spread} min={0} max={4} step={0.05} onChange={(v) => patch({ spread: v })} format={(v) => `×${v.toFixed(2)}`} />
              <Toggle label={t("stDepthSort")} checked={s.depthSort} onChange={(v) => patch({ depthSort: v })} />
            </Section>
          )}
          <Section title={t("stVariety")}>
            <Toggle label={t("stRandomVariant")} checked={s.randomVariant} onChange={(v) => patch({ randomVariant: v })} />
            <Slider label={t("stSizeJitter")} defaultValue={STAMP_TOOL_DEFAULTS.sizeJitter} value={s.sizeJitter} min={0} max={1} step={0.05} onChange={(v) => patch({ sizeJitter: v })} format={pct} />
            <Slider label={t("stRotationJitter")} defaultValue={set?.rotationJitter ?? 0} value={s.rotationJitter} min={0} max={180} step={1} onChange={(v) => patch({ rotationJitter: v })} format={(v) => `±${v}°`} />
            <Toggle label={t("stRandomFlip")} checked={s.randomFlip} onChange={(v) => patch({ randomFlip: v })} />
            <Slider label={t("stToneJitter")} defaultValue={STAMP_TOOL_DEFAULTS.toneJitter} value={s.toneJitter} min={0} max={1} step={0.05} onChange={(v) => patch({ toneJitter: v })} format={pct} />
          </Section>
        </>
      )}

      {/* ---- look: new stamps, or the selected ones ---- */}
      <Section title={t("stTransform")} open>
        <Slider
          label={t("stSize")}
          value={look.size}
          defaultValue={factory.size}
          min={Math.max(0.002, factory.size * 0.1)}
          max={Math.min(0.8, factory.size * 5)}
          step={factory.size * 0.01}
          onChange={(v) => setLook({ size: v })}
          format={(v) => `${Math.round((v / factory.size) * 100)}% · ${px(v)}`}
        />
        <Slider
          label={t("stRotation")}
          value={Math.round(look.rotation)}
          defaultValue={0}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setLook({ rotation: v })}
          format={(v) => `${v}°`}
        />
        <Slider
          label={t("stStretch")}
          value={look.stretch}
          defaultValue={1}
          min={0.5}
          max={2}
          step={0.01}
          onChange={(v) => setLook({ stretch: v })}
          format={pct}
        />
        <div className="mm-st-flips">
          <button className={`mm-pill ${look.flipX ? "selected" : ""}`} aria-pressed={look.flipX} onClick={() => setLook({ flipX: !look.flipX })}>
            <Glyph name="flipH" size={14} />
            {t("stFlipH")}
          </button>
          <button className={`mm-pill ${look.flipY ? "selected" : ""}`} aria-pressed={look.flipY} onClick={() => setLook({ flipY: !look.flipY })}>
            <Glyph name="flipV" size={14} />
            {t("stFlipV")}
          </button>
        </div>
        <span className="mm-bp-subtitle">{t("stPivot")}</span>
        <div className="mm-bp-segment" role="radiogroup" aria-label={t("stPivot")}>
          {(["base", "center"] as const).map((p) => (
            <button key={p} className={look.pivot === p ? "active" : ""} role="radio" aria-checked={look.pivot === p} onClick={() => setLook({ pivot: p })}>
              {t(p === "base" ? "stPivotBase" : "stPivotCenter")}
            </button>
          ))}
        </div>
        <p className="mm-bp-hint">{t(look.pivot === "base" ? "stPivotBaseHint" : "stPivotCenterHint")}</p>
        <div className="mm-st-resets">
          <button
            className="mm-pill"
            onClick={() => setLook({ size: factory.size, rotation: 0, stretch: 1, flipX: false, flipY: false })}
          >
            <Glyph name="reset" size={12} /> {t("stResetTransform")}
          </button>
          <button className="mm-pill" onClick={() => setLook(factory)} title={t("stResetAllHint")}>
            <Glyph name="reset" size={12} /> {t("stResetAll")}
          </button>
        </div>
      </Section>

      <Section title={t("stAppearance")} open>
        {vector && (
          <>
            <div className="mm-st-color-row">
              <span>{t("stInk")}</span>
              <ColorControl
                color={look.ink}
                recents={recentColors}
                onChange={(c) => {
                  setLook({ ink: c });
                  onCommitColor(c);
                }}
                label={t("stInk")}
                recentLabel={t("mmRecents")}
              />
            </div>
            <div className="mm-st-color-row">
              <span>{t("stFill")}</span>
              {look.fill ? (
                <ColorControl
                  color={look.fill}
                  recents={[]}
                  onChange={(c) => {
                    setLook({ fill: c });
                    onCommitColor(c);
                  }}
                  label={t("stFill")}
                  recentLabel={t("mmRecents")}
                />
              ) : (
                <span className="mm-bp-hint">{t("stNoFill")}</span>
              )}
            </div>
          </>
        )}
        <Slider label={t("stOpacity")} value={look.opacity} defaultValue={1} min={0.05} max={1} step={0.01} onChange={(v) => setLook({ opacity: v })} format={pct} />
        <Slider label={t("mmHue")} value={look.hue} defaultValue={0} min={-180} max={180} step={1} onChange={(v) => setLook({ hue: v })} format={(v) => `${Math.round(v)}°`} />
        <Slider label={t("mmSaturation")} value={look.saturation} defaultValue={0} min={-1} max={1} step={0.01} onChange={(v) => setLook({ saturation: v })} format={signed} />
        <Slider label={t("mmBrightness")} value={look.brightness} defaultValue={0} min={-1} max={1} step={0.01} onChange={(v) => setLook({ brightness: v })} format={signed} />
        <Slider label={t("mmContrast")} value={look.contrast} defaultValue={0} min={-1} max={1} step={0.01} onChange={(v) => setLook({ contrast: v })} format={signed} />
        {((look.hue || look.saturation || look.brightness || look.contrast) !== 0 || (vector && (look.ink !== factory.ink || look.fill !== factory.fill))) && (
          <button
            className="mm-pill"
            onClick={() => setLook({ hue: 0, saturation: 0, brightness: 0, contrast: 0, ...(vector ? { ink: factory.ink, fill: factory.fill } : {}) })}
          >
            <Glyph name="reset" size={12} /> {t("stResetColors")}
          </button>
        )}
      </Section>

      <Section title={t("stEffects")}>
        <label className="mm-bp-select-row">
          <span>{t("mmBlendMode")}</span>
          <select value={look.blend} disabled={layerBlends || look.clip === "erase"} onChange={(e) => setLook({ blend: e.target.value as BlendMode })}>
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`mmBlend_${b}`)}
              </option>
            ))}
          </select>
        </label>
        {layerBlends && <p className="mm-bp-hint">{t("stLayerBlends")}</p>}
        <span className="mm-bp-subtitle">{t("stClip")}</span>
        <div className="mm-bp-segment mm-st-clip-modes" role="radiogroup" aria-label={t("stClip")}>
          {CLIPS.map((c) => (
            <button
              key={c.key}
              className={look.clip === c.key ? "active" : ""}
              role="radio"
              aria-checked={look.clip === c.key}
              onClick={() =>
                setLook(c.key === "texture" && look.clip !== "texture" ? { clip: c.key, clipSource: defaultClipSource } : { clip: c.key })
              }
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        <p className="mm-bp-hint">{t(`${CLIPS.find((c) => c.key === look.clip)!.labelKey}Hint`)}</p>
        {look.clip === "texture" && (
          <SourcePicker
            source={look.clipSource}
            onChange={(p) => setLook({ clipSource: { ...look.clipSource, ...p } })}
            t={t}
            recentColors={recentColors}
            onCommitColor={onCommitColor}
          />
        )}
      </Section>

      <Section title={t("stShadow")}>
        <div className="mm-bp-segment mm-st-shadow-modes" role="radiogroup" aria-label={t("stShadow")}>
          {SHADOW_MODES.map((m) => (
            <button
              key={m.key}
              className={look.shadow === m.key ? "active" : ""}
              role="radio"
              aria-checked={look.shadow === m.key}
              onClick={() => setLook({ shadow: m.key })}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        <p className="mm-bp-hint">{t(`${SHADOW_MODES.find((m) => m.key === look.shadow)!.labelKey}Hint`)}</p>
        {look.shadow === "custom" && (
          <>
            <div className="mm-st-color-row">
              <span>{t("stShadowColor")}</span>
              <ColorControl color={look.customShadow.color} recents={[]} onChange={(c) => setShadow({ color: c })} label={t("stShadowColor")} recentLabel="" />
            </div>
            <Slider label={t("stOpacity")} defaultValue={DEFAULT_SHADOW.opacity} value={look.customShadow.opacity} min={0} max={1} step={0.01} onChange={(v) => setShadow({ opacity: v })} format={pct} />
            <Slider label={t("stShadowBlur")} defaultValue={DEFAULT_SHADOW.blur} value={look.customShadow.blur} min={0} max={0.5} step={0.01} onChange={(v) => setShadow({ blur: v })} format={pct} />
            <Slider label={t("stShadowDistance")} defaultValue={DEFAULT_SHADOW.distance} value={look.customShadow.distance} min={0} max={0.5} step={0.01} onChange={(v) => setShadow({ distance: v })} format={pct} />
            <Slider label={t("stShadowAngle")} defaultValue={DEFAULT_SHADOW.angle} value={look.customShadow.angle} min={0} max={359} step={1} onChange={(v) => setShadow({ angle: v })} format={(v) => `${v}°`} />
          </>
        )}
      </Section>
    </aside>
  );
}
