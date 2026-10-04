"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkImage } from "../storage/projects";
export interface SourceState {
  blob: Blob;
  url: string;
  filename: string;
  width: number;
  height: number;
}
/**
 * `autoSample`: when false, the sample world map is never auto-loaded on
 * mount. Used when the page is about to load a specific source instead
 * (for example a map handed off from the standalone map creator), so the
 * sample doesn't race it and win.
 */
export function useSource(onError: (message: string) => void, autoSample = true) {
  const [source, setSource] = useState<SourceState | null>(null),
    [loading, setLoading] = useState(() => autoSample);
  const resources = useRef({ url: "", generation: 0 });
  const assign = useCallback(
    (blob: Blob, filename: string, width: number, height: number) => {
      const r = resources.current;
      if (r.url) URL.revokeObjectURL(r.url);
      r.url = URL.createObjectURL(blob);
      setSource({ blob, url: r.url, filename, width, height });
    },
    [],
  );
  const upload = useCallback(
    async (blob: Blob, filename: string) => {
      const r = resources.current,
        id = ++r.generation;
      setLoading(true);
      try {
        const size = await checkImage(blob);
        if (id !== r.generation) return false;
        assign(blob, filename, size.width, size.height);
        return true;
      } catch (error) {
        if (id === r.generation)
          onError(error instanceof Error ? error.message : "errorImage");
        return false;
      } finally {
        if (id === r.generation) setLoading(false);
      }
    },
    [assign, onError],
  );
  const sample = useCallback(async () => {
    const r = resources.current,
      id = ++r.generation;
    setLoading(true);
    try {
      const image = new Image();
      image.src = "/atelier-world.svg";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("uploadError"))),
          "image/png",
        ),
      );
      if (id !== r.generation) return false;
      assign(blob, "", canvas.width, canvas.height);
      canvas.width = 0;
      return true;
    } catch {
      if (id === r.generation) onError("uploadError");
      return false;
    } finally {
      if (id === r.generation) setLoading(false);
    }
  }, [assign, onError]);
  /** `loading` already starts false when `autoSample` is false (see the lazy
   * initializer above), so this effect never needs to touch it itself. */
  useEffect(() => {
    const r = resources.current;
    if (!autoSample) {
      return () => {
        r.generation++;
        if (r.url) URL.revokeObjectURL(r.url);
      };
    }
    const timer = setTimeout(() => sample(), 0);
    return () => {
      clearTimeout(timer);
      r.generation++;
      if (r.url) URL.revokeObjectURL(r.url);
    };
  }, [sample, autoSample]);
  return { source, loading, upload, sample };
}
