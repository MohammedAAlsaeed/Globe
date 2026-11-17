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
  /** Line styles the person can save (null = unlimited). */
  max_line_styles: number | null;
  /** Text styles the person can save (null = unlimited). */
  max_text_styles: number | null;
  /** Shape styles the person can save (null = unlimited). */
  max_shape_styles: number | null;
}

export interface Usage {
  maps: number;
  upload_bytes: number;
  line_styles: number;
  text_styles: number;
  shape_styles: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  has_password: boolean;
  role: "user" | "support" | "editor" | "admin" | "owner";
  /** Admin panel permissions (empty for everyone but staff). */
  permissions: string[];
  locale: string;
  region: string;
  avatar_url: string | null;
  plan: Plan;
  usage: Usage;
  created_at: string;
}

/** An official starting map (see /admin/content); its document is fetched
 * when it is chosen. `locked`: above the person's plan. */
export interface MapTemplateInfo {
  id: string;
  name: string;
  name_ar: string | null;
  width: number;
  height: number;
  tier: number;
  locked: boolean;
  thumbnail_url: string | null;
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
  kind: "stamps" | "textures" | "lines";
  /** Groups official packs in the Texture Catalog (creator → style → pack). */
  style?: string | null;
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
  /** Average colour (textures): shown while the picture loads. */
  color?: string | null;
  /** Textures: whether it repeats seamlessly, and its default scale. */
  meta?: { tile?: boolean; scale?: number };
  /** Short-lived signed URL. */
  url: string;
  /** A small preview (the picture itself for older uploads). */
  thumb_url?: string;
  created_at?: string;
}

/** The Texture Catalog from the server (GET texture-library). */
export interface TextureLibrary {
  packs: {
    id: string;
    name: string;
    style: string | null;
    official: boolean;
    mine: boolean;
    tier: number;
    published: boolean;
    /** Above the plan: previews only. */
    locked: boolean;
    created_at: string;
  }[];
  textures: {
    id: string;
    pack_id: string;
    name: string;
    category: string | null;
    tags: string[];
    width: number | null;
    height: number | null;
    color: string | null;
    meta: { tile?: boolean; scale?: number };
    thumb_url: string;
    /** null while the pack is locked. */
    url: string | null;
    created_at: string;
  }[];
}

/** The plan limits a signed-out visitor works under (the free plan). */
export const GUEST_LIMITS = { max_export_px: 2048 } as const;

/** A saved Line Tool style: the person's own, or official (by admins). */
export interface LineStyleRecord {
  id: string;
  name: string;
  /** The look (see LineLook); null when the style is locked for the plan. */
  look: import("../mapmaker/types").LineLook | null;
  official: boolean;
  tier: number;
  published: boolean;
  /** Official style above the person's plan: listed, not usable. */
  locked: boolean;
  sort: number;
}

/** A saved Text Tool style: the person's own, or official (by admins). */
export interface TextStyleRecord {
  id: string;
  name: string;
  /** The look (see TextLook); null when the style is locked for the plan. */
  look: import("../mapmaker/types").TextLook | null;
  official: boolean;
  tier: number;
  published: boolean;
  locked: boolean;
  sort: number;
}

/** A saved Shape Tool style: the person's own, or official (by admins). */
export interface ShapeStyleRecord {
  id: string;
  name: string;
  /** The look (see ShapeLook); null when the style is locked for the plan. */
  look: import("../mapmaker/types").ShapeLook | null;
  official: boolean;
  tier: number;
  published: boolean;
  locked: boolean;
  sort: number;
}
