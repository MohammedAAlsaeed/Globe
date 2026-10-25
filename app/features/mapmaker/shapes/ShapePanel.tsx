"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs drawn at runtime */
/**
 * The Shape Tool panel (left of the canvas while the Shape tool is active,
 * or floating over it while shapes are selected with the Select tool):
 *
 *   drawing   Rectangle / Ellipse / Polygon (and star) / Pen / Free, then
 *             Edit Nodes and Doors; how a new part joins the selected
 *             shape (new shape, add, subtract, intersect, exclude)
 *   shape     (one selected) name, its numbers (size, turn, corners,
 *             sides), area and perimeter, its parts — each with how it
 *             combines, in order, removable — doors, flatten, release
 *   combine   (several selected) union, subtract, intersect, exclude
 *   styles    built-in, the person's own and official ones
 *   fill      none, colour, texture, classic pattern or mask
 *   stroke    none, painted or wall pieces; inside, centred or outside
 *
 * Changes apply live: to the next shape drawn when nothing is selected, or
 * to the selected shapes only (see ./state for the three kinds of values).
 */
import { useReducer, useState, type ReactNode } from "react";
import Link from "next/link";
import { Glyph } from "../glyphs";
import { Section, Slider, Toggle } from "../components/EditorControls";
import { BLEND_MODES } from "../brush/BrushPanel";
import { SourcePicker } from "../brush/SourcePicker";
import { biomeSwatchDataUrl } from "../textures";
import { BIOME_LABEL_KEY, BIOME_LIST } from "../domain";
import type {
  BlendMode,
  LineColorStroke,
  LineStampStroke,
  PaintSource,
  ShapeFill,
  ShapeFillType,
  ShapeLook,
  ShapeOp,
  ShapePrim,
  ShapeStroke,
  StrokeAlign,
} from "../types";
import {
  ColorStrokeSection,
  StampStrokeSections,
  type LineArtUploads,
} from "../lines/StrokeSections";
import { stampFromSet } from "../lines/state";
import { shortcutLabel, useShortcuts, type ShortcutId } from "../shortcuts";
import {
  builtinShapeStyles,
  freshLook,
  resetShapeProp,
  SHAPE_COMBINES,
  type ShapeCombine,
  type ShapeDrawMode,
  type ShapeStyle,
  type ShapeToolState,
} from "./state";
import { shapeLookPreview } from "./render";

type T = (k: string, opts?: Record<string, unknown>) => string;

export const SHAPE_DRAW_MODES: {
  key: ShapeDrawMode;
  labelKey: string;
  hintKey: string;
  glyph: string;
  shortcut: ShortcutId;
}[] = [
  {
    key: "rect",
    labelKey: "shDrawRect",
    hintKey: "shHintRect",
    glyph: "rect",
    shortcut: "shape.rect",
  },
  {
    key: "ellipse",
    labelKey: "shDrawEllipse",
    hintKey: "shHintEllipse",
    glyph: "ellipse",
    shortcut: "shape.ellipse",
  },
  {
    key: "polygon",
    labelKey: "shDrawPolygon",
    hintKey: "shHintPolygon",
    glyph: "polygon",
    shortcut: "shape.polygon",
  },
  {
    key: "pen",
    labelKey: "shDrawPen",
    hintKey: "shHintPen",
    glyph: "pen",
    shortcut: "shape.pen",
  },
  {
    key: "free",
    labelKey: "shDrawFree",
    hintKey: "shHintFree",
    glyph: "freeBrush",
    shortcut: "shape.free",
  },
  {
    key: "edit",
    labelKey: "shDrawEdit",
    hintKey: "shHintEdit",
    glyph: "editNodes",
    shortcut: "line.editNodes",
  },
  {
    key: "doors",
    labelKey: "shDrawDoors",
    hintKey: "shHintDoors",
    glyph: "door",
    shortcut: "shape.doors",
  },
];
export const COMBINE_GLYPH: Record<ShapeCombine, string> = {
  new: "opNew",
  add: "opAdd",
  subtract: "opSubtract",
  intersect: "opIntersect",
  exclude: "opExclude",
};
const FILL_TYPES: ShapeFillType[] = [
  "none",
  "color",
  "texture",
  "pattern",
  "mask",
];
const ALIGNS: StrokeAlign[] = ["inside", "center", "outside"];
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---- previews ----------------------------------------------------------------------
const previews = new Map<string, string>();
function StylePreview({ look }: { look: ShapeLook }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const key = JSON.stringify([look.stroke, look.fill, look.opacity]);
  let url = previews.get(key);
  if (!url && typeof document !== "undefined") {
    let pending = false;
    const c = shapeLookPreview(look, 64, 44, () => {
      pending = true;
      previews.delete(key);
      redraw();
    });
    url = c.toDataURL("image/png");
    if (!pending) previews.set(key, url);
  }
  return url ? <img src={url} alt="" draggable={false} /> : null;
}

