/**
 * Typed calls to the admin API (/api/v1/admin). Every page of the panel goes
 * through these, so each endpoint has one place that knows its shape.
 */
import { api } from "@/lib/api/client";
import type {
  AdminMapRow,
  AdminPlan,
  AdminSession,
  AuditEntry,
  Page,
  Role,
  Stats,
  SubscriptionRow,
  UserDetail,
  UserRow,
} from "./types";

type One<T> = { data: T };
export type Query = Record<string, string | number | null | undefined>;

/** `?a=1&b=x`, skipping empty values. */
export function qs(query: Query = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const admin = {
  session: () =>
    api.get<One<AdminSession>>("admin/session").then((r) => r.data),

  twoFactor: {
    setup: () =>
      api
        .post<One<{ secret: string; uri: string }>>("admin/two-factor/setup")
        .then((r) => r.data),
    confirm: (code: string) =>
      api
        .post<One<{ recovery_codes: string[] }>>("admin/two-factor/confirm", {
          code,
        })
        .then((r) => r.data.recovery_codes),
    verify: (input: { code: string } | { recovery_code: string }) =>
      api.post<void>("admin/two-factor/verify", input),
    lock: () => api.post<void>("admin/two-factor/lock"),
    recoveryCodes: () =>
      api
        .post<One<{ recovery_codes: string[] }>>(
          "admin/two-factor/recovery-codes",
        )
        .then((r) => r.data.recovery_codes),
  },

  stats: (days: number) =>
    api.get<One<Stats>>(`admin/stats${qs({ days })}`).then((r) => r.data),

  users: {
    list: (q: Query) => api.get<Page<UserRow>>(`admin/users${qs(q)}`),
    get: (id: string) =>
      api.get<One<UserDetail>>(`admin/users/${id}`).then((r) => r.data),
    update: (
      id: string,
      patch: {
        name?: string;
        email?: string;
        locale?: string;
        email_verified?: boolean;
      },
    ) =>
      api
        .patch<One<UserDetail>>(`admin/users/${id}`, patch)
        .then((r) => r.data),
    passwordReset: (id: string) =>
      api.post<void>(`admin/users/${id}/password-reset`),
    endSessions: (id: string) =>
      api.post<void>(`admin/users/${id}/end-sessions`),
    suspend: (id: string, reason: string) =>
      api
        .post<One<UserDetail>>(`admin/users/${id}/suspend`, { reason })
        .then((r) => r.data),
    unsuspend: (id: string) =>
      api
        .post<One<UserDetail>>(`admin/users/${id}/unsuspend`)
        .then((r) => r.data),
    setRole: (id: string, role: Role) =>
      api
        .put<One<UserDetail>>(`admin/users/${id}/role`, { role })
        .then((r) => r.data),
    resetTwoFactor: (id: string) =>
      api.post<void>(`admin/users/${id}/two-factor-reset`),
    /** `confirm` must be the account's email address. */
    remove: (id: string, confirm: string) =>
      api.deleteWith<void>(`admin/users/${id}`, { confirm }),
  },

  subscriptions: {
    list: (q: Query) =>
      api.get<Page<SubscriptionRow>>(`admin/subscriptions${qs(q)}`),
    grant: (
      userId: string,
      input: {
        plan: string;
        note: string;
        days?: number | null;
        ends_at?: string | null;
      },
    ) =>
      api
        .post<One<SubscriptionRow>>(
          `admin/users/${userId}/subscriptions`,
          input,
        )
        .then((r) => r.data),
    update: (id: number, patch: { ends_at?: string | null; note?: string }) =>
      api
        .patch<One<SubscriptionRow>>(`admin/subscriptions/${id}`, patch)
        .then((r) => r.data),
    revoke: (id: number, reason: string) =>
      api
        .post<One<SubscriptionRow>>(`admin/subscriptions/${id}/revoke`, {
          reason,
        })
        .then((r) => r.data),
  },

  plans: {
    list: () =>
      api.get<{ data: AdminPlan[] }>("admin/plans").then((r) => r.data),
    update: (code: string, patch: Partial<AdminPlan>) =>
      api
        .patch<One<AdminPlan>>(`admin/plans/${code}`, patch)
        .then((r) => r.data),
  },

  maps: {
    list: (q: Query) => api.get<Page<AdminMapRow>>(`admin/maps${qs(q)}`),
    trash: (id: string, reason: string) =>
      api.deleteWith<void>(`admin/maps/${id}`, { reason }),
    restore: (id: string) => api.post<void>(`admin/maps/${id}/restore`),
    /** The map's document (audited, with the reason). */
    document: (id: string, reason: string) =>
      api.post<Record<string, unknown>>(`admin/maps/${id}/document`, {
        reason,
      }),
  },

  audit: (q: Query) => api.get<Page<AuditEntry>>(`admin/audit-log${qs(q)}`),
};
