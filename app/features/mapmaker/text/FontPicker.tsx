"use client";
/**
 * Choosing how a text is lettered:
 *
 *   profiles  matched pairings (an Arabic face + a Latin face + fallbacks
 *             for every other script) — what most people need;
 *   fonts     the whole library by category, searchable by name (Latin or
 *             Arabic), era or civilization, and language; favourites first.
 *
 * Every family's name is shown in its own letters from pre-drawn outlines
 * (public/fonts/previews.json), so browsing downloads no fonts. The chosen
 * font is also shown with the person's own text (./TextSample), loaded then.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import { Glyph } from "../glyphs";
import type { TextLook } from "../types";
import { FONT_CATEGORIES, FONT_PROFILES, FONTS, fontDef, fontProfile, profileSlot, type FontCategory, type FontDefinition } from "./fonts";
import { FONT_INFO } from "./fontInfo.generated";
import { fontBytes } from "./fontStore";
import { TextSample } from "./TextSample";

type T = (k: string, opts?: Record<string, unknown>) => string;

// ---- previews (name outlines) -------------------------------------------------------------
type Preview = { d: string; w: number };
type Previews = Record<string, { latin?: Preview; arabic?: Preview; other?: Preview }>;
let previews: Previews | null = null;
let previewsLoading: Promise<void> | null = null;
const previewListeners = new Set<() => void>();
function loadPreviews() {
  previewsLoading ??= fetch("/fonts/previews.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((p: Previews) => {
      previews = p;
      for (const l of previewListeners) l();
    })
    .catch(() => {
      previews = {};
    });
}
function usePreviews(): Previews | null {
  return useSyncExternalStore(
    (fn) => {
      previewListeners.add(fn);
      loadPreviews();
      return () => previewListeners.delete(fn);
    },
    () => previews,
    () => null,
  );
}

/** A font's name drawn in its own letters (from the pre-drawn outlines). */
export function FontName({ id, which, height = 22 }: { id: string; which?: "latin" | "arabic"; height?: number }) {
  const all = usePreviews();
  const def = fontDef(id);
  const p = all?.[id];
  const pick = which ? p?.[which] : (p?.arabic ?? p?.latin ?? p?.other);
  if (!pick)
    return (
      <span className="mm-tx-fontname-text" style={def?.css ? { fontFamily: `"${def.css.family}", serif` } : undefined}>
        {def?.familyAr && which === "arabic" ? def.familyAr : (def?.family ?? id)}
      </span>
    );
  return (
    <svg className="mm-tx-fontname" viewBox={`-4 -112 ${pick.w + 8} 150`} height={height} width={(height * (pick.w + 8)) / 150} aria-label={def?.family} role="img">
      <path d={pick.d} fill="currentColor" />
    </svg>
  );
}

