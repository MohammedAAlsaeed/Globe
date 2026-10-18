"use client";
/**
 * The upgrade prompt shown when a plan limit is reached (saved line styles
 * today; maps, storage and export size use the same dialog). It says what the
 * limit is, shows how much of it is used, and compares the plans above the
 * person's own — the one right above is marked as the natural next step.
 *
 * Nothing saved is ever removed by a limit (see Entitlements on the server),
 * and the dialog says so: people choose between upgrading and tidying up.
 *
 * Checkout lives outside this app: set NEXT_PUBLIC_UPGRADE_URL and each
 * plan's button links there with `?plan=<code>&from=<limit>`. Until it's set,
 * the plans are shown with a "coming soon" note instead of a dead button.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { plans as plansApi } from "./api";
import type { Plan } from "./types";

export type LimitKind = "line_styles" | "maps" | "upload_bytes" | "export_px";

const UPGRADE_URL = (process.env.NEXT_PUBLIC_UPGRADE_URL ?? "").trim();

/** Where a plan's upgrade button goes (null: no checkout configured yet). */
export function upgradeHref(plan: string, from: LimitKind): string | null {
  if (!UPGRADE_URL) return null;
  const url = new URL(UPGRADE_URL, typeof window !== "undefined" ? window.location.href : "http://localhost");
  url.searchParams.set("plan", plan);
  url.searchParams.set("from", from);
  return url.toString();
}

// The plans rarely change: one request per page load, shared by every dialog.
let plansRequest: Promise<Plan[]> | null = null;
function loadPlans() {
  plansRequest ??= plansApi.list().catch((e) => {
    plansRequest = null;
    throw e;
  });
  return plansRequest;
}

function megabytes(bytes: number, t: (k: string, o?: Record<string, unknown>) => string) {
  return bytes >= 1024 ** 3 ? t("acSizeGb", { n: Math.round((bytes / 1024 ** 3) * 10) / 10 }) : t("acSizeMb", { n: Math.round(bytes / 1024 ** 2) });
}

export function UpgradeDialog({
  limit,
  planCode,
  max,
  used,
  title,
  message,
  onClose,
}: {
  limit: LimitKind;
  /** The person's current plan. */
  planCode: string;
  /** The limit on the current plan (null = unlimited). */
  max: number | null;
  /** How much of it is used, for the meter (omit to hide it). */
  used?: number;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    dialog = useRef<HTMLDialogElement>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null),
    [failed, setFailed] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    loadPlans().then(
      (list) => {
        if (live) setPlans(list);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const current = plans?.find((p) => p.code === planCode),
    above = plans && current ? plans.filter((p) => p.tier > current.tier).sort((a, b) => a.tier - b.tier) : [];

  /** The plan's features, the one this limit is about first. */
  const features = (p: Plan) => {
    const all: { key: LimitKind | "commercial"; text: string }[] = [
      { key: "line_styles", text: p.max_line_styles === null ? t("acFeatLineStylesUnlimited") : t("acFeatLineStyles", { count: p.max_line_styles }) },
      { key: "maps", text: p.max_maps === null ? t("acFeatMapsUnlimited") : t("acFeatMaps", { count: p.max_maps }) },
      { key: "export_px", text: t("acFeatExport", { px: p.max_export_px.toLocaleString() }) },
      { key: "upload_bytes", text: t("acFeatStorage", { size: megabytes(p.upload_quota_bytes, t) }) },
    ];
    if (p.commercial_use) all.push({ key: "commercial", text: t("acFeatCommercial") });
    return [...all.filter((f) => f.key === limit), ...all.filter((f) => f.key !== limit)];
  };

  const close = () => {
    dialog.current?.close();
    onClose();
  };
  const meter = max !== null && used !== undefined ? Math.min(1, used / Math.max(1, max)) : null;

  return (
    <dialog
      ref={dialog}
      className="upg-dialog"
      aria-labelledby="upg-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === dialog.current) close();
      }}
    >
      <div className="upg-body">
        <button className="upg-close" onClick={close} aria-label={t("acUpgradeClose")}>
          ×
        </button>
        <span className="upg-eyebrow">{t("acUpgradeEyebrow")}</span>
        <h2 id="upg-title">{title}</h2>
        <p className="upg-message">{message}</p>

        {meter !== null && (
          <div className="upg-meter" role="meter" aria-valuemin={0} aria-valuemax={max ?? 0} aria-valuenow={used} aria-label={t("acUpgradeUsage", { used, max })}>
            <div className="upg-meter-bar">
              <span style={{ width: `${meter * 100}%` }} />
            </div>
            <small>
              {t("acUpgradeUsage", { used, max })} · {t("acUpgradeCurrent")}: <b>{t(`acPlan_${planCode}`)}</b>
            </small>
          </div>
        )}

        {failed ? (
          <p className="upg-note">{t("acUpgradeLoadError")}</p>
        ) : !plans ? (
          <div className="upg-plans upg-loading" aria-busy="true">
            <div className="upg-plan" />
            <div className="upg-plan" />
          </div>
        ) : (
          above.length > 0 && (
            <div className="upg-plans">
              {above.map((p, i) => {
                const href = upgradeHref(p.code, limit);
                return (
                  <section key={p.code} className={`upg-plan ${i === 0 ? "recommended" : ""}`}>
                    {i === 0 && <span className="upg-badge">{t("acUpgradeRecommended")}</span>}
                    <h3>{t(`acPlan_${p.code}`)}</h3>
                    <ul>
                      {features(p).map((f, k) => (
                        <li key={f.key} className={k === 0 && f.key === limit ? "key" : ""}>
                          {f.text}
                        </li>
                      ))}
                    </ul>
                    {href ? (
                      <a className="upg-cta" href={href}>
                        {t("acUpgradeCta", { plan: t(`acPlan_${p.code}`) })}
                      </a>
                    ) : (
                      <span className="upg-cta disabled" aria-disabled="true">
                        {t("acUpgradeSoon")}
                      </span>
                    )}
                  </section>
                );
              })}
            </div>
          )
        )}

        <footer className="upg-footer">
          <small>{t("acUpgradeKeep")}</small>
          <button className="upg-secondary" onClick={close} autoFocus>
            {t("acUpgradeNotNow")}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
