/**
 * Template files (public/templates, made by scripts/build-earth-template.mjs)
 * are fetched once per page and kept: choosing the Earth again, or at
 * another size of the same detail, doesn't download it again.
 */
import type { EarthData } from "./earth";

const cache = new Map<string, Promise<EarthData>>();

export function loadEarth(detail: string): Promise<EarthData> {
  let p = cache.get(detail);
  if (!p) {
    p = fetch(`/templates/earth-${detail}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`template ${r.status}`);
        return r.json() as Promise<EarthData>;
      })
      .then((d) => {
        if (d.format !== 1 || d.template !== "earth")
          throw new Error("template format");
        return d;
      });
    // a failed download can be tried again
    p.catch(() => cache.delete(detail));
    cache.set(detail, p);
  }
  return p;
}

/** A point of view's name in the person's language (Natural Earth codes
 * are ISO country codes, except KO for South Korea). */
export function povName(code: string, lang: string) {
  const iso = code === "KO" ? "KR" : code;
  try {
    return (
      new Intl.DisplayNames([lang], { type: "region" }).of(iso) ?? code
    );
  } catch {
    return code;
  }
}
