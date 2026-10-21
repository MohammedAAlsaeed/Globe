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
    runRef = useRef<() => Promise<void>>(async () => {});

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
    const { user, binding } = latest.current;
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
    try {
      if (!binding) {
        const { map } = await maps.create(project);
        bind(map.id, map.revision);
        void uploadThumbnail(map.id, true);
      } else {
        const map = await maps.save(binding.id, project, binding.revision);
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
  }, [bind, fail, schedule, uploadThumbnail]);
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
      const { binding, project } = latest.current;
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
          const { map } = await maps.create({ ...project, name });
          latest.current.onRename(name);
          bind(map.id, map.revision);
          void uploadThumbnail(map.id, true);
        } else {
          const map = await maps.save(binding.id, project, conflictRevision);
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
    [bind, conflictRevision, uploadThumbnail],
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