// ---- what the editor hands the panel ------------------------------------------------------
export interface ShapeLibrary {
  signedIn: boolean;
  own: ShapeStyle[];
  official: ShapeStyle[];
  max: number | null;
  busy: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onLimit: () => void;
}
/** One row of the parts list (the tree, flattened with depths). */
export interface PartRow {
  id: string;
  depth: number;
  op: ShapeOp;
  /** The first part of its list: the base the others combine with. */
  base: boolean;
  kind: ShapePrim["kind"] | "path" | "group";
  nodes: number;
}
export interface ShapeActions {
  name: string;
  onRename: (name: string) => void;
  parts: PartRow[];
  selectedPart: string | null;
  onSelectPart: (id: string | null) => void;
  onPartOp: (id: string, op: ShapeOp) => void;
  onPartMove: (id: string, by: -1 | 1) => void;
  onPartRemove: (id: string) => void;
  /** The primitive being shown (the selected part's, or the only part's). */
  prim: { pathId: string; prim: ShapePrim } | null;
  onPrim: (pathId: string, prim: ShapePrim) => void;
  /** Area (map px²) and perimeter (map px). */
  measure: { area: number; perimeter: number };
  doors: number;
  onClearDoors: () => void;
  editingNodes: boolean;
  onEditNodes: () => void;
  onFlatten: () => void;
  onRelease: () => void;
  canRelease: boolean;
  /** Turns a selected door's width (fraction of the map width), when one is picked. */
  door: {
    width: number;
    onWidth: (w: number) => void;
    onRemove: () => void;
  } | null;
}

