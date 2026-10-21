"use client";
/**
 * A text drawn by the map's own text engine, small, in the panel — the
 * person's words in a font or style before they choose it. It loads the
 * fonts it needs and redraws when they arrive.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { MMText, TextLook } from "../types";
import {
  fontsVersion,
  loadFile,
  loadHarfBuzz,
  loadWebFont,
  onFontsChange,
} from "./fontStore";
import { textGeometry } from "./geometry";
import { drawText } from "./render";
import { neededFiles } from "./shape";

export function TextSample({
  text,
  look,
  height = 40,
  background,
}: {
  text: string;
  look: TextLook;
  height?: number;
  background?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useSyncExternalStore(onFontsChange, fontsVersion, () => 0);
  const words = text.trim().split("\n")[0].slice(0, 60) || "Aa أبجد";
  useEffect(() => {
    void loadHarfBuzz();
    const need = neededFiles(words, look);
    need.files.forEach((f) => void loadFile(f));
    need.web.forEach((w) => void loadWebFont(w, words));
  }, [words, look]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr =
      typeof window !== "undefined"
        ? Math.min(2, window.devicePixelRatio || 1)
        : 1;
    const w = c.clientWidth || 240;
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    const o: MMText = {
      ...look,
      id: "sample",
      kind: "text",
      text: words,
      x: 0,
      y: 0,
      rotation: 0,
      boxWidth: null,
      curveMode: look.curveMode === "path" ? "straight" : look.curveMode,
    };
    const geo = textGeometry(o, 1);
    if (!geo.ready) return;
    const { x0, y0, x1, y1 } = geo.bounds;
    const pad = look.outline.enabled ? look.outline.width * 2 : 0.05;
    const k = Math.min(
      (c.width - 8 * dpr) / (x1 - x0 + pad * 2),
      (c.height - 6 * dpr) / (y1 - y0 + pad * 2),
    );
    ctx.save();
    ctx.translate(
      c.width / 2 - ((x0 + x1) / 2) * k,
      c.height / 2 - ((y0 + y1) / 2) * k,
    );
    ctx.scale(k, k);
    ctx.globalAlpha = look.opacity;
    drawText(ctx, geo, look);
    ctx.restore();
  }, [words, look, height, version, background]);
  return (
    <canvas
      ref={ref}
      className="mm-tx-sample-canvas"
      style={{ height, width: "100%" }}
      aria-label={words}
    />
  );
}
