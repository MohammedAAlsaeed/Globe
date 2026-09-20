import type { MMProject } from "./types";

const LAST_ID_KEY = "mapmaker-last-id";
const INIT_KEY = "mapmaker-init";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("al-idrisi-mapmaker", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("storageError"));
  });
}

export async function saveProject(project: MMProject) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("storageError"));
    });
    try {
      localStorage.setItem(LAST_ID_KEY, project.id);
    } catch {}
  } finally {
    database.close();
  }
}

export async function loadProject(id: string): Promise<MMProject | null> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction("projects").objectStore("projects").get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(new Error("storageError"));
    });
  } finally {
    database.close();
  }
}

/** Every saved map, newest first — backs the "My maps" gallery. */
export async function listProjects(): Promise<MMProject[]> {
  const database = await db();
  try {
    const all = await new Promise<MMProject[]>((resolve, reject) => {
      const request = database.transaction("projects").objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(new Error("storageError"));
    });
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    database.close();
  }
}

export async function deleteProject(id: string) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      tx.objectStore("projects").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("storageError"));
    });
    try {
      if (lastProjectId() === id) localStorage.removeItem(LAST_ID_KEY);
    } catch {}
  } finally {
    database.close();
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_ID_KEY);
  } catch {
    return null;
  }
}

/** Hands a freshly created project from the "Create a Map" modal to the editor page, once. */
export function stashInitialProject(project: MMProject) {
  try {
    sessionStorage.setItem(INIT_KEY, JSON.stringify(project));
  } catch {}
}
export function takeInitialProject(): MMProject | null {
  try {
    const raw = sessionStorage.getItem(INIT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INIT_KEY);
    return JSON.parse(raw) as MMProject;
  } catch {
    return null;
  }
}
