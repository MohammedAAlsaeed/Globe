"use client";
import type { ReactNode } from "react";
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
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
      </span>
    </label>
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
