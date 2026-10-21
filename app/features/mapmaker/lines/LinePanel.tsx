"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs drawn at runtime */
/**
 * The Line Tool panel (left of the canvas while the Line tool is active, or
 * floating over it while lines are selected with the Select tool):
 *
 *   drawing   Free Draw / Pen / Edit Nodes, smoothing, angle steps, snapping
 *   styles    built-in, the person's own (saved to their account) and
 *             official styles — click to use, save the current look
 *   stroke    Color (colour, width, pattern, dashes, caps, joins, blur,
 *             casing) or Stamp (line art, size, spacing, direction, offset,
 *             corners, caps, variety, colours)
 *   line      (one selected line) name, closed, reverse, edit nodes
 *
 * Changes apply live, no "Apply" button: to the next line drawn when nothing
 * is selected, or to the selected lines only (never to the tool) — see
 * ./state for the three kinds of values. Every slider can be reset on its
 * own to the line's style; "Reset all" resets the whole look.
 */
import {
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Glyph } from "../glyphs";
import {
  ColorControl,
  Section,
  Slider,
  Toggle,
} from "../components/EditorControls";
import { BLEND_MODES } from "../brush/BrushPanel";
import { stampThumb } from "../stamps/render";
import { catalogVersion, subscribeCatalog } from "../stamps/catalog";
import type {
  BlendMode,
  LineCap,
  LineColorStroke,
  LineJoin,
  LineLook,
  LinePattern,
  LineStampStroke,
} from "../types";
import {
  LINE_CATEGORIES,
  lineCatalogVersion,
  lineSet,
  lineSetLabel,
  searchLineSets,
  subscribeLineCatalog,
  type LineArtSet,
  type LineCategory,
} from "./catalog";
import {
  builtinLineStyles,
  resetProp,
  withSet,
  type LineDrawMode,
  type LineStyle,
  type LineToolState,
} from "./state";
import { lookPreview } from "./render";
import { newSeed } from "../brush/noise";
import { shortcutLabel, useShortcuts, type ShortcutId } from "../shortcuts";

type T = (k: string, opts?: Record<string, unknown>) => string;

