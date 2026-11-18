"use client";
/**
 * The Stamp Catalog: every stamp the person can place, in one browser —
 * the atelier's own art, the official library and their own uploads.
 *
 *   hierarchy  (start) creator → style → pack, with live counts; Ctrl/Shift
 *              picks several packs, across styles and creators
 *   toolbar    search (names, variant names, packs, tags and categories, in
 *              English and Arabic, any word order, word starts); filters
 *              (creator, style, pack, tags, used in this map, new); sort,
 *              grouping, preview size, names, and opening every Stamp Set
 *   grid       previews only. A Stamp Set (several variants of one thing)
 *              opens in place to choose one variant; choosing the set
 *              itself places a random variant each time
 *   preview    (end) the hovered stamp large, its pack and tags, its
 *              variants, and "use" / "favourite"
 *
 * Choosing closes the catalog and the Stamp Tool places it (or, replacing,
 * the selected stamps become it). Nothing on the map changes until then.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Glyph } from "../glyphs";
import { useContentControls } from "../contentControls";
import { Chip, FiltersPanel } from "../brush/TextureCatalog";
import {
  CREATORS,
  EMPTY_QUERY,
  groupItems,
  hierarchyCounts,
  queryItems,
  sortItems,
  styleKey,
  suggestions,
  UNTAGGED,
  type CatalogGroup,
  type CatalogPack,
  type CatalogQuery,
  type CatalogSort,
  type Creator,
  type HierarchyNode,
} from "../brush/textureCatalog";
import { styleLabel } from "../brush/textureLibrary";
import {
  STAMP_CATEGORIES,
  allSets,
  catalogVersion,
  subscribeCatalog,
} from "./catalog";
import { libraryLoaded, libraryPacks } from "./remote";
import {
  catalogStamps,
  stampPacks,
  type CatalogStamp,
  type StampChoice,
} from "./stampCatalog";
import {
  toggleFavorite,
  useStampFavorites,
  useStampUsage,
  type SavedLook,
} from "./stampLooks";
import { StampThumb } from "./StampThumb";
import type { StampUploads } from "./StampPanel";

type T = (key: string, opts?: Record<string, unknown>) => string;

// ---- view settings, remembered per browser ----------------------------------------------
interface View {
  sort: CatalogSort;
  group: CatalogGroup;
  /** Preview size, px. */
  size: number;
  names: boolean;
  /** Every Stamp Set shows its variants. */
  openSets: boolean;
}
const VIEW_KEY = "idrisi.stamps.catalogView.v1";
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
  openSets: false,
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
const CATEGORY_KEYS = new Set<string>(STAMP_CATEGORIES.map((c) => c.key));

/** Every language's text of a translation key (so either finds a stamp). */
function useAllLanguages() {
  const { i18n } = useTranslation();
  return useCallback(
    (key: string) =>
      [
        ...new Set(
          (i18n.languages?.length ? i18n.languages : [i18n.language]).concat([
            "en",
            "ar",
          ]),
        ),
      ].map((lng) => i18n.t(key, { lng })),
    [i18n],
  );
}

