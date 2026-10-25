"use client";
/**
 * The plans and their limits. Everyone with access sees them; the owner can
 * tune names and limits (code, tier and the free plan are fixed). A change
 * applies to everyone on the plan at once.
 */
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { RequirePermission, useAdmin } from "../AdminApp";
import { admin } from "../api";
import type { AdminPlan } from "../types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorNote,
  Field,
  PageHead,
  Skeleton,
  fmtBytes,
  fmtDateTime,
  fmtNumber,
  useLoad,
  useToast,
  type ConfirmSpec,
} from "../ui";

export function Plans() {
  return (
    <RequirePermission permission="plans.view">
      <Inner />
    </RequirePermission>
  );
}

const LIMITS = [
  ["max_maps", "adLimitMaps", true],
  ["max_line_styles", "adLimitLineStyles", true],
  ["max_text_styles", "adLimitTextStyles", true],
  ["max_shape_styles", "adLimitShapeStyles", true],
  ["max_export_px", "adLimitExport", false],
] as const;

function Inner() {
  const { t } = useTranslation(),
    { can } = useAdmin(),
    { data, error, reload, setData } = useLoad(() => admin.plans.list(), []);
  return (
    <>
      <PageHead
        title={t("adNavPlans")}
        lead={can("plans.manage") ? t("adPlansLeadOwner") : t("adPlansLead")}
      />
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton rows={8} />
      ) : (
        <div className="adm-plans">
          {data.map((p) => (
            <PlanCard
              key={p.code}
              plan={p}
              editable={can("plans.manage")}
              onSaved={(np) =>
                setData(
                  data.map((x) => (x.code === np.code ? { ...x, ...np } : x)),
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

type Draft = Record<string, string | boolean>;

function toDraft(p: AdminPlan): Draft {
  return {
    name: p.name,
    max_maps: p.max_maps === null ? "" : String(p.max_maps),
    max_line_styles:
      p.max_line_styles === null ? "" : String(p.max_line_styles),
    max_text_styles:
      p.max_text_styles === null ? "" : String(p.max_text_styles),
    max_shape_styles:
      p.max_shape_styles === null ? "" : String(p.max_shape_styles),
    max_export_px: String(p.max_export_px),
    upload_mb: String(Math.round(p.upload_quota_bytes / 1048576)),
    commercial_use: p.commercial_use,
  };
}

function PlanCard({
  plan,
  editable,
  onSaved,
}: {
  plan: AdminPlan;
  editable: boolean;
  onSaved: (p: AdminPlan) => void;
}) {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    { guard } = useAdmin(),
    toast = useToast(),
    [draft, setDraft] = useState<Draft>(() => toDraft(plan)),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const initial = toDraft(plan);
  const dirty = Object.keys(draft).some((k) => draft[k] !== initial[k]);

  function patch(): Partial<AdminPlan> {
    const out: Record<string, unknown> = {};
    const num = (v: string | boolean) => (v === "" ? null : Number(v));
    if (draft.name !== initial.name) out.name = String(draft.name).trim();
    for (const [k] of LIMITS)
      if (draft[k] !== initial[k]) out[k] = num(draft[k]);
    if (draft.upload_mb !== initial.upload_mb)
      out.upload_quota_bytes = Math.round(Number(draft.upload_mb) * 1048576);
    if (draft.commercial_use !== initial.commercial_use)
      out.commercial_use = draft.commercial_use;
    return out as Partial<AdminPlan>;
  }

  return (
    <Card
      className="adm-plan"
      title={
        <span className="adm-badges">
          {t(`acPlan_${plan.code}`) !== `acPlan_${plan.code}`
            ? t(`acPlan_${plan.code}`)
            : plan.name}
          <code dir="ltr">{plan.code}</code>
          {plan.is_default && <Badge>{t("adPlanFree")}</Badge>}
        </span>
      }
      actions={
        plan.subscribers !== null && (
          <span className="adm-muted small">
            {t("adSubscribers", { n: fmtNumber(plan.subscribers, L) })}
          </span>
        )
      }
    >
      {editable ? (
        <form
          className="adm-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const p = patch();
            setConfirm({
              title: t("adPlanSaveTitle"),
              body: t("adPlanSaveLead", {
                n: plan.subscribers ?? t("adEveryoneFree"),
              }),
              confirmLabel: t("adSave"),
              run: async () => {
                onSaved(await guard(() => admin.plans.update(plan.code, p)));
                toast("ok", t("adSaved"));
              },
            });
          }}
        >
          <Field label={t("adPlanName")}>
            <input
              value={String(draft.name)}
              maxLength={40}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <div className="adm-form-grid">
            {LIMITS.map(([k, label, nullable]) => (
              <Field key={k} label={t(label)}>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder={nullable ? "∞" : undefined}
                  value={String(draft[k])}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </Field>
            ))}
            <Field
              label={t("adLimitUpload")}
              hint={fmtBytes(Number(draft.upload_mb || 0) * 1048576, L)}
            >
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={String(draft.upload_mb)}
                onChange={(e) =>
                  setDraft({ ...draft, upload_mb: e.target.value })
                }
              />
            </Field>
          </div>
          <p className="adm-muted small">{t("adEmptyUnlimited")}</p>
          <label className="adm-check">
            <input
              type="checkbox"
              checked={!!draft.commercial_use}
              onChange={(e) =>
                setDraft({ ...draft, commercial_use: e.target.checked })
              }
            />
            {t("adCommercial")}
          </label>
          <div className="adm-row">
            <Button type="submit" variant="primary" size="sm" disabled={!dirty}>
              {t("adSave")}
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(initial)}
              >
                {t("adDiscard")}
              </Button>
            )}
            {plan.customized_at && (
              <span className="adm-muted small">
                {t("adPlanCustomized", {
                  at: fmtDateTime(plan.customized_at, L),
                })}
              </span>
            )}
          </div>
        </form>
      ) : (
        <dl className="adm-kv">
          {LIMITS.map(([k, label]) => (
            <Fragment key={k}>
              <dt>{t(label)}</dt>
              <dd>{fmtNumber(plan[k] as number | null, L)}</dd>
            </Fragment>
          ))}
          <dt>{t("adLimitUpload")}</dt>
          <dd>{fmtBytes(plan.upload_quota_bytes, L)}</dd>
          <dt>{t("adCommercial")}</dt>
          <dd>{plan.commercial_use ? t("adYes") : t("adNo")}</dd>
        </dl>
      )}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
