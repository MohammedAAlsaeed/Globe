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
export function useSource(onError: (message: string) => void) {
  const [source, setSource] = useState<SourceState | null>(null),
    [loading, setLoading] = useState(true);
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
  useEffect(() => {
    const r = resources.current,
      timer = setTimeout(() => sample(), 0);
    return () => {
      clearTimeout(timer);
      r.generation++;
      if (r.url) URL.revokeObjectURL(r.url);
    };
  }, [sample]);
  return { source, loading, upload, sample };
}
