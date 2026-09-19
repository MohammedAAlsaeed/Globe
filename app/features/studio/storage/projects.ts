import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { validateDocument } from "../domain/validation";
import type { StudioDocument } from "../domain/types";
export interface SavedProject {
  document: StudioDocument;
  source: Blob;
  filename: string;
}
export async function checkImage(blob: Blob) {
  if (blob.size > 40 * 1024 * 1024) throw new Error("errorImage");
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png =
      head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71,
    jpg = head[0] === 255 && head[1] === 216,
    webp =
      String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (!png && !jpg && !webp) throw new Error("errorImage");
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (size.width * size.height > 60e6) throw new Error("errorImage");
  return size;
}
export async function encodeProject(project: SavedProject) {
  const meta = {
    version: 1,
    document: project.document,
    filename: project.filename,
    mime: project.source.type,
  };
  return new Blob(
    [
      new Uint8Array(
        zipSync(
          {
            "project.json": strToU8(JSON.stringify(meta)),
            "source.image": new Uint8Array(await project.source.arrayBuffer()),
          },
          { level: 0 },
        ),
      ),
    ],
    { type: "application/zip" },
  );
}
export async function decodeProject(file: File): Promise<SavedProject> {
  if (file.size > 60 * 1024 * 1024) throw new Error("invalidProject");
  let total = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (!["project.json", "source.image"].includes(entry.name)) return false;
      total += entry.originalSize;
      if (
        total > 60 * 1024 * 1024 ||
        (entry.name === "project.json" && entry.originalSize > 8 * 1024 * 1024)
      )
        throw new Error("invalidProject");
      return true;
    },
  });
  if (!entries["project.json"] || !entries["source.image"])
    throw new Error("invalidProject");
  const meta = JSON.parse(strFromU8(entries["project.json"]));
  if (
    meta.version !== 1 ||
    !["image/png", "image/jpeg", "image/webp"].includes(meta.mime) ||
    typeof meta.filename !== "string"
  )
    throw new Error("invalidProject");
  const document = validateDocument(meta.document),
    source = new Blob([new Uint8Array(entries["source.image"])], {
      type: meta.mime,
    });
  await checkImage(source);
  return { document, source, filename: meta.filename.slice(0, 200) };
}
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("al-idrisi-atelier", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("storageError"));
  });
}
export async function saveLocal(project: SavedProject) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project, "draft");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("storageError"));
    });
  } finally {
    database.close();
  }
}
export async function loadLocal(): Promise<SavedProject | null> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("projects")
        .objectStore("projects")
        .get("draft");
      request.onsuccess = () => {
        try {
          if (!request.result) return resolve(null);
          resolve({
            ...request.result,
            document: validateDocument(request.result.document),
          });
        } catch {
          reject(new Error("invalidProject"));
        }
      };
      request.onerror = () => reject(new Error("storageError"));
    });
  } finally {
    database.close();
  }
}
