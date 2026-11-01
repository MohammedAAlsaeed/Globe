"use client";
/**
 * Keeps the open map saved in the cloud.
 *
 *  - Signed out: the map is saved on this device only (status "signin").
 *  - Signed in, map not in the cloud yet: it is uploaded as a new cloud map
 *    (unless the plan's map limit is reached: status "limit").
 *  - Signed in, cloud map: edits are saved a couple of seconds after
 *    drawing pauses, and at once on ⌘S / the Save button. Each save names
 *    the revision it was based on; if another device saved a newer one in
 *    the meantime the server refuses (409) and the person chooses what to
 *    keep (status "conflict").
 *
 * Failed saves retry on their own; the work is always kept on this device
 * meanwhile (the editor's local autosave), so nothing is lost offline.
 *
 * One save at a time, each based on the revision the previous one returned
 * (kept in a ref at once, not waiting for React to re-render), and each
 * with an id of its own: a save resent because its answer was lost (a slow
 * or dropped connection) is recognised by the server, not taken for a
 * conflict.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { maps } from "../../account/api";
import type { User } from "../../account/types";
import type { CloudBinding, MMProject } from "../types";
import { ApiError, NetworkError } from "@/lib/api/client";

export type CloudStatus =
  | "loading" // waiting to know who is signed in
  | "signin" // signed out: saved on this device only
  | "limit" // the plan's map limit: saved on this device only
  | "pending" // edits waiting to be saved
  | "saving"
  | "saved"
  | "offline" // server unreachable: retrying, saved on this device
  | "error" // the save failed: retrying
  | "conflict"; // a newer version exists: the person chooses

export type ConflictChoice = "load" | "copy" | "replace";

/** An id for one save (the same for its retries). */
const newSaveId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * The saves this tab has sent, per map (the last few). Kept in
 * sessionStorage: the tab's own, surviving a reload of it, never shared with
 * another tab (whose saves stay "someone else's"). A save whose answer was
 * lost (a gateway timeout, a reload) may still have been made: when the
 * server's current revision turns out to be one of these, it isn't a
 * conflict.
 */
const OWN_SAVES = (mapId: string) => `idrisi-saves:${mapId}`;
function rememberSave(mapId: string, saveId: string) {
  try {
    const list = JSON.parse(
      sessionStorage.getItem(OWN_SAVES(mapId)) ?? "[]",
    ) as string[];
    sessionStorage.setItem(
      OWN_SAVES(mapId),
      JSON.stringify([...list.filter((x) => x !== saveId), saveId].slice(-20)),
    );
  } catch {}
}
function isOwnSave(mapId: string, saveId: unknown) {
  if (typeof saveId !== "string") return false;
  try {
    return (
      JSON.parse(sessionStorage.getItem(OWN_SAVES(mapId)) ?? "[]") as string[]
    ).includes(saveId);
  } catch {
    return false;
  }
}

const SAVE_DELAY = 2000,
  RETRY_OFFLINE = 10_000,
  RETRY_ERROR = 15_000,
  THUMBNAIL_EVERY = 60_000;

interface Options {
  project: MMProject;
  binding: CloudBinding | undefined;
  setBinding: (b: CloudBinding | undefined) => void;
  user: User | null | undefined;
  /** The session ended (401): reload who is signed in. */
  onSignedOut: () => void;
  /** Replaces the open map with another version (remounts the editor). */
  onReplaceProject: (p: MMProject) => void;
  /** Renames the open map (used when keeping a conflicting copy). */
  onRename: (name: string) => void;
  /** A small preview image of the map, for the gallery. */
  captureThumbnail: () => Promise<Blob | null>;
  copySuffix: string;
}

