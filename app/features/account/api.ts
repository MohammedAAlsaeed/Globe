/**
 * Typed calls to the API: accounts, maps and the asset library. Components use these, never
 * `api` directly, so every endpoint has one place that knows its shape.
 */
import type {
  LineLook,
  MMProject,
  ShapeLook,
  TextLook,
} from "../mapmaker/types";
import type {
  Asset,
  AssetPack,
  CloudMap,
  LineStyleRecord,
  Plan,
  ShapeStyleRecord,
  TextStyleRecord,
  User,
} from "./types";
import { api, API_URL } from "@/lib/api/client";

type One<T> = { data: T };

// ---- accounts ---------------------------------------------------------------
export const auth = {
  /** The signed-in user, or null when signed out. */
  async me(): Promise<User | null> {
    try {
      return (await api.get<One<User>>("auth/me")).data;
    } catch (e) {
      if ((e as { status?: number }).status === 401) return null;
      throw e;
    }
  },
  login: (email: string, password: string, remember: boolean) =>
    api
      .post<One<User>>("auth/login", { email, password, remember })
      .then((r) => r.data),
  register: (input: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    locale: string;
  }) => api.post<One<User>>("auth/register", input).then((r) => r.data),
  logout: () => api.post<void>("auth/logout"),
  update: (patch: { name?: string; locale?: string }) =>
    api.patch<One<User>>("auth/me", patch).then((r) => r.data),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>("auth/forgot-password", { email }),
  resetPassword: (input: {
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
  }) => api.post<{ message: string }>("auth/reset-password", input),
  resendVerification: () =>
    api.post<void>("auth/email/verification-notification"),
  /** Full-page redirect target for "Continue with Google". */
  googleUrl: () => `${API_URL}/auth/google/redirect`,
};

// ---- editor preferences (controls and shortcuts; see mapmaker/controlsSync) ----
export interface PreferencesRecord {
  /** null until first saved. */
  controls: Record<string, unknown> | null;
  shortcuts: Record<string, string[]> | null;
  /** When they last changed (ms), on whichever device. */
  updated_at: number;
}
export const preferences = {
  get: () =>
    api.get<One<PreferencesRecord>>("auth/me/preferences").then((r) => r.data),
  put: (p: { controls: unknown; shortcuts: unknown; updated_at: number }) =>
    api
      .put<One<PreferencesRecord>>("auth/me/preferences", p)
      .then((r) => r.data),
};

// ---- plans ----------------------------------------------------------------------
export const plans = {
  /** Every plan and its limits (public), cheapest first. */
  list: () => api.get<{ data: Plan[] }>("plans").then((r) => r.data),
};

// ---- maps -----------------------------------------------------------------------
/** What the server stores as a map's document: the project minus its
 * device-only fields (its local id and cloud binding). */
function toDocument(project: MMProject) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cloud, ...doc } = project;
  return doc;
}

/** Map uploads: gzipped, coordinates to six decimals (a few times smaller). */
const MAP_BODY = { compress: true, decimals: 6 } as const;

export const maps = {
  list: () =>
    api.get<{
      data: CloudMap[];
      limits: { count: number; max: number | null };
    }>("maps"),

  /** A map's metadata and its project, bound to the cloud map. */
  async get(id: string): Promise<{ map: CloudMap; project: MMProject }> {
    const r = await api.get<{ data: CloudMap; document: MMProject }>(
      `maps/${id}`,
    );
    return {
      map: r.data,
      project: {
        ...r.document,
        id: r.data.id,
        cloud: { id: r.data.id, revision: r.data.revision },
      },
    };
  },

  /** Uploads a project as a new cloud map; returns it bound to that map. */
  async create(
    project: MMProject,
    /** This upload's id: sent again (its answer lost), it makes no second map. */
    saveId?: string,
  ): Promise<{ map: CloudMap; project: MMProject }> {
    const { data } = await api.post<One<CloudMap>>(
      "maps",
      {
        save_id: saveId,
        name: project.name.trim() || "Untitled map",
        width: project.width,
        height: project.height,
        document: toDocument(project),
      },
      MAP_BODY,
    );
    return {
      map: data,
      project: {
        ...project,
        id: data.id,
        cloud: { id: data.id, revision: data.revision },
      },
    };
  },

  /** Saves a new revision. `revision` is the one the edits were based on;
   * the server answers 409 (`revision_conflict`) if it has a newer one.
   * `saveId` names this save: sent again because its answer was lost, the
   * server answers with what it already saved instead of a conflict. */
  save: (id: string, project: MMProject, revision: number, saveId?: string) =>
    api
      .put<One<CloudMap>>(
        `maps/${id}`,
        {
          revision,
          save_id: saveId,
          name: project.name.trim() || "Untitled map",
          width: project.width,
          height: project.height,
          document: toDocument(project),
        },
        MAP_BODY,
      )
      .then((r) => r.data),

  rename: (id: string, name: string) =>
    api.patch<One<CloudMap>>(`maps/${id}`, { name }).then((r) => r.data),
  remove: (id: string) => api.delete<void>(`maps/${id}`),

  uploadThumbnail(id: string, image: Blob) {
    const form = new FormData();
    form.append("thumbnail", image, "thumbnail.webp");
    return api
      .post<One<CloudMap>>(`maps/${id}/thumbnail`, form)
      .then((r) => r.data);
  },

  /**
   * Checks an export against the plan and records its license — of a cloud
   * map (`id`), or of a map kept on this device (`null`).
   */
  recordExport: (id: string | null, width: number, height: number) =>
    api
      .post<One<{ id: number; plan: string; commercial_use: boolean }>>(
        id ? `maps/${id}/exports` : "exports",
        { width, height },
      )
      .then((r) => r.data),
};

