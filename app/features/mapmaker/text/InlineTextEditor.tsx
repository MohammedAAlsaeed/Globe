"use client";
/**
 * Typing a text right on the map: a borderless box placed over the text,
 * turned like it, in the same fonts (the browser knows them: ./fontStore
 * registers every font it loads). The map's own drawing of the text hides
 * while it's typed into, and every letter updates the text itself, so the
 * panel's copy, the Objects list and undo stay in step.
 *
 *   Enter              a new line
 *   Escape / Ctrl+Enter / ⌘+Enter, or clicking elsewhere   done (the text is kept)
 *
 * Keys typed here never reach the editor's shortcuts (T, V, Delete…).
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { TextLook } from "../types";
import { fontDef, fontProfile, profileSlot } from "./fonts";
import { cssFamilyOf, loadFile, loadWebFont, pickFile } from "./fontStore";
import { neededFiles } from "./shape";
import { scriptsIn } from "./scripts";

/** The browser font stack that matches the engine's choice of fonts. */
export function cssStack(look: TextLook, text: string): string {
  const profile = fontProfile(look.profile);
  const arabicFirst = scriptsIn(text).has("arabic") && !/^[\s\d\p{P}]*\p{Script=Latin}/u.test(text);
  const order = arabicFirst ? (["arabic", "latin"] as const) : (["latin", "arabic"] as const);
  const ids: string[] = [];
  if (look.font) ids.push(look.font);
  for (const s of order) {
    const f = profileSlot(profile, s)?.font;
    if (f) ids.push(f);
  }
  for (const s of ["greek", "cyrillic", "hebrew", "devanagari", "cjk"] as const) {
    const f = profileSlot(profile, s)?.font;
    if (f) ids.push(f);
  }
  const fams = [...new Set(ids)].map((id) => {
    const def = fontDef(id);
    return def?.css ? `"${def.css.family}"` : `"${cssFamilyOf(id)}"`;
  });
  return [...fams, "serif"].join(", ");
}

export function InlineTextEditor({
  text,
  look,
  x,
  y,
  rotation,
  W,
  onChange,
  onDone,
  placeholder,
}: {
  text: string;
  look: TextLook;
  /** The anchor, stage pixels. */
  x: number;
  y: number;
  rotation: number;
  W: number;
  onChange: (text: string) => void;
  onDone: () => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  // The fonts it shows: the same files the map uses.
  useEffect(() => {
    const need = neededFiles(text || "Aa", look);
    need.files.forEach((f) => void loadFile(f));
    need.web.forEach((w) => void loadWebFont(w, text));
    const f = fontDef(look.font);
    if (f) {
      const file = pickFile(f, look.weight, look.italic);
      if (file) void loadFile(file.file.path);
    }
  }, [text, look]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // Grows with its words.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.width = "0px";
    el.style.height = "0px";
    el.style.width = `${Math.max(el.scrollWidth + 6, look.size * W * 1.5)}px`;
    el.style.height = `${el.scrollHeight}px`;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const rtl = getComputedStyle(el).direction === "rtl";
    const align = look.align === "center" || look.align === "left" || look.align === "right" ? look.align : (look.align === "start") !== rtl ? "left" : "right";
    const ox = align === "center" ? w / 2 : align === "left" ? 0 : w;
    el.style.left = `${x - ox}px`;
    el.style.top = `${y - h / 2}px`;
    el.style.transformOrigin = `${ox}px ${h / 2}px`;
  }, [text, look, x, y, W]);

  const size = Math.max(4, look.size * W);
  return (
    <textarea
      ref={ref}
      className="mm-tx-inline"
      dir={look.direction === "auto" ? "auto" : look.direction}
      value={text}
      placeholder={placeholder}
      spellCheck={false}
      maxLength={2000}
      wrap="off"
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => done.current()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          done.current();
        }
      }}
      style={{
        fontFamily: cssStack(look, text),
        fontSize: size,
        fontWeight: Math.round(look.weight),
        fontStyle: look.italic ? "italic" : "normal",
        textTransform: look.caps ? "uppercase" : "none",
        letterSpacing: `${look.letterSpacing}em`,
        wordSpacing: `${look.wordSpacing}em`,
        lineHeight: look.lineHeight + 0.25,
        color: look.fill,
        textAlign: look.align,
        transform: `rotate(${rotation}deg)`,
        caretColor: look.fill,
      }}
    />
  );
}
