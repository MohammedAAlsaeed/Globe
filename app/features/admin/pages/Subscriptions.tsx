"use client";
/**
 * Subscriptions: every plan someone holds or held. Staff grant plans by hand
 * (with a note) and can extend or end those grants; paid subscriptions are
 * shown but belong to the payment provider.
 */
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RequirePermission, useAdmin } from "../AdminApp";
import { admin } from "../api";
import type { PersonRef, SubscriptionRow } from "../types";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  PageHead,
  Pager,
  SearchBox,
  Select,
  Skeleton,
  adminError,
  fmtDate,
  fmtNumber,
  useLoad,
  useToast,
  useUrlQuery,
  type ConfirmSpec,
} from "../ui";

const PAID = ["cartographer", "atlas"];

export function Subscriptions() {
  return (
    <RequirePermission permission="subscriptions.view">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const { t, i18n } = useTranslation(),
    { values, set, page } = useUrlQuery([
      "q",
      "state",
      "plan",
      "provider",
      "user",
    ] as const),
    { data, error, loading, reload } = useLoad(
      () => admin.subscriptions.list({ ...values, page, per_page: 25 }),
      [values, page],
    );
  return (
    <>
      <PageHead
        title={t("adNavSubscriptions")}
        lead={
          data
            ? t("adSubsCount", { n: fmtNumber(data.meta.total, i18n.language) })
            : t("adSubsLead")
        }
      />
      <div className="adm-filters">
        <SearchBox
          value={values.q}
          onChange={(q) => set({ q })}
          placeholder={t("adSubsSearch")}
        />
        <Select
          label={t("adFilterState")}
          value={values.state}
          onChange={(state) => set({ state })}
          options={[
            { value: "", label: t("adAnyState") },
            { value: "current", label: t("adStateCurrent") },
            { value: "expiring", label: t("adStateExpiring") },
            { value: "ended", label: t("adStateEnded") },
          ]}
        />
        <Select
          label={t("adFilterPlan")}
          value={values.plan}
          onChange={(plan) => set({ plan })}
          options={[
            { value: "", label: t("adAnyPlan") },
            ...PAID.map((p) => ({ value: p, label: t(`acPlan_${p}`) })),
          ]}
        />
        <Select
          label={t("adFilterSource")}
          value={values.provider}
          onChange={(provider) => set({ provider })}
          options={[
            { value: "", label: t("adAnySource") },
            { value: "manual", label: t("adSourceManual") },
          ]}
        />
        {values.user && (
          <Button size="sm" variant="ghost" onClick={() => set({ user: null })}>
            {t("adClearPerson")} ×
          </Button>
        )}
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton rows={10} />
      ) : data.data.length === 0 ? (
        <Empty title={t("adNoResults")} />
      ) : (
        <div className={`adm-table-wrap${loading ? " is-loading" : ""}`}>
          <SubscriptionTable rows={data.data} onChanged={reload} />
          <Pager meta={data.meta} onPage={(p) => set({ page: p })} />
        </div>
      )}
    </>
  );
}

