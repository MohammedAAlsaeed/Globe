/**
 * Typed calls to the API: accounts and maps. Components use these, never
 * `api` directly, so every endpoint has one place that knows its shape.
 */
import type { MMProject } from "../mapmaker/types";
import type { CloudMap, User } from "./types";
import {api, API_URL} from "@/lib/api/client";

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
    api.post<One<User>>("auth/login", { email, password, remember }).then((r) => r.data),
  register: (input: { name: string; email: string; password: string; password_confirmation: string; locale: string }) =>
    api.post<One<User>>("auth/register", input).then((r) => r.data),
  logout: () => api.post<void>("auth/logout"),
  update: (patch: { name?: string; locale?: string }) => api.patch<One<User>>("auth/me", patch).then((r) => r.data),
  forgotPassword: (email: string) => api.post<{ message: string }>("auth/forgot-password", { email }),
  resetPassword: (input: { token: string; email: string; password: string; password_confirmation: string }) =>
    api.post<{ message: string }>("auth/reset-password", input),
  resendVerification: () => api.post<void>("auth/email/verification-notification"),
  /** Full-page redirect target for "Continue with Google". */
  googleUrl: () => `${API_URL}/auth/google/redirect`,
};

// ---- maps -----------------------------------------------------------------------
/** What the server stores as a map's document: the project minus its
 * device-only fields (its local id and cloud binding). */
function toDocument(project: MMProject) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cloud, ...doc } = project;
  return doc;
}

export const maps = {
  list: () => api.get<{ data: CloudMap[]; limits: { count: number; max: number | null } }>("maps"),

  /** A map's metadata and its project, bound to the cloud map. */
  async get(id: string): Promise<{ map: CloudMap; project: MMProject }> {
    const r = await api.get<{ data: CloudMap; document: MMProject }>(`maps/${id}`);
    return { map: r.data, project: { ...r.document, id: r.data.id, cloud: { id: r.data.id, revision: r.data.revision } } };
  },

  /** Uploads a project as a new cloud map; returns it bound to that map. */
  async create(project: MMProject): Promise<{ map: CloudMap; project: MMProject }> {
    const { data } = await api.post<One<CloudMap>>("maps", {
      name: project.name.trim() || "Untitled map",
      width: project.width,
      height: project.height,
      document: toDocument(project),
    });
    return { map: data, project: { ...project, id: data.id, cloud: { id: data.id, revision: data.revision } } };
  },

  /** Saves a new revision. `revision` is the one the edits were based on;
   * the server answers 409 (`revision_conflict`) if it has a newer one. */
  save: (id: string, project: MMProject, revision: number) =>
    api
      .put<One<CloudMap>>(`maps/${id}`, {
        revision,
        name: project.name.trim() || "Untitled map",
        width: project.width,
        height: project.height,
        document: toDocument(project),
      })
      .then((r) => r.data),

  rename: (id: string, name: string) => api.patch<One<CloudMap>>(`maps/${id}`, { name }).then((r) => r.data),
  remove: (id: string) => api.delete<void>(`maps/${id}`),

  uploadThumbnail(id: string, image: Blob) {
    const form = new FormData();
    form.append("thumbnail", image, "thumbnail.webp");
    return api.post<One<CloudMap>>(`maps/${id}/thumbnail`, form).then((r) => r.data);
  },

  /** Checks an export against the plan and records its license. */
  recordExport: (id: string, width: number, height: number) =>
    api.post<One<{ id: number; plan: string; commercial_use: boolean }>>(`maps/${id}/exports`, { width, height }).then((r) => r.data),
};
