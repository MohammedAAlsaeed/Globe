"use client";
import { useId, type ReactNode } from "react";
import { ResetButton, ValueEditor } from "./ValueEditor";

/** A typed number with its unit; with a `defaultValue`, a reset button appears once it differs. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
  defaultValue,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** The value the reset button returns to. */
  defaultValue?: number;
}) {
  return (
    <label className="field-label">
      {label}
      <span className="number-box">
        <input
          key={value}
          type="number"
          aria-label={label}
          defaultValue={Number(value.toFixed(4))}
          min={min}
          max={max}
          step={step}
          onBlur={(e) => {
            const n = e.currentTarget.valueAsNumber;
            if (Number.isFinite(n)) {
              const v = Math.max(min, Math.min(max, n));
              e.currentTarget.value = String(v);
              if (v !== value) onChange(v);
            } else e.currentTarget.value = String(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span>{unit}</span>
        {defaultValue !== undefined && (
          <ResetButton
            value={value}
            defaultValue={defaultValue}
            onReset={() => onChange(defaultValue)}
            label={label}
            format={(v) => `${Number(v.toFixed(4))}${unit ? ` ${unit}` : ""}`}
            className="number-box-reset"
          />
        )}
      </span>
    </label>
  );
}

/**
 * A slider with its value shown beside it. The value can be typed exactly
 * (click it), and with a `defaultValue` a reset button appears once it differs.
 */
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  defaultValue,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** How the value is shown ("35%", "×1.5"); typed numbers are read in these units. */
  format?: (v: number) => string;
  defaultValue?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`range-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <ValueEditor value={value} min={min} max={max} step={step} onChange={onChange} format={format} label={label} className="range-field-value" />
      {defaultValue !== undefined && (
        <ResetButton value={value} defaultValue={defaultValue} onReset={() => onChange(defaultValue)} label={label} format={format} className="range-field-reset" />
      )}
    </div>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field-label">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="toggle-row"
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span>{label}</span>
      <span className={`switch ${value ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}
