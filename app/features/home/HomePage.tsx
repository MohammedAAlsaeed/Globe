"use client";
/* eslint-disable @next/next/no-img-element -- brand artwork and signed thumbnail URLs */
/**
 * The home page, one address for two people:
 *
 *   a visitor  sees what the atelier does and can start drawing at once,
 *              with no account (Landing);
 *   a member   sees their own work: the map to continue, recent maps, their
 *              plan, and the quickest ways on (Dashboard).
 *
 * Which one is drawn first comes from a hint the server read from a cookie
 * (lib/session.ts), so a member never sees the landing page flash by while
 * their session is being checked; the check then confirms or corrects it.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  maps,
  plans as plansApi,
  templates as templatesApi,
} from "../account/api";
import { useAuth } from "../account/AuthProvider";
import { PlanMeter, VerifyNotice } from "../account/MapsPage";
import type { CloudMap, MapTemplateInfo, Plan, User } from "../account/types";
import { SiteHeader, errorMessage } from "../account/ui";
import { CreateMapModal, EarthThumb } from "../mapmaker/CreateMapModal";
import { isHidden, useContentControls } from "../mapmaker/contentControls";
import { Glyph } from "../mapmaker/glyphs";
import { listProjects, stashInitialProject } from "../mapmaker/storage";
import type { MMProject } from "../mapmaker/types";
import { Flourish } from "@/components/ui/Flourish";

type T = (key: string, opts?: Record<string, unknown>) => string;
/** Opens "Create a map", optionally with a template already chosen. */
type StartMap = (template?: string) => void;

