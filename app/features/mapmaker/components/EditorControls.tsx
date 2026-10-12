"use client";
/** Small, reusable presentational pieces shared across the standalone map
 * creator's toolbars, object inspector and Edit menu. Kept together in one
 * file (rather than one file per widget) since each is only a few lines and
 * they're only ever used from MapCreatorEditor.tsx — mirrors how the print
 * studio keeps its own editor UI self-contained (features/studio/components). */
import type { ReactNode } from "react";
import { Glyph } from "../glyphs";
import { ARABIC_RANGE } from "../domain";
import type { LabelAlign, MMObject, MMPatch } from "../types";
import {SelectField} from "@/components/ui/fields";

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
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="mm-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <b>{format ? format(value) : value}</b>
    </label>
  );
}

/**
 * A slider with a reset button that returns it to its default value (shown
 * only once the value differs, but always taking its space so rows line up).
 */
export function ResetSlider({
  defaultValue,
  resetLabel,
  ...slider
}: Parameters<typeof Slider>[0] & { defaultValue: number; resetLabel: string }) {
  const changed = Math.abs(slider.value - defaultValue) > 1e-9;
  return (
    <div className="mm-reset-row">
      <Slider {...slider} />
      <button
        className="mm-reset"
        title={resetLabel}
        aria-label={`${resetLabel}: ${slider.label}`}
        style={{ visibility: changed ? "visible" : "hidden" }}
        onClick={() => slider.onChange(defaultValue)}
      >
        <Glyph name="reset" size={12} />
      </button>
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
        <input type="color" value={color} onChange={(e) => onChange(e.target.value)} />
      </label>
      {recents.length > 0 && (
        <div className="mm-recents-row" title={recentLabel}>
          {recents.map((c) => (
            <button key={c} className="mm-color-chip" style={{ background: c }} onClick={() => onChange(c)} />
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
}: {
  obj: MMObject;
  layerId: string;
  t: (k: string, opts?: Record<string, unknown>) => string;
  onPatch: (patch: MMPatch) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (dir: "front" | "back" | "forward" | "backward") => void;
}) {
  return (
    <div className="mm-quickbar">
      {obj.kind === "label" && (
        <>
          <input
            className="mm-inline-text"
            value={obj.text}
            dir={obj.rtl ? "rtl" : "ltr"}
            onChange={(e) => {
              const text = e.target.value,
                rtl = ARABIC_RANGE.test(text);
              onPatch(rtl !== obj.rtl ? { text, rtl } : { text });
            }}
          />
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmLabelSize")} value={obj.size} min={0.01} max={0.1} step={0.005} onChange={(v) => onPatch({ size: v })} />
          <Slider label={t("mmIconRotation")} value={obj.rotation ?? 0} min={-180} max={180} step={1} onChange={(v) => onPatch({ rotation: v })} format={(v) => `${v}°`} />
          <SelectField label={t("mmLabelAlign")} value={obj.align} onChange={(v) => onPatch({ align: v as LabelAlign })}>
            <option value="start">{t("mmAlignStart")}</option>
            <option value="center">{t("mmAlignCenter")}</option>
            <option value="end">{t("mmAlignEnd")}</option>
          </SelectField>
        </>
      )}
      {obj.kind === "path" && (
        <>
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmPathWidth")} value={obj.width} min={0.002} max={0.03} step={0.001} onChange={(v) => onPatch({ width: v })} />
        </>
      )}
      {obj.kind === "region" && (
        <Slider label={t("mmFillOpacity")} value={obj.opacity} min={0.1} max={1} step={0.05} onChange={(v) => onPatch({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      {obj.kind === "brush" && (
        <>
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmBrushSize")} value={obj.size} min={0.002} max={0.05} step={0.001} onChange={(v) => onPatch({ size: v })} />
          <Slider label={t("mmBrushOpacity")} value={obj.opacity} min={0.1} max={1} step={0.05} onChange={(v) => onPatch({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t("mmBrushSoftness")} value={obj.softness} min={0} max={1} step={0.05} onChange={(v) => onPatch({ softness: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </>
      )}
      <div className="button-row">
        <button className="secondary-button" title={t("mmBringToFront")} onClick={() => onReorder("front")}>
          <Glyph name="toTop" size={13} />
        </button>
        <button className="secondary-button" title={t("mmBringForward")} onClick={() => onReorder("forward")}>
          <Glyph name="up" size={13} />
        </button>
        <button className="secondary-button" title={t("mmSendBackward")} onClick={() => onReorder("backward")}>
          <Glyph name="down" size={13} />
        </button>
        <button className="secondary-button" title={t("mmSendToBack")} onClick={() => onReorder("back")}>
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
function IconButton({ glyph, label, onClick, disabled }: { glyph: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="mm-icon-btn" title={label} aria-label={label} onClick={onClick} disabled={disabled}>
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
  onAlign: (mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") => void;
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
        <IconButton glyph="group" label={`${t("mmGroup")} (⌘G)`} onClick={onGroup} />
        <IconButton glyph="ungroup" label={`${t("mmUngroup")} (⇧⌘G)`} onClick={onUngroup} disabled={!grouped} />
      </div>
      <div className="mm-icon-group">
        <IconButton glyph="alignLeft" label={t("mmAlignLeft")} onClick={() => onAlign("left")} />
        <IconButton glyph="alignCenterX" label={t("mmAlignCenterX")} onClick={() => onAlign("centerX")} />
        <IconButton glyph="alignRight" label={t("mmAlignRight")} onClick={() => onAlign("right")} />
        <IconButton glyph="alignTop" label={t("mmAlignTop")} onClick={() => onAlign("top")} />
        <IconButton glyph="alignCenterY" label={t("mmAlignCenterY")} onClick={() => onAlign("centerY")} />
        <IconButton glyph="alignBottom" label={t("mmAlignBottom")} onClick={() => onAlign("bottom")} />
        <IconButton glyph="distributeX" label={t("mmDistributeX")} onClick={() => onDistribute("x")} disabled={count < 3} />
        <IconButton glyph="distributeY" label={t("mmDistributeY")} onClick={() => onDistribute("y")} disabled={count < 3} />
      </div>
      <div className="mm-icon-group">
        <IconButton glyph="toTop" label={t("mmBringToFront")} onClick={onFront} />
        <IconButton glyph="toBottom" label={t("mmSendToBack")} onClick={onBack} />
        <IconButton glyph="lock" label={t("mmLockObjects")} onClick={onLock} />
        <IconButton glyph="eyeOff" label={t("mmHideObjects")} onClick={onHide} />
      </div>
      <div className="mm-icon-group">
        <IconButton glyph="copy" label={`${t("mmCopyObject")} (⌘C)`} onClick={onCopy} />
        <IconButton glyph="duplicate" label={`${t("mmDuplicateObject")} (⌘D)`} onClick={onDuplicate} />
        <IconButton glyph="trash" label={t("mmDeleteObject")} onClick={onDelete} />
        {onSaveStamp && <IconButton glyph="stamp" label={t("stSaveAsStamp")} onClick={onSaveStamp} />}
        <IconButton glyph="close" label={t("mmClearSelection")} onClick={onClear} />
      </div>
    </div>
  );
}
