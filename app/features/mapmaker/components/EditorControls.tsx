"use client";
/** Small, reusable presentational pieces shared across the standalone map
 * creator's toolbars, object inspector and Edit menu. Kept together in one
 * file (rather than one file per widget) since each is only a few lines and
 * they're only ever used from MapCreatorEditor.tsx — mirrors how the print
 * studio keeps its own editor UI self-contained (features/studio/components). */
import { useId, type ReactNode } from "react";
import { ResetButton, ValueEditor } from "@/components/ui/ValueEditor";
import { Glyph } from "../glyphs";
import { shortcutLabel } from "../shortcuts";
import { DEFAULT_BRUSH } from "../brush/presets";
import type { MMObject, MMPatch } from "../types";

/** A collapsible group of settings in a tool panel. */
export function Section({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="mm-bp-section" open={open}>
      <summary>
        <span>{title}</span>
        <Glyph name="chevronDown" size={13} />
      </summary>
      <div className="mm-bp-section-body">{children}</div>
    </details>
  );
}
/** An on/off switch row in a tool panel. */
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mm-bp-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mm-bp-switch" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}
/**
 * A setting's slider. Its value can be typed exactly (click it — see
 * ValueEditor), and with a `defaultValue` a reset button appears beside it
 * once the value differs (the button always keeps its place, so rows line up).
 * Every slider in the editor passes its default (checked by a test).
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  parse,
  defaultValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Typed number (in the units shown) → value, for displays that aren't linear. */
  parse?: (shown: number) => number;
  /** The value the reset button returns to. */
  defaultValue?: number;
}) {
  const id = useId();
  const slider = (
    <div className="mm-slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <b>
        <ValueEditor
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          format={format}
          parse={parse}
          label={label}
        />
      </b>
    </div>
  );
  if (defaultValue === undefined) return slider;
  return (
    <div className="mm-reset-row">
      {slider}
      <ResetButton
        value={value}
        defaultValue={defaultValue}
        onReset={() => onChange(defaultValue)}
        label={label}
        format={format}
        className="mm-reset"
      />
    </div>
  );
}

