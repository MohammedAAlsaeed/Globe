/** Shapes returned by the API (see api/app/Http/Resources). */

export interface Plan {
  code: string;
  name: string;
  tier: number;
  /** null = unlimited */
  max_maps: number | null;
  max_export_px: number;
  upload_quota_bytes: number;
  commercial_use: boolean;
}

export interface Usage {
  maps: number;
  upload_bytes: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  has_password: boolean;
  role: "user" | "admin";
  locale: string;
  region: string;
  avatar_url: string | null;
  plan: Plan;
  usage: Usage;
  created_at: string;
}

/** A cloud map's metadata (the document is fetched separately). */
export interface CloudMap {
  id: string;
  name: string;
  width: number;
  height: number;
  schema_version: number;
  revision: number;
  document_bytes: number;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

/** The plan limits a signed-out visitor works under (the free plan). */
export const GUEST_LIMITS = { max_export_px: 2048 } as const;
