"use client";
/* eslint-disable @next/next/no-img-element -- previews are signed URLs from the API */
/**
 * My textures (/library/textures): the person's own textures, and — for
 * staff — the official texture library: packs with their style, the plan
 * each needs and publishing, and many pictures uploaded at once.
 *
 * Pictures are tidied in the browser before they go (≤ 2048 px, WebP, a
 * small preview and the average colour; see brush/textureLibrary), so the
 * Texture Catalog opens fast however large the library grows. Each texture
 * gets a category and tags (what the catalog filters and searches by), and
 * its default scale.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api/client";
import { library } from "./api";
import { useAuth } from "./AuthProvider";
import type { Asset, AssetPack } from "./types";
import { CompassLoader, CompassScreen, SiteHeader, errorMessage } from "./ui";
import {
  CATALOG_CATEGORIES,
  type CatalogCategory,
} from "../mapmaker/brush/textureCatalog";
import {
  loadTextureLibrary,
  uploadTextures,
} from "../mapmaker/brush/textureLibrary";
import { Flourish } from "@/components/ui/Flourish";

type T = (k: string, o?: Record<string, unknown>) => string;
const PLAN_OF_TIER = ["explorer", "cartographer", "atlas"];
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const tagsOf = (text: string) =>
  [
    ...new Set(
      text
        .split(/[,،]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);

export function TextureLibraryPage() {
  const { t } = useTranslation(),
    { user, refresh } = useAuth(),
    curator = !!user?.permissions.includes("content.manage");
  const [packs, setPacks] = useState<AssetPack[] | null>(null),
    [notice, setNotice] = useState<{
      kind: "ok" | "error";
      text: string;
    } | null>(null);

  const load = useCallback(async () => {
    try {
      setPacks(
        (await library.packs("textures")).filter((p) => !p.official || curator),
      );
    } catch (e) {
      setPacks([]);
      setNotice({ kind: "error", text: errorMessage(t, e) });
    }
  }, [t, curator]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when signed in
    if (user) void load();
  }, [user, load]);

  /** After any change: this page, the editor's catalog and the quota. */
  const changed = useCallback(async () => {
    await Promise.all([load(), loadTextureLibrary(true), refresh()]);
  }, [load, refresh]);
  const report = useCallback(
    (e: unknown) =>
      setNotice({
        kind: "error",
        text:
          e instanceof ApiError && e.code === "plan_limit_reached"
            ? t("stUploadLimit", {
                quota: mb(user?.plan.upload_quota_bytes ?? 0),
              })
            : errorMessage(t, e),
      }),
    [t, user?.plan.upload_quota_bytes],
  );

  if (user === undefined) return <CompassScreen label={t("acLoading")} />;
  const own = packs?.filter((p) => !p.official) ?? [],
    official = packs?.filter((p) => p.official) ?? [];

  return (
    <div className="site">
      <SiteHeader />
      <main className="maps-main">
        <div className="maps-head">
          <h1 className="fl-title">
            <Flourish text={t("tlTitle")} />
          </h1>
          <div className="maps-head-actions">
            <Link className="site-btn quiet" href="/library">
              {t("tlStamps")}
            </Link>
            <Link className="site-btn quiet" href="/editor">
              {t("stBackToEditor")}
            </Link>
          </div>
        </div>
        {!user ? (
          <div className="maps-empty">
            <p>{t("tlSignIn")}</p>
            <Link className="site-btn" href="/login?next=/library/textures">
              {t("acSignIn")}
            </Link>
          </div>
        ) : (
          <>
            <p className="maps-section-note">{t("tlLead")}</p>
            {user.plan.upload_quota_bytes > 0 && (
              <div className="maps-plan">
                <span>
                  {t("stQuota", {
                    used: mb(user.usage.upload_bytes),
                    quota: mb(user.plan.upload_quota_bytes),
                  })}
                </span>
                <div
                  className={`maps-meter ${user.usage.upload_bytes >= user.plan.upload_quota_bytes ? "full" : ""}`}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (user.usage.upload_bytes / user.plan.upload_quota_bytes) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {notice && (
              <p
                className={`site-notice ${notice.kind}`}
                role={notice.kind === "error" ? "alert" : "status"}
              >
                {notice.text}
              </p>
            )}
            {packs === null ? (
              <CompassLoader size={72} label={t("acLoading")} />
            ) : (
              <>
                <section className="maps-section">
                  <h2>{t("tlMine")}</h2>
                  {own.length === 0 ? (
                    <div className="maps-empty">
                      <p>{t("tlNoUploads")}</p>
                      <button
                        className="site-btn"
                        onClick={async () => {
                          try {
                            await library.createPack({
                              name: "My textures",
                              kind: "textures",
                            });
                            await changed();
                          } catch (e) {
                            report(e);
                          }
                        }}
                      >
                        {t("tlStart")}
                      </button>
                    </div>
                  ) : (
                    own.map((p) => (
                      <TexturePack
                        key={p.id}
                        pack={p}
                        t={t}
                        onChanged={changed}
                        onError={report}
                      />
                    ))
                  )}
                </section>
                {curator && (
                  <section className="maps-section">
                    <h2>{t("tlOfficial")}</h2>
                    <p className="maps-section-note">{t("tlOfficialLead")}</p>
                    {official.map((p) => (
                      <TexturePack
                        key={p.id}
                        pack={p}
                        t={t}
                        onChanged={changed}
                        onError={report}
                      />
                    ))}
                    <NewOfficialPack
                      t={t}
                      onCreated={changed}
                      onError={report}
                    />
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NewOfficialPack({
  t,
  onCreated,
  onError,
}: {
  t: T;
  onCreated: () => void;
  onError: (e: unknown) => void;
}) {
  const [name, setName] = useState(""),
    [style, setStyle] = useState("");
  return (
    <form
      className="lib-new-pack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
          await library.createPack({
            name: name.trim(),
            kind: "textures",
            style: style.trim() || null,
            official: true,
            tier: 0,
          });
          setName("");
          onCreated();
        } catch (err) {
          onError(err);
        }
      }}
    >
      <label className="site-field">
        <span>{t("stNewPack")}</span>
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="site-field">
        <span>{t("tlStyle")}</span>
        <input
          value={style}
          maxLength={40}
          placeholder={t("tlStyleHint")}
          onChange={(e) => setStyle(e.target.value)}
        />
      </label>
      <button className="site-btn small" disabled={!name.trim()}>
        {t("stCreatePack")}
      </button>
    </form>
  );
}

/** One pack: its textures, uploading many at once, and (official) plan, style, publishing. */
function TexturePack({
  pack,
  t,
  onChanged,
  onError,
}: {
  pack: AssetPack;
  t: T;
  onChanged: () => Promise<void> | void;
  onError: (e: unknown) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<{ done: number; total: number } | null>(
      null,
    ),
    [confirmDelete, setConfirmDelete] = useState(false),
    [over, setOver] = useState(false),
    // Applied to every picture of the next upload.
    [category, setCategory] = useState<CatalogCategory | "">(""),
    [tags, setTags] = useState(""),
    [tile, setTile] = useState(true),
    [scale, setScale] = useState(1),
    input = useRef<HTMLInputElement>(null);
  const official = pack.official;
  const load = useCallback(
    async () => setAssets(await library.assets(pack.id).catch(() => [])),
    [pack.id],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    void load();
  }, [load]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      await load();
      await onChanged();
    } catch (e) {
      onError(e);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    const pictures = files.filter((f) =>
      /^image\/(png|jpeg|webp)$/.test(f.type),
    );
    if (!pictures.length) return;
    setBusy(true);
    setProgress({ done: 0, total: pictures.length });
    const { error } = await uploadTextures(pictures, {
      packId: pack.id,
      category: category || null,
      tags: tagsOf(tags),
      tile,
      scale: scale !== 1 ? scale : undefined,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setProgress(null);
    setBusy(false);
    if (error) onError(error);
    await load();
    await onChanged();
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void upload([...e.dataTransfer.files]);
  }

  return (
    <article
      className={`lib-pack tl-pack ${over ? "over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="lib-pack-head">
        {official ? (
          <input
            className="lib-name"
            defaultValue={pack.name}
            maxLength={80}
            aria-label={t("stPackName")}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== pack.name &&
              run(() =>
                library.updatePack(pack.id, { name: e.target.value.trim() }),
              )
            }
          />
        ) : (
          <span className="lib-spacer" />
        )}
        {official && (
          <>
            <label className="lib-inline">
              {t("tlStyle")}
              <input
                className="tl-input"
                defaultValue={pack.style ?? ""}
                maxLength={40}
                placeholder={t("tlStyleHint")}
                onBlur={(e) =>
                  e.target.value.trim() !== (pack.style ?? "") &&
                  run(() =>
                    library.updatePack(pack.id, {
                      style: e.target.value.trim() || null,
                    }),
                  )
                }
              />
            </label>
            <label className="lib-inline">
              {t("stPackPlan")}
              <select
                value={pack.tier}
                onChange={(e) =>
                  run(() =>
                    library.updatePack(pack.id, { tier: +e.target.value }),
                  )
                }
              >
                {PLAN_OF_TIER.map((code, tier) => (
                  <option key={code} value={tier}>
                    {t(`acPlan_${code}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="lib-inline">
              <input
                type="checkbox"
                checked={pack.published}
                onChange={(e) =>
                  run(() =>
                    library.updatePack(pack.id, {
                      published: e.target.checked,
                    }),
                  )
                }
              />
              {t("stPublished")}
            </label>
          </>
        )}
        <div className="lib-pack-actions">
          {confirmDelete ? (
            <>
              <button
                className="site-btn small danger"
                onClick={() => run(() => library.removePack(pack.id))}
              >
                {t("stDeletePackConfirm")}
              </button>
              <button
                className="site-btn quiet small"
                onClick={() => setConfirmDelete(false)}
              >
                {t("acCancel")}
              </button>
            </>
          ) : (
            <button
              className="site-btn quiet small"
              onClick={() => setConfirmDelete(true)}
            >
              {t("stDeletePack")}
            </button>
          )}
        </div>
      </header>

      <div className="tl-upload">
        <div className="tl-upload-options">
          <label className="lib-inline">
            {t("tlCategory")}
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as CatalogCategory | "")
              }
            >
              <option value="">{t("txcUncategorised")}</option>
              {CATALOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`mmTexCat_${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="lib-inline tl-grow">
            {t("tlTags")}
            <input
              className="tl-input"
              value={tags}
              placeholder={t("tlTagsHint")}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <label className="lib-inline">
            {t("tlScale")}
            <input
              className="tl-input tl-num"
              type="number"
              min={0.1}
              max={8}
              step={0.1}
              value={scale}
              onChange={(e) =>
                setScale(Math.min(8, Math.max(0.1, +e.target.value || 1)))
              }
            />
          </label>
          <label className="lib-inline">
            <input
              type="checkbox"
              checked={tile}
              onChange={(e) => setTile(e.target.checked)}
            />
            {t("tlSeamless")}
          </label>
        </div>
        <button
          className="tl-drop"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {progress
            ? t("txcUploading", { done: progress.done, total: progress.total })
            : t("tlDrop")}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void upload(files);
          }}
        />
      </div>

      {assets === null ? (
        <CompassLoader size={48} />
      ) : assets.length === 0 ? (
        <p className="maps-section-note">{t("tlEmptyPack")}</p>
      ) : (
        <>
          <p className="maps-section-note">
            {t("tlCount", { n: assets.length })}
          </p>
          <div className="tl-grid">
            {assets.map((a) => (
              <TextureCard key={a.id} asset={a} t={t} busy={busy} run={run} />
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function TextureCard({
  asset,
  t,
  busy,
  run,
}: {
  asset: Asset;
  t: T;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const save = (patch: Parameters<typeof library.updateAsset>[1]) =>
    run(() => library.updateAsset(asset.id, patch));
  return (
    <div className="tl-card">
      <img
        src={asset.thumb_url ?? asset.url}
        alt=""
        loading="lazy"
        crossOrigin="anonymous"
        style={asset.color ? { background: asset.color } : undefined}
      />
      <input
        className="tl-input"
        defaultValue={asset.name}
        maxLength={80}
        aria-label={t("stAssetName")}
        onBlur={(e) =>
          e.target.value.trim() &&
          e.target.value.trim() !== asset.name &&
          save({ name: e.target.value.trim() })
        }
      />
      <select
        value={asset.category ?? ""}
        aria-label={t("tlCategory")}
        onChange={(e) => save({ category: e.target.value || null })}
      >
        <option value="">{t("txcUncategorised")}</option>
        {CATALOG_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`mmTexCat_${c}`)}
          </option>
        ))}
      </select>
      <input
        className="tl-input"
        defaultValue={asset.tags.join("، ")}
        placeholder={t("tlTagsHint")}
        aria-label={t("tlTags")}
        onBlur={(e) => {
          const next = tagsOf(e.target.value);
          if (next.join("|") !== asset.tags.join("|"))
            void save({ tags: next });
        }}
      />
      <div className="tl-card-row">
        <label className="lib-inline">
          {t("tlScale")}
          <input
            className="tl-input tl-num"
            type="number"
            min={0.1}
            max={8}
            step={0.1}
            defaultValue={asset.meta?.scale ?? 1}
            onBlur={(e) => {
              const v = Math.min(8, Math.max(0.1, +e.target.value || 1));
              if (v !== (asset.meta?.scale ?? 1))
                void save({
                  meta: { tile: asset.meta?.tile ?? true, scale: v },
                });
            }}
          />
        </label>
        <label className="lib-inline">
          <input
            type="checkbox"
            checked={asset.meta?.tile !== false}
            onChange={(e) =>
              save({
                meta: { scale: asset.meta?.scale ?? 1, tile: e.target.checked },
              })
            }
          />
          {t("tlSeamless")}
        </label>
        <button
          className="site-link"
          disabled={busy}
          onClick={() => run(() => library.removeAsset(asset.id))}
        >
          {t("acDelete")}
        </button>
      </div>
    </div>
  );
}
