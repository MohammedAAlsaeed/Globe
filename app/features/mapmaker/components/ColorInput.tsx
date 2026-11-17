"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "onBlur"
> & {
  value: string;
  onChange: (v: string) => void;
  /** The picker closed (or lost focus) on this colour. */
  onBlur?: (v: string) => void;
};

/**
 * A colour input that is safe to drag.
 *
 * The native picker fires an input event on every move. With a controlled
 * `value`, React writes each colour back into the element while the picker is
 * open, and Chrome can answer that write with another input event inside
 * React's commit. Each one is a new nested update until React gives up with
 * "Maximum update depth exceeded". This input is uncontrolled: it only takes
 * the outside colour when it changes and the person isn't picking, and it
 * sends at most one change per frame.
 */
export function ColorInput({ value, onChange, onBlur, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const live = useRef({ frame: 0, pending: null as string | null, sent: value });
  const send = useRef(onChange);
  useEffect(() => {
    send.current = onChange;
  });

  // The colour changed elsewhere (undo, another panel, a preset).
  useEffect(() => {
    const el = ref.current;
    live.current.sent = value;
    if (el && live.current.pending === null && el.value !== value.toLowerCase())
      el.value = value;
  }, [value]);

  // Unmounting mid-drag still delivers the last colour.
  useEffect(() => {
    const s = live.current;
    return () => {
      if (!s.frame) return;
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      const v = s.pending;
      s.pending = null;
      if (v !== null && v !== s.sent) send.current(v);
    };
  }, []);

  const flush = () => {
    const s = live.current;
    s.frame = 0;
    const v = s.pending;
    s.pending = null;
    if (v === null || v === s.sent) return;
    s.sent = v;
    send.current(v);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="color"
      defaultValue={value}
      onChange={(e) => {
        const s = live.current;
        s.pending = e.currentTarget.value;
        if (!s.frame) s.frame = requestAnimationFrame(flush);
      }}
      onBlur={(e) => {
        const s = live.current;
        if (s.frame) {
          cancelAnimationFrame(s.frame);
          flush();
        }
        onBlur?.(e.currentTarget.value);
      }}
    />
  );
}
