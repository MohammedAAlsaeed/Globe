/** Shapes returned by the admin API (see api/app/Http/Controllers/Api/V1/Admin). */

export type Role = "user" | "support" | "editor" | "admin" | "owner";
export const ROLES: Role[] = ["user", "support", "editor", "admin", "owner"];

/** What a staff member may do (see api/app/Enums/Permission.php). */
export type Permission =
  | "stats.view"
  | "users.view"
  | "users.manage"
  | "users.suspend"
  | "users.delete"
  | "staff.manage"
  | "subscriptions.view"
  | "subscriptions.grant"
  | "subscriptions.manage"
  | "plans.view"
  | "plans.manage"
  | "content.manage"
  | "maps.view"
  | "maps.manage"
  | "maps.read"
  | "audit.view";

export interface AdminSession {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  two_factor: {
    enabled: boolean;
    /** This session passed the code check (and is still within its window). */
    verified: boolean;
    /** Unix time until which sensitive changes need no new code. */
    step_up_until: number | null;
    recovery_codes_left: number | null;
  };
}

export interface Page<T> {
  data: T[];
  meta: { total: number; page: number; per_page: number; last_page: number };
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  role: Role;
  /** Plan code in force. */
  plan: string | null;
  maps_count: number | null;
  two_factor: boolean;
  suspended: boolean;
  suspended_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface PersonRef {
  id: string;
  name: string;
  email: string;
}

export interface SubscriptionRow {
  id: number;
  plan: { code: string; name: string; tier: number } | null;
  user: PersonRef | null;
  status: "active" | "canceled" | "expired";
  current: boolean;
  provider: string;
  provider_ref: string | null;
  /** Granted by staff (only these can be changed from the panel). */
  manual: boolean;
  granted_by: PersonRef | null;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
  canceled_at: string | null;
  created_at: string;
}

export interface UserMapRow {
  id: string;
  name: string;
  width: number;
  height: number;
  revision: number;
  bytes: number;
  thumbnail_url: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserDetail extends Omit<UserRow, "plan"> {
  locale: string;
  region: string;
  avatar_url: string | null;
  has_password: boolean;
  providers: string[];
  usage: {
    maps: number;
    upload_bytes: number;
    line_styles: number;
    text_styles: number;
    shape_styles: number;
  };
  counts: Record<
    | "maps"
    | "exports"
    | "line_styles"
    | "text_styles"
    | "shape_styles"
    | "asset_packs",
    number
  >;
  plan: {
    code: string;
    name: string;
    tier: number;
    max_maps: number | null;
    upload_quota_bytes: number;
  };
  subscriptions: SubscriptionRow[];
  maps: UserMapRow[];
  /** null when sessions aren't kept in the database. */
  sessions:
    | { ip: string | null; user_agent: string | null; last_activity: string }[]
    | null;
  suspended_reason: string | null;
}

export interface AdminPlan {
  id: number;
  code: string;
  name: string;
  tier: number;
  max_maps: number | null;
  max_export_px: number;
  upload_quota_bytes: number;
  max_line_styles: number | null;
  max_text_styles: number | null;
  max_shape_styles: number | null;
  commercial_use: boolean;
  is_default: boolean;
  sort: number;
  customized_at: string | null;
  /** People on it now (null for the free plan). */
  subscribers: number | null;
}

export interface AdminMapRow extends UserMapRow {
  user: PersonRef | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  action: string;
  actor: { id: string | null; email: string | null } | null;
  target: { type: string; id: string | null; label: string | null } | null;
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Stats {
  days: number;
  generated_at: string;
  totals: {
    users: number;
    users_new: number;
    users_new_prev: number;
    active: number;
    verified: number;
    suspended: number;
    staff: number;
    paid: number;
    maps: number;
    maps_new: number;
    maps_new_prev: number;
    maps_bytes: number;
    exports_new: number;
    uploads_bytes: number;
    expiring_grants: number;
  };
  series: {
    users: { date: string; n: number }[];
    maps: { date: string; n: number }[];
  };
  plans: { code: string; name: string; users: number }[];
}