// ---- favourites -------------------------------------------------------------------------------
const FAV_KEY = "mapmaker-font-favorites";
function loadFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const LANGS = ["ar", "fa", "ur", "en", "fr", "es", "de", "el", "ru", "he", "hi", "zh", "ja", "ko"];
/** A font's languages, its own script's first (an Arabic font lists Arabic, Persian, Urdu before English). */
function fontLangs(def: FontDefinition): string[] {
  if (def.source === "web") return def.id.endsWith("jp") ? ["ja"] : def.id.endsWith("kr") ? ["ko"] : ["zh"];
  const langs = FONT_INFO[def.id]?.languages ?? [];
  const first = def.category === "arabicManuscript" || def.category === "arabicKufi" ? ["ar", "fa", "ur"] : def.id === "noto-serif-hebrew" ? ["he"] : def.id === "noto-serif-devanagari" ? ["hi"] : [];
  return [...first.filter((l) => langs.includes(l)), ...langs.filter((l) => !first.includes(l))];
}
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function FontPicker({
  look,
  text,
  onProfile,
  onFont,
  t,
}: {
  look: TextLook;
  /** The text being styled (shown in the chosen font). */
  text: string;
  onProfile: (id: string) => void;
  /** A font by hand, or null to follow the profile. */
  onFont: (id: string | null) => void;
  t: T;
}) {
  const [tab, setTab] = useState<"profiles" | "fonts">(look.font ? "fonts" : "profiles");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<FontCategory | "all" | "favorites">("all");
  const [lang, setLang] = useState("");
  // The picker only ever opens in the browser (on a click), so storage is there.
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [hover, setHover] = useState<string | null>(null);
  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [id, ...favs];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {}
  };

  const fonts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FONTS.filter((f) => {
      if (cat === "favorites" && !favs.includes(f.id)) return false;
      if (cat !== "all" && cat !== "favorites" && f.category !== cat) return false;
      if (lang && !fontLangs(f).includes(lang)) return false;
      if (!q) return true;
      return [f.family, f.familyAr ?? "", ...f.tags, ...fontLangs(f), t(`txCat_${f.category}`)].some((s) => s.toLowerCase().includes(q));
    }).sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)));
  }, [query, cat, lang, favs, t]);

  const profile = fontProfile(look.profile);
  const sampleFont = hover ?? look.font;

  return (
    <div className="mm-tx-picker">
      <div className="mm-bp-segment small" role="tablist">
        <button role="tab" aria-selected={tab === "profiles"} className={tab === "profiles" ? "active" : ""} onClick={() => setTab("profiles")}>
          {t("txProfiles")}
        </button>
        <button role="tab" aria-selected={tab === "fonts"} className={tab === "fonts" ? "active" : ""} onClick={() => setTab("fonts")}>
          {t("txFonts")}
        </button>
      </div>
      {tab === "profiles" ? (
        <div className="mm-tx-list" role="listbox" aria-label={t("txProfiles")}>
          {FONT_PROFILES.map((p) => {
            const ar = profileSlot(p, "arabic")?.font,
              la = profileSlot(p, "latin")?.font;
            const selected = p.id === profile.id && !look.font;
            return (
              <button key={p.id} role="option" aria-selected={selected} className={`mm-tx-row ${selected ? "selected" : ""}`} onClick={() => onProfile(p.id)} title={t(`txProfileHint_${p.id}`)}>
                <span className="mm-tx-row-name">{t(`txProfile_${p.id}`)}</span>
                <span className="mm-tx-row-previews">
                  {ar && <FontName id={ar} which="arabic" height={20} />}
                  {la && <FontName id={la} which="latin" height={17} />}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mm-st-search">
            <Glyph name="search" size={14} />
            <input type="search" value={query} placeholder={t("txSearchFonts")} aria-label={t("txSearchFonts")} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="mm-tx-filters">
            <div className="mm-bp-chips" role="tablist" aria-label={t("txCategories")}>
              {(["all", "favorites", ...FONT_CATEGORIES] as const).map((c) => (
                <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? "active" : ""} onClick={() => setCat(c)}>
                  {c === "favorites" ? "★" : t(c === "all" ? "stCatAll" : `txCat_${c}`)}
                </button>
              ))}
            </div>
            <label className="mm-ln-select mm-tx-lang-filter">
              <span>{t("txLanguageFilter")}</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="">{t("txAnyLanguage")}</option>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {t(`txLang_${l}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className={`mm-tx-row mm-tx-follow ${!look.font ? "selected" : ""}`} onClick={() => onFont(null)}>
            <span className="mm-tx-row-name">{t("txFollowProfile", { profile: t(`txProfile_${profile.id}`) })}</span>
          </button>
          <div className="mm-tx-list" role="listbox" aria-label={t("txFonts")} onMouseLeave={() => setHover(null)}>
            {fonts.map((f) => {
              const info = FONT_INFO[f.id];
              const selected = look.font === f.id;
              return (
                <div key={f.id} className={`mm-tx-font ${selected ? "selected" : ""}`} onMouseEnter={() => setHover(f.id)}>
                  <button role="option" aria-selected={selected} className="mm-tx-font-main" onClick={() => onFont(f.id)}>
                    <span className="mm-tx-font-previews">
                      {info?.scripts.includes("arabic") && f.familyAr ? <FontName id={f.id} which="arabic" /> : null}
                      {info?.scripts.includes("latin") && !(info?.scripts.includes("arabic") && !f.familyAr) ? <FontName id={f.id} which="latin" height={18} /> : null}
                      {!info && <FontName id={f.id} />}
                    </span>
                    <small>
                      {f.family}
                      {f.familyAr ? ` · ${f.familyAr}` : ""} · {fontLangs(f).slice(0, 4).map((l) => t(`txLangShort_${l}`)).join(" ")}
                      {f.source === "file" ? ` · ${kb(fontBytes(f))}` : ` · ${t("txWebFont")}`}
                    </small>
                  </button>
                  <button className={`mm-tx-fav ${favs.includes(f.id) ? "on" : ""}`} aria-pressed={favs.includes(f.id)} title={t("txFavorite")} onClick={() => toggleFav(f.id)}>
                    ★
                  </button>
                </div>
              );
            })}
            {fonts.length === 0 && <p className="mm-bp-hint">{t("stNoResults")}</p>}
          </div>
          {sampleFont && text.trim() && (
            <div className="mm-tx-sample">
              <span className="mm-bp-subtitle">{t("txSampleWith", { font: fontDef(sampleFont)?.family ?? "" })}</span>
              <TextSample text={text} look={{ ...look, font: sampleFont, size: 0.05, curveMode: "straight" }} height={46} />
            </div>
          )}
          <p className="mm-bp-hint">{t("txLicenseNote")}</p>
        </>
      )}
    </div>
  );
}