export const LINE_DRAW_MODES: {
  key: LineDrawMode;
  labelKey: string;
  hintKey: string;
  glyph: string;
  shortcut: ShortcutId;
}[] = [
  {
    key: "free",
    labelKey: "lnDrawFree",
    hintKey: "lnHintFree",
    glyph: "freeBrush",
    shortcut: "line.free",
  },
  {
    key: "pen",
    labelKey: "lnDrawPen",
    hintKey: "lnHintPen",
    glyph: "pen",
    shortcut: "line.pen",
  },
  {
    key: "edit",
    labelKey: "lnDrawEdit",
    hintKey: "lnHintEdit",
    glyph: "editNodes",
    shortcut: "line.editNodes",
  },
];
const PATTERNS: { key: LinePattern; labelKey: string }[] = [
  { key: "solid", labelKey: "lnPatternSolid" },
  { key: "dashed", labelKey: "lnPatternDashed" },
  { key: "dotted", labelKey: "lnPatternDotted" },
  { key: "dashdot", labelKey: "lnPatternDashDot" },
  { key: "custom", labelKey: "lnPatternCustom" },
];
const CAPS: { key: LineCap; labelKey: string }[] = [
  { key: "round", labelKey: "lnCapRound" },
  { key: "butt", labelKey: "lnCapButt" },
  { key: "square", labelKey: "lnCapSquare" },
];
const JOINS: { key: LineJoin; labelKey: string }[] = [
  { key: "round", labelKey: "lnJoinRound" },
  { key: "miter", labelKey: "lnJoinMiter" },
  { key: "bevel", labelKey: "lnJoinBevel" },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---- previews ----------------------------------------------------------------------
const previews = new Map<string, string>();
/** A style's swatch: its look drawn along a small curve (cached per look). */
function StylePreview({ look }: { look: LineLook }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const key = JSON.stringify([
    look.mode,
    look.mode === "color" ? look.stroke : look.stamp,
  ]);
  let url = previews.get(key);
  if (!url && typeof document !== "undefined") {
    let pending = false;
    const c = lookPreview(look, 120, 34, () => {
      pending = true;
      previews.delete(key);
      redraw();
    });
    url = c.toDataURL("image/png");
    if (!pending) previews.set(key, url);
  }
  // Pale looks (surf, white roads) are shown on a sea-blue tile.
  const main = look.mode === "color" ? look.stroke.color : look.stamp.ink,
    [r, g, b] = [1, 3, 5].map((i) => parseInt(main.slice(i, i + 2), 16) / 255),
    pale = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.72;
  return url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        opacity: look.opacity,
        ...(pale ? { background: "#2c5678" } : {}),
      }}
    />
  ) : null;
}
function SetThumb({
  set,
  ink,
  fill,
}: {
  set: LineArtSet;
  ink?: string;
  fill?: string | null;
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const url = set.parts.seg[0]
    ? stampThumb(set.parts.seg[0], ink, set.vector ? fill : undefined, redraw)
    : null;
  return url ? (
    <img src={url} alt="" draggable={false} />
  ) : (
    <span className="mm-st-thumb-wait" />
  );
}

// ---- library (account styles) --------------------------------------------------------
export interface LineLibrary {
  signedIn: boolean;
  own: LineStyle[];
  official: LineStyle[];
  /** null = unlimited. */
  max: number | null;
  busy: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  /** At the limit: shows the upgrade prompt instead of saving. */
  onLimit: () => void;
}
export interface LineArtUploads {
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  /** New line art from pictures (several = variants of the repeated piece). */
  onUpload: (files: File[]) => void;
  /** Adds an end/corner piece to one of your own sets. */
  onAddPiece: (
    setId: string,
    role: "start" | "end" | "corner",
    file: File,
  ) => void;
}

export function LinePanel({
  state,
  onChange,
  editing,
  onEditLook,
  onDoneEditing,
  baseLook,
  line,
  library,
  uploads,
  t,
  mapWidthPx,
  recentColors,
  onCommitColor,
  target,
  floating = false,
}: {
  state: LineToolState;
  onChange: (next: LineToolState) => void;
  /** Selected lines being edited (the first one's look), or null. */
  editing: { count: number; look: LineLook; styleId: string | null } | null;
  /** A new look for the selected lines (and the style it came from, when one was applied). */
  onEditLook: (look: LineLook, styleId?: string | null) => void;
  onDoneEditing: () => void;
  /** What resets return to (the line's / tool's style, or the factory look). */
  baseLook: LineLook;
  /** Actions on the one selected line (null when not exactly one). */
  line: {
    name: string;
    closed: boolean;
    canClose: boolean;
    onRename: (name: string) => void;
    onToggleClosed: () => void;
    onReverse: () => void;
    onEditNodes: () => void;
    editingNodes: boolean;
  } | null;
  library: LineLibrary;
  uploads: LineArtUploads;
  t: T;
  mapWidthPx: number;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  target: ReactNode;
  floating?: boolean;
}) {
  // Server styles, sets and uploaded pictures can arrive while the panel is open.
  const lineVersion = useSyncExternalStore(
      subscribeLineCatalog,
      lineCatalogVersion,
      lineCatalogVersion,
    ),
    stampVersion = useSyncExternalStore(
      subscribeCatalog,
      catalogVersion,
      catalogVersion,
    );
  const keys = useShortcuts();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<LineCategory | "all">("walls"),
    [styleName, setStyleName] = useState(""),
    [savingStyle, setSavingStyle] = useState(false);
  const look = editing ? editing.look : state.look,
    styleId = editing ? editing.styleId : state.styleId;
  const setLook = (next: LineLook, appliedStyle?: string | null) => {
    if (editing) onEditLook(next, appliedStyle);
    else
      onChange({
        ...state,
        look: next,
        styleId: appliedStyle === undefined ? null : appliedStyle,
      });
  };
  const setStroke = (p: Partial<LineColorStroke>) =>
    setLook({ ...look, stroke: { ...look.stroke, ...p } });
  const setStamp = (p: Partial<LineStampStroke>) =>
    setLook({ ...look, stamp: { ...look.stamp, ...p } });
  const reset = (path: string) =>
    setLook(resetProp(look, baseLook, path), editing ? undefined : styleId);
  const px = (v: number) =>
    `${Math.max(1, Math.round(v * mapWidthPx * 10) / 10)} px`;
  const s = look.stroke,
    st = look.stamp,
    base = baseLook,
    currentSet = lineSet(st.set);
  // A stamp-set's own defaults, when the line uses another set than its style.
  const setBase =
    currentSet && currentSet.id !== base.stamp.set
      ? { ...base.stamp, ...currentSet.defaults }
      : base.stamp;

  const sets = useMemo(
    () =>
      searchLineSets(
        query,
        (x) => lineSetLabel(t, x),
        query ? "all" : category,
      ),
    // The versions change when server sets or stamps arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, category, t, lineVersion, stampVersion],
  );
  const drawMode = LINE_DRAW_MODES.find((m) => m.key === state.draw)!;
  const ownCount = library.own.length,
    atLimit = library.max !== null && ownCount >= library.max;

  const styleButton = (style: LineStyle) => (
    <div
      key={style.id}
      className={`mm-ln-style ${styleId === style.id ? "selected" : ""} ${style.locked ? "locked" : ""}`}
    >
      <button
        title={
          style.locked
            ? t("lnStyleLocked")
            : (style.name ?? (style.labelKey ? t(style.labelKey) : style.id))
        }
        disabled={style.locked}
        onClick={() =>
          setLook(
            { ...style.look, stamp: { ...style.look.stamp, seed: newSeed() } },
            style.id,
          )
        }
      >
        <StylePreview look={style.look} />
        <span>
          {style.name ?? (style.labelKey ? t(style.labelKey) : style.id)}
        </span>
        {style.locked && <Glyph name="lock" size={11} />}
      </button>
      {style.source === "own" && (
        <button
          className="mm-ln-style-del"
          title={t("lnStyleDelete")}
          aria-label={t("lnStyleDelete")}
          onClick={() => library.onDelete(style.id)}
        >
          <Glyph name="close" size={10} />
        </button>
      )}
    </div>
  );

  return (
    <aside
      className={`mm-brush-panel mm-line-panel ${floating ? "floating" : ""}`}
      aria-label={t("lnPanel")}
    >
      {target}
      {editing ? (
        <div className="mm-st-editing">
          <span>{t("lnEditing", { count: editing.count })}</span>
          <button className="mm-pill" onClick={onDoneEditing}>
            {t("stDone")}
          </button>
        </div>
      ) : (
        <>
          <div
            className="mm-bp-modes"
            role="radiogroup"
            aria-label={t("lnDrawMode")}
          >
            {LINE_DRAW_MODES.map((m) => (
              <button
                key={m.key}
                className={state.draw === m.key ? "active" : ""}
                onClick={() => onChange({ ...state, draw: m.key })}
                role="radio"
                aria-checked={state.draw === m.key}
                title={`${t(m.labelKey)} (${shortcutLabel(m.shortcut, keys)})`}
              >
                <Glyph name={m.glyph} size={18} />
                <span>{t(m.labelKey)}</span>
              </button>
            ))}
          </div>
          <p className="mm-bp-hint">{t(drawMode.hintKey)}</p>
        </>
      )}

      {line && (
        <Section title={t("lnLineSection")} open>
          <label className="mm-ln-name">
            <span>{t("lnName")}</span>
            <input
              key={line.name}
              defaultValue={line.name}
              maxLength={80}
              placeholder={t("lnNamePlaceholder")}
              onBlur={(e) => {
                if (e.target.value !== line.name)
                  line.onRename(e.target.value.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <div className="mm-st-flips">
            <button
              className={`mm-pill ${line.editingNodes ? "selected" : ""}`}
              onClick={line.onEditNodes}
              aria-pressed={line.editingNodes}
              title={t("lnEditNodesHint", {
                key: shortcutLabel("line.editNodes", keys),
              })}
            >
              <Glyph name="editNodes" size={14} />
              {t("lnEditNodes")}
            </button>
            <button
              className="mm-pill"
              onClick={line.onReverse}
              title={t("lnReverseHint")}
            >
              <Glyph name="reverse" size={14} />
              {t("lnReverse")}
            </button>
            <button
              className={`mm-pill ${line.closed ? "selected" : ""}`}
              onClick={line.onToggleClosed}
              disabled={!line.canClose}
              aria-pressed={line.closed}
            >
              <Glyph name="closePath" size={14} />
              {t("lnClosed")}
            </button>
          </div>
        </Section>
      )}

      {/* ---- styles ---- */}
      <Section title={t("lnStyles")} open>
        <div className="mm-ln-styles">
          {builtinLineStyles().map(styleButton)}
        </div>
        {library.official.length > 0 && (
          <>
            <span className="mm-bp-subtitle">{t("lnStylesOfficial")}</span>
            <div className="mm-ln-styles">
              {library.official.map(styleButton)}
            </div>
          </>
        )}
        <span className="mm-bp-subtitle">{t("lnStylesOwn")}</span>
        {library.signedIn ? (
          <>
            {library.own.length > 0 ? (
              <div className="mm-ln-styles">{library.own.map(styleButton)}</div>
            ) : (
              <p className="mm-bp-hint">{t("lnStylesOwnEmpty")}</p>
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
                  placeholder={t("lnStyleNamePlaceholder")}
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
                // At the limit the button stays: it explains the limit and the
                // plans instead of saving (the server refuses it too).
                onClick={() =>
                  atLimit ? library.onLimit() : setSavingStyle(true)
                }
                aria-haspopup={atLimit ? "dialog" : undefined}
              >
                <Glyph name={atLimit ? "lock" : "plus"} size={12} />
                {t("lnStyleSaveCurrent")}
              </button>
            )}
            {library.max !== null && (
              <p className={`mm-bp-hint mm-ln-count ${atLimit ? "full" : ""}`}>
                {t("lnStyleCount", { count: ownCount, max: library.max })}
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
            <p>{t("lnStylesSignIn")}</p>
            <Link
              className="mm-pill"
              href={`/login?next=${encodeURIComponent("/editor")}`}
            >
              {t("acSignIn")}
            </Link>
          </div>
        )}
      </Section>

      {/* ---- stroke ---- */}
      <div
        className="mm-bp-segment"
        role="radiogroup"
        aria-label={t("lnStrokeMode")}
      >
        {(["color", "stamp"] as const).map((m) => (
          <button
            key={m}
            className={look.mode === m ? "active" : ""}
            role="radio"
            aria-checked={look.mode === m}
            onClick={() =>
              setLook({ ...look, mode: m }, editing ? undefined : styleId)
            }
          >
            {t(m === "color" ? "lnModeColor" : "lnModeStamp")}
          </button>
        ))}
      </div>

      {look.mode === "color" ? (
        <Section title={t("lnColorStroke")} open>
          <div className="mm-st-color-row">
            <span>{t("mmColor")}</span>
            <ColorControl
              color={s.color}
              recents={recentColors}
              onChange={(c) => {
                setStroke({ color: c });
                onCommitColor(c);
              }}
              label={t("mmColor")}
              recentLabel={t("mmRecents")}
            />
          </div>
          <Slider
            label={t("lnWidth")}
            value={s.width}
            defaultValue={base.stroke.width}
            min={0.0005}
            max={0.04}
            step={0.0001}
            onChange={(v) => setStroke({ width: v })}
            format={px}
          />
          <span className="mm-bp-subtitle">{t("lnPattern")}</span>
          <div
            className="mm-bp-chips"
            role="radiogroup"
            aria-label={t("lnPattern")}
          >
            {PATTERNS.map((p) => (
              <button
                key={p.key}
                role="radio"
                aria-checked={s.pattern === p.key}
                className={s.pattern === p.key ? "active" : ""}
                onClick={() => setStroke({ pattern: p.key })}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
          {(s.pattern === "dashed" ||
            s.pattern === "dashdot" ||
            s.pattern === "custom") && (
            <Slider
              label={t("lnDash")}
              value={s.dash}
              defaultValue={base.stroke.dash}
              min={0.2}
              max={20}
              step={0.1}
              onChange={(v) => setStroke({ dash: v })}
              format={(v) => `×${v.toFixed(1)}`}
            />
          )}
          {s.pattern !== "solid" && (
            <Slider
              label={t("lnGap")}
              value={s.gap}
              defaultValue={base.stroke.gap}
              min={0.2}
              max={20}
              step={0.1}
              onChange={(v) => setStroke({ gap: v })}
              format={(v) => `×${v.toFixed(1)}`}
            />
          )}
          <span className="mm-bp-subtitle">{t("lnCap")}</span>
          <div
            className="mm-bp-segment small"
            role="radiogroup"
            aria-label={t("lnCap")}
          >
            {CAPS.map((c) => (
              <button
                key={c.key}
                className={s.cap === c.key ? "active" : ""}
                role="radio"
                aria-checked={s.cap === c.key}
                onClick={() => setStroke({ cap: c.key })}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
          <span className="mm-bp-subtitle">{t("lnJoin")}</span>
          <div
            className="mm-bp-segment small"
            role="radiogroup"
            aria-label={t("lnJoin")}
          >
            {JOINS.map((j) => (
              <button
                key={j.key}
                className={s.join === j.key ? "active" : ""}
                role="radio"
                aria-checked={s.join === j.key}
                onClick={() => setStroke({ join: j.key })}
              >
                {t(j.labelKey)}
              </button>
            ))}
          </div>
          <Slider
            label={t("lnBlur")}
            value={s.blur}
            defaultValue={base.stroke.blur}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStroke({ blur: v })}
            format={pct}
          />
          <Slider
            label={t("lnCasing")}
            value={s.casing}
            defaultValue={base.stroke.casing}
            min={0}
            max={0.01}
            step={0.0001}
            onChange={(v) => setStroke({ casing: v })}
            format={(v) => (v ? px(v) : t("lnNone"))}
          />
          {s.casing > 0 && (
            <div className="mm-st-color-row">
              <span>{t("lnCasingColor")}</span>
              <ColorControl
                color={s.casingColor}
                recents={[]}
                onChange={(c) => setStroke({ casingColor: c })}
                label={t("lnCasingColor")}
                recentLabel=""
              />
            </div>
          )}
        </Section>
      ) : (
        <>
          <Section title={t("lnStampArt")} open>
            <div className="mm-st-search">
              <Glyph name="search" size={14} />
              <input
                type="search"
                value={query}
                placeholder={t("lnSearchArt")}
                aria-label={t("lnSearchArt")}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {!query && (
              <div
                className="mm-bp-chips"
                role="tablist"
                aria-label={t("stCategories")}
              >
                {[
                  { key: "all" as const, labelKey: "stCatAll" },
                  ...LINE_CATEGORIES,
                ].map((c) => (
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
            {!query && category === "custom" && (
              <LineArtUploadBox
                u={uploads}
                t={t}
                ownSet={currentSet?.category === "custom" ? currentSet : null}
              />
            )}
            <div
              className="mm-st-sets"
              role="listbox"
              aria-label={t("lnStampArt")}
            >
              {sets.map((x) => (
                <button
                  key={x.id}
                  role="option"
                  aria-selected={x.id === st.set}
                  className={`mm-st-set ${x.id === st.set ? "selected" : ""} ${x.locked ? "locked" : ""}`}
                  title={x.locked ? t("stLocked") : lineSetLabel(t, x)}
                  disabled={x.locked}
                  onClick={() =>
                    setLook(withSet(look, x), editing ? undefined : null)
                  }
                >
                  <SetThumb
                    set={x}
                    ink={x.id === st.set ? st.ink : undefined}
                    fill={x.id === st.set ? st.fill : undefined}
                  />
                  <span>{lineSetLabel(t, x)}</span>
                  {x.locked && <Glyph name="lock" size={12} />}
                </button>
              ))}
              {sets.length === 0 && (
                <p className="mm-bp-hint">
                  {t(
                    !query && category === "custom"
                      ? "lnNoUploads"
                      : "stNoResults",
                  )}
                </p>
              )}
            </div>
          </Section>
          <Section title={t("lnStampLayout")} open>
            <Slider
              label={t("lnStampSize")}
              value={st.size}
              defaultValue={setBase.size}
              min={0.001}
              max={0.1}
              step={0.0002}
              onChange={(v) => setStamp({ size: v })}
              format={px}
            />
            <Slider
              label={t("lnSpacing")}
              value={st.spacing}
              defaultValue={setBase.spacing}
              min={-0.8}
              max={3}
              step={0.01}
              onChange={(v) => setStamp({ spacing: v })}
              format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}
            />
            <Slider
              label={t("lnOffset")}
              value={st.offset}
              defaultValue={0}
              min={-3}
              max={3}
              step={0.05}
              onChange={(v) => setStamp({ offset: v })}
              format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`}
            />
            <Slider
              label={t("stRotation")}
              value={st.rotation}
              defaultValue={0}
              min={-180}
              max={180}
              step={1}
              onChange={(v) => setStamp({ rotation: v })}
              format={(v) => `${v}°`}
            />
            <Toggle
              label={t("lnFollowPath")}
              checked={st.followPath}
              onChange={(v) => setStamp({ followPath: v })}
            />
            <Toggle
              label={t("lnFit")}
              checked={st.fit}
              onChange={(v) => setStamp({ fit: v })}
            />
            <Toggle
              label={t("lnFlip")}
              checked={st.flip}
              onChange={(v) => setStamp({ flip: v })}
            />
            <span className="mm-bp-subtitle">{t("lnCorners")}</span>
            <div
              className="mm-bp-segment small"
              role="radiogroup"
              aria-label={t("lnCorners")}
            >
              {(["split", "continuous"] as const).map((c) => (
                <button
                  key={c}
                  className={st.corners === c ? "active" : ""}
                  role="radio"
                  aria-checked={st.corners === c}
                  onClick={() => setStamp({ corners: c })}
                >
                  {t(c === "split" ? "lnCornersSplit" : "lnCornersContinuous")}
                </button>
              ))}
            </div>
            <p className="mm-bp-hint">
              {t(
                st.corners === "split"
                  ? "lnCornersSplitHint"
                  : "lnCornersContinuousHint",
              )}
            </p>
            {(st.parts.start || st.parts.end) && (
              <Toggle
                label={t("lnCaps")}
                checked={st.caps}
                onChange={(v) => setStamp({ caps: v })}
              />
            )}
            <span className="mm-bp-subtitle">{t("stPivot")}</span>
            <div
              className="mm-bp-segment small"
              role="radiogroup"
              aria-label={t("stPivot")}
            >
              {(["center", "base"] as const).map((a) => (
                <button
                  key={a}
                  className={st.anchor === a ? "active" : ""}
                  role="radio"
                  aria-checked={st.anchor === a}
                  onClick={() => setStamp({ anchor: a })}
                >
                  {t(a === "base" ? "lnAnchorBase" : "lnAnchorCenter")}
                </button>
              ))}
            </div>
          </Section>
          <Section title={t("stVariety")}>
            <Slider
              label={t("stSizeJitter")}
              value={st.scaleJitter}
              defaultValue={setBase.scaleJitter}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setStamp({ scaleJitter: v })}
              format={pct}
            />
            <Slider
              label={t("stRotationJitter")}
              value={st.rotationJitter}
              defaultValue={setBase.rotationJitter}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setStamp({ rotationJitter: v })}
              format={pct}
            />
            <button
              className="mm-pill"
              onClick={() => setStamp({ seed: newSeed() })}
              title={t("lnReshuffleHint")}
            >
              <Glyph name="shuffle" size={13} />
              {t("lnReshuffle")}
            </button>
          </Section>
          {(currentSet?.vector ?? true) && (
            <Section title={t("stAppearance")} open>
              <div className="mm-st-color-row">
                <span>{t("stInk")}</span>
                <ColorControl
                  color={st.ink}
                  recents={recentColors}
                  onChange={(c) => {
                    setStamp({ ink: c });
                    onCommitColor(c);
                  }}
                  label={t("stInk")}
                  recentLabel={t("mmRecents")}
                />
              </div>
              <div className="mm-st-color-row">
                <span>{t("stFill")}</span>
                {st.fill ? (
                  <ColorControl
                    color={st.fill}
                    recents={[]}
                    onChange={(c) => setStamp({ fill: c })}
                    label={t("stFill")}
                    recentLabel=""
                  />
                ) : (
                  <span className="mm-bp-hint">{t("stNoFill")}</span>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      <Section title={t("lnBlending")}>
        <Slider
          label={t("stOpacity")}
          value={look.opacity}
          defaultValue={base.opacity}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(v) => setLook({ ...look, opacity: v })}
          format={pct}
        />
        <label className="mm-ln-select">
          <span>{t("mmBlendMode")}</span>
          <select
            value={look.blend ?? "normal"}
            onChange={(e) =>
              setLook({
                ...look,
                blend:
                  e.target.value === "normal"
                    ? undefined
                    : (e.target.value as BlendMode),
              })
            }
          >
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`mmBlend_${b}`)}
              </option>
            ))}
          </select>
        </label>
      </Section>

      {!editing && (
        <Section title={t("lnDrawing")}>
          {state.draw === "free" && (
            <Slider
              label={t("lnSmoothing")}
              value={state.smoothing}
              defaultValue={0.5}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onChange({ ...state, smoothing: v })}
              format={pct}
            />
          )}
          <label className="mm-ln-select">
            <span>{t("lnAngleStep")}</span>
            <select
              value={state.angleStep}
              onChange={(e) =>
                onChange({ ...state, angleStep: +e.target.value })
              }
            >
              {[15, 30, 45, 90].map((a) => (
                <option key={a} value={a}>
                  {a}°
                </option>
              ))}
            </select>
          </label>
          <Toggle
            label={t("lnSnapEnds")}
            checked={state.snapEnds}
            onChange={(v) => onChange({ ...state, snapEnds: v })}
          />
          <p className="mm-bp-hint">{t("lnDrawingHint")}</p>
        </Section>
      )}

      <div className="mm-st-resets">
        <button
          className="mm-pill"
          onClick={() => reset(look.mode === "color" ? "stroke" : "stamp")}
          title={t("lnResetStrokeHint")}
        >
          <Glyph name="reset" size={12} /> {t("lnResetStroke")}
        </button>
        <button
          className="mm-pill"
          onClick={() =>
            setLook({ ...base, mode: look.mode }, editing ? undefined : styleId)
          }
          title={t("lnResetAllHint")}
        >
          <Glyph name="reset" size={12} /> {t("stResetAll")}
        </button>
      </div>
    </aside>
  );
}

/** "My line art": pictures of a repeated piece (and its end / corner pieces). */
function LineArtUploadBox({
  u,
  t,
  ownSet,
}: {
  u: LineArtUploads;
  t: T;
  ownSet: LineArtSet | null;
}) {
  const input = useRef<HTMLInputElement>(null),
    role = useRef<"seg" | "start" | "end" | "corner">("seg");
  if (!u.signedIn)
    return (
      <div className="mm-st-upload">
        <p>{t("lnUploadSignIn")}</p>
        <Link
          className="mm-pill"
          href={`/login?next=${encodeURIComponent("/editor")}`}
        >
          {t("acSignIn")}
        </Link>
      </div>
    );
  const pick = (r: typeof role.current) => {
    role.current = r;
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
          if (!files.length) return;
          if (role.current === "seg") u.onUpload(files);
          else if (ownSet) u.onAddPiece(ownSet.id, role.current, files[0]);
        }}
      />
      <div className="mm-st-upload-actions">
        <button
          className="mm-pill"
          disabled={u.busy}
          onClick={() => pick("seg")}
          title={t("lnUploadHint")}
        >
          <Glyph name="upload" size={13} />
          {t("lnUpload")}
        </button>
      </div>
      {ownSet && (
        <div className="mm-st-upload-actions">
          <button
            className="mm-pill"
            disabled={u.busy}
            onClick={() => pick("start")}
          >
            {t("lnAddStart")}
          </button>
          <button
            className="mm-pill"
            disabled={u.busy}
            onClick={() => pick("end")}
          >
            {t("lnAddEnd")}
          </button>
          <button
            className="mm-pill"
            disabled={u.busy}
            onClick={() => pick("corner")}
          >
            {t("lnAddCorner")}
          </button>
        </div>
      )}
      <p className="mm-bp-hint">
        {u.busy ? t("stUploading") : t("lnUploadHint")}
      </p>
      {u.error && (
        <p className="mm-st-upload-error" role="alert">
          {u.error}
        </p>
      )}
    </div>
  );
}