export function ColorControl({
  color,
  recents,
  onChange,
  label,
  recentLabel,
}: {
  color: string;
  recents: string[];
  onChange: (v: string) => void;
  label: string;
  recentLabel: string;
}) {
  return (
    <div className="mm-color-control">
      <label className="mm-color-input" title={label}>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {recents.length > 0 && (
        <div className="mm-recents-row" title={recentLabel}>
          {recents.map((c) => (
            <button
              key={c}
              className="mm-color-chip"
              style={{ background: c }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ObjectQuickBar({
  obj,
  t,
  onPatch,
  onDuplicate,
  onDelete,
  onReorder,
  lineActions,
}: {
  obj: MMObject;
  layerId: string;
  t: (k: string, opts?: Record<string, unknown>) => string;
  onPatch: (patch: MMPatch) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (dir: "front" | "back" | "forward" | "backward") => void;
  /** Lines: node editing and path actions (their look is edited in the Line panel). */
  lineActions?: {
    editingNodes: boolean;
    canClose: boolean;
    onEditNodes: () => void;
    onReverse: () => void;
    onToggleClosed: () => void;
  };
}) {
  return (
    <div className="mm-quickbar">
      {obj.kind === "line" && lineActions && (
        <div className="button-row">
          <button
            className={`secondary-button ${lineActions.editingNodes ? "active" : ""}`}
            aria-pressed={lineActions.editingNodes}
            onClick={lineActions.onEditNodes}
            title={t("lnEditNodesHint", {
              key: shortcutLabel("line.editNodes"),
            })}
          >
            <Glyph name="editNodes" size={13} /> {t("lnEditNodes")}
          </button>
          <button
            className="secondary-button"
            onClick={lineActions.onReverse}
            title={t("lnReverseHint")}
          >
            <Glyph name="reverse" size={13} />
          </button>
          <button
            className={`secondary-button ${obj.closed ? "active" : ""}`}
            aria-pressed={obj.closed}
            disabled={!lineActions.canClose}
            onClick={lineActions.onToggleClosed}
            title={t("lnClosed")}
          >
            <Glyph name="closePath" size={13} />
          </button>
        </div>
      )}
      {obj.kind === "brush" && (
        <>
          <ColorControl
            color={obj.color}
            recents={[]}
            onChange={(v) => onPatch({ color: v })}
            label={t("mmColor")}
            recentLabel=""
          />
          <Slider
            label={t("mmBrushSize")}
            defaultValue={DEFAULT_BRUSH.size}
            value={obj.size}
            min={0.002}
            max={0.05}
            step={0.001}
            onChange={(v) => onPatch({ size: v })}
          />
          <Slider
            label={t("mmBrushOpacity")}
            defaultValue={1}
            value={obj.opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => onPatch({ opacity: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label={t("mmBrushSoftness")}
            defaultValue={DEFAULT_BRUSH.softness}
            value={obj.softness}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onPatch({ softness: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </>
      )}
      <div className="button-row">
        <button
          className="secondary-button"
          title={t("mmBringToFront")}
          onClick={() => onReorder("front")}
        >
          <Glyph name="toTop" size={13} />
        </button>
        <button
          className="secondary-button"
          title={t("mmBringForward")}
          onClick={() => onReorder("forward")}
        >
          <Glyph name="up" size={13} />
        </button>
        <button
          className="secondary-button"
          title={t("mmSendBackward")}
          onClick={() => onReorder("backward")}
        >
          <Glyph name="down" size={13} />
        </button>
        <button
          className="secondary-button"
          title={t("mmSendToBack")}
          onClick={() => onReorder("back")}
        >
          <Glyph name="toBottom" size={13} />
        </button>
        <button className="secondary-button" onClick={onDuplicate}>
          {t("mmDuplicateObject")}
        </button>
        <button className="secondary-button" onClick={onDelete}>
          {t("mmDeleteObject")}
        </button>
      </div>
    </div>
  );
}

export function MenuRow({
  label,
  shortcut,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <button className="mm-menu-row" disabled={disabled} onClick={onClick}>
      {icon && <Glyph name={icon} size={13} />}
      <span>{label}</span>
      {shortcut && <kbd className="mm-key">{shortcut}</kbd>}
    </button>
  );
}

export function MenuHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mm-menu-hint">
      <span>{label}</span>
      <small>{hint}</small>
    </div>
  );
}

/** Toolbar shown in place of the single-object ObjectQuickBar whenever a
 * marquee-select or shift-click has more than one object selected: batched
 * front/back/duplicate/copy/delete rather than the single-object's
 * per-kind style controls, which don't make sense across mixed kinds. */
/** A small toolbar button showing just a glyph (its label is the tooltip). */
function IconButton({
  glyph,
  label,
  onClick,
  disabled,
}: {
  glyph: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="mm-icon-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Glyph name={glyph} size={15} />
    </button>
  );
}

/** Shown while several objects are selected: arrange, group, align and
 * distribute them, or turn them into a stamp. Icon buttons, so the whole
 * set fits the toolbar's one row. */
export function MultiSelectionBar({
  count,
  t,
  onDuplicate,
  onDelete,
  onCopy,
  onFront,
  onBack,
  onClear,
  grouped,
  onGroup,
  onUngroup,
  onAlign,
  onDistribute,
  onLock,
  onHide,
  onSaveStamp,
}: {
  count: number;
  t: (k: string, opts?: Record<string, unknown>) => string;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onFront: () => void;
  onBack: () => void;
  onClear: () => void;
  /** Some of the selection is grouped (Ungroup applies). */
  grouped: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (
    mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom",
  ) => void;
  onDistribute: (axis: "x" | "y") => void;
  onLock: () => void;
  onHide: () => void;
  /** Null when it isn't available (signed out). */
  onSaveStamp: (() => void) | null;
}) {
  return (
    <div className="mm-quickbar">
      <span className="mm-toolbar-note">{t("mmMultiSelected", { count })}</span>
      <div className="mm-icon-group">
        <IconButton
          glyph="group"
          label={`${t("mmGroup")} (${shortcutLabel("edit.group")})`}
          onClick={onGroup}
        />
        <IconButton
          glyph="ungroup"
          label={`${t("mmUngroup")} (${shortcutLabel("edit.ungroup")})`}
          onClick={onUngroup}
          disabled={!grouped}
        />
      </div>
      <div className="mm-icon-group">
        <IconButton
          glyph="alignLeft"
          label={t("mmAlignLeft")}
          onClick={() => onAlign("left")}
        />
        <IconButton
          glyph="alignCenterX"
          label={t("mmAlignCenterX")}
          onClick={() => onAlign("centerX")}
        />
        <IconButton
          glyph="alignRight"
          label={t("mmAlignRight")}
          onClick={() => onAlign("right")}
        />
        <IconButton
          glyph="alignTop"
          label={t("mmAlignTop")}
          onClick={() => onAlign("top")}
        />
        <IconButton
          glyph="alignCenterY"
          label={t("mmAlignCenterY")}
          onClick={() => onAlign("centerY")}
        />
        <IconButton
          glyph="alignBottom"
          label={t("mmAlignBottom")}
          onClick={() => onAlign("bottom")}
        />
        <IconButton
          glyph="distributeX"
          label={t("mmDistributeX")}
          onClick={() => onDistribute("x")}
          disabled={count < 3}
        />
        <IconButton
          glyph="distributeY"
          label={t("mmDistributeY")}
          onClick={() => onDistribute("y")}
          disabled={count < 3}
        />
      </div>
      <div className="mm-icon-group">
        <IconButton
          glyph="toTop"
          label={t("mmBringToFront")}
          onClick={onFront}
        />
        <IconButton
          glyph="toBottom"
          label={t("mmSendToBack")}
          onClick={onBack}
        />
        <IconButton glyph="lock" label={t("mmLockObjects")} onClick={onLock} />
        <IconButton
          glyph="eyeOff"
          label={t("mmHideObjects")}
          onClick={onHide}
        />
      </div>
      <div className="mm-icon-group">
        <IconButton
          glyph="copy"
          label={`${t("mmCopyObject")} (${shortcutLabel("edit.copy")})`}
          onClick={onCopy}
        />
        <IconButton
          glyph="duplicate"
          label={`${t("mmDuplicateObject")} (${shortcutLabel("edit.duplicate")})`}
          onClick={onDuplicate}
        />
        <IconButton
          glyph="trash"
          label={t("mmDeleteObject")}
          onClick={onDelete}
        />
        {onSaveStamp && (
          <IconButton
            glyph="stamp"
            label={t("stSaveAsStamp")}
            onClick={onSaveStamp}
          />
        )}
        <IconButton
          glyph="close"
          label={t("mmClearSelection")}
          onClick={onClear}
        />
      </div>
    </div>
  );
}
