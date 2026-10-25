"use client";
/**
 * The audit log: every change made by staff, newest first — who, what, on
 * which record, what it was before and after, from where. Read-only.
 */
import Link from "next/link";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { RequirePermission } from "../AdminApp";
import { admin, type Query } from "../api";
import type { AuditEntry } from "../types";
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
  fmtDateTime,
  useLoad,
  useUrlQuery,
  type T,
} from "../ui";

export function Audit() {
  return (
    <RequirePermission permission="audit.view">
      <Inner />
    </RequirePermission>
  );
}

const GROUPS = ["user", "subscription", "plan", "map", "content", "two_factor"];

function Inner() {
  const { t } = useTranslation(),
    { values, set, page } = useUrlQuery([
      "action",
      "target_type",
      "target_id",
      "actor",
      "from",
      "to",
    ] as const);
  return (
    <>
      <PageHead title={t("adNavAudit")} lead={t("adAuditLead")} />
      <div className="adm-filters">
        <Select
          label={t("adFilterAction")}
          value={values.action}
          onChange={(action) => set({ action })}
          options={[
            { value: "", label: t("adAllActions") },
            ...GROUPS.map((g) => ({
              value: `${g}.`,
              label: t(`adGroup_${g}`),
            })),
          ]}
        />
        <SearchBox
          value={values.target_id}
          onChange={(target_id) => set({ target_id })}
          placeholder={t("adAuditTargetId")}
        />
        <label className="adm-inline-field">
          <span>{t("adFrom")}</span>
          <input
            type="date"
            value={values.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>
        <label className="adm-inline-field">
          <span>{t("adTo")}</span>
          <input
            type="date"
            value={values.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
      </div>
      <AuditList
        query={{
          ...values,
          to: values.to ? `${values.to} 23:59:59` : "",
          page,
          per_page: 50,
        }}
        onPage={(p) => set({ page: p })}
      />
    </>
  );
}

export function actionLabel(t: T, action: string) {
  const key = `adAct_${action.replace(/\./g, "_")}`;
  const v = t(key);
  return v === key ? action : v;
}

function valueText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Changes({ e }: { e: AuditEntry }) {
  const { t } = useTranslation();
  const before = e.changes?.before ?? {},
    after = e.changes?.after ?? {},
    keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const meta = Object.entries(e.meta ?? {});
  return (
    <div className="adm-audit-detail">
      {keys.length > 0 && (
        <table className="adm-diff">
          <thead>
            <tr>
              <th>{t("adField")}</th>
              <th>{t("adBefore")}</th>
              <th>{t("adAfter")}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th>{k}</th>
                <td className="old">{valueText(before[k])}</td>
                <td className="new">{valueText(after[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {meta.length > 0 && (
        <dl className="adm-kv">
          {meta.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd dir="auto">{valueText(v)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      <p className="adm-muted small" dir="ltr">
        {e.ip ?? "—"} · {e.user_agent ?? "—"}
      </p>
    </div>
  );
}

export function AuditList({
  query,
  compact,
  onPage,
  refreshKey = 0,
}: {
  query: Query;
  compact?: boolean;
  onPage?: (p: number) => void;
  /** Change it to load the list again. */
  refreshKey?: number;
}) {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    key = JSON.stringify(query),
    { data, error, loading, reload } = useLoad(
      () => admin.audit(query),
      [key, refreshKey],
    ),
    [open, setOpen] = useState<number | null>(null);
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Skeleton rows={compact ? 4 : 10} />;
  if (data.data.length === 0)
    return compact ? (
      <p className="adm-muted">{t("adNoHistory")}</p>
    ) : (
      <Empty title={t("adNoResults")} />
    );
  const danger = (a: string) =>
    /deleted|suspended|revoked|failed|trashed|document_read|two_factor_reset|role_changed/.test(
      a,
    );
  return (
    <div className={loading ? "is-loading" : undefined}>
      <ol className={`adm-audit${compact ? " compact" : ""}`}>
        {data.data.map((e) => (
          <li key={e.id} className={open === e.id ? "open" : undefined}>
            <button
              className="adm-audit-row"
              aria-expanded={open === e.id}
              onClick={() => setOpen(open === e.id ? null : e.id)}
            >
              <span
                className="adm-audit-when"
                title={fmtDateTime(e.created_at, L)}
              >
                {fmtAgo(e.created_at, L)}
              </span>
              <span className="adm-audit-what">
                <Badge tone={danger(e.action) ? "danger" : "neutral"}>
                  {actionLabel(t, e.action)}
                </Badge>
                {e.target?.label && (
                  <span dir="auto" className="adm-audit-target">
                    {e.target.label}
                  </span>
                )}
              </span>
              {!compact && (
                <span className="adm-audit-who" dir="ltr">
                  {e.actor?.email ?? t("adSystem")}
                </span>
              )}
            </button>
            {open === e.id && (
              <>
                <Changes e={e} />
                {e.target?.type === "user" && e.target.id && !compact && (
                  <Link
                    className="adm-link"
                    href={`/admin/users/${e.target.id}`}
                  >
                    {t("adOpenPerson")}
                  </Link>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      {onPage && <Pager meta={data.meta} onPage={onPage} />}
    </div>
  );
}
