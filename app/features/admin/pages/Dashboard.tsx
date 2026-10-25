"use client";
/** The first page: how the atelier is doing, at a glance. */
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RequirePermission, useAdmin } from "../AdminApp";
import { admin } from "../api";
import { BarList, TrendChart } from "../charts";
import {
  Card,
  ErrorNote,
  PageHead,
  Skeleton,
  fmtBytes,
  fmtDateTime,
  fmtNumber,
  useLoad,
} from "../ui";

function Delta({
  now,
  before,
  locale,
}: {
  now: number;
  before: number;
  locale: string;
}) {
  const { t } = useTranslation();
  if (!before && !now) return <span className="adm-delta flat">—</span>;
  if (!before) return <span className="adm-delta up">{t("adDeltaNew")}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return (
    <span className={`adm-delta ${dir}`} title={t("adDeltaVsPrev")}>
      {pct > 0 ? "↑" : pct < 0 ? "↓" : "→"}{" "}
      {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
        Math.abs(pct),
      )}
      %
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="adm-stat-label">{label}</span>
      <span className="adm-stat-value">{value}</span>
      {sub && <span className="adm-stat-sub">{sub}</span>}
    </>
  );
  return href ? (
    <Link className="adm-stat link" href={href}>
      {body}
    </Link>
  ) : (
    <div className="adm-stat">{body}</div>
  );
}

export function Dashboard() {
  return (
    <RequirePermission permission="stats.view">
      <DashboardInner />
    </RequirePermission>
  );
}

function DashboardInner() {
  const { t, i18n } = useTranslation(),
    { can, session } = useAdmin(),
    [days, setDays] = useState(30),
    { data, error, loading, reload } = useLoad(() => admin.stats(days), [days]);
  const L = i18n.language,
    rtl = i18n.dir() === "rtl";

  return (
    <>
      <PageHead
        title={t("adHello", { name: session.name.split(" ")[0] })}
        lead={
          data
            ? t("adUpdated", { at: fmtDateTime(data.generated_at, L) })
            : t("adDashboardLead")
        }
        actions={
          <div className="adm-seg" role="radiogroup" aria-label={t("adRange")}>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
              >
                {t("adDays", { n: d })}
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton rows={8} />
      ) : (
        <div className={`adm-dash${loading ? " is-loading" : ""}`}>
          <div className="adm-stats">
            <Stat
              label={t("adStatUsers")}
              value={fmtNumber(data.totals.users, L)}
              sub={
                <>
                  +{fmtNumber(data.totals.users_new, L)} ·{" "}
                  <Delta
                    now={data.totals.users_new}
                    before={data.totals.users_new_prev}
                    locale={L}
                  />
                </>
              }
              href={can("users.view") ? "/admin/users" : undefined}
            />
            <Stat
              label={t("adStatActive", { n: days })}
              value={fmtNumber(data.totals.active, L)}
              sub={t("adOfAll", {
                pct: data.totals.users
                  ? Math.round((data.totals.active / data.totals.users) * 100)
                  : 0,
              })}
            />
            <Stat
              label={t("adStatPaid")}
              value={fmtNumber(data.totals.paid, L)}
              sub={t("adOfAll", {
                pct: data.totals.users
                  ? Math.round((data.totals.paid / data.totals.users) * 100)
                  : 0,
              })}
              href={
                can("subscriptions.view")
                  ? "/admin/subscriptions?state=current"
                  : undefined
              }
            />
            <Stat
              label={t("adStatMaps")}
              value={fmtNumber(data.totals.maps, L)}
              sub={
                <>
                  +{fmtNumber(data.totals.maps_new, L)} ·{" "}
                  <Delta
                    now={data.totals.maps_new}
                    before={data.totals.maps_new_prev}
                    locale={L}
                  />
                </>
              }
              href={can("maps.view") ? "/admin/maps" : undefined}
            />
          </div>

          <div className="adm-grid-2">
            <Card title={t("adChartSignups")}>
              <TrendChart
                points={data.series.users}
                locale={L}
                rtl={rtl}
                label={t("adChartSignups")}
              />
            </Card>
            <Card title={t("adChartMaps")}>
              <TrendChart
                points={data.series.maps}
                locale={L}
                rtl={rtl}
                label={t("adChartMaps")}
              />
            </Card>
          </div>

          <div className="adm-grid-2">
            <Card title={t("adPlanMix")}>
              <BarList
                label={t("adPlanMix")}
                locale={L}
                rows={data.plans.map((p) => ({
                  key: p.code,
                  label:
                    t(`acPlan_${p.code}`) !== `acPlan_${p.code}`
                      ? t(`acPlan_${p.code}`)
                      : p.name,
                  value: p.users,
                }))}
              />
            </Card>
            <Card title={t("adHealth")}>
              <dl className="adm-kv">
                <dt>{t("adStatVerified")}</dt>
                <dd>
                  {fmtNumber(data.totals.verified, L)}{" "}
                  <small>
                    {t("adOfAll", {
                      pct: data.totals.users
                        ? Math.round(
                            (data.totals.verified / data.totals.users) * 100,
                          )
                        : 0,
                    })}
                  </small>
                </dd>
                <dt>{t("adStatExports", { n: days })}</dt>
                <dd>{fmtNumber(data.totals.exports_new, L)}</dd>
                <dt>{t("adStatStorageMaps")}</dt>
                <dd>{fmtBytes(data.totals.maps_bytes, L)}</dd>
                <dt>{t("adStatStorageUploads")}</dt>
                <dd>{fmtBytes(data.totals.uploads_bytes, L)}</dd>
                <dt>{t("adStatSuspended")}</dt>
                <dd>
                  {can("users.view") && data.totals.suspended ? (
                    <Link href="/admin/users?status=suspended">
                      {fmtNumber(data.totals.suspended, L)}
                    </Link>
                  ) : (
                    fmtNumber(data.totals.suspended, L)
                  )}
                </dd>
                <dt>{t("adStatExpiring")}</dt>
                <dd>
                  {can("subscriptions.view") && data.totals.expiring_grants ? (
                    <Link href="/admin/subscriptions?state=expiring">
                      {fmtNumber(data.totals.expiring_grants, L)}
                    </Link>
                  ) : (
                    fmtNumber(data.totals.expiring_grants, L)
                  )}
                </dd>
                <dt>{t("adStatStaff")}</dt>
                <dd>{fmtNumber(data.totals.staff, L)}</dd>
              </dl>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
