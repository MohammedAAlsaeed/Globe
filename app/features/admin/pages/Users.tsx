"use client";
/** People: search, filter and sort everyone with an account. */
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { RequirePermission } from "../AdminApp";
import { admin } from "../api";
import { ROLES } from "../types";
import {
  Badge,
  Empty,
  ErrorNote,
  PageHead,
  Pager,
  SearchBox,
  Select,
  Skeleton,
  fmtAgo,
  fmtDate,
  fmtNumber,
  useLoad,
  useUrlQuery,
} from "../ui";

const KEYS = ["q", "role", "status", "plan", "sort"] as const;

export function Users() {
  return (
    <RequirePermission permission="users.view">
      <UsersInner />
    </RequirePermission>
  );
}

/** Role and state badges shared by the list and the detail page. */
export function UserBadges({
  role,
  suspended,
  verified,
}: {
  role: string;
  suspended: boolean;
  verified: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {role !== "user" && <Badge tone="accent">{t(`adRole_${role}`)}</Badge>}
      {suspended && <Badge tone="danger">{t("adSuspended")}</Badge>}
      {!verified && <Badge tone="warn">{t("adUnverified")}</Badge>}
    </>
  );
}

/** A column header that sorts the list (newest/largest first on the first click). */
export function SortHead({
  col,
  label,
  sort,
  onSort,
  num,
}: {
  col: string;
  label: string;
  sort: string;
  onSort: (col: string) => void;
  /** A column of numbers (aligned to the end). */
  num?: boolean;
}) {
  const dir =
    sort === col ? "ascending" : sort === `-${col}` ? "descending" : "none";
  return (
    <th aria-sort={dir} className={num ? "num" : undefined}>
      <button className="adm-sort" onClick={() => onSort(col)}>
        {label}
        <span aria-hidden="true">
          {dir === "ascending" ? "↑" : dir === "descending" ? "↓" : ""}
        </span>
      </button>
    </th>
  );
}

function UsersInner() {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    { values, set, page } = useUrlQuery(KEYS),
    { data, error, loading, reload } = useLoad(
      () => admin.users.list({ ...values, page, per_page: 25 }),
      [values, page],
    );
  const sort = values.sort || "-created_at";
  const sortBy = (col: string) =>
    set({ sort: sort === `-${col}` ? col : `-${col}` });

  return (
    <>
      <PageHead
        title={t("adNavUsers")}
        lead={
          data
            ? t("adUsersCount", { n: fmtNumber(data.meta.total, L) })
            : undefined
        }
      />
      <div className="adm-filters">
        <SearchBox
          value={values.q}
          onChange={(q) => set({ q })}
          placeholder={t("adUsersSearch")}
        />
        <Select
          label={t("adFilterRole")}
          value={values.role}
          onChange={(role) => set({ role })}
          options={[
            { value: "", label: t("adAllRoles") },
            { value: "staff", label: t("adStaffOnly") },
            ...ROLES.map((r) => ({ value: r, label: t(`adRole_${r}`) })),
          ]}
        />
        <Select
          label={t("adFilterStatus")}
          value={values.status}
          onChange={(status) => set({ status })}
          options={[
            { value: "", label: t("adAnyStatus") },
            { value: "active", label: t("adStatusActive") },
            { value: "suspended", label: t("adSuspended") },
            { value: "unverified", label: t("adUnverified") },
            { value: "two_factor", label: t("adStatusTwoFactor") },
          ]}
        />
        <Select
          label={t("adFilterPlan")}
          value={values.plan}
          onChange={(plan) => set({ plan })}
          options={[
            { value: "", label: t("adAnyPlan") },
            ...["explorer", "cartographer", "atlas"].map((p) => ({
              value: p,
              label: t(`acPlan_${p}`),
            })),
          ]}
        />
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton rows={10} />
      ) : data.data.length === 0 ? (
        <Empty title={t("adNoResults")}>{t("adNoResultsLead")}</Empty>
      ) : (
        <div className={`adm-table-wrap${loading ? " is-loading" : ""}`}>
          <table className="adm-table">
            <thead>
              <tr>
                <SortHead
                  sort={sort}
                  onSort={sortBy}
                  col="name"
                  label={t("adColPerson")}
                />
                <th>{t("adColPlan")}</th>
                <SortHead
                  sort={sort}
                  onSort={sortBy}
                  col="maps_count"
                  num
                  label={t("adColMaps")}
                />
                <SortHead
                  sort={sort}
                  onSort={sortBy}
                  col="last_seen_at"
                  label={t("adColLastSeen")}
                />
                <SortHead
                  sort={sort}
                  onSort={sortBy}
                  col="created_at"
                  label={t("adColJoined")}
                />
              </tr>
            </thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link className="adm-person" href={`/admin/users/${u.id}`}>
                      <span className="adm-avatar sm">
                        {u.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <b>{u.name}</b>
                        <small dir="ltr">{u.email}</small>
                      </span>
                    </Link>
                    <span className="adm-badges">
                      <UserBadges
                        role={u.role}
                        suspended={u.suspended}
                        verified={u.email_verified}
                      />
                    </span>
                  </td>
                  <td>
                    {u.plan ? (
                      <Badge tone={u.plan === "explorer" ? "neutral" : "info"}>
                        {t(`acPlan_${u.plan}`)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{fmtNumber(u.maps_count ?? 0, L)}</td>
                  <td title={u.last_seen_at ?? undefined}>
                    {fmtAgo(u.last_seen_at, L)}
                  </td>
                  <td>{fmtDate(u.created_at, L)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager meta={data.meta} onPage={(p) => set({ page: p })} />
        </div>
      )}
    </>
  );
}
