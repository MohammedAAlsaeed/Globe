"use client";
import { useEffect, useRef, useState } from "react";
import type { StudioDocument, GoreAsset } from "../domain/types";
import type { SourceState } from "./useSource";
import { renderInWorker, releaseAssets } from "../rendering/client";
export function usePreview(
  source: SourceState | null,
  document: StudioDocument,
  mode: "gores" | "panorama",
) {
  const [result, setResult] = useState<{
    assets: GoreAsset[];
    key: string;
    error: string;
  }>({ assets: [], key: "", error: "" });
  const owned = useRef<GoreAsset[]>([]),
    { globe, layers } = document,
    key = JSON.stringify([source?.url, globe, layers, mode]);
  useEffect(() => {
    if (!source) return;
    const abort = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      renderInWorker(
        {
          source: source.blob,
          globe,
          layers,
          dpi: Math.min(75, (1800 / (Math.PI * globe.width)) * 25.4),
          preview: true,
          mode,
        },
        abort.signal,
      )
        .then((assets) => {
          if (!active) {
            releaseAssets(assets);
            return;
          }
          releaseAssets(owned.current);
          owned.current = assets;
          setResult({ assets, key, error: "" });
        })
        .catch((e) => {
          if (active && e.name !== "AbortError")
            setResult({ assets: [], key, error: e.message });
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [source, globe, layers, mode, key]);
  useEffect(() => () => releaseAssets(owned.current), []);
  return {
    assets: result.assets,
    pending: result.key !== key,
    error: result.key === key ? result.error : "",
  };
}
