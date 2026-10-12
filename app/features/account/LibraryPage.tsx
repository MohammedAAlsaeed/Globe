"use client";
/* eslint-disable @next/next/no-img-element -- stamp pictures are signed URLs from the API */
/**
 * My stamps (the art manager): your uploaded stamps, organized into sets —
 * pictures in one set are variants the Stamp Tool places at random. Admins
 * also manage the official library here: packs, the plan each needs,
 * publishing, and the catalog category of each stamp.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api/client";
import { library } from "./api";
import { useAuth } from "./AuthProvider";
import type { Asset, AssetPack } from "./types";
import { CompassLoader, CompassScreen, SiteHeader, errorMessage } from "./ui";
import { prepareStampImage } from "../mapmaker/stamps/upload";
import { loadLibrary } from "../mapmaker/stamps/remote";

type T = (k: string, o?: Record<string, unknown>) => string;
const CATEGORIES = [
  "terrain",
  "vegetation",
  "settlements",
  "water",
  "symbols",
] as const;
const CATEGORY_LABEL: Record<string, string> = {
  terrain: "stCatTerrain",
  vegetation: "stCatVegetation",
  settlements: "stCatSettlements",
  water: "stCatWater",
  symbols: "stCatSymbols",
};
const PLAN_OF_TIER = ["explorer", "cartographer", "atlas"];
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const newSetKey = () => `set-${Date.now().toString(36)}`;

/** Assets grouped by set (ungrouped assets are sets of one), in upload order. */
function groupSets(assets: Asset[]) {
  const sets = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = a.set_key ?? `one-${a.id}`;
    sets.set(key, [...(sets.get(key) ?? []), a]);
  }
  return [...sets];
}

