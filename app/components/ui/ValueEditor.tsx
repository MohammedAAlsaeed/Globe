"use client";
/**
 * A slider's value that can be typed. It shows the value as formatted
 * ("160 px"); a click (or Enter / F2 when focused) turns it into a box for the
 * exact number. Enter or leaving the box applies it, Escape cancels, and the
 * arrow keys step it (Shift: ×10). The number is read in the units shown and
 * converted back to the slider's value (see ./valueInput).
 *
 * And `ResetButton`: returns a value to its default. It always takes its
 * place, but only shows once the value differs, so rows stay aligned.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  editParts,
  firstNumber,
  settleValue,
  valueFromDisplay,
} from "./valueInput";

export interface ValueEditorProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** How the value is shown ("160 px"); also how typed numbers are read back. */
  format?: (v: number) => string;
  /** Typed number (in the units shown) → value, when the display isn't linear. */
  parse?: (shown: number) => number;
  /** The setting's name, for screen readers. */
  label: string;
  className?: string;
}

export function ValueEditor({
  value,
  min,
  max,
  step,
  onChange,
  format,
  parse,
  label,
  className = "",
}: ValueEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = format ? format(value) : String(value);
  const parts = editParts(shown);

  const toValue = (text: string): number | null => {
    const n = firstNumber(text);
    if (!Number.isFinite(n)) return null;
    const v = parse ? parse(n) : valueFromDisplay(n, min, max, format);
    return Number.isFinite(v) ? settleValue(v, min, max, step) : null;
  };
  const commit = () => {
    if (draft === null) return;
    const v = toValue(draft);
    setDraft(null);
    if (v !== null && Math.abs(v - value) > 1e-12) onChange(v);
  };
  const begin = () => {
    setDraft(parts.number);
    requestAnimationFrame(() => input.current?.select());
  };

  if (draft !== null)
    return (
      <span className={`value-editor editing ${className}`}>
        {parts.prefix && (
          <span className="value-editor-unit">{parts.prefix}</span>
        )}
        <input
          ref={input}
          className="value-editor-input"
          value={draft}
          inputMode="decimal"
          autoFocus
          aria-label={label}
          size={Math.max(3, draft.length + 1)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const base = toValue(draft) ?? value,
                next = settleValue(
                  base +
                    (e.key === "ArrowUp" ? 1 : -1) *
                      step *
                      (e.shiftKey ? 10 : 1),
                  min,
                  max,
                  step,
                );
              onChange(next);
              setDraft(editParts(format ? format(next) : String(next)).number);
            }
            // Keys typed here never reach the editor's shortcuts.
            e.stopPropagation();
          }}
        />
        {parts.suffix && (
          <span className="value-editor-unit">{parts.suffix}</span>
        )}
      </span>
    );
  return (
    <button
      type="button"
      className={`value-editor ${className}`}
      title={t("valueTypeHint")}
      aria-label={`${label}: ${shown}. ${t("valueTypeHint")}`}
      onClick={begin}
      onKeyDown={(e) => {
        if (e.key === "F2") {
          e.preventDefault();
          begin();
        }
      }}
    >
      {shown}
    </button>
  );
}

export function ResetButton({
  value,
  defaultValue,
  onReset,
  label,
  format,
  className = "",
}: {
  value: number;
  defaultValue: number;
  onReset: () => void;
  /** The setting's name, for screen readers. */
  label: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const { t } = useTranslation();
  const changed = Math.abs(value - defaultValue) > 1e-9;
  const title = t("valueResetTo", {
    value: format ? format(defaultValue) : String(defaultValue),
  });
  return (
    <button
      type="button"
      className={`value-reset ${className}`}
      title={title}
      aria-label={`${label}: ${title}`}
      aria-hidden={!changed}
      tabIndex={changed ? 0 : -1}
      style={{ visibility: changed ? "visible" : "hidden" }}
      onClick={onReset}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    </button>
  );
}