export function ShapePanel({
  state,
  onChange,
  editing,
  onEditLook,
  onDoneEditing,
  baseLook,
  shape,
  combineCount,
  onCombine,
  combineTarget,
  library,
  uploads,
  t,
  mapWidthPx,
  gridCellPx,
  recentColors,
  onCommitColor,
  target,
  floating = false,
}: {
  state: ShapeToolState;
  onChange: (next: ShapeToolState) => void;
  /** Selected shapes being edited (the first one's look), or null. */
  editing: { count: number; look: ShapeLook; styleId: string | null } | null;
  onEditLook: (look: ShapeLook, styleId?: string | null) => void;
  onDoneEditing: () => void;
  baseLook: ShapeLook;
  shape: ShapeActions | null;
  /** Shapes selected together (combining needs two or more). */
  combineCount: number;
  onCombine: (op: ShapeOp) => void;
  /** The shape a new part would join (its name), when combining. */
  combineTarget: string | null;
  library: ShapeLibrary;
  uploads: LineArtUploads;
  t: T;
  mapWidthPx: number;
  /** A grid cell's width in map pixels (for sizes in cells), when shown. */
  gridCellPx: number | null;
  recentColors: string[];
  onCommitColor: (c: string) => void;
  target: ReactNode;
  floating?: boolean;
}) {
  const keys = useShortcuts();
  const [styleName, setStyleName] = useState(""),
    [savingStyle, setSavingStyle] = useState(false);
  const look = editing ? editing.look : state.look,
    styleId = editing ? editing.styleId : state.styleId,
    base = baseLook;
  const setLook = (next: ShapeLook, appliedStyle?: string | null) => {
    if (editing) onEditLook(next, appliedStyle);
    else
      onChange({
        ...state,
        look: next,
        styleId: appliedStyle === undefined ? null : appliedStyle,
      });
  };
  const setStroke = (p: Partial<ShapeStroke>) =>
    setLook({ ...look, stroke: { ...look.stroke, ...p } });
  const setColor = (p: Partial<LineColorStroke>) =>
    setStroke({ color: { ...look.stroke.color, ...p } });
  const setStamp = (p: Partial<LineStampStroke>) =>
    setStroke({ stamp: { ...look.stroke.stamp, ...p } });
  const setFill = (p: Partial<ShapeFill>) =>
    setLook({ ...look, fill: { ...look.fill, ...p } });
  const setSource = (p: Partial<PaintSource>) =>
    setFill({ source: { ...look.fill.source, ...p } });
  const reset = (path: string) =>
    setLook(resetShapeProp(look, base, path), editing ? undefined : styleId);
  const px = (v: number) =>
    `${Math.max(1, Math.round(v * mapWidthPx * 10) / 10)} px`;
  const fill = look.fill,
    stroke = look.stroke;
  const drawMode = SHAPE_DRAW_MODES.find((m) => m.key === state.draw)!;
  const creating = !editing && !["edit", "doors"].includes(state.draw);
  const ownCount = library.own.length,
    atLimit = library.max !== null && ownCount >= library.max;
  const cells = (v: number) =>
    gridCellPx ? ` · ${(v / gridCellPx).toFixed(1)} ${t("shCells")}` : "";

  const styleButton = (style: ShapeStyle) => (
    <div
      key={style.id}
      className={`mm-ln-style mm-sh-style ${styleId === style.id ? "selected" : ""} ${style.locked ? "locked" : ""}`}
    >
      <button
        title={
          style.locked
            ? t("lnStyleLocked")
            : (style.name ?? (style.labelKey ? t(style.labelKey) : style.id))
        }
        disabled={style.locked}
        onClick={() => setLook(freshLook(style.look), style.id)}
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
      className={`mm-brush-panel mm-line-panel mm-shape-panel ${floating ? "floating" : ""}`}
      aria-label={t("shPanel")}
    >
      {target}
      {editing ? (
        <div className="mm-st-editing">
          <span>{t("shEditing", { count: editing.count })}</span>
          <button className="mm-pill" onClick={onDoneEditing}>
            {t("stDone")}
          </button>
        </div>
      ) : null}
      {!floating && (
        <>
          <div
            className="mm-bp-modes mm-sh-modes"
            role="radiogroup"
            aria-label={t("shDrawMode")}
          >
            {SHAPE_DRAW_MODES.map((m) => (
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

      {/* ---- how the next part is made ---- */}
      {creating && (
        <Section title={t("shDrawing")} open>
          <span className="mm-bp-subtitle">{t("shCombine")}</span>
          <div
            className="mm-bp-segment mm-sh-ops"
            role="radiogroup"
            aria-label={t("shCombine")}
          >
            {SHAPE_COMBINES.map((c) => (
              <button
                key={c}
                className={state.combine === c ? "active" : ""}
                role="radio"
                aria-checked={state.combine === c}
                title={`${t(`shOp_${c}`)} (${shortcutLabel("shape.combine", keys)})`}
                onClick={() => onChange({ ...state, combine: c })}
              >
                <Glyph name={COMBINE_GLYPH[c]} size={16} />
                <span>{t(`shOp_${c}`)}</span>
              </button>
            ))}
          </div>
          <p className="mm-bp-hint">
            {state.combine === "new"
              ? t("shCombineNewHint")
              : combineTarget
                ? t("shCombineTargetHint", {
                    op: t(`shOp_${state.combine}`),
                    name: combineTarget,
                  })
                : t("shCombineNoTarget")}
          </p>
          {state.draw === "rect" && (
            <Slider
              label={t("shCornerRadius")}
              value={state.radius}
              defaultValue={0}
              min={0}
              max={0.5}
              step={0.01}
              onChange={(v) => onChange({ ...state, radius: v })}
              format={(v) => (v ? pct(v * 2) : t("lnNone"))}
            />
          )}
          {state.draw === "polygon" && (
            <>
              <Toggle
                label={t("shStar")}
                checked={state.star}
                onChange={(v) => onChange({ ...state, star: v })}
              />
              <Slider
                label={t(state.star ? "shPoints" : "shSides")}
                value={state.sides}
                defaultValue={state.star ? 5 : 6}
                min={3}
                max={24}
                step={1}
                onChange={(v) => onChange({ ...state, sides: Math.round(v) })}
              />
              {state.star && (
                <Slider
                  label={t("shInner")}
                  value={state.inner}
                  defaultValue={0.5}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  onChange={(v) => onChange({ ...state, inner: v })}
                  format={pct}
                />
              )}
            </>
          )}
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
          {state.draw === "pen" && (
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
          )}
          <p className="mm-bp-hint">{t("shModifiersHint")}</p>
        </Section>
      )}
      {!editing && state.draw === "doors" && !shape?.door && (
        <Section title={t("shDoors")} open>
          <Slider
            label={t("shDoorWidth")}
            value={state.portalWidth}
            defaultValue={0.012}
            min={0.002}
            max={0.08}
            step={0.0005}
            onChange={(v) => onChange({ ...state, portalWidth: v })}
            format={px}
          />
        </Section>
      )}

      {/* ---- the one selected shape ---- */}
      {shape && (
        <Section title={t("shShapeSection")} open>
          <label className="mm-ln-name">
            <span>{t("lnName")}</span>
            <input
              key={shape.name}
              defaultValue={shape.name}
              maxLength={80}
              placeholder={t("shNamePlaceholder")}
              onBlur={(e) => {
                if (e.target.value !== shape.name)
                  shape.onRename(e.target.value.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <p className="mm-bp-hint mm-sh-measure">
            {t("shMeasure", {
              area: Math.round(shape.measure.area).toLocaleString(),
              perimeter: Math.round(shape.measure.perimeter).toLocaleString(),
            })}
            {gridCellPx
              ? ` · ${t("shMeasureCells", {
                  area: (shape.measure.area / gridCellPx ** 2).toFixed(1),
                  perimeter: (shape.measure.perimeter / gridCellPx).toFixed(1),
                })}`
              : ""}
          </p>
          {shape.prim && (
            <PrimFields
              key={shape.prim.pathId}
              prim={shape.prim.prim}
              onChange={(p) => shape.onPrim(shape.prim!.pathId, p)}
              t={t}
              mapWidthPx={mapWidthPx}
              cells={cells}
            />
          )}
          <span className="mm-bp-subtitle">{t("shParts")}</span>
          <ol className="mm-sh-parts" aria-label={t("shParts")}>
            {shape.parts.map((p, i) => (
              <li
                key={p.id}
                className={shape.selectedPart === p.id ? "selected" : ""}
                style={{ paddingInlineStart: 6 + p.depth * 14 }}
              >
                <button
                  className="mm-sh-part-pick"
                  onClick={() =>
                    shape.onSelectPart(
                      shape.selectedPart === p.id ? null : p.id,
                    )
                  }
                  aria-pressed={shape.selectedPart === p.id}
                >
                  <Glyph
                    name={
                      p.kind === "group"
                        ? "group"
                        : p.kind === "path"
                          ? "pen"
                          : p.kind
                    }
                    size={14}
                  />
                  <span>
                    {t(`shPart_${p.kind}`)}
                    {p.kind !== "group" && (
                      <small> · {t("shNodes", { count: p.nodes })}</small>
                    )}
                  </span>
                </button>
                {p.base ? (
                  <span className="mm-sh-part-base">{t("shBase")}</span>
                ) : (
                  <select
                    value={p.op}
                    aria-label={t("shCombine")}
                    onChange={(e) =>
                      shape.onPartOp(p.id, e.target.value as ShapeOp)
                    }
                  >
                    {(["add", "subtract", "intersect", "exclude"] as const).map(
                      (op) => (
                        <option key={op} value={op}>
                          {t(`shOp_${op}`)}
                        </option>
                      ),
                    )}
                  </select>
                )}
                <button
                  className="mm-sh-part-btn"
                  title={t("shPartUp")}
                  aria-label={t("shPartUp")}
                  disabled={i === 0 || p.base}
                  onClick={() => shape.onPartMove(p.id, -1)}
                >
                  <Glyph name="up" size={12} />
                </button>
                <button
                  className="mm-sh-part-btn"
                  title={t("shPartDown")}
                  aria-label={t("shPartDown")}
                  onClick={() => shape.onPartMove(p.id, 1)}
                >
                  <Glyph name="down" size={12} />
                </button>
                <button
                  className="mm-sh-part-btn"
                  title={t("shPartRemove")}
                  aria-label={t("shPartRemove")}
                  disabled={shape.parts.length === 1}
                  onClick={() => shape.onPartRemove(p.id)}
                >
                  <Glyph name="trash" size={12} />
                </button>
              </li>
            ))}
          </ol>
          <div className="mm-st-flips">
            <button
              className={`mm-pill ${shape.editingNodes ? "selected" : ""}`}
              onClick={shape.onEditNodes}
              aria-pressed={shape.editingNodes}
              title={t("shEditNodesHint", {
                key: shortcutLabel("line.editNodes", keys),
              })}
            >
              <Glyph name="editNodes" size={14} />
              {t("lnEditNodes")}
            </button>
            <button
              className="mm-pill"
              onClick={shape.onFlatten}
              disabled={shape.parts.length < 2}
              title={t("shFlattenHint")}
            >
              <Glyph name="flatten" size={14} />
              {t("shFlatten")}
            </button>
            <button
              className="mm-pill"
              onClick={shape.onRelease}
              disabled={!shape.canRelease}
              title={t("shReleaseHint")}
            >
              <Glyph name="release" size={14} />
              {t("shRelease")}
            </button>
          </div>
          {shape.door ? (
            <div className="mm-sh-door">
              <Slider
                label={t("shDoorWidth")}
                value={shape.door.width}
                defaultValue={state.portalWidth}
                min={0.002}
                max={0.08}
                step={0.0005}
                onChange={shape.door.onWidth}
                format={px}
              />
              <button className="mm-pill" onClick={shape.door.onRemove}>
                <Glyph name="trash" size={12} />
                {t("shDoorRemove")}
              </button>
            </div>
          ) : (
            shape.doors > 0 && (
              <div className="mm-sh-door">
                <span className="mm-bp-hint">
                  {t("shDoorCount", { count: shape.doors })}
                </span>
                <button className="mm-pill" onClick={shape.onClearDoors}>
                  {t("shDoorsClear")}
                </button>
              </div>
            )
          )}
        </Section>
      )}

      {/* ---- several selected shapes ---- */}
      {combineCount >= 2 && (
        <Section title={t("shCombineSection", { count: combineCount })} open>
          <div className="mm-sh-combine">
            {(["add", "subtract", "intersect", "exclude"] as const).map(
              (op) => (
                <button
                  key={op}
                  className="mm-pill"
                  onClick={() => onCombine(op)}
                  title={t(`shCombineHint_${op}`)}
                >
                  <Glyph name={COMBINE_GLYPH[op]} size={16} />
                  {t(`shCombine_${op}`)}
                </button>
              ),
            )}
          </div>
          <p className="mm-bp-hint">{t("shCombineSectionHint")}</p>
        </Section>
      )}

      {/* ---- styles ---- */}
      <Section title={t("lnStyles")} open>
        <div className="mm-ln-styles mm-sh-styles">
          {builtinShapeStyles().map(styleButton)}
        </div>
        {library.official.length > 0 && (
          <>
            <span className="mm-bp-subtitle">{t("lnStylesOfficial")}</span>
            <div className="mm-ln-styles mm-sh-styles">
              {library.official.map(styleButton)}
            </div>
          </>
        )}
        <span className="mm-bp-subtitle">{t("lnStylesOwn")}</span>
        {library.signedIn ? (
          <>
            {library.own.length > 0 ? (
              <div className="mm-ln-styles mm-sh-styles">
                {library.own.map(styleButton)}
              </div>
            ) : (
              <p className="mm-bp-hint">{t("shStylesOwnEmpty")}</p>
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
                  placeholder={t("shStyleNamePlaceholder")}
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
            <p>{t("shStylesSignIn")}</p>
            <Link
              className="mm-pill"
              href={`/login?next=${encodeURIComponent("/editor")}`}
            >
              {t("acSignIn")}
            </Link>
          </div>
        )}
      </Section>

      {/* ---- fill ---- */}
      <Section title={t("shFill")} open>
        <div className="mm-bp-chips" role="radiogroup" aria-label={t("shFill")}>
          {FILL_TYPES.map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={fill.type === f}
              className={fill.type === f ? "active" : ""}
              onClick={() =>
                setFill({
                  type: f,
                  ...(f === "color" || f === "texture"
                    ? { source: { ...fill.source, type: f } }
                    : {}),
                })
              }
            >
              {t(`shFill_${f}`)}
            </button>
          ))}
        </div>
        {(fill.type === "color" || fill.type === "texture") && (
          <SourcePicker
            source={{ ...fill.source, type: fill.type }}
            onChange={setSource}
            t={t}
            recentColors={recentColors}
            onCommitColor={onCommitColor}
            showType={false}
          />
        )}
        {fill.type === "pattern" && (
          <>
            <div className="mm-texture-picker mm-sh-patterns">
              {BIOME_LIST.map((b) => (
                <button
                  key={b}
                  className={`mm-texture-swatch ${fill.pattern === b ? "selected" : ""}`}
                  title={t(BIOME_LABEL_KEY[b])}
                  aria-label={t(BIOME_LABEL_KEY[b])}
                  style={{ backgroundImage: `url(${biomeSwatchDataUrl(b)})` }}
                  onClick={() => setFill({ pattern: b })}
                />
              ))}
            </div>
            <div className="mm-bp-current">
              {t(BIOME_LABEL_KEY[fill.pattern])}
            </div>
            <Slider
              label={t("mmTextureScale")}
              value={fill.source.textureScale}
              defaultValue={base.fill.source.textureScale}
              min={0.25}
              max={4}
              step={0.05}
              onChange={(v) => setSource({ textureScale: v })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <Slider
              label={t("mmTextureRotation")}
              value={fill.source.textureRotation}
              defaultValue={0}
              min={0}
              max={359}
              step={1}
              onChange={(v) => setSource({ textureRotation: v })}
              format={(v) => `${v}°`}
            />
          </>
        )}
        {(fill.type === "texture" || fill.type === "pattern") && (
          <>
            <span className="mm-bp-subtitle">{t("shAnchor")}</span>
            <div
              className="mm-bp-segment small"
              role="radiogroup"
              aria-label={t("shAnchor")}
            >
              {(["map", "shape"] as const).map((a) => (
                <button
                  key={a}
                  className={fill.anchor === a ? "active" : ""}
                  role="radio"
                  aria-checked={fill.anchor === a}
                  onClick={() => setFill({ anchor: a })}
                >
                  {t(a === "map" ? "shAnchorMap" : "shAnchorShape")}
                </button>
              ))}
            </div>
            <p className="mm-bp-hint">
              {t(
                fill.anchor === "map" ? "shAnchorMapHint" : "shAnchorShapeHint",
              )}
            </p>
          </>
        )}
        {fill.type === "mask" ? (
          <>
            <span className="mm-bp-subtitle">{t("shMaskMode")}</span>
            <div
              className="mm-bp-segment small"
              role="radiogroup"
              aria-label={t("shMaskMode")}
            >
              {[false, true].map((inv) => (
                <button
                  key={String(inv)}
                  className={fill.invert === inv ? "active" : ""}
                  role="radio"
                  aria-checked={fill.invert === inv}
                  onClick={() => setFill({ invert: inv })}
                >
                  {t(inv ? "shMaskHide" : "shMaskShow")}
                </button>
              ))}
            </div>
            <Slider
              label={t("shFeather")}
              value={fill.feather}
              defaultValue={base.fill.type === "mask" ? base.fill.feather : 0}
              min={0}
              max={0.05}
              step={0.0005}
              onChange={(v) => setFill({ feather: v })}
              format={(v) => (v ? px(v) : t("lnNone"))}
            />
            <p className="mm-bp-hint">
              {t(fill.invert ? "shMaskHideHint" : "shMaskShowHint")}
            </p>
          </>
        ) : (
          fill.type !== "none" && (
            <Slider
              label={t("shFillOpacity")}
              value={fill.opacity}
              defaultValue={base.fill.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setFill({ opacity: v })}
              format={pct}
            />
          )
        )}
      </Section>
      {(fill.type === "color" || fill.type === "texture") && (
        <Section title={t("mmColorFilters")}>
          {(
            [
              ["hue", "mmHue", -180, 180, 1, (v: number) => `${v}°`],
              ["saturation", "mmSaturation", -1, 1, 0.01, pct],
              ["brightness", "mmBrightness", -1, 1, 0.01, pct],
              ["contrast", "mmContrast", -1, 1, 0.01, pct],
            ] as const
          ).map(([k, label, min, max, step, format]) => (
            <Slider
              key={k}
              label={t(label)}
              value={fill.source[k]}
              defaultValue={0}
              min={min}
              max={max}
              step={step}
              onChange={(v) => setSource({ [k]: v })}
              format={format}
            />
          ))}
        </Section>
      )}

      {/* ---- stroke ---- */}
      <Section title={t("shStroke")} open>
        <div
          className="mm-bp-segment"
          role="radiogroup"
          aria-label={t("lnStrokeMode")}
        >
          {(["none", "color", "stamp"] as const).map((m) => (
            <button
              key={m}
              className={stroke.mode === m ? "active" : ""}
              role="radio"
              aria-checked={stroke.mode === m}
              onClick={() => setStroke({ mode: m })}
            >
              {t(
                m === "none"
                  ? "lnNone"
                  : m === "color"
                    ? "lnModeColor"
                    : "shModeWalls",
              )}
            </button>
          ))}
        </div>
        {stroke.mode !== "none" && (
          <>
            <span className="mm-bp-subtitle">{t("shAlign")}</span>
            <div
              className="mm-bp-segment small"
              role="radiogroup"
              aria-label={t("shAlign")}
            >
              {ALIGNS.map((a) => (
                <button
                  key={a}
                  className={stroke.align === a ? "active" : ""}
                  role="radio"
                  aria-checked={stroke.align === a}
                  onClick={() => setStroke({ align: a })}
                >
                  {t(`shAlign_${a}`)}
                </button>
              ))}
            </div>
            <Slider
              label={t("shStrokeOpacity")}
              value={stroke.opacity}
              defaultValue={base.stroke.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setStroke({ opacity: v })}
              format={pct}
            />
          </>
        )}
      </Section>
      {stroke.mode === "color" && (
        <ColorStrokeSection
          stroke={stroke.color}
          base={base.stroke.color}
          onChange={setColor}
          t={t}
          px={px}
          recentColors={recentColors}
          onCommitColor={onCommitColor}
          showCaps={false}
        />
      )}
      {stroke.mode === "stamp" && (
        <StampStrokeSections
          stamp={stroke.stamp}
          base={base.stroke.stamp}
          onChange={setStamp}
          onPickSet={(x) =>
            setLook(
              {
                ...look,
                stroke: {
                  ...look.stroke,
                  mode: "stamp",
                  stamp: stampFromSet(x, look.stroke.stamp),
                },
              },
              editing ? undefined : null,
            )
          }
          uploads={uploads}
          t={t}
          px={px}
          recentColors={recentColors}
          onCommitColor={onCommitColor}
        />
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

      <div className="mm-st-resets">
        <button
          className="mm-pill"
          onClick={() => reset("fill")}
          title={t("shResetFillHint")}
        >
          <Glyph name="reset" size={12} /> {t("shResetFill")}
        </button>
        <button
          className="mm-pill"
          onClick={() => reset("stroke")}
          title={t("lnResetStrokeHint")}
        >
          <Glyph name="reset" size={12} /> {t("lnResetStroke")}
        </button>
        <button
          className="mm-pill"
          onClick={() => setLook(base, editing ? undefined : styleId)}
          title={t("shResetAllHint")}
        >
          <Glyph name="reset" size={12} /> {t("stResetAll")}
        </button>
      </div>
    </aside>
  );
}

/** A primitive's numbers: size, turn and its own kind's settings. */
function PrimFields({
  prim,
  onChange,
  t,
  mapWidthPx,
  cells,
}: {
  prim: ShapePrim;
  onChange: (p: ShapePrim) => void;
  t: T;
  mapWidthPx: number;
  cells: (px: number) => string;
}) {
  const round = (v: number) => Math.round(v * mapWidthPx);
  const isRound = prim.kind === "polygon" || prim.kind === "star";
  return (
    <div className="mm-sh-prim">
      <Slider
        label={t(isRound ? "shDiameter" : "shWidth")}
        value={round(prim.w)}
        // Resetting one side to the other makes it square.
        defaultValue={round(isRound ? prim.w : prim.h)}
        min={1}
        max={Math.round(mapWidthPx * 1.5)}
        step={1}
        onChange={(v) =>
          onChange(
            isRound
              ? { ...prim, w: v / mapWidthPx, h: v / mapWidthPx }
              : { ...prim, w: v / mapWidthPx },
          )
        }
        format={(v) => `${v} px${cells(v)}`}
      />
      {!isRound && (
        <Slider
          label={t("shHeight")}
          value={round(prim.h)}
          defaultValue={round(prim.w)}
          min={1}
          max={Math.round(mapWidthPx * 1.5)}
          step={1}
          onChange={(v) => onChange({ ...prim, h: v / mapWidthPx })}
          format={(v) => `${v} px${cells(v)}`}
        />
      )}
      <Slider
        label={t("stRotation")}
        value={Math.round(prim.rot)}
        defaultValue={0}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => onChange({ ...prim, rot: v })}
        format={(v) => `${v}°`}
      />
      {prim.kind === "rect" && (
        <Slider
          label={t("shCornerRadius")}
          value={prim.radius ?? 0}
          defaultValue={0}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => onChange({ ...prim, radius: v })}
          format={(v) => (v ? `${Math.round(v * 200)}%` : t("lnNone"))}
        />
      )}
      {isRound && (
        <Slider
          label={t(prim.kind === "star" ? "shPoints" : "shSides")}
          value={prim.sides ?? 6}
          defaultValue={prim.kind === "star" ? 5 : 6}
          min={3}
          max={24}
          step={1}
          onChange={(v) => onChange({ ...prim, sides: Math.round(v) })}
        />
      )}
      {prim.kind === "star" && (
        <Slider
          label={t("shInner")}
          value={prim.inner ?? 0.5}
          defaultValue={0.5}
          min={0.05}
          max={0.95}
          step={0.01}
          onChange={(v) => onChange({ ...prim, inner: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      )}
    </div>
  );
}
