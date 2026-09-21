"use client";
/** Small, reusable presentational pieces shared across the standalone map
 * creator's toolbars, object inspector and Edit menu. Kept together in one
 * file (rather than one file per widget) since each is only a few lines and
 * they're only ever used from MapCreatorEditor.tsx — mirrors how the print
 * studio keeps its own editor UI self-contained (features/studio/components). */
import { Glyph } from "../glyphs";
import type { MMObject, MMPatch } from "../types";

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
      {obj.kind === "icon" && (
        <>
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmIconSize")} value={obj.scale} min={0.3} max={4} step={0.1} onChange={(v) => onPatch({ scale: v })} />
          <Slider label={t("mmIconRotation")} value={obj.rotation} min={-180} max={180} step={1} onChange={(v) => onPatch({ rotation: v })} format={(v) => `${v}°`} />
        </>
      )}
      {obj.kind === "label" && (
        <>
          <input className="mm-inline-text" value={obj.text} onChange={(e) => onPatch({ text: e.target.value })} />
          <ColorControl color={obj.color} recents={[]} onChange={(v) => onPatch({ color: v })} label={t("mmColor")} recentLabel="" />
          <Slider label={t("mmLabelSize")} value={obj.size} min={0.01} max={0.1} step={0.005} onChange={(v) => onPatch({ size: v })} />
          <Slider label={t("mmIconRotation")} value={obj.rotation ?? 0} min={-180} max={180} step={1} onChange={(v) => onPatch({ rotation: v })} format={(v) => `${v}°`} />
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
          <Glyph name="up" size={13} />
        </button>
        <button className="secondary-button" title={t("mmSendToBack")} onClick={() => onReorder("back")}>
          <Glyph name="down" size={13} />
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
