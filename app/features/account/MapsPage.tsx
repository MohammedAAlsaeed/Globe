"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails are signed URLs from the API */
/**
 * My maps: the signed-in user's cloud maps with their plan and usage, and
 * the maps kept only in this browser (made signed out, or imported), which
 * can be uploaded to the cloud.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Glyph } from "../mapmaker/glyphs";
import { CreateMapModal } from "../mapmaker/CreateMapModal";
import {
  deleteProject,
  exportProjectToFile,
  listProjects,
  parseProjectFile,
  saveProject,
  stashInitialProject,
} from "../mapmaker/storage";
import type { MMProject } from "../mapmaker/types";
import { auth, maps } from "./api";
import { useAuth } from "./AuthProvider";
import type { CloudMap, User } from "./types";
import { CompassLoader, CompassScreen, SiteHeader, errorMessage } from "./ui";
import {ApiError} from "@/lib/api/client";

function formatDate(value: string | number, locale: string) {
  try {
    return new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function MapsPage() {
  const { t, i18n } = useTranslation(),
    router = useRouter(),
    { user, refresh } = useAuth(),
    fileInput = useRef<HTMLInputElement>(null);
  const [cloud, setCloud] = useState<CloudMap[] | null>(null),
    [local, setLocal] = useState<MMProject[] | null>(null),
    [creating, setCreating] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null),
    [busyId, setBusyId] = useState<string | null>(null),
    [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadCloud = useCallback(async () => {
    try {
      setCloud((await maps.list()).data);
    } catch (e) {
      setCloud([]);
      setNotice({ kind: "error", text: errorMessage(t, e) });
    }
  }, [t]);
  const loadLocal = useCallback(async () => {
    const all = await listProjects().catch(() => []);
    // Local copies of cloud maps are drafts, not separate maps.
    setLocal(all.filter((p) => !p.cloud));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    void loadLocal();
  }, [loadLocal]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when signed in
    if (user) void loadCloud();
  }, [user, loadCloud]);

  /** A failed action: plan limits get their own message. */
  function report(e: unknown) {
    setNotice({
      kind: "error",
      text:
        e instanceof ApiError && e.code === "plan_limit_reached" && user
          ? t("acLimitReached", { plan: t(`acPlan_${user.plan.code}`), max: e.body.max })
          : errorMessage(t, e),
    });
  }

  async function removeCloud(id: string) {
    setBusyId(id);
    try {
      await maps.remove(id);
      await deleteProject(id).catch(() => {});
      setCloud((list) => list?.filter((m) => m.id !== id) ?? list);
      void refresh();
    } catch (e) {
      report(e);
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }
  async function downloadCloud(id: string) {
    setBusyId(id);
    try {
      const { project } = await maps.get(id);
      exportProjectToFile(project);
    } catch (e) {
      report(e);
    } finally {
      setBusyId(null);
    }
  }
  /** Uploads a device map; its local copy then lives on as the cloud map's draft. */
  async function upload(project: MMProject) {
    setBusyId(project.id);
    try {
      const { project: bound } = await maps.create(project);
      await saveProject({ ...bound, cloud: { ...bound.cloud!, savedAt: Date.now() } });
      await deleteProject(project.id);
      await Promise.all([loadCloud(), loadLocal(), refresh()]);
    } catch (e) {
      report(e);
    } finally {
      setBusyId(null);
    }
  }
  async function removeLocal(id: string) {
    await deleteProject(id);
    setLocal((list) => list?.filter((p) => p.id !== id) ?? list);
    setConfirm(null);
  }
  function openLocal(project: MMProject) {
    stashInitialProject(project);
    router.push("/editor");
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNotice(null);
    let project: MMProject;
    try {
      project = await parseProjectFile(await file.text());
    } catch {
      setNotice({ kind: "error", text: t("mmImportError") });
      return;
    }
    if (user) await upload(project);
    else {
      await saveProject(project);
      await loadLocal();
    }
  }

  if (user === undefined) return <CompassScreen label={t("acLoading")} />;
  return (
    <div className="site">
      <SiteHeader />
      <main className="maps-main">
        <div className="maps-head">
          <div>
            <h1>{t("acMapsTitle")}</h1>
          </div>
          <div className="maps-head-actions">
            <button className="site-btn quiet" onClick={() => fileInput.current?.click()}>
              <Glyph name="upload" size={16} />
              {t("acImportMap")}
            </button>
            <button className="site-btn" onClick={() => setCreating(true)}>
              {t("acNewMap")}
            </button>
          </div>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile} />

        {user && <PlanMeter user={user} count={cloud?.length ?? user.usage.maps} />}
        {user && !user.email_verified && <VerifyNotice email={user.email} />}
        {notice && (
          <p className={`site-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        )}

        <section className="maps-section" aria-labelledby="cloud-maps">
          <h2 id="cloud-maps">{t("acCloudMaps")}</h2>
          {!user ? (
            <div className="maps-empty">
              <p>{t("acSignInToSee")}</p>
              <div className="maps-head-actions">
                <Link className="site-btn" href="/login?next=/maps">
                  {t("acSignIn")}
                </Link>
                <Link className="site-btn quiet" href="/register?next=/maps">
                  {t("acCreateAccount")}
                </Link>
              </div>
            </div>
          ) : cloud === null ? (
            <CompassLoader size={72} label={t("acLoading")} />
          ) : (
            <>
              {cloud.length === 0 && <p className="maps-section-note">{t("acEmptyCloud")}</p>}
              <div className="maps-grid">
                <button className="maps-new" onClick={() => setCreating(true)}>
                  <span aria-hidden="true">+</span>
                  {t("acNewMap")}
                </button>
                {cloud.map((m) => (
                  <div className="map-tile" key={m.id}>
                    <Link className="map-tile-open" href={`/editor?map=${m.id}`} aria-label={m.name}>
                      {m.thumbnail_url ? (
                        <img src={m.thumbnail_url} alt="" loading="lazy" />
                      ) : (
                        <span className="map-tile-blank">
                          <img src="/brand/compass-256.webp" alt="" />
                        </span>
                      )}
                    </Link>
                    {confirm === m.id ? (
                      <div className="map-tile-confirm">
                        <span>{t("acDeleteConfirm")}</span>
                        <button className="site-btn small" disabled={busyId === m.id} onClick={() => removeCloud(m.id)}>
                          {t("acDelete")}
                        </button>
                        <button className="site-btn quiet small" onClick={() => setConfirm(null)}>
                          {t("acCancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="map-tile-info">
                        <div>
                          <b>{m.name}</b>
                          <small>
                            {t("acUpdated", { date: formatDate(m.updated_at, i18n.language) })}
                          </small>
                        </div>
                        <div className="map-tile-actions">
                          <button title={t("acDownload")} aria-label={t("acDownload")} disabled={busyId === m.id} onClick={() => downloadCloud(m.id)}>
                            <Glyph name="download" size={15} />
                          </button>
                          <button title={t("acDelete")} aria-label={t("acDelete")} onClick={() => setConfirm(m.id)}>
                            <Glyph name="trash" size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {local && local.length > 0 && (
          <section className="maps-section" aria-labelledby="device-maps">
            <h2 id="device-maps">{t("acDeviceMaps")}</h2>
            <p className="maps-section-note">{t(user ? "acDeviceNote" : "acDeviceNoteGuest")}</p>
            <div className="maps-grid">
              {local.map((p) => (
                <div className="map-tile" key={p.id}>
                  <button className="map-tile-open" onClick={() => openLocal(p)} aria-label={p.name || t("mmUntitledMap")}>
                    <span className="map-tile-blank" style={{ background: p.background }}>
                      <img src="/brand/compass-256.webp" alt="" />
                    </span>
                  </button>
                  {confirm === p.id ? (
                    <div className="map-tile-confirm">
                      <span>{t("acDeleteConfirm")}</span>
                      <button className="site-btn small" onClick={() => removeLocal(p.id)}>
                        {t("acDelete")}
                      </button>
                      <button className="site-btn quiet small" onClick={() => setConfirm(null)}>
                        {t("acCancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="map-tile-info">
                      <div>
                        <b>{p.name || t("mmUntitledMap")}</b>
                        <small>{t("acUpdated", { date: formatDate(p.updatedAt, i18n.language) })}</small>
                      </div>
                      <div className="map-tile-actions">
                        {user && (
                          <button title={t("acUpload")} aria-label={t("acUpload")} disabled={busyId === p.id} onClick={() => upload(p)}>
                            <Glyph name="upload" size={15} />
                          </button>
                        )}
                        <button title={t("acDownload")} aria-label={t("acDownload")} onClick={() => exportProjectToFile(p)}>
                          <Glyph name="download" size={15} />
                        </button>
                        <button title={t("acDelete")} aria-label={t("acDelete")} onClick={() => setConfirm(p.id)}>
                          <Glyph name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      {creating && <CreateMapModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/** "2 of 3 maps" and a meter that turns red when the plan is full. */
function PlanMeter({ user, count }: { user: User; count: number }) {
  const { t } = useTranslation();
  const max = user.plan.max_maps,
    full = max !== null && count >= max;
  return (
    <div className="maps-plan">
      <span>
        <b>{t("acPlanLine", { plan: t(`acPlan_${user.plan.code}`) })}</b>
        {"  "}
        {max === null ? t("acPlanUnlimited", { used: count }) : t("acPlanUsage", { used: count, max })}
      </span>
      {max !== null && (
        <div
          className={`maps-meter ${full ? "full" : ""}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={count}
        >
          <span style={{ width: `${Math.min(100, (count / Math.max(1, max)) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function VerifyNotice({ email }: { email: string }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  return (
    <p className="site-notice">
      {t("acVerifyBanner", { email })}{" "}
      {sent ? (
        t("acResent")
      ) : (
        <button
          className="site-link"
          onClick={() => {
            setSent(true);
            void auth.resendVerification().catch(() => setSent(false));
          }}
        >
          {t("acResend")}
        </button>
      )}
    </p>
  );
}
