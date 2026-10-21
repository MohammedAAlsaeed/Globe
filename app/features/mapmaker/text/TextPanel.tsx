"use client";
/**
 * The Text Tool panel (left of the canvas while the Text tool is active, or
 * floating over it while texts are selected with the Select tool):
 *
 *   styles      built-in presets (Kingdom, Ocean, City…), the person's own
 *               (saved to their account) and official ones
 *   content     the words (also typed on the map), direction, language
 *   lettering   font profile or a font by hand, size, weight, italic,
 *               capitals, spacing, line height, alignment, kashida
 *   appearance  colour, opacities, blend mode
 *   outline / shadow
 *   curve       straight, arc up/down, along a path; how letters follow it
 *   transform   rotation, wrapping width, position (one text)
 *   advanced    OpenType features, following a stamp
 *
 * Changes apply live — to the next text when nothing is selected, or to the
 * selected texts only (see ./state). Every setting resets on its own to the
 * text's style; "Reset all" resets the look but keeps the words and place.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Glyph } from "../glyphs";
import {
  ColorControl,
  Section,
  Slider,
  Toggle,
} from "../components/EditorControls";
import { ResetButton } from "@/components/ui/ValueEditor";
import { BLEND_MODES } from "../brush/BrushPanel";
import type {
  BlendMode,
  LineJoin,
  MMText,
  TextAlign,
  TextLook,
  TextPath,
} from "../types";
import { fontDef, fontProfile, profileSlot } from "./fonts";
import { FONT_FILE_INFO } from "./fontInfo.generated";
import { fontWeights, hasItalic, pickFile } from "./fontStore";
import { FontName, FontPicker } from "./FontPicker";
import { scriptsIn } from "./scripts";
import type { ShapedText } from "./shape";
import {
  BUILTIN_TEXT_STYLES,
  DEFAULT_TEXT_PATH,
  HISTORIC_COLORS,
  type TextStyle,
  type TextToolState,
} from "./state";
import { TextSample } from "./TextSample";

type T = (k: string, opts?: Record<string, unknown>) => string;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const em = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

export interface TextLibrary {
  signedIn: boolean;
  own: TextStyle[];
  official: TextStyle[];
  max: number | null;
  busy: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onLimit: () => void;
}

export interface TextActions {
  onUseForNew: () => void;
  /** Texts elsewhere on the map made with the same style (not selected). */
  sameStyleCount: number;
  /** Gives them this look too ("Text Style Sync"). */
  onSyncStyle: () => void;
  onEditInline: () => void;
  onEditPath: () => void;
  editingPath: boolean;
  onPickStamp: () => void;
  pickingStamp: boolean;
  onDetach: () => void;
  /** The stamp it follows (its name), or null. */
  attachedTo: string | null;
}

const ALIGNS: { key: TextAlign; glyph: string; labelKey: string }[] = [
  { key: "left", glyph: "alignLeft", labelKey: "txAlignLeft" },
  { key: "center", glyph: "alignCenterX", labelKey: "txAlignCenter" },
  { key: "right", glyph: "alignRight", labelKey: "txAlignRight" },
  { key: "start", glyph: "alignStart", labelKey: "txAlignStart" },
  { key: "end", glyph: "alignEnd", labelKey: "txAlignEnd" },
];
const LANGS = [
  "",
  "ar",
  "fa",
  "ur",
  "en",
  "fr",
  "es",
  "de",
  "he",
  "el",
  "ru",
  "hi",
  "zh",
  "ja",
  "ko",
];
/** Features offered when the font has them: [tag, on by default]. */
const FEATURES: [string, boolean][] = [
  ["liga", true],
  ["calt", true],
  ["kern", true],
  ["dlig", false],
  ["swsh", false],
  ["cswh", false],
  ["hlig", false],
  ["salt", false],
  ["smcp", false],
  ["c2sc", false],
  ["onum", false],
  ["lnum", false],
  ["pnum", false],
  ["tnum", false],
  ["frac", false],
  ["ss01", false],
  ["ss02", false],
  ["ss03", false],
  ["ss04", false],
  ["ss05", false],
];
const SHADOW_PRESETS: { key: string; shadow: Partial<TextLook["shadow"]> }[] = [
  {
    key: "soft",
    shadow: {
      color: "#000000",
      opacity: 0.35,
      blur: 0.14,
      offsetX: 0.03,
      offsetY: 0.05,
    },
  },
  {
    key: "manuscript",
    shadow: {
      color: "#3b2a1a",
      opacity: 0.45,
      blur: 0.05,
      offsetX: 0.04,
      offsetY: 0.04,
    },
  },
  {
    key: "stone",
    shadow: {
      color: "#000000",
      opacity: 0.7,
      blur: 0.02,
      offsetX: 0.07,
      offsetY: 0.09,
    },
  },
  {
    key: "glow",
    shadow: {
      color: "#f3e7c9",
      opacity: 0.85,
      blur: 0.35,
      offsetX: 0,
      offsetY: 0,
    },
  },
];