export function StampCatalog({
  current,
  look,
  mode = "pick",
  uploads,
  onPick,
  onClose,
}: {
  /** The set in use (and its variant, null = random). */
  current: StampChoice;
  /** The look the next stamps get (a favourite keeps it). */
  look: (set: string) => SavedLook;
  /** Picking a stamp to place, or the stamp the selection becomes. */
  mode?: "pick" | "replace";
  uploads: StampUploads;
  onPick: (choice: StampChoice) => void;
  onClose: () => void;
}) {
  const { t: tt, i18n } = useTranslation(),
    t = tt as T,
    names = useAllLanguages(),
    usage = useStampUsage(),
    favorites = useStampFavorites();
  const hiddenVersion = useContentControls();
  const version = useSyncExternalStore(
    subscribeCatalog,
    catalogVersion,
    catalogVersion,
  );
  const [view, setView] = useState<View>(loadView),
    [query, setQuery] = useState<CatalogQuery>(EMPTY_QUERY),
    [filtersOpen, setFiltersOpen] = useState(false),
    [hovered, setHovered] = useState<string | null>(null),
    [opened, setOpened] = useState<Record<string, boolean>>({}),
    [notice, setNotice] = useState<string | null>(null),
    [progress, setProgress] = useState<string | null>(null),
    [open, setOpen] = useState<Record<string, boolean>>({
      "c:atelier": true,
      "c:official": true,
      "c:me": true,
    }),
    search = useRef<HTMLInputElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    asSet = useRef(false),
    [now] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // not remembered: fine
    }
  }, [view]);
  useEffect(() => search.current?.focus(), []);

  const stamps = useMemo(
    () => catalogStamps(allSets(), names),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` / `hiddenVersion`: the sets changed
    [names, version, hiddenVersion],
  );
  const packs = useMemo(() => {
    const has = new Set(stamps.map((x) => x.packId));
    return stampPacks(allSets(), libraryPacks()).filter(
      (p) => has.has(p.id) || p.creator === "me",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version`: the library changed
  }, [stamps, version]);
  const packById = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs]);

  const label = useCallback(
      (x: CatalogStamp) => x.name ?? (x.labelKey ? t(x.labelKey) : x.id),
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
          : CATEGORY_KEYS.has(tag)
            ? t(STAMP_CATEGORIES.find((c) => c.key === tag)!.labelKey)
            : tag,
      [t],
    ),
    variantLabel = (x: CatalogStamp, i: number) =>
      x.variants[i]?.name ?? t("stVariant", { n: i + 1 });

  // Everything the search and filters let through, then the hierarchy's part.
  const ctx = { used: usage.used, now };
  const filtered = useMemo(
    () => queryItems(stamps, query, { ...ctx, ignoreNode: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is derived from these
    [stamps, query, usage.used, now],
  );
  const counts = useMemo(
    () => hierarchyCounts(filtered.map((x) => x.item)),
    [filtered],
  );
  const shown = useMemo(() => {
    const inNode = queryItems(
      filtered.map((x) => x.item),
      { ...EMPTY_QUERY, node: query.node, text: query.text },
      ctx,
    );
    return sortItems(inNode, view.sort, label, i18n.language).map(
      (x) => x.item,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is derived from these
  }, [filtered, query.node, query.text, view.sort, label, i18n.language]);
  const groups = useMemo(
    () => groupItems(shown, view.group),
    [shown, view.group],
  );

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
      }).filter(
        (c) => c.styles.length || (c.creator === "me" && uploads.signedIn),
      ),
    [packs, uploads.signedIn],
  );
  const allTags = useMemo(() => {
    const n = new Map<string, number>();
    for (const x of stamps)
      for (const tag of [x.category, ...(x.tags.length ? x.tags : [UNTAGGED])])
        n.set(tag, (n.get(tag) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [stamps]);
  const suggested = useMemo(
    () =>
      suggestions(
        query.text,
        packs.map((p) => ({ id: p.id, label: packLabel(p) })),
        allTags,
      ),
    [query.text, packs, allTags, packLabel],
  );

  const currentStamp = stamps.find((x) => x.id === current.set),
    focus = stamps.find((x) => x.id === hovered) ?? currentStamp ?? null;

  function pick(x: CatalogStamp, variant: number | null) {
    if (x.locked) {
      setNotice(t("stLocked"));
      return;
    }
    onPick({
      set: x.id,
      variant: x.variants.length > 1 ? variant : 0,
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
      const list = was.includes(p.id)
        ? was.filter((x) => x !== p.id)
        : [...was, p.id];
      return {
        ...q,
        node: list.length ? { kind: "packs", packs: list } : { kind: "all" },
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

  const creatorLabel = (c: Creator) => t(`stcCreator_${c}`),
    setOpenState = (x: CatalogStamp) => opened[x.id] ?? view.openSets,
    favEntry = (x: CatalogStamp, variant: number | null) => ({
      set: x.id,
      variant: x.variants.length > 1 ? variant : 0,
      look: look(x.id),
    }),
    favored = (x: CatalogStamp) => favorites.some((f) => f.set === x.id);

  const tile = (
    x: CatalogStamp,
    variant: number | null,
    key: string,
    extra = "",
  ) => {
    const isSet = variant === null && x.variants.length > 1,
      asset = x.variants[variant ?? 0]?.key ?? "",
      selected =
        x.id === current.set &&
        (variant === null
          ? current.variant === null || x.variants.length === 1
          : current.variant === variant),
      name = variant === null ? label(x) : variantLabel(x, variant);
    return (
      <li key={key} className={extra}>
        <button
          className={`mm-txc-tile mm-stc-tile ${selected ? "selected" : ""} ${x.locked ? "locked" : ""}`}
          title={[
            name,
            ...(isSet ? [t("stcVariants", { n: x.variants.length })] : []),
            ...x.tags.map((tag) => `#${tagLabel(tag)}`),
          ].join("  ")}
          onPointerEnter={() => setHovered(x.id)}
          onFocus={() => setHovered(x.id)}
          onClick={() => pick(x, variant)}
        >
          <span className="mm-stc-art">
            <StampThumb asset={asset} />
          </span>
          {x.locked && (
            <span className="mm-txc-lock">
              <Glyph name="lock" size={13} />
            </span>
          )}
          {variant === null && usage.used.has(x.id) && (
            <span className="mm-txc-used" title={t("txcUsedHere")} />
          )}
          {variant === null && favored(x) && (
            <span className="mm-txc-fav">
              <Glyph name="star" size={11} />
            </span>
          )}
          {view.names && <span className="mm-txc-name">{name}</span>}
        </button>
        {isSet && (
          <button
            className={`mm-stc-set-toggle ${setOpenState(x) ? "open" : ""}`}
            aria-expanded={setOpenState(x)}
            title={t(setOpenState(x) ? "stcCloseSet" : "stcOpenSet")}
            onClick={() =>
              setOpened((o) => ({ ...o, [x.id]: !setOpenState(x) }))
            }
          >
            <Glyph name="layers" size={11} />
            {x.variants.length}
          </button>
        )}
      </li>
    );
  };

  async function upload(files: File[]) {
    if (!files.length) return;
    setNotice(null);
    setProgress(t("stUploading"));
    const error = await uploads.onUpload(files, asSet.current);
    setProgress(null);
    if (error) setNotice(error);
    else selectNode({ kind: "creator", creator: "me" });
  }

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
        className="mm-txc mm-stc"
        role="dialog"
        aria-modal="true"
        aria-label={t(mode === "replace" ? "stcReplaceTitle" : "stcTitle")}
        onKeyDown={onKeyDown}
      >
        <header className="mm-txc-head">
          <h2>{t(mode === "replace" ? "stcReplaceTitle" : "stcTitle")}</h2>
          <label className="mm-txc-search">
            <Glyph name="search" size={15} />
            <input
              ref={search}
              type="search"
              value={query.text}
              placeholder={t("stcSearch")}
              aria-label={t("stcSearch")}
              onChange={(e) =>
                setQuery((q) => ({ ...q, text: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown[0]) pick(shown[0], null);
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
          <label className="mm-txc-field" title={t("stcOpenSetsHint")}>
            <input
              type="checkbox"
              checked={view.openSets}
              onChange={(e) => {
                setOpened({});
                setView({ ...view, openSets: e.target.checked });
              }}
            />
            {t("stcOpenSets")}
          </label>
          {uploads.signedIn && (
            <div className="mm-stc-upload">
              <button
                className="mm-pill mm-txc-upload"
                disabled={uploads.busy}
                onClick={() => {
                  asSet.current = false;
                  fileInput.current?.click();
                }}
              >
                <Glyph name="upload" size={14} />
                {progress ?? t("stUpload")}
              </button>
              <button
                className="mm-pill"
                disabled={uploads.busy}
                title={t("stUploadSetHint")}
                onClick={() => {
                  asSet.current = true;
                  fileInput.current?.click();
                }}
              >
                {t("stUploadSet")}
              </button>
              <Link className="mm-pill" href="/library">
                {t("stManage")}
              </Link>
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
            </div>
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
          <nav className="mm-txc-tree" aria-label={t("stcLibrary")}>
            <button
              className={nodeActive({ kind: "all" }) ? "active" : ""}
              onClick={() => selectNode({ kind: "all" })}
            >
              <span>{t("stcAll")}</span>
              <small>{filtered.length}</small>
            </button>
            {tree.map(({ creator, styles }) => {
              const ck = `c:${creator}`;
              return (
                <div key={creator} className="mm-txc-branch">
                  <div className="mm-txc-row">
                    <button
                      className="mm-txc-twisty"
                      aria-expanded={open[ck] ?? false}
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
                    <p className="mm-txc-empty-note">{t("stcMeEmpty")}</p>
                  )}
                </div>
              );
            })}
          </nav>

          <div
            className={`mm-txc-grid-wrap ${view.names ? "" : "no-names"}`}
            style={{ ["--txc-size" as string]: `${view.size}px` }}
          >
            {!libraryLoaded() && (
              <p className="mm-txc-loading">{t("stcLoading")}</p>
            )}
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
                    {g.items.flatMap((x) => [
                      tile(x, null, x.id),
                      ...(x.variants.length > 1 && setOpenState(x)
                        ? x.variants.map((_, i) =>
                            tile(x, i, `${x.id}#${i}`, "mm-stc-variant"),
                          )
                        : []),
                    ])}
                  </ul>
                </section>
              ))
            )}
          </div>

          <aside className="mm-txc-side" aria-live="polite">
            {focus ? (
              <>
                <div className="mm-stc-big">
                  <StampThumb
                    asset={
                      focus.variants[
                        focus.id === current.set ? (current.variant ?? 0) : 0
                      ]?.key ?? ""
                    }
                    size={256}
                    full={!focus.locked}
                  />
                </div>
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
                <div className="mm-txc-focus-tags">
                  {[focus.category, ...focus.tags].map((tag) => (
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
                {focus.variants.length > 1 && (
                  <>
                    <small className="mm-txc-note">
                      {t("stcVariantsHint", { n: focus.variants.length })}
                    </small>
                    <div className="mm-stc-variants">
                      <button
                        className="mm-st-variant random"
                        title={t("stRandomVariantHint")}
                        disabled={focus.locked}
                        onClick={() => pick(focus, null)}
                      >
                        <Glyph name="shuffle" size={16} />
                      </button>
                      {focus.variants.map((v, i) => (
                        <button
                          key={v.key}
                          className="mm-st-variant"
                          title={variantLabel(focus, i)}
                          disabled={focus.locked}
                          onClick={() => pick(focus, i)}
                        >
                          <StampThumb asset={v.key} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {focus.locked ? (
                  <p className="mm-txc-note">{t("stLocked")}</p>
                ) : (
                  <div className="mm-txc-focus-actions">
                    <button
                      className="mm-pill selected"
                      onClick={() => pick(focus, null)}
                    >
                      <Glyph name="check" size={13} />
                      {mode === "replace"
                        ? t("stcReplaceWith")
                        : focus.id === current.set
                          ? t("stcKeep")
                          : t("stcUse")}
                    </button>
                    <button
                      className={`mm-pill ${favored(focus) ? "selected" : ""}`}
                      title={t("stcFavoriteHint")}
                      onClick={() => {
                        const own = favorites.find((f) => f.set === focus.id);
                        toggleFavorite(own ?? favEntry(focus, null));
                      }}
                    >
                      <Glyph name="star" size={13} />
                      {favored(focus) ? t("txcFavorited") : t("txcFavorite")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="mm-txc-note">{t("stcHoverHint")}</p>
            )}
            {(notice || uploads.error) && (
              <p className="mm-txc-note warn" role="alert">
                {notice ?? uploads.error}
              </p>
            )}
            <p className="mm-txc-count">
              {t("stcShowing", { n: shown.length, total: stamps.length })}
            </p>
          </aside>
        </div>
      </div>
    </div>,
    host,
  );
}