export function useCloudSync(o: Options) {
  const [status, setStatus] = useState<CloudStatus>("loading"),
    [conflictRevision, setConflictRevision] = useState<number | null>(null),
    [limitMax, setLimitMax] = useState<number | null>(null),
    [resolving, setResolving] = useState(false),
    [resolveError, setResolveError] = useState<unknown>(null);

  // Long-lived async work reads the latest values through refs.
  const latest = useRef(o);
  useLayoutEffect(() => {
    latest.current = o;
  });
  const saved = useRef<MMProject | null>(
      // A cloud copy loaded without local edits since its last save is in sync.
      o.binding && (o.binding.savedAt ?? 0) >= o.project.updatedAt
        ? o.project
        : null,
    ),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inFlight = useRef(false),
    again = useRef(false),
    blocked = useRef(false), // conflict or limit: no automatic saves
    lastThumb = useRef(0),
    thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    uploadThumbnailRef = useRef<(id: string, force?: boolean) => Promise<void>>(
      async () => {},
    ),
    // The save routine, read by timers (always the latest version).
    runRef = useRef<() => Promise<void>>(async () => {}),
    // The cloud map and the revision the server last answered with: set the
    // moment a save returns, so the next save never starts from an older one
    // (the binding prop only catches up on the next render).
    server = useRef<{ id: string; revision: number } | null>(
      o.binding ? { id: o.binding.id, revision: o.binding.revision } : null,
    ),
    // The id of the save of a given version of the project: its retries
    // reuse it, the next version gets a new one.
    pendingSave = useRef<{ project: MMProject; id: string } | null>(null);

  /** The binding to save against: the newest revision known. */
  const current = useCallback(() => {
    const b = latest.current.binding,
      s = server.current;
    if (!b) return undefined;
    return s && s.id === b.id && s.revision > b.revision
      ? { ...b, revision: s.revision }
      : b;
  }, []);

  const schedule = useCallback((delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runRef.current(), delay);
  }, []);

  const uploadThumbnail = useCallback(async (id: string, force = false) => {
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
    thumbTimer.current = null;
    const wait = THUMBNAIL_EVERY - (Date.now() - lastThumb.current);
    if (!force && wait > 0) {
      // Too soon after the last one: refresh it once the interval is up.
      thumbTimer.current = setTimeout(
        () => void uploadThumbnailRef.current(id, true),
        wait,
      );
      return;
    }
    lastThumb.current = Date.now();
    try {
      const blob = await latest.current.captureThumbnail();
      if (blob) await maps.uploadThumbnail(id, blob);
    } catch {
      // A missing preview is not worth bothering anyone about.
    }
  }, []);

  useLayoutEffect(() => {
    uploadThumbnailRef.current = uploadThumbnail;
  }, [uploadThumbnail]);

  /** Handles a failed request; returns true when it should be retried. */
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof NetworkError) {
        setStatus("offline");
        schedule(RETRY_OFFLINE);
      } else if (e instanceof ApiError && e.status === 401) {
        setStatus("signin");
        latest.current.onSignedOut();
      } else if (
        e instanceof ApiError &&
        e.code === "revision_conflict" &&
        server.current &&
        Number(e.body.current_revision) > server.current.revision &&
        isOwnSave(server.current.id, e.body.current_save_id)
      ) {
        // Our own save made it after all (its answer was lost): carry on
        // from the revision it made, with everything drawn since.
        server.current = {
          id: server.current.id,
          revision: Number(e.body.current_revision),
        };
        setStatus("pending");
        schedule(0);
      } else if (e instanceof ApiError && e.code === "revision_conflict") {
        blocked.current = true;
        setConflictRevision(Number(e.body.current_revision));
        setStatus("conflict");
      } else if (e instanceof ApiError && e.code === "plan_limit_reached") {
        blocked.current = true;
        setLimitMax(typeof e.body.max === "number" ? e.body.max : null);
        setStatus("limit");
      } else {
        setStatus("error");
        schedule(RETRY_ERROR);
      }
    },
    [schedule],
  );

  const bind = useCallback((id: string, revision: number) => {
    server.current = { id, revision };
    latest.current.setBinding({ id, revision, savedAt: Date.now() });
    // Show the cloud map's own address, without reloading the editor.
    const url = new URL(window.location.href);
    if (url.searchParams.get("map") !== id) {
      url.searchParams.set("map", id);
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  /** One save (or the first upload) of the current project. */
  const run = useCallback(async () => {
    const { user } = latest.current,
      binding = current();
    if (!user || blocked.current) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    const project = latest.current.project;
    if (binding && saved.current === project) {
      setStatus("saved");
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    if (pendingSave.current?.project !== project)
      pendingSave.current = { project, id: newSaveId() };
    const saveId = pendingSave.current.id;
    // Remembered before it is sent: its answer may never arrive.
    if (binding) rememberSave(binding.id, saveId);
    try {
      if (!binding) {
        const { map } = await maps.create(project, saveId);
        rememberSave(map.id, saveId);
        bind(map.id, map.revision);
        void uploadThumbnail(map.id, true);
      } else {
        const map = await maps.save(
          binding.id,
          project,
          binding.revision,
          saveId,
        );
        bind(map.id, map.revision);
        void uploadThumbnail(map.id);
      }
      saved.current = project;
      const changed = latest.current.project !== project;
      setStatus(changed ? "pending" : "saved");
      if (changed) schedule(SAVE_DELAY);
    } catch (e) {
      fail(e);
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        schedule(0);
      }
    }
  }, [bind, current, fail, schedule, uploadThumbnail]);
  useLayoutEffect(() => {
    runRef.current = run;
  }, [run]);

  // React to edits and to signing in or out.
  useEffect(() => {
    if (o.user === undefined) return;
    if (!o.user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the session
      setStatus("signin");
      return;
    }
    if (blocked.current) return;
    if (!o.binding) {
      // A map made before signing in (or offline): upload it now.
      schedule(0);
      return;
    }
    if (saved.current === o.project) {
      setStatus((s) => (s === "loading" ? "saved" : s));
      return;
    }
    setStatus((s) => (s === "saving" ? s : "pending"));
    schedule(SAVE_DELAY);
  }, [o.project, o.user, o.binding, schedule]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
    },
    [],
  );

  // Leaving with unsaved cloud edits asks first (they are still kept locally).
  useEffect(() => {
    if (status !== "pending" && status !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  /** Save right now (⌘S, the Save button). */
  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void runRef.current();
  }, []);

  const resolveConflict = useCallback(
    async (choice: ConflictChoice) => {
      const { project } = latest.current,
        binding = current();
      if (!binding || conflictRevision === null) return;
      setResolving(true);
      setResolveError(null);
      try {
        if (choice === "load") {
          const fresh = await maps.get(binding.id);
          latest.current.onReplaceProject({
            ...fresh.project,
            cloud: { ...fresh.project.cloud!, savedAt: Date.now() },
          });
          return;
        }
        if (choice === "copy") {
          const name = `${project.name || "Map"} ${latest.current.copySuffix}`;
          const { map } = await maps.create({ ...project, name }, newSaveId());
          latest.current.onRename(name);
          bind(map.id, map.revision);
          void uploadThumbnail(map.id, true);
        } else {
          const saveId = newSaveId();
          rememberSave(binding.id, saveId);
          const map = await maps.save(
            binding.id,
            project,
            conflictRevision,
            saveId,
          );
          bind(map.id, map.revision);
        }
        saved.current = project;
        blocked.current = false;
        setConflictRevision(null);
        setStatus("saved");
      } catch (e) {
        setResolveError(e);
      } finally {
        setResolving(false);
      }
    },
    [bind, conflictRevision, current, uploadThumbnail],
  );

  return {
    status,
    saveNow,
    conflict: conflictRevision !== null,
    resolveConflict,
    resolving,
    resolveError,
    limitMax,
  };
}
