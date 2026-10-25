"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails are signed URLs from the API */
/**
 * One person: their account, plan and usage, subscriptions, maps, sign-in
 * security, and every action staff can take on them — each one confirmed,
 * and the risky ones with a reason or a typed email.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RequirePermission, useAdmin } from "../AdminApp";
import { admin } from "../api";
import { AuditList } from "./Audit";
import { GrantDialog, SubscriptionTable } from "./Subscriptions";
import { UserBadges } from "./Users";
import { ROLES, type Role, type UserDetail as Detail } from "../types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  ErrorNote,
  Field,
  Skeleton,
  adminError,
  fmtAgo,
  fmtBytes,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  useLoad,
  useToast,
  type ConfirmSpec,
} from "../ui";

export function UserDetail({ id }: { id: string }) {
  return (
    <RequirePermission permission="users.view">
      <Inner id={id} />
    </RequirePermission>
  );
}

function Meter({
  used,
  max,
  format,
}: {
  used: number;
  max: number | null;
  format: (n: number) => string;
}) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div className="adm-meter">
      <div className="adm-meter-track">
        <span
          className={`adm-meter-fill${pct >= 100 ? " full" : pct >= 80 ? " high" : ""}`}
          style={{ width: max === null ? "0%" : `${pct}%` }}
        />
      </div>
      <small>
        {format(used)} / {max === null ? "∞" : format(max)}
      </small>
    </div>
  );
}

function Inner({ id }: { id: string }) {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    router = useRouter(),
    toast = useToast(),
    { can, guard, session } = useAdmin(),
    {
      data: u,
      error,
      reload,
      setData,
    } = useLoad(() => admin.users.get(id), [id]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null),
    // Bumped after every change, so the history below shows it.
    [rev, setRev] = useState(0),
    [editing, setEditing] = useState(false),
    [granting, setGranting] = useState(false);

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!u) return <Skeleton rows={12} />;

  const self = u.id === session.id,
    staffTarget = u.role !== "user",
    mayTouch = !staffTarget || can("staff.manage");

  const done = (d?: Detail, msg?: string) => {
    setRev((r) => r + 1);
    if (d) setData(d);
    else void reload();
    if (msg) toast("ok", msg);
  };

  return (
    <>
      <nav className="adm-crumbs">
        <Link href="/admin/users">{t("adNavUsers")}</Link>
        <span aria-hidden="true">/</span>
        <span>{u.name}</span>
      </nav>
      <header className="adm-profile">
        <span className="adm-avatar lg">
          {u.avatar_url ? (
            <img src={u.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            u.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <div>
          <h1>{u.name}</h1>
          <p dir="ltr" className="adm-profile-email">
            {u.email}
          </p>
          <div className="adm-badges">
            <UserBadges
              role={u.role}
              suspended={u.suspended}
              verified={u.email_verified}
            />
            <Badge tone={u.plan.code === "explorer" ? "neutral" : "info"}>
              {t(`acPlan_${u.plan.code}`)}
            </Badge>
            {u.two_factor && <Badge tone="ok">{t("adTwoFactorOn")}</Badge>}
          </div>
        </div>
        <div className="adm-profile-meta">
          <span>{t("adJoined", { date: fmtDate(u.created_at, L) })}</span>
          <span>{t("adLastSeen", { ago: fmtAgo(u.last_seen_at, L) })}</span>
        </div>
      </header>

      {u.suspended && (
        <div className="adm-notice error">
          <b>
            {t("adSuspendedSince", { date: fmtDateTime(u.suspended_at, L) })}
          </b>
          {u.suspended_reason && <span> — {u.suspended_reason}</span>}
        </div>
      )}

      <div className="adm-detail">
        <div className="adm-detail-main">
          <Card
            title={t("adPlanUsage")}
            actions={
              can("subscriptions.grant") && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setGranting(true)}
                >
                  {t("adGrantPlan")}
                </Button>
              )
            }
          >
            <dl className="adm-kv">
              <dt>{t("adColMaps")}</dt>
              <dd>
                <Meter
                  used={u.usage.maps}
                  max={u.plan.max_maps}
                  format={(n) => fmtNumber(n, L)}
                />
              </dd>
              <dt>{t("adUploads")}</dt>
              <dd>
                <Meter
                  used={u.usage.upload_bytes}
                  max={u.plan.upload_quota_bytes}
                  format={(n) => fmtBytes(n, L)}
                />
              </dd>
              <dt>{t("adStyles")}</dt>
              <dd>
                {t("adStylesCount", {
                  line: u.usage.line_styles,
                  text: u.usage.text_styles,
                  shape: u.usage.shape_styles,
                })}
              </dd>
              <dt>{t("adExports")}</dt>
              <dd>{fmtNumber(u.counts.exports, L)}</dd>
            </dl>
          </Card>

          <Card title={t("adNavSubscriptions")}>
            <SubscriptionTable
              rows={u.subscriptions}
              compact
              onChanged={() => done(undefined, t("adSaved"))}
            />
          </Card>

          <Card
            title={t("adMapsOf", { n: fmtNumber(u.counts.maps, L) })}
            actions={
              can("maps.view") && (
                <Link
                  className="adm-btn ghost sm"
                  href={`/admin/maps?user=${u.id}&state=all`}
                >
                  {t("adSeeAll")}
                </Link>
              )
            }
          >
            {u.maps.length === 0 ? (
              <p className="adm-muted">{t("adNoMaps")}</p>
            ) : (
              <ul className="adm-thumbs">
                {u.maps.map((m) => (
                  <li
                    key={m.id}
                    className={m.deleted_at ? "trashed" : undefined}
                  >
                    <span className="adm-thumb">
                      {m.thumbnail_url ? (
                        <img src={m.thumbnail_url} alt="" loading="lazy" />
                      ) : (
                        <span className="adm-thumb-blank" />
                      )}
                    </span>
                    <b>{m.name}</b>
                    <small>
                      {m.deleted_at ? t("adInTrash") : fmtAgo(m.updated_at, L)}{" "}
                      · {fmtBytes(m.bytes, L)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {can("audit.view") && (
            <Card
              title={t("adHistory")}
              actions={
                <Link
                  className="adm-btn ghost sm"
                  href={`/admin/audit?target_type=user&target_id=${u.id}`}
                >
                  {t("adSeeAll")}
                </Link>
              }
            >
              <AuditList
                query={{ target_type: "user", target_id: u.id, per_page: 8 }}
                compact
                refreshKey={rev}
              />
            </Card>
          )}
        </div>

        <div className="adm-detail-side">
          <Card
            title={t("adAccount")}
            actions={
              can("users.manage") &&
              mayTouch && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(true)}
                >
                  {t("adEdit")}
                </Button>
              )
            }
          >
            <dl className="adm-kv">
              <dt>{t("adEmailStatus")}</dt>
              <dd>{u.email_verified ? t("adVerified") : t("adUnverified")}</dd>
              <dt>{t("adSignIn")}</dt>
              <dd>
                {[
                  u.has_password && t("adPassword"),
                  ...u.providers.map((p) => p[0].toUpperCase() + p.slice(1)),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
              <dt>{t("adLanguage")}</dt>
              <dd>{u.locale === "ar" ? "العربية" : "English"}</dd>
              <dt>{t("adRegion")}</dt>
              <dd>{u.region}</dd>
              <dt>{t("adUserId")}</dt>
              <dd>
                <code dir="ltr">{u.id}</code>
              </dd>
            </dl>
          </Card>

          <Card title={t("adSecurity")}>
            {u.sessions && (
              <>
                <h3 className="adm-subhead">
                  {t("adSessions", { n: u.sessions.length })}
                </h3>
                <ul className="adm-sessions">
                  {u.sessions.map((s, i) => (
                    <li key={i}>
                      <span dir="ltr">{s.ip ?? "—"}</span>
                      <small title={s.user_agent ?? undefined}>
                        {browserName(s.user_agent)}
                      </small>
                      <small>{fmtAgo(s.last_activity, L)}</small>
                    </li>
                  ))}
                  {u.sessions.length === 0 && (
                    <li className="adm-muted">{t("adNoSessions")}</li>
                  )}
                </ul>
              </>
            )}
            <div className="adm-actions">
              {can("users.manage") && mayTouch && u.has_password && (
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirm({
                      title: t("adSendReset"),
                      body: t("adSendResetLead", { email: u.email }),
                      confirmLabel: t("adSend"),
                      run: async () => {
                        await guard(() => admin.users.passwordReset(u.id));
                        done(undefined, t("adResetSent"));
                      },
                    })
                  }
                >
                  {t("adSendReset")}
                </Button>
              )}
              {can("users.manage") && mayTouch && !self && (
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirm({
                      title: t("adEndSessions"),
                      body: t("adEndSessionsLead"),
                      confirmLabel: t("adEndSessions"),
                      run: async () => {
                        await guard(() => admin.users.endSessions(u.id));
                        done(undefined, t("adSessionsEnded"));
                      },
                    })
                  }
                >
                  {t("adEndSessions")}
                </Button>
              )}
              {can("staff.manage") && !self && u.two_factor && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    setConfirm({
                      title: t("adReset2fa"),
                      body: t("adReset2faLead"),
                      confirmLabel: t("adReset2fa"),
                      danger: true,
                      run: async () => {
                        await guard(() => admin.users.resetTwoFactor(u.id));
                        done(undefined, t("adSaved"));
                      },
                    })
                  }
                >
                  {t("adReset2fa")}
                </Button>
              )}
            </div>
          </Card>

          {can("staff.manage") && !self && (
            <RoleCard u={u} onDone={(d) => done(d, t("adSaved"))} />
          )}

          {!self &&
            mayTouch &&
            (can("users.suspend") || can("users.delete")) && (
              <Card title={t("adDangerZone")} className="danger">
                <div className="adm-actions">
                  {can("users.suspend") &&
                    (u.suspended ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          setConfirm({
                            title: t("adUnsuspend"),
                            body: t("adUnsuspendLead"),
                            confirmLabel: t("adUnsuspend"),
                            run: async () =>
                              done(
                                await guard(() => admin.users.unsuspend(u.id)),
                                t("adSaved"),
                              ),
                          })
                        }
                      >
                        {t("adUnsuspend")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setConfirm({
                            title: t("adSuspend"),
                            body: t("adSuspendLead"),
                            confirmLabel: t("adSuspend"),
                            danger: true,
                            reason: true,
                            run: async (reason) =>
                              done(
                                await guard(() =>
                                  admin.users.suspend(u.id, reason),
                                ),
                                t("adSaved"),
                              ),
                          })
                        }
                      >
                        {t("adSuspend")}
                      </Button>
                    ))}
                  {can("users.delete") && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setConfirm({
                          title: t("adDeleteUser"),
                          body: t("adDeleteUserLead", { maps: u.counts.maps }),
                          confirmLabel: t("adDeleteForever"),
                          danger: true,
                          typed: u.email,
                          run: async () => {
                            await guard(() =>
                              admin.users.remove(u.id, u.email),
                            );
                            toast("ok", t("adDeleted"));
                            router.replace("/admin/users");
                          },
                        })
                      }
                    >
                      {t("adDeleteUser")}
                    </Button>
                  )}
                </div>
              </Card>
            )}
        </div>
      </div>

      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      {editing && (
        <EditDialog
          u={u}
          onClose={() => setEditing(false)}
          onDone={(d) => done(d, t("adSaved"))}
        />
      )}
      {granting && (
        <GrantDialog
          user={u}
          onClose={() => setGranting(false)}
          onDone={() => done(undefined, t("adGranted"))}
        />
      )}
    </>
  );
}

function browserName(ua: string | null) {
  if (!ua) return "—";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const b = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [b, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

function RoleCard({ u, onDone }: { u: Detail; onDone: (d: Detail) => void }) {
  const { t } = useTranslation(),
    { guard } = useAdmin(),
    toast = useToast(),
    [role, setRole] = useState<Role>(u.role),
    [busy, setBusy] = useState(false);
  return (
    <Card title={t("adRole")}>
      <div className="adm-stack">
        <div className="adm-roles" role="radiogroup" aria-label={t("adRole")}>
          {ROLES.map((r) => (
            <label key={r} className={`adm-role${role === r ? " on" : ""}`}>
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
              />
              <b>{t(`adRole_${r}`)}</b>
              <small>{t(`adRoleLead_${r}`)}</small>
            </label>
          ))}
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={role === u.role}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await guard(() => admin.users.setRole(u.id, role)));
            } catch (e) {
              toast("error", adminError(t, e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("adSaveRole")}
        </Button>
        {role !== "user" && (
          <p className="adm-muted small">{t("adRoleNote")}</p>
        )}
      </div>
    </Card>
  );
}

function EditDialog({
  u,
  onClose,
  onDone,
}: {
  u: Detail;
  onClose: () => void;
  onDone: (d: Detail) => void;
}) {
  const { t } = useTranslation(),
    { guard } = useAdmin(),
    [name, setName] = useState(u.name),
    [email, setEmail] = useState(u.email),
    [locale, setLocale] = useState(u.locale),
    [verified, setVerified] = useState(u.email_verified),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const patch: Parameters<typeof admin.users.update>[1] = {};
      if (name.trim() !== u.name) patch.name = name.trim();
      if (email.trim().toLowerCase() !== u.email)
        patch.email = email.trim().toLowerCase();
      if (locale !== u.locale) patch.locale = locale;
      if (verified !== u.email_verified) patch.email_verified = verified;
      onDone(await guard(() => admin.users.update(u.id, patch)));
      onClose();
    } catch (e) {
      setError(adminError(t, e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("adEditAccount")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button variant="primary" busy={busy} onClick={save}>
            {t("adSave")}
          </Button>
        </>
      }
    >
      <div className="adm-stack">
        <Field label={t("acName")}>
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("acEmail")} hint={t("adEmailChangeHint")}>
          <input
            value={email}
            type="email"
            dir="ltr"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("adLanguage")}>
          <select
            className="adm-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          {t("adMarkVerified")}
        </label>
        {error && <p className="adm-notice error">{error}</p>}
      </div>
    </Dialog>
  );
}