// ---- asset library (stamps) ---------------------------------------------------------
type Many<T> = { data: T[] };
type AssetDetails = {
  name?: string;
  set_key?: string | null;
  category?: string | null;
  tags?: string[];
};

export const library = {
  packs: () =>
    api.get<Many<AssetPack>>("asset-packs?kind=stamps").then((r) => r.data),
  /** A pack's assets (refused with `plan_limit_reached` for a locked pack). */
  assets: (packId: string) =>
    api.get<Many<Asset>>(`asset-packs/${packId}/assets`).then((r) => r.data),
  /** Assets by id, for drawing maps that use them (even from a locked pack). */
  resolve: (ids: string[]) =>
    api
      .get<Many<Asset>>(
        `assets?${ids.map((id) => `ids[]=${encodeURIComponent(id)}`).join("&")}`,
      )
      .then((r) => r.data),

  /** Line art packs (pieces repeated along lines; `category` = the piece's role). */
  linePacks: () =>
    api.get<Many<AssetPack>>("asset-packs?kind=lines").then((r) => r.data),
  createPack: (input: {
    name: string;
    kind?: "stamps" | "lines";
    official?: boolean;
    tier?: number;
    published?: boolean;
  }) =>
    api
      .post<One<AssetPack>>("asset-packs", { kind: "stamps", ...input })
      .then((r) => r.data),
  updatePack: (
    id: string,
    patch: { name?: string; tier?: number; published?: boolean; sort?: number },
  ) =>
    api.patch<One<AssetPack>>(`asset-packs/${id}`, patch).then((r) => r.data),
  removePack: (id: string) => api.delete<void>(`asset-packs/${id}`),

  upload(
    packId: string,
    file: Blob,
    filename: string,
    details: AssetDetails = {},
  ) {
    const form = new FormData();
    form.append("file", file, filename);
    if (details.name) form.append("name", details.name);
    if (details.set_key) form.append("set_key", details.set_key);
    if (details.category) form.append("category", details.category);
    for (const tag of details.tags ?? []) form.append("tags[]", tag);
    return api
      .post<One<Asset>>(`asset-packs/${packId}/assets`, form)
      .then((r) => r.data);
  },
  updateAsset: (id: string, patch: AssetDetails) =>
    api.patch<One<Asset>>(`assets/${id}`, patch).then((r) => r.data),
  removeAsset: (id: string) => api.delete<void>(`assets/${id}`),
};

// ---- Line Tool styles ----------------------------------------------------------------
export const lineStyles = {
  /** The person's own styles and the official ones, with their plan limit. */
  list: () =>
    api.get<{
      data: LineStyleRecord[];
      limits: { count: number; max: number | null };
    }>("line-styles"),
  create: (input: {
    name: string;
    look: LineLook;
    official?: boolean;
    tier?: number;
    published?: boolean;
  }) =>
    api.post<One<LineStyleRecord>>("line-styles", input).then((r) => r.data),
  update: (
    id: string,
    patch: {
      name?: string;
      look?: LineLook;
      tier?: number;
      published?: boolean;
      sort?: number;
    },
  ) =>
    api
      .patch<One<LineStyleRecord>>(`line-styles/${id}`, patch)
      .then((r) => r.data),
  remove: (id: string) => api.delete<void>(`line-styles/${id}`),
};

// ---- Text Tool styles ----------------------------------------------------------------
export const textStyles = {
  /** The person's own text styles and the official ones, with their plan limit. */
  list: () =>
    api.get<{
      data: TextStyleRecord[];
      limits: { count: number; max: number | null };
    }>("text-styles"),
  create: (input: {
    name: string;
    look: TextLook;
    official?: boolean;
    tier?: number;
    published?: boolean;
  }) =>
    api.post<One<TextStyleRecord>>("text-styles", input).then((r) => r.data),
  update: (
    id: string,
    patch: {
      name?: string;
      look?: TextLook;
      tier?: number;
      published?: boolean;
      sort?: number;
    },
  ) =>
    api
      .patch<One<TextStyleRecord>>(`text-styles/${id}`, patch)
      .then((r) => r.data),
  remove: (id: string) => api.delete<void>(`text-styles/${id}`),
};

// ---- Shape Tool styles ----------------------------------------------------------------
export const shapeStyles = {
  /** The person's own shape styles and the official ones, with their plan limit. */
  list: () =>
    api.get<{
      data: ShapeStyleRecord[];
      limits: { count: number; max: number | null };
    }>("shape-styles"),
  create: (input: {
    name: string;
    look: ShapeLook;
    official?: boolean;
    tier?: number;
    published?: boolean;
  }) =>
    api.post<One<ShapeStyleRecord>>("shape-styles", input).then((r) => r.data),
  update: (
    id: string,
    patch: {
      name?: string;
      look?: ShapeLook;
      tier?: number;
      published?: boolean;
      sort?: number;
    },
  ) =>
    api
      .patch<One<ShapeStyleRecord>>(`shape-styles/${id}`, patch)
      .then((r) => r.data),
  remove: (id: string) => api.delete<void>(`shape-styles/${id}`),
};