/** A colour with typed hex (alpha too), palettes and the eyedropper. */
function ColorField({
  label,
  color,
  base,
  alpha,
  onChange,
  onAlpha,
  recents,
  mapColors,
  t,
}: {
  label: string;
  color: string;
  /** The style's colour (the reset button returns to it). */
  base: string;
  alpha?: number;
  onChange: (c: string) => void;
  onAlpha?: (a: number) => void;
  recents: string[];
  mapColors: string[];
  t: T;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const hex =
    alpha !== undefined && alpha < 1
      ? `${color}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")}`
      : color;
  const eyedropper = typeof window !== "undefined" && "EyeDropper" in window;
  const commit = () => {
    if (draft === null) return;
    const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(draft.trim());
    setDraft(null);
    if (!m) return;
    onChange(`#${m[1].toLowerCase()}`);
    if (m[2] && onAlpha)
      onAlpha(Math.round((parseInt(m[2], 16) / 255) * 100) / 100);
  };
  return (
    <div className="mm-tx-color">
      <div className="mm-st-color-row">
        <span>{label}</span>
        <span className="mm-tx-color-main">
          <ColorControl
            color={color}
            recents={recents}
            onChange={onChange}
            label={label}
            recentLabel={t("mmRecents")}
          />
          <ResetButton
            value={color.toLowerCase() === base.toLowerCase() ? 0 : 1}
            defaultValue={0}
            onReset={() => onChange(base)}
            label={label}
            format={() => base}
            className="mm-reset"
          />
        </span>
      </div>
      <div className="mm-tx-color-tools">
        <input
          className="mm-tx-hex"
          value={draft ?? hex}
          aria-label={t("txHex")}
          spellCheck={false}
          onFocus={() => setDraft(hex)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(null);
          }}
        />
        {eyedropper && (
          <button
            className="mm-bp-icon-button"
            title={t("txEyedropper")}
            onClick={async () => {
              try {
                const r = await new (
                  window as unknown as {
                    EyeDropper: new () => {
                      open(): Promise<{ sRGBHex: string }>;
                    };
                  }
                ).EyeDropper().open();
                if (/^#[0-9a-f]{6}$/i.test(r.sRGBHex))
                  onChange(r.sRGBHex.toLowerCase());
              } catch {}
            }}
          >
            <Glyph name="eyedropper" size={14} />
          </button>
        )}
      </div>
      <div
        className="mm-tx-swatches"
        role="group"
        aria-label={t("txHistoricColors")}
      >
        {HISTORIC_COLORS.map((c) => (
          <button
            key={c.key}
            title={t(`txColor_${c.key}`)}
            style={{ background: c.color }}
            className={c.color === color ? "on" : ""}
            onClick={() => onChange(c.color)}
          />
        ))}
      </div>
      {mapColors.length > 0 && (
        <div
          className="mm-tx-swatches"
          role="group"
          aria-label={t("txMapColors")}
          title={t("txMapColors")}
        >
          {mapColors.map((c) => (
            <button
              key={c}
              style={{ background: c }}
              className={c === color ? "on" : ""}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A row of choices with a reset button that returns to the style's value. */
function Choice<V extends string>({
  label,
  value,
  base,
  options,
  onChange,
  small = true,
}: {
  label: string;
  value: V;
  base: V;
  options: { key: V; label: ReactNode; title?: string }[];
  onChange: (v: V) => void;
  small?: boolean;
}) {
  const b = options.find((o) => o.key === base);
  const baseText =
    typeof b?.label === "string" ? b.label : (b?.title ?? String(base));
  return (
    <div className="mm-tx-choice">
      <span className="mm-bp-subtitle">{label}</span>
      <div className="mm-reset-row">
        <div
          className={`mm-bp-segment ${small ? "small" : ""}`}
          role="radiogroup"
          aria-label={label}
        >
          {options.map((o) => (
            <button
              key={o.key}
              role="radio"
              aria-checked={value === o.key}
              className={value === o.key ? "active" : ""}
              title={o.title}
              onClick={() => onChange(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <ResetButton
          value={value === base ? 0 : 1}
          defaultValue={0}
          onReset={() => onChange(base)}
          label={label}
          format={() => baseText}
          className="mm-reset"
        />
      </div>
    </div>
  );
}

export function TextPanel({
  state,
  onChange,
  editing,
  onEditLook,
  onEditText,
  onDoneEditing,
  baseLook,
  shaped,
  actions,
  library,
  t,
  mapWidthPx,
  mapHeightPx,
  recentColors,
  onCommitColor,
  mapColors,
  target,
  floating = false,
}: {
  state: TextToolState;
  onChange: (next: TextToolState) => void;
  /** Selected texts (the first one's look), or null. */
  editing: {
    count: number;
    look: TextLook;
    styleId: string | null;
    single: MMText | null;
  } | null;
  /** A change to the selected texts' look (`key` merges a slider drag into one undo step). */
  onEditLook: (
    change: (look: TextLook) => TextLook,
    key: string,
    styleId?: string | null,
  ) => void;
  /** A change to the one selected text's own fields (words, box, rotation, path…). */
  onEditText: (patch: Partial<MMText>, key: string) => void;
  onDoneEditing: () => void;
  baseLook: TextLook;
  /** The selected text's (or the tool sample's) layout: warnings about fonts. */
  shaped: ShapedText | null;
  actions: TextActions | null;
  library: TextLibrary;
  t: T;
  mapWidthPx: number;
  mapHeightPx: number;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  mapColors: string[];
  target: ReactNode;
  floating?: boolean;
}) {
  const look = editing ? editing.look : state.look,
    styleId = editing ? editing.styleId : state.styleId,
    single = editing?.single ?? null;
  const [picker, setPicker] = useState(false),
    [styleName, setStyleName] = useState(""),
    [savingStyle, setSavingStyle] = useState(false);
  /** Changes the look (of the selection, or the tool's). */
  const set = (
    change: (l: TextLook) => TextLook,
    key: string,
    applied?: string | null,
  ) => {
    if (editing) onEditLook(change, key, applied);
    else
      onChange({
        ...state,
        look: change(state.look),
        styleId:
          applied === undefined
            ? key === "style"
              ? state.styleId
              : null
            : applied,
      });
  };
  const patch = (p: Partial<TextLook>, key: string) =>
    set((l) => ({ ...l, ...p }), key);
  const setOutline = (p: Partial<TextLook["outline"]>, key: string) =>
    set((l) => ({ ...l, outline: { ...l.outline, ...p } }), `outline.${key}`);
  const setShadow = (p: Partial<TextLook["shadow"]>, key: string) =>
    set((l) => ({ ...l, shadow: { ...l.shadow, ...p } }), `shadow.${key}`);
  const base = baseLook;
  const px = (v: number) => `${Math.max(1, Math.round(v * mapWidthPx))} px`;
  const sampleText = single?.text ?? (state.sample || t("txSampleText"));

  // The font that sets weights/italic: the hand-picked one, else the profile's
  // face for the text's main script.
  const scripts = useMemo(() => scriptsIn(sampleText), [sampleText]);
  const mainScript =
    scripts.has("arabic") && !scripts.has("latin")
      ? "arabic"
      : scripts.has("arabic")
        ? "arabic"
        : "latin";
  const profile = fontProfile(look.profile);
  const mainFont =
    fontDef(look.font) ??
    fontDef(profileSlot(profile, mainScript)?.font) ??
    fontDef("noto-serif")!;
  const weights = fontWeights(mainFont, look.italic);
  const italicOk = hasItalic(mainFont);
  const mainFile = pickFile(mainFont, look.weight, look.italic);
  const features = mainFile
    ? (FONT_FILE_INFO[mainFile.file.path]?.features ?? [])
    : [];
  const arabic = scripts.has("arabic");

  const applyStyle = (s: TextStyle) =>
    set(
      // A text on a path stays on it; its words, place and box stay too.
      (l) => ({
        ...s.look,
        ...(l.curveMode === "path"
          ? { curveMode: "path" as const, letters: l.letters }
          : {}),
      }),
      "style",
      s.id,
    );
  const ownCount = library.own.length,
    atLimit = library.max !== null && ownCount >= library.max;
  const styleButton = (s: TextStyle) => (
    <div
      key={s.id}
      className={`mm-ln-style mm-tx-style ${styleId === s.id ? "selected" : ""} ${s.locked ? "locked" : ""}`}
    >
      <button
        title={s.locked ? t("lnStyleLocked") : (s.name ?? t(s.labelKey ?? ""))}
        disabled={s.locked}
        onClick={() => applyStyle(s)}
      >
        <TextSample
          text={s.name ?? t(s.labelKey ?? "")}
          look={{
            ...s.look,
            curveMode: s.look.curveMode === "arc" ? "arc" : "straight",
          }}
          height={26}
          background="#e9dcc0"
        />
        <span>{s.name ?? t(s.labelKey ?? "")}</span>
        {s.locked && <Glyph name="lock" size={11} />}
      </button>
      {s.source === "own" && (
        <button
          className="mm-ln-style-del"
          title={t("lnStyleDelete")}
          aria-label={t("lnStyleDelete")}
          onClick={() => library.onDelete(s.id)}
        >
          <Glyph name="close" size={10} />
        </button>
      )}
    </div>
  );

  // Font warnings from the layout.
  const notes: string[] = [];
  for (const sub of shaped?.substitutes ?? [])
    notes.push(
      t("txSubstitute", {
        script: t(`txScript_${sub.script}`),
        font: fontDef(sub.font)?.family ?? sub.font,
      }),
    );
  for (const s of shaped?.unsupported ?? [])
    notes.push(t("txUnsupported", { script: t(`txScript_${s}`) }));
  for (const m of shaped?.styleMissing ?? []) {
    const f = fontDef(m.font)?.family ?? m.font;
    if (m.weight) notes.push(t("txNoWeight", { font: f }));
    if (m.italic) notes.push(t("txNoItalic", { font: f }));
  }
  if (
    look.font &&
    fontDef(look.font) &&
    !fontDef(look.font)!.files.length &&
    fontDef(look.font)!.source !== "web"
  )
    notes.push(t("txUnknownFont"));

  const path: TextPath | undefined = single?.path;
  const setPath = (p: Partial<TextPath>, key: string) =>
    single && path && onEditText({ path: { ...path, ...p } }, `path.${key}`);
  const curveKind =
    look.curveMode === "arc"
      ? look.curve < 0
        ? "down"
        : "up"
      : look.curveMode;

  return (
    <aside
      className={`mm-brush-panel mm-line-panel mm-text-panel ${floating ? "floating" : ""}`}
      aria-label={t("txPanel")}
    >
      {target}
      {editing ? (
        <div className="mm-st-editing">
          <span>{t("txEditing", { count: editing.count })}</span>
          <button className="mm-pill" onClick={onDoneEditing}>
            {t("stDone")}
          </button>
        </div>
      ) : (
        <p className="mm-bp-hint">{t("txToolHint")}</p>
      )}
      {editing && actions && (
        <div className="mm-st-flips">
          {single && (
            <button
              className="mm-pill"
              onClick={actions.onEditInline}
              title={t("txEditInlineHint")}
            >
              <Glyph name="text" size={13} />
              {t("txEditInline")}
            </button>
          )}
          <button
            className="mm-pill"
            onClick={actions.onUseForNew}
            title={t("txUseForNewHint")}
          >
            <Glyph name="check" size={13} />
            {t("txUseForNew")}
          </button>
          {actions.sameStyleCount > 0 && (
            <button
              className="mm-pill"
              onClick={actions.onSyncStyle}
              title={t("txSyncStyleHint")}
            >
              <Glyph name="duplicate" size={13} />
              {t("txSyncStyle", { count: actions.sameStyleCount })}
            </button>
          )}
        </div>
      )}

      {/* ---- styles ---- */}
      <Section title={t("txStyles")} open={!editing}>
        <div className="mm-ln-styles mm-tx-styles">
          {BUILTIN_TEXT_STYLES.map(styleButton)}
        </div>
        {library.official.length > 0 && (
          <>
            <span className="mm-bp-subtitle">{t("txStylesOfficial")}</span>
            <div className="mm-ln-styles mm-tx-styles">
              {library.official.map(styleButton)}
            </div>
          </>
        )}
        <span className="mm-bp-subtitle">{t("txStylesOwn")}</span>
        {library.signedIn ? (
          <>
            {library.own.length > 0 ? (
              <div className="mm-ln-styles mm-tx-styles">
                {library.own.map(styleButton)}
              </div>
            ) : (
              <p className="mm-bp-hint">{t("txStylesOwnEmpty")}</p>
            )}
            {savingStyle ? (
              <form
                className="mm-ln-save"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!styleName.trim()) return;
                  library.onSave(styleName.trim());
                  setStyleName("");
                  setSavingStyle(false);
                }}
              >
                <input
                  autoFocus
                  value={styleName}
                  maxLength={60}
                  placeholder={t("txStyleNamePlaceholder")}
                  onChange={(e) => setStyleName(e.target.value)}
                />
                <button
                  className="mm-pill"
                  type="submit"
                  disabled={!styleName.trim() || library.busy}
                >
                  {t("lnStyleSave")}
                </button>
                <button
                  className="mm-pill"
                  type="button"
                  onClick={() => setSavingStyle(false)}
                >
                  {t("mmCancelDraft")}
                </button>
              </form>
            ) : (
              <button
                className={`mm-pill ${atLimit ? "mm-ln-save-locked" : ""}`}
                disabled={library.busy}
                onClick={() =>
                  atLimit ? library.onLimit() : setSavingStyle(true)
                }
                aria-haspopup={atLimit ? "dialog" : undefined}
              >
                <Glyph name={atLimit ? "lock" : "plus"} size={12} />
                {t("txStyleSaveCurrent")}
              </button>
            )}
            {library.max !== null && (
              <p className={`mm-bp-hint mm-ln-count ${atLimit ? "full" : ""}`}>
                {t("txStyleCount", { count: ownCount, max: library.max })}
                {atLimit && (
                  <>
                    {" · "}
                    {t("lnStyleLimitReached")}
                    {" · "}
                    <button
                      type="button"
                      className="mm-ln-upgrade"
                      onClick={library.onLimit}
                    >
                      {t("lnStyleUpgrade")}
                    </button>
                  </>
                )}
              </p>
            )}
            {library.error && (
              <p className="mm-st-upload-error" role="alert">
                {library.error}
              </p>
            )}
          </>
        ) : (
          <div className="mm-st-upload">
            <p>{t("txStylesSignIn")}</p>
            <Link
              className="mm-pill"
              href={`/login?next=${encodeURIComponent("/editor")}`}
            >
              {t("acSignIn")}
            </Link>
          </div>
        )}
      </Section>

      {/* ---- content ---- */}
      <Section title={t("txContent")} open>
        {single ? (
          <textarea
            className="mm-tx-content"
            dir="auto"
            rows={Math.min(6, Math.max(2, single.text.split("\n").length + 1))}
            value={single.text}
            maxLength={2000}
            aria-label={t("txContent")}
            onChange={(e) =>
              e.target.value.length > 0 &&
              onEditText({ text: e.target.value }, "text")
            }
          />
        ) : !editing ? (
          <label className="mm-ln-name">
            <span>{t("txNewTextStarts")}</span>
            <input
              dir="auto"
              value={state.sample}
              maxLength={200}
              placeholder={t("txNewTextEmpty")}
              onChange={(e) => onChange({ ...state, sample: e.target.value })}
            />
          </label>
        ) : (
          <p className="mm-bp-hint">{t("txManySelected")}</p>
        )}
        <Choice
          label={t("txDirection")}
          value={look.direction}
          base={base.direction}
          options={[
            { key: "auto", label: t("txDirAuto"), title: t("txDirAutoHint") },
            { key: "rtl", label: t("txDirRtl") },
            { key: "ltr", label: t("txDirLtr") },
          ]}
          onChange={(v) => patch({ direction: v }, "direction")}
        />
        <label className="mm-ln-select">
          <span>{t("txLanguage")}</span>
          <select
            value={look.lang}
            onChange={(e) => patch({ lang: e.target.value }, "lang")}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(l ? `txLang_${l}` : "txLang_auto")}
              </option>
            ))}
          </select>
        </label>
      </Section>

      {/* ---- lettering ---- */}
      <Section title={t("txLettering")} open>
        <button
          className="mm-tx-font-button"
          onClick={() => setPicker((v) => !v)}
          aria-expanded={picker}
        >
          <span className="mm-tx-font-button-label">
            <small>{look.font ? t("txFont") : t("txProfile")}</small>
            <b>
              {look.font
                ? (fontDef(look.font)?.family ?? look.font)
                : t(`txProfile_${profile.id}`)}
            </b>
          </span>
          <span className="mm-tx-row-previews">
            {look.font ? (
              <FontName id={look.font} />
            ) : (
              <>
                {profileSlot(profile, "arabic") && (
                  <FontName
                    id={profileSlot(profile, "arabic")!.font}
                    which="arabic"
                    height={18}
                  />
                )}
                {profileSlot(profile, "latin") && (
                  <FontName
                    id={profileSlot(profile, "latin")!.font}
                    which="latin"
                    height={15}
                  />
                )}
              </>
            )}
          </span>
          <Glyph name="chevronDown" size={13} />
        </button>
        {(look.font !== base.font || look.profile !== base.profile) && (
          <button
            className="mm-pill mm-tx-reset-font"
            onClick={() =>
              set(
                (l) => ({ ...l, font: base.font, profile: base.profile }),
                "font",
              )
            }
          >
            <Glyph name="reset" size={12} />
            {t("txResetFont")}
          </button>
        )}
        {picker && (
          <FontPicker
            look={look}
            text={sampleText}
            t={t}
            onProfile={(id) =>
              set((l) => ({ ...l, profile: id, font: null }), "profile")
            }
            onFont={(id) => patch({ font: id }, "font")}
          />
        )}
        {notes.length > 0 && (
          <ul className="mm-tx-notes" role="status">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <Slider
          label={t("txSize")}
          value={look.size}
          defaultValue={base.size}
          min={0.002}
          max={0.25}
          step={0.0005}
          onChange={(v) => patch({ size: v }, "size")}
          format={px}
        />
        {weights.range ? (
          <Slider
            label={t("txWeight")}
            value={Math.min(
              weights.range[1],
              Math.max(weights.range[0], look.weight),
            )}
            defaultValue={Math.min(
              weights.range[1],
              Math.max(weights.range[0], base.weight),
            )}
            min={weights.range[0]}
            max={weights.range[1]}
            step={10}
            onChange={(v) => patch({ weight: v }, "weight")}
            format={(v) =>
              t(`txWeight_${Math.round(v / 100) * 100}`, {
                defaultValue: String(v),
              })
            }
          />
        ) : weights.list.length > 1 ? (
          <Choice
            label={t("txWeight")}
            value={
              String(
                weights.list.reduce((a, b) =>
                  Math.abs(b - look.weight) < Math.abs(a - look.weight) ? b : a,
                ),
              ) as string
            }
            base={String(
              weights.list.reduce((a, b) =>
                Math.abs(b - base.weight) < Math.abs(a - base.weight) ? b : a,
              ),
            )}
            options={weights.list.map((w) => ({
              key: String(w),
              label: t(`txWeight_${w}`, { defaultValue: String(w) }),
            }))}
            onChange={(v) => patch({ weight: Number(v) }, "weight")}
          />
        ) : (
          <p className="mm-bp-hint">
            {t("txOneWeight", {
              font: mainFont.family,
              weight: t(`txWeight_${weights.list[0] ?? 400}`, {
                defaultValue: String(weights.list[0] ?? 400),
              }),
            })}
          </p>
        )}
        <div className="mm-tx-toggles">
          <Toggle
            label={t("txItalic")}
            checked={look.italic}
            onChange={(v) => patch({ italic: v }, "italic")}
          />
          <Toggle
            label={t("txCaps")}
            checked={look.caps}
            onChange={(v) => patch({ caps: v }, "caps")}
          />
        </div>
        {!italicOk && look.italic && (
          <p className="mm-bp-hint">
            {t("txNoItalic", { font: mainFont.family })}
          </p>
        )}
        <Slider
          label={t("txLetterSpacing")}
          value={look.letterSpacing}
          defaultValue={base.letterSpacing}
          min={-0.1}
          max={1}
          step={0.01}
          onChange={(v) => patch({ letterSpacing: v }, "letterSpacing")}
          format={em}
        />
        {arabic && look.letterSpacing !== 0 && (
          <p className="mm-bp-hint">{t("txArabicSpacingHint")}</p>
        )}
        <Slider
          label={t("txWordSpacing")}
          value={look.wordSpacing}
          defaultValue={base.wordSpacing}
          min={-0.2}
          max={2}
          step={0.01}
          onChange={(v) => patch({ wordSpacing: v }, "wordSpacing")}
          format={em}
        />
        <Slider
          label={t("txLineHeight")}
          value={look.lineHeight}
          defaultValue={base.lineHeight}
          min={0.6}
          max={3}
          step={0.05}
          onChange={(v) => patch({ lineHeight: v }, "lineHeight")}
          format={(v) => v.toFixed(2)}
        />
        <Choice
          label={t("txAlign")}
          value={look.align}
          base={base.align}
          options={ALIGNS.map((a) => ({
            key: a.key,
            label: <Glyph name={a.glyph} size={14} />,
            title: t(a.labelKey),
          }))}
          onChange={(v) => patch({ align: v }, "align")}
        />
        {arabic && (
          <>
            <Slider
              label={t("txKashida")}
              value={look.kashida}
              defaultValue={base.kashida}
              min={0}
              max={1}
              step={0.34}
              onChange={(v) => patch({ kashida: v }, "kashida")}
              format={(v) =>
                v ? t(`txKashida_${Math.round(v * 3)}`) : t("lnNone")
              }
            />
            <p className="mm-bp-hint">{t("txKashidaHint")}</p>
          </>
        )}
      </Section>

      {/* ---- appearance ---- */}
      <Section title={t("stAppearance")} open>
        <ColorField
          label={t("txFill")}
          color={look.fill}
          base={base.fill}
          alpha={look.fillOpacity}
          onChange={(c) => {
            patch({ fill: c }, "fill");
            onCommitColor(c);
          }}
          onAlpha={(a) => patch({ fillOpacity: a }, "fillOpacity")}
          recents={recentColors}
          mapColors={mapColors}
          t={t}
        />
        <Slider
          label={t("txFillOpacity")}
          value={look.fillOpacity}
          defaultValue={base.fillOpacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => patch({ fillOpacity: v }, "fillOpacity")}
          format={pct}
        />
        <Slider
          label={t("txOpacity")}
          value={look.opacity}
          defaultValue={base.opacity}
          min={0.02}
          max={1}
          step={0.01}
          onChange={(v) => patch({ opacity: v }, "opacity")}
          format={pct}
        />
        <label className="mm-ln-select">
          <span>{t("mmBlendMode")}</span>
          <select
            value={look.blend ?? "normal"}
            onChange={(e) =>
              patch({ blend: e.target.value as BlendMode }, "blend")
            }
          >
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`mmBlend_${b}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="mm-bp-hint">
          {t(
            `txBlendHint_${["multiply", "screen", "overlay", "soft-light"].includes(look.blend ?? "") ? look.blend : "normal"}`,
          )}
        </p>
      </Section>

      {/* ---- outline ---- */}
      <Section title={t("txOutline")} open={look.outline.enabled}>
        <Toggle
          label={t("txOutlineOn")}
          checked={look.outline.enabled}
          onChange={(v) => setOutline({ enabled: v }, "enabled")}
        />
        {look.outline.enabled && (
          <>
            <ColorField
              label={t("mmColor")}
              color={look.outline.color}
              base={base.outline.color}
              onChange={(c) => setOutline({ color: c }, "color")}
              recents={recentColors}
              mapColors={mapColors}
              t={t}
            />
            <Slider
              label={t("txOutlineWidth")}
              value={look.outline.width}
              defaultValue={base.outline.width || 0.08}
              min={0.01}
              max={0.5}
              step={0.005}
              onChange={(v) => setOutline({ width: v }, "width")}
              format={pct}
            />
            <Slider
              label={t("txOutlineOpacity")}
              value={look.outline.opacity}
              defaultValue={base.outline.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setOutline({ opacity: v }, "opacity")}
              format={pct}
            />
            <Choice
              label={t("lnJoin")}
              value={look.outline.join}
              base={base.outline.join}
              options={(["round", "miter", "bevel"] as LineJoin[]).map((j) => ({
                key: j,
                label: t(`lnJoin${j[0].toUpperCase()}${j.slice(1)}`),
              }))}
              onChange={(v) => setOutline({ join: v }, "join")}
            />
            <Choice
              label={t("txOutlinePosition")}
              value={look.outline.position}
              base={base.outline.position}
              options={[
                {
                  key: "outside",
                  label: t("txOutside"),
                  title: t("txOutsideHint"),
                },
                { key: "center", label: t("txCenter") },
              ]}
              onChange={(v) => setOutline({ position: v }, "position")}
            />
          </>
        )}
        {JSON.stringify(look.outline) !== JSON.stringify(base.outline) && (
          <button
            className="mm-pill mm-tx-section-reset"
            onClick={() =>
              set((l) => ({ ...l, outline: base.outline }), "outline.reset")
            }
          >
            <Glyph name="reset" size={12} />
            {t("txResetOutline")}
          </button>
        )}
      </Section>

      {/* ---- shadow ---- */}
      <Section title={t("txShadow")} open={look.shadow.enabled}>
        <Toggle
          label={t("txShadowOn")}
          checked={look.shadow.enabled}
          onChange={(v) => setShadow({ enabled: v }, "enabled")}
        />
        {look.shadow.enabled && (
          <>
            <div className="mm-bp-chips wrap">
              {SHADOW_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() =>
                    setShadow({ ...p.shadow, enabled: true }, "preset")
                  }
                >
                  {t(`txShadow_${p.key}`)}
                </button>
              ))}
            </div>
            <div className="mm-st-color-row">
              <span>{t("mmColor")}</span>
              <ColorControl
                color={look.shadow.color}
                recents={[]}
                onChange={(c) => setShadow({ color: c }, "color")}
                label={t("mmColor")}
                recentLabel=""
              />
            </div>
            <Slider
              label={t("txShadowOpacity")}
              value={look.shadow.opacity}
              defaultValue={base.shadow.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setShadow({ opacity: v }, "opacity")}
              format={pct}
            />
            <Slider
              label={t("txShadowBlur")}
              value={look.shadow.blur}
              defaultValue={base.shadow.blur}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setShadow({ blur: v }, "blur")}
              format={pct}
            />
            <Slider
              label={t("txShadowX")}
              value={look.shadow.offsetX}
              defaultValue={base.shadow.offsetX}
              min={-0.5}
              max={0.5}
              step={0.005}
              onChange={(v) => setShadow({ offsetX: v }, "offsetX")}
              format={em}
            />
            <Slider
              label={t("txShadowY")}
              value={look.shadow.offsetY}
              defaultValue={base.shadow.offsetY}
              min={-0.5}
              max={0.5}
              step={0.005}
              onChange={(v) => setShadow({ offsetY: v }, "offsetY")}
              format={em}
            />
            <Slider
              label={t("txShadowAngle")}
              value={Math.round(
                (Math.atan2(look.shadow.offsetY, look.shadow.offsetX) * 180) /
                  Math.PI,
              )}
              defaultValue={Math.round(
                (Math.atan2(base.shadow.offsetY, base.shadow.offsetX) * 180) /
                  Math.PI,
              )}
              min={-180}
              max={180}
              step={1}
              onChange={(deg) => {
                const d =
                    Math.hypot(look.shadow.offsetX, look.shadow.offsetY) ||
                    0.06,
                  r = (deg * Math.PI) / 180;
                setShadow(
                  {
                    offsetX: Math.round(Math.cos(r) * d * 1000) / 1000,
                    offsetY: Math.round(Math.sin(r) * d * 1000) / 1000,
                  },
                  "angle",
                );
              }}
              format={(v) => `${v}°`}
            />
            <Slider
              label={t("txShadowDistance")}
              value={Math.min(
                0.7,
                Math.hypot(look.shadow.offsetX, look.shadow.offsetY),
              )}
              defaultValue={Math.min(
                0.7,
                Math.hypot(base.shadow.offsetX, base.shadow.offsetY),
              )}
              min={0}
              max={0.7}
              step={0.005}
              onChange={(d) => {
                const a =
                  Math.atan2(look.shadow.offsetY, look.shadow.offsetX) ||
                  Math.PI / 4;
                setShadow(
                  {
                    offsetX: Math.round(Math.cos(a) * d * 1000) / 1000,
                    offsetY: Math.round(Math.sin(a) * d * 1000) / 1000,
                  },
                  "distance",
                );
              }}
              format={pct}
            />
          </>
        )}
        {JSON.stringify(look.shadow) !== JSON.stringify(base.shadow) && (
          <button
            className="mm-pill mm-tx-section-reset"
            onClick={() =>
              set((l) => ({ ...l, shadow: base.shadow }), "shadow.reset")
            }
          >
            <Glyph name="reset" size={12} />
            {t("txResetShadow")}
          </button>
        )}
      </Section>

      {/* ---- curve ---- */}
      <Section title={t("txCurve")} open={look.curveMode !== "straight"}>
        <div className="mm-reset-row">
          <div
            className="mm-bp-segment small mm-tx-curves"
            role="radiogroup"
            aria-label={t("txCurve")}
          >
            {(["straight", "up", "down", "path"] as const).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={curveKind === k}
                className={curveKind === k ? "active" : ""}
                disabled={
                  k === "path" &&
                  !single &&
                  !(editing?.look.curveMode === "path")
                }
                title={t(`txCurveHint_${k}`)}
                onClick={() => {
                  if (k === "straight")
                    patch({ curveMode: "straight" }, "curveMode");
                  else if (k === "up")
                    patch(
                      { curveMode: "arc", curve: Math.abs(look.curve) || 30 },
                      "curveMode",
                    );
                  else if (k === "down")
                    patch(
                      {
                        curveMode: "arc",
                        curve: -(Math.abs(look.curve) || 30),
                      },
                      "curveMode",
                    );
                  else patch({ curveMode: "path" }, "curveMode");
                }}
              >
                <Glyph name={`curve_${k}`} size={16} />
                <span>{t(`txCurve_${k}`)}</span>
              </button>
            ))}
          </div>
          <ResetButton
            value={
              look.curveMode === base.curveMode && look.curve === base.curve
                ? 0
                : 1
            }
            defaultValue={0}
            onReset={() =>
              patch(
                { curveMode: base.curveMode, curve: base.curve },
                "curveMode",
              )
            }
            label={t("txCurve")}
            className="mm-reset"
          />
        </div>
        {!single && !editing && (
          <p className="mm-bp-hint">{t("txPathNeedsText")}</p>
        )}
        {look.curveMode === "arc" && (
          <Slider
            label={t("txBend")}
            value={look.curve}
            defaultValue={base.curveMode === "arc" ? base.curve : 0}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => patch({ curve: v }, "curve")}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
          />
        )}
        {look.curveMode === "path" && single && path && actions && (
          <>
            <div className="mm-st-flips">
              <button
                className={`mm-pill ${actions.editingPath ? "selected" : ""}`}
                aria-pressed={actions.editingPath}
                onClick={actions.onEditPath}
              >
                <Glyph name="editNodes" size={13} />
                {t("txEditPath")}
              </button>
              <button
                className="mm-pill"
                onClick={() => setPath({ reverse: !path.reverse }, "reverse")}
                aria-pressed={path.reverse}
              >
                <Glyph name="reverse" size={13} />
                {t("lnReverse")}
              </button>
            </div>
            <Choice
              label={t("txPathSide")}
              value={path.side}
              base={DEFAULT_TEXT_PATH.side}
              options={(["above", "center", "below"] as const).map((s) => ({
                key: s,
                label: t(`txSide_${s}`),
              }))}
              onChange={(v) => setPath({ side: v }, "side")}
            />
            <Choice
              label={t("txPathAlign")}
              value={path.align}
              base={DEFAULT_TEXT_PATH.align}
              options={(["start", "center", "end"] as const).map((s) => ({
                key: s,
                label: t(`txPathAlign_${s}`),
              }))}
              onChange={(v) => setPath({ align: v }, "align")}
            />
            <Slider
              label={t("txPathOffset")}
              value={path.offset}
              defaultValue={0}
              min={-0.5}
              max={0.5}
              step={0.005}
              onChange={(v) => setPath({ offset: v }, "offset")}
              format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}
            />
            <Slider
              label={t("txBaselineOffset")}
              value={path.baseline}
              defaultValue={0}
              min={-2}
              max={2}
              step={0.01}
              onChange={(v) => setPath({ baseline: v }, "baseline")}
              format={em}
            />
            <Toggle
              label={t("txSmoothBends")}
              checked={path.smooth}
              onChange={(v) => setPath({ smooth: v }, "smooth")}
            />
          </>
        )}
        {look.curveMode !== "straight" && (
          <>
            <label className="mm-ln-select">
              <span>{t("txLetters")}</span>
              <select
                value={look.letters}
                onChange={(e) =>
                  patch(
                    { letters: e.target.value as TextLook["letters"] },
                    "letters",
                  )
                }
              >
                {(["auto", "warp", "letters", "words"] as const).map((l) => (
                  <option key={l} value={l}>
                    {t(`txLetters_${l}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mm-bp-hint">{t(`txLettersHint_${look.letters}`)}</p>
          </>
        )}
      </Section>

      {/* ---- transform (one text) ---- */}
      {single && (
        <Section title={t("txTransform")}>
          {single.curveMode !== "path" && (
            <Slider
              label={t("stRotation")}
              value={Math.round(single.rotation)}
              defaultValue={0}
              min={-180}
              max={180}
              step={1}
              onChange={(v) => onEditText({ rotation: v }, "rotation")}
              format={(v) => `${v}°`}
            />
          )}
          <Toggle
            label={t("txWrap")}
            checked={single.boxWidth !== null}
            onChange={(v) =>
              onEditText(
                {
                  boxWidth: v
                    ? Math.max(
                        0.05,
                        Math.min(
                          0.8,
                          ((shaped?.width ?? 6) * single.size) / 1.5,
                        ),
                      )
                    : null,
                },
                "boxWidth",
              )
            }
          />
          {single.boxWidth !== null && (
            <Slider
              label={t("txBoxWidth")}
              value={single.boxWidth}
              defaultValue={Math.max(
                0.05,
                ((shaped?.width ?? 6) * single.size) / 1.5,
              )}
              min={0.01}
              max={1}
              step={0.001}
              onChange={(v) => onEditText({ boxWidth: v }, "boxWidth")}
              format={px}
            />
          )}
          <p className="mm-bp-hint">
            {t("txPosition", {
              x: Math.round(single.x * mapWidthPx),
              y: Math.round(single.y * mapHeightPx),
              angle: Math.round(single.rotation),
            })}
          </p>
        </Section>
      )}

      {/* ---- advanced ---- */}
      <Section title={t("txAdvanced")}>
        {features.length > 0 ? (
          <>
            <span className="mm-bp-subtitle">
              {t("txFeatures", { font: mainFont.family })}
            </span>
            <div className="mm-tx-features">
              {FEATURES.filter(([tag]) => features.includes(tag)).map(
                ([tag, on]) => {
                  const value = look.features[tag] ?? on;
                  return (
                    <Toggle
                      key={tag}
                      label={t(`txFeature_${tag}`, { defaultValue: tag })}
                      checked={value}
                      onChange={(v) =>
                        set((l) => {
                          const f = { ...l.features };
                          if (v === on) delete f[tag];
                          else f[tag] = v;
                          return { ...l, features: f };
                        }, `feature.${tag}`)
                      }
                    />
                  );
                },
              )}
            </div>
            <p className="mm-bp-hint">{t("txFeaturesHint")}</p>
          </>
        ) : (
          <p className="mm-bp-hint">
            {t("txNoFeatures", { font: mainFont.family })}
          </p>
        )}
        {single && actions && single.curveMode !== "path" && (
          <>
            <span className="mm-bp-subtitle">{t("txAttach")}</span>
            {actions.attachedTo ? (
              <div className="mm-tx-attached">
                <span>{t("txAttachedTo", { stamp: actions.attachedTo })}</span>
                <button className="mm-pill" onClick={actions.onDetach}>
                  {t("txDetach")}
                </button>
              </div>
            ) : (
              <button
                className={`mm-pill ${actions.pickingStamp ? "selected" : ""}`}
                aria-pressed={actions.pickingStamp}
                onClick={actions.onPickStamp}
              >
                <Glyph name="stamp" size={13} />
                {actions.pickingStamp
                  ? t("txAttachPicking")
                  : t("txAttachPick")}
              </button>
            )}
            <p className="mm-bp-hint">{t("txAttachHint")}</p>
          </>
        )}
      </Section>

      <div className="mm-st-resets">
        <button
          className="mm-pill"
          onClick={() =>
            set(() => baseLook, "resetAll", editing ? undefined : styleId)
          }
        >
          <Glyph name="reset" size={12} />
          {t("txResetAll")}
        </button>
        {single && (single.rotation !== 0 || single.boxWidth !== null) && (
          <button
            className="mm-pill"
            onClick={() =>
              onEditText({ rotation: 0, boxWidth: null }, "resetTransform")
            }
          >
            {t("txResetTransform")}
          </button>
        )}
      </div>
      <p className="mm-bp-hint">{t("txResetAllHint")}</p>
    </aside>
  );
}
