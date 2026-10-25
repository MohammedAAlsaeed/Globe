"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs drawn at runtime */
/**
 * The stroke settings shared by the Line and Shape tools:
 *
 *   ColorStrokeSection   colour, width, pattern, dashes, caps, joins, blur,
 *                        casing
 *   StampStrokeSections  the line art (search, categories, your own
 *                        uploads), its layout along the path, variety and
 *                        colours
 *
 * Both only edit the stroke they're given; what a change applies to (the
 * next line or shape, or the selected ones) is the panel's business.
 */
import {
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { Glyph } from "../glyphs";
import {
  ColorControl,
  Section,
  Slider,
  Toggle,
} from "../components/EditorControls";
import { stampThumb } from "../stamps/render";
import { catalogVersion, subscribeCatalog } from "../stamps/catalog";
import type {
  LineCap,
  LineColorStroke,
  LineJoin,
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
import { newSeed } from "../brush/noise";

type T = (k: string, opts?: Record<string, unknown>) => string;

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

export function ColorStrokeSection({
  stroke: s,
  base,
  onChange,
  t,
  px,
  recentColors,
  onCommitColor,
  title,
  showCaps = true,
}: {
  stroke: LineColorStroke;
  /** What each slider's reset returns to. */
  base: LineColorStroke;
  onChange: (patch: Partial<LineColorStroke>) => void;
  t: T;
  /** Formats a length (fraction of the map width) in pixels. */
  px: (v: number) => string;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  title?: string;
  /** Closed outlines have no ends: their caps only shape dashes. */
  showCaps?: boolean;
}) {
  return (
    <Section title={title ?? t("lnColorStroke")} open>
      <div className="mm-st-color-row">
        <span>{t("mmColor")}</span>
        <ColorControl
          color={s.color}
          recents={recentColors}
          onChange={(c) => {
            onChange({ color: c });
            onCommitColor(c);
          }}
          label={t("mmColor")}
          recentLabel={t("mmRecents")}
        />
      </div>
      <Slider
        label={t("lnWidth")}
        value={s.width}
        defaultValue={base.width}
        min={0.0005}
        max={0.04}
        step={0.0001}
        onChange={(v) => onChange({ width: v })}
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
            onClick={() => onChange({ pattern: p.key })}
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
          defaultValue={base.dash}
          min={0.2}
          max={20}
          step={0.1}
          onChange={(v) => onChange({ dash: v })}
          format={(v) => `×${v.toFixed(1)}`}
        />
      )}
      {s.pattern !== "solid" && (
        <Slider
          label={t("lnGap")}
          value={s.gap}
          defaultValue={base.gap}
          min={0.2}
          max={20}
          step={0.1}
          onChange={(v) => onChange({ gap: v })}
          format={(v) => `×${v.toFixed(1)}`}
        />
      )}
      {(showCaps || s.pattern !== "solid") && (
        <>
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
                onClick={() => onChange({ cap: c.key })}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}
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
            onClick={() => onChange({ join: j.key })}
          >
            {t(j.labelKey)}
          </button>
        ))}
      </div>
      <Slider
        label={t("lnBlur")}
        value={s.blur}
        defaultValue={base.blur}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ blur: v })}
        format={pct}
      />
      <Slider
        label={t("lnCasing")}
        value={s.casing}
        defaultValue={base.casing}
        min={0}
        max={0.01}
        step={0.0001}
        onChange={(v) => onChange({ casing: v })}
        format={(v) => (v ? px(v) : t("lnNone"))}
      />
      {s.casing > 0 && (
        <div className="mm-st-color-row">
          <span>{t("lnCasingColor")}</span>
          <ColorControl
            color={s.casingColor}
            recents={[]}
            onChange={(c) => onChange({ casingColor: c })}
            label={t("lnCasingColor")}
            recentLabel=""
          />
        </div>
      )}
    </Section>
  );
}

export function StampStrokeSections({
  stamp: st,
  base,
  onChange,
  onPickSet,
  uploads,
  t,
  px,
  recentColors,
  onCommitColor,
}: {
  stamp: LineStampStroke;
  /** What each slider's reset returns to (the style's own pieces). */
  base: LineStampStroke;
  onChange: (patch: Partial<LineStampStroke>) => void;
  /** Use another line-art set (its own defaults). */
  onPickSet: (set: LineArtSet) => void;
  uploads: LineArtUploads;
  t: T;
  px: (v: number) => string;
  recentColors: string[];
  onCommitColor: (c: string) => void;
}) {
  // Server sets and uploaded pictures can arrive while the panel is open.
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
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<LineCategory | "all">("walls");
  const currentSet = lineSet(st.set);
  // A set's own defaults, when the stroke uses another set than its style.
  const setBase =
    currentSet && currentSet.id !== base.set
      ? { ...base, ...currentSet.defaults }
      : base;
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
  return (
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
        <div className="mm-st-sets" role="listbox" aria-label={t("lnStampArt")}>
          {sets.map((x) => (
            <button
              key={x.id}
              role="option"
              aria-selected={x.id === st.set}
              className={`mm-st-set ${x.id === st.set ? "selected" : ""} ${x.locked ? "locked" : ""}`}
              title={x.locked ? t("stLocked") : lineSetLabel(t, x)}
              disabled={x.locked}
              onClick={() => onPickSet(x)}
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
                !query && category === "custom" ? "lnNoUploads" : "stNoResults",
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
          onChange={(v) => onChange({ size: v })}
          format={px}
        />
        <Slider
          label={t("lnSpacing")}
          value={st.spacing}
          defaultValue={setBase.spacing}
          min={-0.8}
          max={3}
          step={0.01}
          onChange={(v) => onChange({ spacing: v })}
          format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}
        />
        <Slider
          label={t("lnOffset")}
          value={st.offset}
          defaultValue={0}
          min={-3}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ offset: v })}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`}
        />
        <Slider
          label={t("stRotation")}
          value={st.rotation}
          defaultValue={0}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => onChange({ rotation: v })}
          format={(v) => `${v}°`}
        />
        <Toggle
          label={t("lnFollowPath")}
          checked={st.followPath}
          onChange={(v) => onChange({ followPath: v })}
        />
        <Toggle
          label={t("lnFit")}
          checked={st.fit}
          onChange={(v) => onChange({ fit: v })}
        />
        <Toggle
          label={t("lnFlip")}
          checked={st.flip}
          onChange={(v) => onChange({ flip: v })}
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
              onClick={() => onChange({ corners: c })}
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
            onChange={(v) => onChange({ caps: v })}
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
              onClick={() => onChange({ anchor: a })}
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
          onChange={(v) => onChange({ scaleJitter: v })}
          format={pct}
        />
        <Slider
          label={t("stRotationJitter")}
          value={st.rotationJitter}
          defaultValue={setBase.rotationJitter}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onChange({ rotationJitter: v })}
          format={pct}
        />
        <button
          className="mm-pill"
          onClick={() => onChange({ seed: newSeed() })}
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
                onChange({ ink: c });
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
                onChange={(c) => onChange({ fill: c })}
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
