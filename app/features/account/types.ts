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

/** A pack of the asset library: official (by the atelier) or the user's own. */
export interface AssetPack {
  id: string;
  name: string;
  kind: "stamps" | "textures";
  tier: number;
  official: boolean;
  published: boolean;
  /** The plan doesn't include it: shown, but its assets can't be used. */
  locked: boolean;
  assets_count?: number;
  cover_url?: string | null;
}

/** One uploaded image. Assets of a pack sharing a `set_key` form one stamp set. */
export interface Asset {
  id: string;
  pack_id: string;
  name: string;
  set_key: string | null;
  category: string | null;
  tags: string[];
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** Short-lived signed URL. */
  url: string;
}

/** The plan limits a signed-out visitor works under (the free plan). */
export const GUEST_LIMITS = { max_export_px: 2048 } as const;