function formatDate(value: string | number, locale: string) {
  try {
    return new Date(value).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function formatBytes(bytes: number, locale: string) {
  const gb = bytes / 1024 ** 3,
    n = gb >= 1 ? gb : bytes / 1024 ** 2;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)} ${gb >= 1 ? "GB" : "MB"}`;
}

/** Maps kept only in this browser (made signed out, or imported), newest first. */
function useDeviceMaps() {
  const [list, setList] = useState<MMProject[]>([]);
  useEffect(() => {
    let live = true;
    listProjects().then(
      (all) =>
        live &&
        setList(
          all
            .filter((p) => !p.cloud)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
        ),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return list;
}

function VerifiedNotice() {
  const { t } = useTranslation();
  return useSearchParams().get("verified") === "1" ? (
    <p className="site-notice ok landing-verified" role="status">
      {t("acVerified")}
    </p>
  ) : null;
}

export function HomePage() {
  const { user, expected } = useAuth(),
    [creating, setCreating] = useState<string | null>(null),
    start: StartMap = (template = "blank") => setCreating(template);
  return (
    <div className="site">
      <SiteHeader />
      <Suspense>
        <VerifiedNotice />
      </Suspense>
      {user ? (
        <Dashboard user={user} start={start} />
      ) : expected ? (
        <DashboardWaiting />
      ) : (
        <Landing start={start} />
      )}
      {creating && (
        <CreateMapModal
          initialTemplate={creating}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}

// ---- templates (both pages) --------------------------------------------------------
/** The Earth and the official templates as cards; nothing when there are none. */
function TemplateStrip({ start, lead }: { start: StartMap; lead: string }) {
  const { t, i18n } = useTranslation();
  useContentControls();
  const [official, setOfficial] = useState<MapTemplateInfo[]>([]);
  useEffect(() => {
    let live = true;
    templatesApi.list().then(
      (list) => live && setOfficial(list),
      () => {}, // offline: the Earth is still there
    );
    return () => {
      live = false;
    };
  }, []);
  const earth = !isHidden("template", "earth");
  if (!earth && official.length === 0) return null;
  const ar = i18n.language?.startsWith("ar");
  return (
    <section className="home-section" aria-labelledby="home-templates">
      <div className="home-section-head">
        <h2 id="home-templates">{t("hmTemplatesTitle")}</h2>
        <p>{lead}</p>
      </div>
      <div className="home-templates">
        {earth && (
          <button className="home-template" onClick={() => start("earth")}>
            <EarthThumb />
            <b>{t("mmTplEarth")}</b>
            <small>{t("mmTplEarthNote")}</small>
          </button>
        )}
        {official.map((x) => (
          <button
            key={x.id}
            className="home-template"
            disabled={x.locked}
            onClick={() => start(x.id)}
          >
            {x.thumbnail_url ? (
              <img
                className="mm-template-thumb"
                src={x.thumbnail_url}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="mm-template-thumb home-template-blank" />
            )}
            <b dir="auto">{(ar && x.name_ar) || x.name}</b>
            <small>
              {x.locked
                ? t("mmPlanLocked")
                : t("mmTplSize", { w: x.width, h: x.height })}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---- the visitor's page --------------------------------------------------------------
const FEATURES = [
  { key: "land", glyph: "land" },
  { key: "stamps", glyph: "stamp" },
  { key: "lines", glyph: "line" },
  { key: "text", glyph: "text" },
  { key: "layers", glyph: "layers" },
  { key: "print", glyph: "print" },
] as const;

function Landing({ start }: { start: StartMap }) {
  const { t } = useTranslation(),
    router = useRouter(),
    drafts = useDeviceMaps(),
    draft = drafts[0];
  return (
    <main>
      <section className="landing-hero">
        <div className="landing-copy">
          <h1 className="fl-title">
            <Flourish text={t("mmLandingTitle")} />
          </h1>
          <p>{t("mmLandingIntro")}</p>
          <div className="landing-ctas">
            <button className="site-btn" onClick={() => start()}>
              {t("mmCreateCardButton")}
            </button>
            <Link className="site-btn quiet" href="/print">
              {t("mmPrintCardButton")}
            </Link>
          </div>
          <small className="home-try">{t("hmTryFree")}</small>
          {draft && (
            <div className="home-draft">
              <div>
                <b>{t("hmDraftTitle")}</b>
                <span dir="auto">
                  {t("hmDraftText", {
                    name: draft.name || t("mmUntitledMap"),
                  })}
                </span>
              </div>
              <button
                className="site-btn quiet small"
                onClick={() => {
                  stashInitialProject(draft);
                  router.push("/editor");
                }}
              >
                {t("hmDraftOpen")}
              </button>
            </div>
          )}
        </div>
        <img className="landing-rose" src="/brand/compass-1024.webp" alt="" />
      </section>

      <section className="home-section" aria-labelledby="home-features">
        <div className="home-section-head">
          <h2 id="home-features">{t("hmFeaturesTitle")}</h2>
        </div>
        <ul className="home-features">
          {FEATURES.map((f) => (
            <li key={f.key}>
              <span className="home-feature-icon" aria-hidden="true">
                <Glyph name={f.glyph} size={22} />
              </span>
              <h3>{t(`hmFeat_${f.key}_t`)}</h3>
              <p>{t(`hmFeat_${f.key}_d`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <TemplateStrip start={start} lead={t("hmTemplatesLead")} />

      <section className="landing-paths">
        <div className="landing-path">
          <h2>{t("mmCreateCardTitle")}</h2>
          <p>{t("mmCreateCardText")}</p>
          <button className="site-btn quiet small" onClick={() => start()}>
            {t("mmCreateCardButton")}
          </button>
        </div>
        <div className="landing-path">
          <h2>{t("mmPrintCardTitle")}</h2>
          <p>{t("mmPrintCardText")}</p>
          <Link className="site-btn quiet small" href="/print">
            {t("mmPrintCardButton")}
          </Link>
        </div>
      </section>

      <PlansSection />

      <section className="home-join">
        <h2>{t("hmJoinTitle")}</h2>
        <p>{t("mmLandingFooter")}</p>
        <div className="landing-ctas">
          <Link className="site-btn" href="/register">
            {t("acCreateAccount")}
          </Link>
          <Link className="site-btn quiet" href="/login?next=/">
            {t("acSignIn")}
          </Link>
        </div>
      </section>
    </main>
  );
}

/** The plans side by side, from the API (so they always match what is enforced). */
function PlansSection() {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    [list, setList] = useState<Plan[]>([]);
  useEffect(() => {
    let live = true;
    plansApi.list().then(
      (p) => live && setList(p),
      () => {}, // offline: the page reads fine without them
    );
    return () => {
      live = false;
    };
  }, []);
  if (list.length === 0) return null;
  const num = (n: number) => new Intl.NumberFormat(L).format(n);
  return (
    <section className="home-section" aria-labelledby="home-plans">
      <div className="home-section-head">
        <h2 id="home-plans">{t("hmPlansTitle")}</h2>
        <p>{t("hmPlansLead")}</p>
      </div>
      <ul className="home-plans">
        {list.map((p) => (
          <li key={p.code}>
            <h3>{t(`acPlan_${p.code}`, { defaultValue: p.name })}</h3>
            <ul>
              <li>
                {p.max_maps === null
                  ? t("hmPlanMapsUnlimited")
                  : t("hmPlanMaps", { n: num(p.max_maps) })}
              </li>
              <li>{t("hmPlanExport", { px: num(p.max_export_px) })}</li>
              {p.upload_quota_bytes > 0 && (
                <li>
                  {t("hmPlanUploads", {
                    size: formatBytes(p.upload_quota_bytes, L),
                  })}
                </li>
              )}
              <li>
                {t(p.commercial_use ? "hmPlanCommercial" : "hmPlanPersonal")}
              </li>
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- the member's page -----------------------------------------------------------------
/** The member's layout while their session is being confirmed. */
function DashboardWaiting() {
  const { t } = useTranslation();
  return (
    <main className="maps-main home-dash" aria-busy="true">
      <span className="home-sr-only" role="status">
        {t("acLoading")}
      </span>
      <div className="home-wait home-wait-title" />
      <div className="home-continue">
        <div className="home-wait home-wait-hero" />
        <div className="home-wait home-wait-side" />
      </div>
      <div className="maps-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="home-wait home-wait-tile" />
        ))}
      </div>
    </main>
  );
}

function MapTile({ map, locale, t }: { map: CloudMap; locale: string; t: T }) {
  return (
    <div className="map-tile">
      <Link
        className="map-tile-open"
        href={`/editor?map=${map.id}`}
        aria-label={map.name}
      >
        {map.thumbnail_url ? (
          <img src={map.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <span className="map-tile-blank">
            <img src="/brand/compass-256.webp" alt="" />
          </span>
        )}
      </Link>
      <div className="map-tile-info">
        <div>
          <b dir="auto">{map.name}</b>
          <small>
            {t("acUpdated", { date: formatDate(map.updated_at, locale) })}
          </small>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, start }: { user: User; start: StartMap }) {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    [cloud, setCloud] = useState<CloudMap[] | null>(null),
    [error, setError] = useState<string | null>(null),
    device = useDeviceMaps();

  useEffect(() => {
    let live = true;
    maps.list().then(
      (r) =>
        live &&
        setCloud(
          [...r.data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        ),
      (e) => {
        if (!live) return;
        setCloud([]);
        setError(errorMessage(t as T, e));
      },
    );
    return () => {
      live = false;
    };
  }, [user.id, t]);

  const latest = cloud?.[0],
    recent = cloud?.slice(1, 7) ?? [],
    firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return (
    <main className="maps-main home-dash">
      <div className="maps-head">
        <h1 className="home-welcome" dir="auto">
          {t("hmWelcome", { name: firstName })}
        </h1>
        <div className="maps-head-actions">
          <Link className="site-btn quiet" href="/print">
            {t("acPrintStudio")}
          </Link>
          <button className="site-btn" onClick={() => start()}>
            {t("acNewMap")}
          </button>
        </div>
      </div>

      {!user.email_verified && <VerifyNotice email={user.email} />}
      {error && (
        <p className="site-notice error" role="alert">
          {error}
        </p>
      )}

      <div className="home-continue">
        {cloud === null ? (
          <div className="home-wait home-wait-hero" />
        ) : latest ? (
          <Link className="home-latest" href={`/editor?map=${latest.id}`}>
            {latest.thumbnail_url ? (
              <img src={latest.thumbnail_url} alt="" />
            ) : (
              <span className="map-tile-blank">
                <img src="/brand/compass-256.webp" alt="" />
              </span>
            )}
            <span className="home-latest-info">
              <small>{t("hmContinue")}</small>
              <b dir="auto">{latest.name}</b>
              <span>
                {t("acUpdated", { date: formatDate(latest.updated_at, L) })}
                {" · "}
                {latest.width}×{latest.height}
              </span>
            </span>
          </Link>
        ) : (
          <div className="home-first">
            <h2>{t("hmNoMapsTitle")}</h2>
            <p>{t("hmNoMapsText")}</p>
            <button className="site-btn" onClick={() => start()}>
              {t("acNewMap")}
            </button>
          </div>
        )}
        <aside className="home-side">
          <PlanMeter user={user} count={cloud?.length ?? user.usage.maps} />
          <nav className="home-links" aria-label={t("hmShortcuts")}>
            <Link href="/maps">{t("acMyMaps")}</Link>
            <Link href="/library">{t("hmMyStamps")}</Link>
            <Link href="/print">{t("acPrintStudio")}</Link>
            {user.permissions.length > 0 && (
              <Link href="/admin">{t("acAdminPanel")}</Link>
            )}
          </nav>
        </aside>
      </div>

      {recent.length > 0 && (
        <section className="maps-section" aria-labelledby="home-recent">
          <div className="home-row-head">
            <h2 id="home-recent">{t("hmRecent")}</h2>
            <Link className="site-link" href="/maps">
              {t("hmAllMaps")}
            </Link>
          </div>
          <div className="maps-grid">
            {recent.map((m) => (
              <MapTile key={m.id} map={m} locale={L} t={t as T} />
            ))}
          </div>
        </section>
      )}

      {device.length > 0 && (
        <p className="site-notice">
          {t("hmDeviceDrafts", { count: device.length })}{" "}
          <Link className="site-link" href="/maps">
            {t("hmDeviceReview")}
          </Link>
        </p>
      )}

      <TemplateStrip start={start} lead={t("hmTemplatesLead")} />
    </main>
  );
}
