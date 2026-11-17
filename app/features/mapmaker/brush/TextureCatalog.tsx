"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs and signed URLs */
/**
 * The Texture Catalog: every texture the person can paint with, in one
 * browser — built-in, the official library and their own uploads.
 *
 *   hierarchy  (start) creator → style → pack, with live counts; Ctrl/Shift
 *              picks several packs
 *   toolbar    search (English and Arabic, any word order, word starts);
 *              filters (creator, style, pack, tags, used in this map, new);
 *              sort, grouping, preview size and names
 *   grid       previews only — a texture's picture is downloaded when it is
 *              hovered (for the live preview) or chosen
 *   preview    (end) the hovered texture drawn as it will paint: tiled at
 *              the current scale, turned and colour-adjusted
 *
 * Choosing a texture closes the catalog; the brush (or land, shape…) then
 * paints with it. Nothing on the map changes until then.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Glyph } from "../glyphs";
import { isHidden, useContentControls } from "../contentControls";
import type { PaintSource } from "../types";
import {
  CATALOG_CATEGORIES,
  CREATORS,
  EMPTY_QUERY,
  groupTextures,
  hierarchyCounts,
  queryTextures,
  sortTextures,
  styleKey,
  suggestions,
  UNTAGGED,
  type CatalogGroup,
  type CatalogPack,
  type CatalogQuery,
  type CatalogSort,
  type CatalogTexture,
  type Creator,
  type HierarchyNode,
} from "./textureCatalog";
import {
  sameTextureLook,
  styleLabel,
  toggleFavorite,
  uploadTextures,
  useTextureFavorites,
  useTextureLibrary,
} from "./textureLibrary";
import {
  ensureTextures,
  subscribeTextures,
  textureMatrix,
  textureReady,
  texturesVersion,
  textureThumb,
  textureTile,
  TEXTURE_BASE_PX,
} from "./textures";
import { useTextureUsage } from "./textureUsage";

type T = (key: string, opts?: Record<string, unknown>) => string;

// ---- view settings, remembered per browser ----------------------------------------------
interface View {
  sort: CatalogSort;
  group: CatalogGroup;
  /** Preview size, px. */
  size: number;
  names: boolean;
}
const VIEW_KEY = "idrisi.textures.catalogView.v1";
/** Preview sizes: small, medium, large. */
const PREVIEW_SIZES = [
  ["s", 72],
  ["m", 96],
  ["l", 136],
] as const;
const DEFAULT_VIEW: View = {
  sort: "relevance",
  group: "pack",
  size: 96,
  names: true,
};
function loadView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    return v && typeof v === "object"
      ? { ...DEFAULT_VIEW, ...v }
      : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