export function LibraryPage() {
  const { t } = useTranslation(),
    { user, refresh } = useAuth();
  const [packs, setPacks] = useState<AssetPack[] | null>(null),
    [notice, setNotice] = useState<{
      kind: "ok" | "error";
      text: string;
    } | null>(null);

  const load = useCallback(async () => {
    try {
      setPacks(
        (await library.packs()).filter(
          (p) => !p.official || user?.role === "admin",
        ),
      );
    } catch (e) {
      setPacks([]);
      setNotice({ kind: "error", text: errorMessage(t, e) });
    }
  }, [t, user?.role]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when signed in
    if (user) void load();
  }, [user, load]);

  /** After any change: refresh this page, the editor's catalog and the quota. */
  const changed = useCallback(async () => {
    await Promise.all([load(), loadLibrary(), refresh()]);
  }, [load, refresh]);
  const report = (e: unknown) =>
    setNotice({
      kind: "error",
      text:
        e instanceof ApiError && e.code === "plan_limit_reached"
          ? t("stUploadLimit", {
              quota: mb(user?.plan.upload_quota_bytes ?? 0),
            })
          : e instanceof Error && e.message === "emptyImage"
            ? t("stUploadEmpty")
            : errorMessage(t, e),
    });

  if (user === undefined) return <CompassScreen label={t("acLoading")} />;
  const own = packs?.filter((p) => !p.official) ?? [],
    official = packs?.filter((p) => p.official) ?? [];

  return (
    <div className="site">
      <SiteHeader />
      <main className="maps-main">
        <div className="maps-head">
          <h1>{t("stLibraryTitle")}</h1>
          <div className="maps-head-actions">
            <Link className="site-btn quiet" href="/editor">
              {t("stBackToEditor")}
            </Link>
          </div>
        </div>
        {!user ? (
          <div className="maps-empty">
            <p>{t("stUploadSignIn")}</p>
            <Link className="site-btn" href="/login?next=/library">
              {t("acSignIn")}
            </Link>
          </div>
        ) : (
          <>
            <p className="maps-section-note">{t("stLibraryLead")}</p>
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
                  <h2>{t("stCatCustom")}</h2>
                  {own.length === 0 ? (
                    <OwnPackStarter
                      t={t}
                      onCreated={changed}
                      onError={report}
                    />
                  ) : (
                    own.map((p) => (
                      <PackEditor
                        key={p.id}
                        pack={p}
                        t={t}
                        admin={false}
                        onChanged={changed}
                        onError={report}
                      />
                    ))
                  )}
                </section>
                {user.role === "admin" && (
                  <section className="maps-section">
                    <h2>{t("stOfficialLibrary")}</h2>
                    <p className="maps-section-note">{t("stOfficialLead")}</p>
                    {official.map((p) => (
                      <PackEditor
                        key={p.id}
                        pack={p}
                        t={t}
                        admin
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

function OwnPackStarter({
  t,
  onCreated,
  onError,
}: {
  t: T;
  onCreated: () => void;
  onError: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="maps-empty">
      <p>{t("stNoUploads")}</p>
      <button
        className="site-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await library.createPack({ name: "My stamps" });
            onCreated();
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("stStartLibrary")}
      </button>
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
  const [name, setName] = useState("");
  return (
    <form
      className="lib-new-pack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
          await library.createPack({
            name: name.trim(),
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
      <button className="site-btn small" disabled={!name.trim()}>
        {t("stCreatePack")}
      </button>
    </form>
  );
}

/** One pack: its sets of stamps, uploads, and (admins) its plan and publishing. */
function PackEditor({
  pack,
  t,
  admin,
  onChanged,
  onError,
}: {
  pack: AssetPack;
  t: T;
  admin: boolean;
  onChanged: () => Promise<void> | void;
  onError: (e: unknown) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    input = useRef<HTMLInputElement>(null),
    target = useRef<string | null | undefined>(undefined);
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
  /** Uploads into a new set, an existing set (`setKey`), or as single stamps (null). */
  function pick(setKey: string | null) {
    target.current = setKey;
    input.current?.click();
  }
  const sets = groupSets(assets ?? []);
  const official = pack.official;

  return (
    <article className="lib-pack">
      <header className="lib-pack-head">
        {/* Your own stamps live in one pack, titled by the section above. */}
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
        {admin && official && (
          <>
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
          <button
            className="site-btn small"
            disabled={busy}
            onClick={() => pick(null)}
          >
            {t("stUpload")}
          </button>
          <button
            className="site-btn quiet small"
            disabled={busy}
            onClick={() => pick(newSetKey())}
            title={t("stUploadSetHint")}
          >
            {t("stUploadSet")}
          </button>
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
        <input
          ref={input}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            const setKey = target.current ?? null;
            if (!files.length) return;
            void run(async () => {
              for (const file of files) {
                const blob = await prepareStampImage(file),
                  name =
                    file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Stamp";
                await library.upload(
                  pack.id,
                  blob,
                  `${name}.${blob.type === "image/webp" ? "webp" : "png"}`,
                  { name, set_key: setKey },
                );
              }
            });
          }}
        />
      </header>
      {busy && <p className="maps-section-note">{t("stWorking")}</p>}
      {assets === null ? (
        <CompassLoader size={48} />
      ) : sets.length === 0 ? (
        <p className="maps-section-note">{t("stEmptyPack")}</p>
      ) : (
        <div className="lib-sets">
          {sets.map(([key, list]) => (
            <div className="lib-set" key={key}>
              <div className="lib-set-head">
                <b>
                  {list.length > 1
                    ? t("stSetOf", { name: list[0].name, count: list.length })
                    : list[0].name}
                </b>
                <button
                  className="site-link"
                  disabled={busy}
                  onClick={() => pick(list[0].set_key ?? null)}
                  hidden={!list[0].set_key}
                >
                  {t("stAddVariant")}
                </button>
              </div>
              <div className="lib-assets">
                {list.map((a) => (
                  <div className="lib-asset" key={a.id}>
                    <img src={a.url} alt="" loading="lazy" />
                    <input
                      defaultValue={a.name}
                      maxLength={80}
                      aria-label={t("stStampName")}
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value !== a.name &&
                        run(() =>
                          library.updateAsset(a.id, {
                            name: e.target.value.trim(),
                          }),
                        )
                      }
                    />
                    <select
                      aria-label={t("stMoveToSet")}
                      value={a.set_key ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        void run(() =>
                          library.updateAsset(a.id, {
                            set_key: v === "__new" ? newSetKey() : v || null,
                          }),
                        );
                      }}
                    >
                      <option value="">{t("stOwnStamp")}</option>
                      {sets
                        .filter(([k, l]) => l[0].set_key && k !== `one-${a.id}`)
                        .map(([k, l]) => (
                          <option key={k} value={l[0].set_key!}>
                            {t("stInSet", { name: l[0].name })}
                          </option>
                        ))}
                      <option value="__new">{t("stNewSet")}</option>
                    </select>
                    {official && (
                      <select
                        aria-label={t("stCategory")}
                        value={a.category ?? ""}
                        onChange={(e) =>
                          run(() =>
                            library.updateAsset(a.id, {
                              category: e.target.value || null,
                            }),
                          )
                        }
                      >
                        <option value="">{t("stCatLibrary")}</option>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {t(CATEGORY_LABEL[c])}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      className="site-link"
                      disabled={busy}
                      onClick={() => run(() => library.removeAsset(a.id))}
                    >
                      {t("acDelete")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