export function SubscriptionTable({
  rows,
  compact,
  onChanged,
}: {
  rows: SubscriptionRow[];
  /** On a person's page: no person column. */
  compact?: boolean;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    { can, guard } = useAdmin(),
    toast = useToast(),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null),
    [extending, setExtending] = useState<SubscriptionRow | null>(null);
  if (rows.length === 0) return <p className="adm-muted">{t("adNoSubs")}</p>;
  return (
    <>
      <table className="adm-table">
        <thead>
          <tr>
            {!compact && <th>{t("adColPerson")}</th>}
            <th>{t("adColPlan")}</th>
            <th>{t("adColPeriod")}</th>
            <th>{t("adColSource")}</th>
            <th>
              <span className="adm-sr-only">{t("adActions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={s.current ? undefined : "dim"}>
              {!compact && (
                <td>
                  {s.user ? (
                    <Link
                      className="adm-person"
                      href={`/admin/users/${s.user.id}`}
                    >
                      <span>
                        <b>{s.user.name}</b>
                        <small dir="ltr">{s.user.email}</small>
                      </span>
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td>
                <span className="adm-badges">
                  <b>{s.plan ? t(`acPlan_${s.plan.code}`) : "—"}</b>
                  {s.current ? (
                    <Badge tone="ok">{t("adStateCurrent")}</Badge>
                  ) : (
                    <Badge>{t("adStateEnded")}</Badge>
                  )}
                  {s.status === "canceled" && (
                    <Badge tone="warn">{t("adCanceled")}</Badge>
                  )}
                </span>
              </td>
              <td>
                {fmtDate(s.starts_at, L)} →{" "}
                {s.ends_at ? fmtDate(s.ends_at, L) : t("adNoEnd")}
              </td>
              <td>
                {s.manual ? (
                  <span className="adm-source">
                    {t("adGrantedBy", {
                      who: s.granted_by?.name ?? t("adSomeone"),
                    })}
                    {s.note && <small title={s.note}>“{s.note}”</small>}
                  </span>
                ) : (
                  <span className="adm-source">
                    {s.provider}
                    {s.provider_ref && (
                      <small dir="ltr">{s.provider_ref}</small>
                    )}
                  </span>
                )}
              </td>
              <td className="adm-row-actions">
                {s.manual && s.current && can("subscriptions.manage") && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExtending(s)}
                    >
                      {t("adChangeEnd")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirm({
                          title: t("adRevoke"),
                          body: t("adRevokeLead", {
                            plan: s.plan ? t(`acPlan_${s.plan.code}`) : "",
                          }),
                          confirmLabel: t("adRevoke"),
                          danger: true,
                          reason: true,
                          run: async (reason) => {
                            await guard(() =>
                              admin.subscriptions.revoke(s.id, reason),
                            );
                            toast("ok", t("adSaved"));
                            onChanged();
                          },
                        })
                      }
                    >
                      {t("adRevoke")}
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      {extending && (
        <EndDialog
          sub={extending}
          onClose={() => setExtending(null)}
          onDone={() => {
            toast("ok", t("adSaved"));
            onChanged();
          }}
          onError={(e) => toast("error", adminError(t, e))}
        />
      )}
    </>
  );
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Picks an end: a number of days from now, a date, or none. */
function EndPicker({
  value,
  onChange,
}: {
  value: { mode: "days" | "date" | "none"; days: number; date: string };
  onChange: (v: {
    mode: "days" | "date" | "none";
    days: number;
    date: string;
  }) => void;
}) {
  const { t } = useTranslation(),
    [tomorrow] = useState(() => toInputDate(new Date(Date.now() + 86400000)));
  return (
    <div className="adm-stack tight">
      <div className="adm-seg" role="radiogroup" aria-label={t("adDuration")}>
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value.mode === "days" && value.days === d}
            onClick={() => onChange({ ...value, mode: "days", days: d })}
          >
            {t("adDays", { n: d })}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={value.mode === "date"}
          onClick={() => onChange({ ...value, mode: "date" })}
        >
          {t("adUntilDate")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.mode === "none"}
          onClick={() => onChange({ ...value, mode: "none" })}
        >
          {t("adNoEnd")}
        </button>
      </div>
      {value.mode === "date" && (
        <input
          type="date"
          value={value.date}
          min={tomorrow}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      )}
    </div>
  );
}

/** End of the chosen day, in the browser's time zone, as an ISO string. */
function endOfDay(date: string) {
  return new Date(`${date}T23:59:59`).toISOString();
}

export function GrantDialog({
  user,
  onClose,
  onDone,
}: {
  user: PersonRef;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(),
    { guard } = useAdmin(),
    [plan, setPlan] = useState("cartographer"),
    [end, setEnd] = useState(() => ({
      mode: "days" as "days" | "date" | "none",
      days: 30,
      date: toInputDate(new Date(Date.now() + 30 * 86400000)),
    })),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await guard(() =>
        admin.subscriptions.grant(user.id, {
          plan,
          note: note.trim(),
          days: end.mode === "days" ? end.days : null,
          ends_at: end.mode === "date" ? endOfDay(end.date) : null,
        }),
      );
      onDone();
      onClose();
    } catch (e) {
      setError(adminError(t, e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("adGrantTitle", { name: user.name })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={note.trim().length < 3}
            onClick={go}
          >
            {t("adGrantPlan")}
          </Button>
        </>
      }
    >
      <div className="adm-stack">
        <Field label={t("adColPlan")}>
          <div className="adm-seg" role="radiogroup">
            {PAID.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={plan === p}
                onClick={() => setPlan(p)}
              >
                {t(`acPlan_${p}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("adDuration")}>
          <EndPicker value={end} onChange={setEnd} />
        </Field>
        <Field label={t("adNote")} hint={t("adNoteHint")}>
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <p className="adm-muted small">{t("adGrantReplaces")}</p>
        {error && <p className="adm-notice error">{error}</p>}
      </div>
    </Dialog>
  );
}

function EndDialog({
  sub,
  onClose,
  onDone,
  onError,
}: {
  sub: SubscriptionRow;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const { t } = useTranslation(),
    { guard } = useAdmin(),
    [end, setEnd] = useState(() => ({
      mode: (sub.ends_at ? "date" : "none") as "days" | "date" | "none",
      days: 30,
      date: sub.ends_at
        ? toInputDate(new Date(sub.ends_at))
        : toInputDate(new Date(Date.now() + 30 * 86400000)),
    })),
    [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const ends_at =
        end.mode === "none"
          ? null
          : end.mode === "days"
            ? new Date(Date.now() + end.days * 86400000).toISOString()
            : endOfDay(end.date);
      await guard(() => admin.subscriptions.update(sub.id, { ends_at }));
      onDone();
      onClose();
    } catch (e) {
      onError(e);
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("adChangeEnd")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button variant="primary" busy={busy} onClick={go}>
            {t("adSave")}
          </Button>
        </>
      }
    >
      <EndPicker value={end} onChange={setEnd} />
    </Dialog>
  );
}