// ---- the live preview ------------------------------------------------------------------
/** The texture as it will paint: tiled, turned, colour-adjusted. */
function LivePreview({
  id,
  source,
  size = 232,
}: {
  id: string;
  source: PaintSource;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useSyncExternalStore(
    subscribeTextures,
    texturesVersion,
    () => 0,
  );
  // An uploaded texture's picture is fetched after a short hover (see the
  // catalog): until then its preview stands in, rather than a download for
  // every texture the pointer passes over.
  const ready = textureReady(id);
  useEffect(() => {
    const c = ref.current;
    if (!c || !ready) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d")!;
    // About three tiles across at the standard scale.
    const pxPerTile = ((size * dpr) / 3) * source.textureScale,
      level = pxPerTile > TEXTURE_BASE_PX * 1.6 ? 1 : 0,
      tile = textureTile(id, level, source),
      pattern = ctx.createPattern(tile, "repeat");
    ctx.clearRect(0, 0, c.width, c.height);
    if (!pattern) return;
    pattern.setTransform(textureMatrix(source, tile, pxPerTile));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, c.width, c.height);
  }, [id, source, size, version, ready]);
  if (!ready)
    return (
      <img
        className="mm-txc-live"
        src={textureThumb(id)}
        alt=""
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  return (
    <canvas
      ref={ref}
      className="mm-txc-live"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// ---- the catalog -----------------------------------------------------------------------
export function TextureCatalog({
  source,
  onPick,
  onClose,
}: {
  /** What is being painted with now (its look is used for the preview). */
  source: PaintSource;
  /** A texture was chosen: the changes to make to the source. */
  onPick: (patch: Partial<PaintSource>) => void;
  onClose: () => void;
}) {
  const { t: tt, i18n } = useTranslation(),
    t = tt as T,
    lib = useTextureLibrary(),
    usage = useTextureUsage(),
    favorites = useTextureFavorites();
  const hiddenVersion = useContentControls();
  const [view, setView] = useState<View>(loadView),
    [query, setQuery] = useState<CatalogQuery>(EMPTY_QUERY),
    [filtersOpen, setFiltersOpen] = useState(false),
    [hovered, setHovered] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [uploading, setUploading] = useState<{
      done: number;
      total: number;
    } | null>(null),
    [open, setOpen] = useState<Record<string, boolean>>({
      "c:atelier": true,
      "c:official": true,
      "c:me": true,
    }),
    search = useRef<HTMLInputElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    [now] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // not remembered: fine
    }
  }, [view]);
  useEffect(() => search.current?.focus(), []);

  // Built-in textures staff hid are not offered (the one in use stays).
  const textures = useMemo(
    () =>
      lib.textures.filter(
        (x) =>
          x.creator !== "atelier" ||
          !isHidden("texture", x.id) ||
          x.id === source.texture,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `hiddenVersion`: isHidden's list changed
    [lib.textures, source.texture, hiddenVersion],
  );
  const packs = useMemo(() => {
    const has = new Set(textures.map((x) => x.packId));
    return lib.packs.filter((p) => has.has(p.id) || p.creator === "me");
  }, [lib.packs, textures]);
  const packById = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs]);

  const label = useCallback(
      (x: CatalogTexture) => x.name ?? (x.labelKey ? t(x.labelKey) : x.id),
      [t],
    ),
    packLabel = useCallback(
      (p: CatalogPack | undefined) =>
        p ? (p.name ?? (p.labelKey ? t(p.labelKey) : p.id)) : "",
      [t],
    ),
    tagLabel = useCallback(
      (tag: string) =>
        tag === UNTAGGED
          ? t("txcUntagged")
          : (CATALOG_CATEGORIES as readonly string[]).includes(tag)
            ? t(`mmTexCat_${tag}`)
            : tag,
      [t],
    );

  // Everything the search and filters let through, then the hierarchy's part.
  const ctx = { used: usage.used, now };
  const filtered = useMemo(
    () => queryTextures(textures, query, { ...ctx, ignoreNode: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is derived from these
    [textures, query, usage.used, now],
  );
  const counts = useMemo(
    () => hierarchyCounts(filtered.map((x) => x.texture)),
    [filtered],
  );
  const shown = useMemo(() => {
    const inNode = queryTextures(
      filtered.map((x) => x.texture),
      { ...EMPTY_QUERY, node: query.node, text: query.text },
      ctx,
    );
    return sortTextures(inNode, view.sort, label, i18n.language).map(
      (x) => x.texture,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is derived from these
  }, [filtered, query.node, query.text, view.sort, label, i18n.language]);
  const groups = useMemo(
    () => groupTextures(shown, view.group),
    [shown, view.group],
  );

  // The styles of each creator, and the packs of each style, as listed.
  const tree = useMemo(
    () =>
      CREATORS.map((creator) => {
        const own = packs.filter((p) => p.creator === creator),
          styles = [...new Set(own.map((p) => p.style))];
        return {
          creator,
          styles: styles.map((style) => ({
            style,
            packs: own.filter((p) => p.style === style),
          })),
        };
      }).filter((c) => c.styles.length || (c.creator === "me" && lib.signedIn)),
    [packs, lib.signedIn],
  );
  const allTags = useMemo(() => {
    const n = new Map<string, number>();
    for (const x of textures)
      for (const tag of x.tags.length ? x.tags : [UNTAGGED])
        n.set(tag, (n.get(tag) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [textures]);
  const suggested = useMemo(
    () =>
      suggestions(
        query.text,
        packs.map((p) => ({ id: p.id, label: packLabel(p) })),
        allTags.map(tagLabel).length ? allTags : [],
      ),
    [query.text, packs, allTags, packLabel, tagLabel],
  );

  const current = textures.find((x) => x.id === source.texture),
    focus = textures.find((x) => x.id === hovered) ?? current ?? null;

  // The hovered texture's picture, for the live preview (after a short pause).
  useEffect(() => {
    if (!hovered || textureReady(hovered)) return;
    const timer = setTimeout(() => void ensureTextures([hovered]), 220);
    return () => clearTimeout(timer);
  }, [hovered]);

  async function pick(x: CatalogTexture) {
    if (x.locked) {
      setNotice(t("txcLocked"));
      return;
    }
    setBusy(x.id);
    await ensureTextures([x.id]);
    setBusy(null);
    onPick({
      type: "texture",
      texture: x.id,
      ...(x.defaultScale ? { textureScale: x.defaultScale } : {}),
    });
    onClose();
  }

  function selectNode(node: HierarchyNode) {
    setQuery((q) => ({ ...q, node }));
  }
  function clickPack(p: CatalogPack, multi: boolean) {
    setQuery((q) => {
      const was = q.node.kind === "packs" ? q.node.packs : [];
      if (!multi) return { ...q, node: { kind: "packs", packs: [p.id] } };
      const packs = was.includes(p.id)
        ? was.filter((x) => x !== p.id)
        : [...was, p.id];
      return {
        ...q,
        node: packs.length ? { kind: "packs", packs } : { kind: "all" },
      };
    });
  }
  const nodeActive = (node: HierarchyNode) =>
    JSON.stringify(node) === JSON.stringify(query.node);
  const toggleIn = <K extends "packs" | "creators" | "styles" | "tags">(
    key: K,
    value: CatalogQuery[K][number],
  ) =>
    setQuery((q) => {
      const list = q[key] as string[];
      return {
        ...q,
        [key]: list.includes(value as string)
          ? list.filter((x) => x !== value)
          : [...list, value],
      };
    });
  const activeFilters =
    query.packs.length +
    query.creators.length +
    query.styles.length +
    query.tags.length +
    (query.usedOnly ? 1 : 0) +
    (query.newOnly ? 1 : 0);

  async function upload(files: File[]) {
    if (!files.length) return;
    setNotice(null);
    setUploading({ done: 0, total: files.length });
    const { ids, error } = await uploadTextures(files, {
      onProgress: (done, total) => setUploading({ done, total }),
    });
    setUploading(null);
    if (error)
      setNotice(
        (error as { code?: string }).code === "plan_limit_reached"
          ? t("txcUploadLimit")
          : t("txcUploadFailed"),
      );
    if (ids.length) selectNode({ kind: "creator", creator: "me" });
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (filtersOpen) setFiltersOpen(false);
      else onClose();
    } else if (e.key === "/" && document.activeElement !== search.current) {
      e.preventDefault();
      search.current?.focus();
    }
  }

  const creatorLabel = (c: Creator) => t(`txcCreator_${c}`),
    favored = (x: CatalogTexture) =>
      favorites.some((f) => f.source.texture === x.id);

  // Above everything (panels may be transformed), inside the editor's
  // shell so its colours apply.
  const host =
    typeof document !== "undefined"
      ? (document.querySelector(".mm-shell") ?? document.body)
      : null;
  if (!host) return null;
  return createPortal(
    <div
      className="mm-txc-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="mm-txc"
        role="dialog"
        aria-modal="true"
        aria-label={t("txcTitle")}
        onKeyDown={onKeyDown}
      >
        <header className="mm-txc-head">
          <h2>{t("txcTitle")}</h2>
          <label className="mm-txc-search">
            <Glyph name="search" size={15} />
            <input
              ref={search}
              type="search"
              value={query.text}
              placeholder={t("txcSearch")}
              aria-label={t("txcSearch")}
              onChange={(e) =>
                setQuery((q) => ({ ...q, text: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown[0]) void pick(shown[0]);
              }}
            />
          </label>
          <button
            className="mm-txc-close"
            onClick={onClose}
            aria-label={t("close")}
          >
            <Glyph name="close" size={16} />
          </button>
        </header>

        <div className="mm-txc-toolbar">
          <div className="mm-txc-filters">
            <button
              className={`mm-pill ${filtersOpen || activeFilters ? "selected" : ""}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Glyph name="sliders" size={14} />
              {t("txcFilters")}
              {activeFilters > 0 && (
                <b className="mm-txc-badge">{activeFilters}</b>
              )}
            </button>
            {filtersOpen && (
              <FiltersPanel
                t={t}
                query={query}
                setQuery={setQuery}
                toggleIn={toggleIn}
                packs={packs}
                packLabel={packLabel}
                tags={allTags}
                tagLabel={tagLabel}
                creatorLabel={creatorLabel}
              />
            )}
          </div>
          <label className="mm-txc-field">
            {t("txcSort")}
            <select
              value={view.sort}
              onChange={(e) =>
                setView({ ...view, sort: e.target.value as CatalogSort })
              }
            >
              <option value="relevance">{t("txcSortRelevance")}</option>
              <option value="title">{t("txcSortTitle")}</option>
              <option value="newest">{t("txcSortNewest")}</option>
            </select>
          </label>
          <label className="mm-txc-field">
            {t("txcGroup")}
            <select
              value={view.group}
              onChange={(e) =>
                setView({ ...view, group: e.target.value as CatalogGroup })
              }
            >
              <option value="none">{t("txcGroupNone")}</option>
              <option value="pack">{t("txcGroupPack")}</option>
              <option value="category">{t("txcGroupCategory")}</option>
              <option value="tag">{t("txcGroupTag")}</option>
            </select>
          </label>
          <div className="mm-txc-field" role="group" aria-label={t("txcSize")}>
            {t("txcSize")}
            <div className="mm-bp-segment small mm-txc-sizes">
              {PREVIEW_SIZES.map(([key, px]) => (
                <button
                  key={key}
                  className={view.size === px ? "active" : ""}
                  aria-pressed={view.size === px}
                  onClick={() => setView({ ...view, size: px })}
                >
                  {t(`txcSize_${key}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="mm-txc-field">
            <input
              type="checkbox"
              checked={view.names}
              onChange={(e) => setView({ ...view, names: e.target.checked })}
            />
            {t("txcNames")}
          </label>
          {lib.signedIn && (
            <>
              <button
                className="mm-pill mm-txc-upload"
                disabled={!!uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Glyph name="upload" size={14} />
                {uploading
                  ? t("txcUploading", {
                      done: uploading.done,
                      total: uploading.total,
                    })
                  : t("txcUpload")}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  void upload(files);
                }}
              />
            </>
          )}
        </div>

        {(suggested.length > 0 || activeFilters > 0) && (
          <div className="mm-txc-chips">
            {suggested.map((s) => (
              <button
                key={`${s.kind}:${s.key}`}
                className="mm-txc-chip suggest"
                onClick={() =>
                  setQuery((q) => ({
                    ...q,
                    text: "",
                    ...(s.kind === "pack"
                      ? { packs: [...new Set([...q.packs, s.key])] }
                      : { tags: [...new Set([...q.tags, s.key])] }),
                  }))
                }
              >
                <Glyph name="plus" size={11} />
                {s.kind === "pack"
                  ? t("txcSuggestPack", { name: s.label })
                  : t("txcSuggestTag", { name: tagLabel(s.label) })}
              </button>
            ))}
            {query.creators.map((c) => (
              <Chip key={`c${c}`} onRemove={() => toggleIn("creators", c)}>
                {creatorLabel(c)}
              </Chip>
            ))}
            {query.styles.map((s) => (
              <Chip key={`s${s}`} onRemove={() => toggleIn("styles", s)}>
                {styleLabel(s.split("|")[1] ?? "", t)}
              </Chip>
            ))}
            {query.packs.map((p) => (
              <Chip key={`p${p}`} onRemove={() => toggleIn("packs", p)}>
                {packLabel(packById.get(p))}
              </Chip>
            ))}
            {query.tags.map((tag) => (
              <Chip key={`t${tag}`} onRemove={() => toggleIn("tags", tag)}>
                #{tagLabel(tag)}
              </Chip>
            ))}
            {query.usedOnly && (
              <Chip
                onRemove={() => setQuery((q) => ({ ...q, usedOnly: false }))}
              >
                {t("txcUsedHere")}
              </Chip>
            )}
            {query.newOnly && (
              <Chip
                onRemove={() => setQuery((q) => ({ ...q, newOnly: false }))}
              >
                {t("txcNew")}
              </Chip>
            )}
            {activeFilters > 0 && (
              <button
                className="mm-txc-chip clear"
                onClick={() =>
                  setQuery((q) => ({
                    ...EMPTY_QUERY,
                    text: q.text,
                    node: q.node,
                  }))
                }
              >
                {t("txcClearFilters")}
              </button>
            )}
          </div>
        )}

        <div className="mm-txc-body">
          <nav className="mm-txc-tree" aria-label={t("txcLibrary")}>
            <button
              className={nodeActive({ kind: "all" }) ? "active" : ""}
              onClick={() => selectNode({ kind: "all" })}
            >
              <span>{t("txcAll")}</span>
              <small>{filtered.length}</small>
            </button>
            {tree.map(({ creator, styles }) => {
              const ck = `c:${creator}`;
              return (
                <div key={creator} className="mm-txc-branch">
                  <div className="mm-txc-row">
                    <button
                      className="mm-txc-twisty"
                      aria-expanded={!!open[ck]}
                      aria-label={creatorLabel(creator)}
                      onClick={() => setOpen({ ...open, [ck]: !open[ck] })}
                    >
                      <Glyph name="chevronDown" size={12} />
                    </button>
                    <button
                      className={
                        nodeActive({ kind: "creator", creator }) ? "active" : ""
                      }
                      onClick={() => selectNode({ kind: "creator", creator })}
                    >
                      <b>{creatorLabel(creator)}</b>
                      <small>{counts.get(ck) ?? 0}</small>
                    </button>
                  </div>
                  {open[ck] &&
                    styles.map(({ style, packs: own }) => (
                      <div key={style} className="mm-txc-style">
                        {/* A creator with one unnamed style shows its packs directly. */}
                        {(styles.length > 1 || style) && (
                          <button
                            className={
                              nodeActive({ kind: "style", creator, style })
                                ? "active"
                                : ""
                            }
                            onClick={() =>
                              selectNode({ kind: "style", creator, style })
                            }
                          >
                            <span>{styleLabel(style, t)}</span>
                            <small>
                              {counts.get(`s:${styleKey(creator, style)}`) ?? 0}
                            </small>
                          </button>
                        )}
                        {own.map((p) => (
                          <button
                            key={p.id}
                            className={`mm-txc-pack ${
                              query.node.kind === "packs" &&
                              query.node.packs.includes(p.id)
                                ? "active"
                                : ""
                            }`}
                            title={t("txcPackHint")}
                            onClick={(e) =>
                              clickPack(p, e.ctrlKey || e.metaKey || e.shiftKey)
                            }
                          >
                            <span>
                              {p.locked && <Glyph name="lock" size={11} />}
                              {packLabel(p)}
                            </span>
                            <small>{counts.get(`p:${p.id}`) ?? 0}</small>
                          </button>
                        ))}
                      </div>
                    ))}
                  {open[ck] && creator === "me" && !styles.length && (
                    <p className="mm-txc-empty-note">{t("txcMeEmpty")}</p>
                  )}
                </div>
              );
            })}
          </nav>

          <div
            className={`mm-txc-grid-wrap ${view.names ? "" : "no-names"}`}
            style={{ ["--txc-size" as string]: `${view.size}px` }}
          >
            {!lib.loaded && <p className="mm-txc-loading">{t("txcLoading")}</p>}
            {shown.length === 0 ? (
              <div className="mm-txc-none">
                <b>{t("txcNoResults")}</b>
                <span>{t("txcNoResultsHint")}</span>
              </div>
            ) : (
              groups.map((g) => (
                <section key={g.key} className="mm-txc-group">
                  {view.group !== "none" && (
                    <h3>
                      {view.group === "pack"
                        ? packLabel(packById.get(g.key))
                        : g.key
                          ? tagLabel(g.key)
                          : t("txcUncategorised")}
                      <small>{g.items.length}</small>
                    </h3>
                  )}
                  <ul className="mm-txc-grid">
                    {g.items.map((x) => (
                      <li key={x.id}>
                        <button
                          className={`mm-txc-tile ${x.id === source.texture ? "selected" : ""} ${x.locked ? "locked" : ""}`}
                          title={[
                            label(x),
                            ...x.tags.map((tag) => `#${tagLabel(tag)}`),
                          ].join("  ")}
                          aria-busy={busy === x.id}
                          onPointerEnter={() => setHovered(x.id)}
                          onFocus={() => setHovered(x.id)}
                          onClick={() => void pick(x)}
                        >
                          <img
                            src={textureThumb(x.id)}
                            alt=""
                            loading="lazy"
                            draggable={false}
                            style={
                              x.color ? { background: x.color } : undefined
                            }
                          />
                          {x.locked && (
                            <span className="mm-txc-lock">
                              <Glyph name="lock" size={13} />
                            </span>
                          )}
                          {usage.used.has(x.id) && (
                            <span
                              className="mm-txc-used"
                              title={t("txcUsedHere")}
                            />
                          )}
                          {favored(x) && (
                            <span className="mm-txc-fav">
                              <Glyph name="star" size={11} />
                            </span>
                          )}
                          {view.names && (
                            <span className="mm-txc-name">{label(x)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          <aside className="mm-txc-side" aria-live="polite">
            {focus ? (
              <>
                <LivePreview
                  id={focus.id}
                  source={{
                    ...source,
                    type: "texture",
                    texture: focus.id,
                    textureScale:
                      focus.id === source.texture
                        ? source.textureScale
                        : (focus.defaultScale ?? source.textureScale),
                  }}
                />
                <b className="mm-txc-focus-name">{label(focus)}</b>
                <small className="mm-txc-focus-path">
                  {[
                    creatorLabel(focus.creator),
                    styleLabel(focus.style, t),
                    packLabel(packById.get(focus.packId)),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                {focus.tags.length > 0 && (
                  <div className="mm-txc-focus-tags">
                    {focus.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() =>
                          setQuery((q) => ({
                            ...q,
                            tags: [...new Set([...q.tags, tag])],
                          }))
                        }
                      >
                        #{tagLabel(tag)}
                      </button>
                    ))}
                  </div>
                )}
                {!focus.tile && (
                  <small className="mm-txc-note">{t("txcSingleSheet")}</small>
                )}
                {focus.locked ? (
                  <p className="mm-txc-note">{t("txcLocked")}</p>
                ) : (
                  <div className="mm-txc-focus-actions">
                    <button
                      className="mm-pill selected"
                      disabled={busy !== null}
                      onClick={() => void pick(focus)}
                    >
                      <Glyph name="check" size={13} />
                      {focus.id === source.texture ? t("txcKeep") : t("txcUse")}
                    </button>
                    <button
                      className={`mm-pill ${favored(focus) ? "selected" : ""}`}
                      title={t("txcFavoriteHint")}
                      onClick={() =>
                        toggleFavorite(
                          favorites.find((f) => f.source.texture === focus.id)
                            ?.source ?? {
                            ...source,
                            type: "texture",
                            texture: focus.id,
                            textureScale:
                              focus.defaultScale ?? source.textureScale,
                          },
                        )
                      }
                    >
                      <Glyph name="star" size={13} />
                      {favored(focus) ? t("txcFavorited") : t("txcFavorite")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="mm-txc-note">{t("txcHoverHint")}</p>
            )}
            {notice && (
              <p className="mm-txc-note warn" role="alert">
                {notice}
              </p>
            )}
            <p className="mm-txc-count">
              {t("txcShowing", { n: shown.length, total: textures.length })}
            </p>
          </aside>
        </div>
      </div>
    </div>,
    host,
  );
}

function Chip({
  children,
  onRemove,
}: {
  children: ReactNode;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="mm-txc-chip">
      {children}
      <button onClick={onRemove} aria-label={t("txcRemoveFilter")}>
        <Glyph name="close" size={10} />
      </button>
    </span>
  );
}

function FiltersPanel({
  t,
  query,
  setQuery,
  toggleIn,
  packs,
  packLabel,
  tags,
  tagLabel,
  creatorLabel,
}: {
  t: T;
  query: CatalogQuery;
  setQuery: (f: (q: CatalogQuery) => CatalogQuery) => void;
  toggleIn: <K extends "packs" | "creators" | "styles" | "tags">(
    key: K,
    value: CatalogQuery[K][number],
  ) => void;
  packs: CatalogPack[];
  packLabel: (p: CatalogPack) => string;
  tags: string[];
  tagLabel: (tag: string) => string;
  creatorLabel: (c: Creator) => string;
}) {
  const styles = [
    ...new Map(
      packs.map((p) => [styleKey(p.creator, p.style), p] as const),
    ).values(),
  ];
  const box = (
    checked: boolean,
    onChange: () => void,
    text: string,
    key: string,
  ) => (
    <label key={key} className="mm-txc-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{text}</span>
    </label>
  );
  return (
    <div className="mm-txc-popover" role="group" aria-label={t("txcFilters")}>
      <div>
        <h4>{t("txcFilterShow")}</h4>
        {box(
          query.usedOnly,
          () => setQuery((q) => ({ ...q, usedOnly: !q.usedOnly })),
          t("txcUsedHere"),
          "used",
        )}
        {box(
          query.newOnly,
          () => setQuery((q) => ({ ...q, newOnly: !q.newOnly })),
          t("txcNew"),
          "new",
        )}
        <h4>{t("txcFilterCreator")}</h4>
        {CREATORS.map((c) =>
          box(
            query.creators.includes(c),
            () => toggleIn("creators", c),
            creatorLabel(c),
            c,
          ),
        )}
        <h4>{t("txcFilterStyle")}</h4>
        {styles.map((p) => {
          const k = styleKey(p.creator, p.style);
          return box(
            query.styles.includes(k),
            () => toggleIn("styles", k),
            `${styleLabel(p.style, t)} — ${creatorLabel(p.creator)}`,
            k,
          );
        })}
      </div>
      <div>
        <h4>{t("txcFilterPack")}</h4>
        <div className="mm-txc-checklist">
          {packs.map((p) =>
            box(
              query.packs.includes(p.id),
              () => toggleIn("packs", p.id),
              packLabel(p),
              p.id,
            ),
          )}
        </div>
      </div>
      <div>
        <h4>{t("txcFilterTags")}</h4>
        <div className="mm-txc-checklist">
          {tags.map((tag) =>
            box(
              query.tags.includes(tag),
              () => toggleIn("tags", tag),
              tagLabel(tag),
              tag,
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** A small swatch of a look (a recent or favourite texture), for the panel. */
export function LookSwatch({
  look,
  selected,
  title,
  onClick,
  onRemove,
}: {
  look: PaintSource;
  selected: boolean;
  title: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  useSyncExternalStore(subscribeTextures, texturesVersion, () => 0);
  return (
    <button
      className={`mm-tx-swatch ${selected ? "selected" : ""}`}
      title={title}
      onClick={onClick}
      onContextMenu={
        onRemove
          ? (e) => {
              e.preventDefault();
              onRemove();
            }
          : undefined
      }
    >
      <img src={textureThumb(look.texture, look)} alt="" draggable={false} />
    </button>
  );
}

export { sameTextureLook };
