/**
 * The Line Tool's server side, seen from the editor:
 *
 *   styles     the person's own line styles (saved to their account, within
 *              the plan's limit) and the official styles admins publish —
 *              official styles above the plan are listed but locked;
 *   line art   line packs from the asset library (kind "lines"): official
 *              packs and the person's own uploaded pieces. Each picture's
 *              `category` says which piece it is ("seg" — the repeated piece,
 *              "start", "end", "corner"); pictures sharing a `set_key` form
 *              one set. Their images are added to the stamp catalog (hidden)
 *              so they draw, colour and print like any stamp.
 *
 * Signed-out visitors keep the built-in styles and art.
 */
import { useCallback, useEffect, useState } from "react";
import { library, lineStyles } from "../../account/api";
import { ApiError } from "@/lib/api/client";
import type { Asset, AssetPack, LineStyleRecord, User } from "../../account/types";
import { prepareStampImage } from "../stamps/upload";
import { registerRemoteSets, type StampAsset, type StampSet } from "../stamps/catalog";
import { uploadedKey } from "../stamps/remote";
import type { LineLook } from "../types";
import { setRemoteLineSets, type LineArtSet } from "./catalog";
import { factoryLook, type LineStyle } from "./state";
import { validLook } from "./validate";

export type PieceRole = "seg" | "start" | "end" | "corner";
const ROLES: PieceRole[] = ["seg", "start", "end", "corner"];

/** A server style for the panel (locked ones show a neutral preview). */
function toStyle(r: LineStyleRecord): LineStyle | null {
  if (r.look && !validLook(r.look)) return null;
  return { id: `s:${r.id}`, source: r.official ? "official" : "own", name: r.name, look: r.look ?? factoryLook(), locked: r.locked || !r.look };
}

/** One pack's pictures as line sets (grouped by set_key). */
export function linePackSets(pack: AssetPack, assets: Asset[]): { set: LineArtSet; stamp: { set: StampSet; assets: StampAsset[] } }[] {
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = a.set_key ?? `one-${a.id}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const out: { set: LineArtSet; stamp: { set: StampSet; assets: StampAsset[] } }[] = [];
  for (const [key, list] of groups) {
    const byRole = (r: PieceRole) => list.filter((a) => (ROLES.includes(a.category as PieceRole) ? a.category : "seg") === r);
    const seg = byRole("seg");
    if (!seg.length) continue;
    const id = `lu:${pack.id}:${key}`,
      first = seg[0],
      // Thickness from the picture's proportions: about 1% of the map wide
      // for a typical long piece.
      size = 0.01;
    const one = (r: PieceRole) => byRole(r)[0] ? uploadedKey(byRole(r)[0].id) : null;
    out.push({
      set: {
        id,
        category: pack.official ? "library" : "custom",
        name: first.name,
        tags: [...new Set(list.flatMap((a) => a.tags)), pack.name],
        parts: { seg: seg.map((a) => uploadedKey(a.id)), start: one("start"), end: one("end"), corner: one("corner") },
        vector: false,
        defaults: {
          ink: "#3a2e22",
          fill: null,
          size,
          spacing: 0,
          followPath: true,
          fit: true,
          corners: one("corner") ? "split" : "continuous",
          caps: !!(one("start") || one("end")),
          scaleJitter: 0,
          rotationJitter: 0,
          anchor: "center",
        },
      },
      // Hidden stamp sets, so the pictures load and draw by key.
      stamp: {
        set: {
          id: `h:${id}`,
          pack: pack.id,
          category: "custom",
          name: first.name,
          tags: [],
          assets: list.map((a) => uploadedKey(a.id)),
          vector: false,
          ink: "#3a2e22",
          fill: null,
          size,
          shadow: false,
          rotationJitter: 0,
          randomFlip: false,
          pivot: "center",
          hidden: true,
        },
        assets: list.map((a) => ({ key: uploadedKey(a.id), set: `h:${id}`, kind: "image" as const, url: a.url, w: a.width ?? 1, h: a.height ?? 1 })),
      },
    });
  }
  return out;
}

/** Loads the line packs into the line catalog. */
async function loadLineArt() {
  const packs = await library.linePacks();
  const sets: LineArtSet[] = [];
  const stamps: { set: StampSet; assets: StampAsset[] }[] = [];
  await Promise.all(
    packs.map(async (pack) => {
      if (pack.locked) {
        sets.push({
          id: `lu:${pack.id}`,
          category: "library",
          name: pack.name,
          tags: [],
          parts: { seg: [] },
          vector: false,
          locked: true,
          defaults: { ink: "#3a2e22", fill: null, size: 0.01, spacing: 0, followPath: true, fit: true, corners: "continuous", caps: false, scaleJitter: 0, rotationJitter: 0, anchor: "center" },
        });
        return;
      }
      for (const x of linePackSets(pack, await library.assets(pack.id).catch(() => []))) {
        sets.push(x.set);
        stamps.push(x.stamp);
      }
    }),
  );
  registerRemoteSets(stamps);
  setRemoteLineSets(sets);
}

/** The person's own line-art pack, made on first upload. */
async function ownLinePack(): Promise<AssetPack> {
  const packs = await library.linePacks();
  return packs.find((p) => !p.official) ?? (await library.createPack({ name: "My line art", kind: "lines" }));
}

export function useLineLibrary(user: User | null | undefined, describeError: (e: unknown) => string) {
  const [own, setOwn] = useState<LineStyle[]>([]),
    [official, setOfficial] = useState<LineStyle[]>([]),
    [max, setMax] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [uploadBusy, setUploadBusy] = useState(false),
    [uploadError, setUploadError] = useState<string | null>(null),
    // The upgrade prompt: opened when saving at the plan's limit (checked
    // here first, and again by the server, which has the final say).
    [limitPrompt, setLimitPrompt] = useState<{ max: number | null; plan: string | null } | null>(null);

  /** Applies a fresh list of styles from the server. */
  const apply = useCallback((r: Awaited<ReturnType<typeof lineStyles.list>>) => {
    const styles = r.data.map(toStyle).filter((s): s is LineStyle => !!s);
    setOwn(styles.filter((s) => s.source === "own"));
    setOfficial(styles.filter((s) => s.source === "official"));
    setMax(r.limits.max);
  }, []);
  const refresh = useCallback(
    () =>
      lineStyles.list().then(apply, () => {
        // Offline or the API is down: built-in styles still work.
      }),
    [apply],
  );

  useEffect(() => {
    if (!user) {
      // Signed out: only the built-in line art stays listed.
      if (user === null) setRemoteLineSets([]);
      return;
    }
    let live = true;
    lineStyles.list().then(
      (r) => {
        if (live) apply(r);
      },
      () => {},
    );
    void loadLineArt().catch(() => {});
    return () => {
      live = false;
    };
  }, [user, apply]);

  const save = useCallback(
    async (name: string, look: LineLook) => {
      setBusy(true);
      setError(null);
      try {
        await lineStyles.create({ name, look });
        await refresh();
      } catch (e) {
        if (e instanceof ApiError && e.code === "plan_limit_reached" && e.body.limit === "line_styles") {
          // Saved from another tab or device meanwhile: show the prompt, and
          // the up-to-date count behind it.
          setLimitPrompt({ max: typeof e.body.max === "number" ? e.body.max : null, plan: typeof e.body.plan === "string" ? e.body.plan : null });
          void refresh();
        } else setError(describeError(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh, describeError],
  );
  /** Opens the upgrade prompt (the save button at the limit). */
  const promptLimit = useCallback(() => setLimitPrompt({ max, plan: null }), [max]);
  const closeLimitPrompt = useCallback(() => setLimitPrompt(null), []);
  const remove = useCallback(
    async (styleId: string) => {
      const id = styleId.replace(/^s:/, "");
      setOwn((list) => list.filter((s) => s.id !== styleId));
      try {
        await lineStyles.remove(id);
      } catch (e) {
        setError(describeError(e));
        await refresh();
      }
    },
    [refresh, describeError],
  );

  /** Uploads pictures as a new line set (several = variants of the piece). */
  const upload = useCallback(
    async (files: File[]): Promise<string | null> => {
      setUploadBusy(true);
      setUploadError(null);
      try {
        const pack = await ownLinePack(),
          setKey = `line-${Date.now().toString(36)}`;
        for (const file of files) {
          const blob = await prepareStampImage(file),
            name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Line",
            ext = blob.type === "image/webp" ? "webp" : "png";
          await library.upload(pack.id, blob, `${name}.${ext}`, { name, set_key: setKey, category: "seg" });
        }
        await loadLineArt();
        return `lu:${pack.id}:${setKey}`;
      } catch (e) {
        setUploadError(describeError(e));
        return null;
      } finally {
        setUploadBusy(false);
      }
    },
    [describeError],
  );
  /** Adds an end or corner piece to one of the person's own sets. */
  const addPiece = useCallback(
    async (setId: string, role: Exclude<PieceRole, "seg">, file: File) => {
      const [, packId, setKey] = setId.split(":");
      if (!packId || !setKey) return;
      setUploadBusy(true);
      setUploadError(null);
      try {
        const blob = await prepareStampImage(file),
          ext = blob.type === "image/webp" ? "webp" : "png";
        await library.upload(packId, blob, `${role}.${ext}`, { name: role, set_key: setKey.startsWith("one-") ? null : setKey, category: role });
        await loadLineArt();
      } catch (e) {
        setUploadError(describeError(e));
      } finally {
        setUploadBusy(false);
      }
    },
    [describeError],
  );

  // Signed out: nothing from the account (stale lists aren't shown).
  return {
    own: user ? own : [],
    official: user ? official : [],
    max: user ? max : null,
    busy,
    error,
    save,
    remove,
    uploadBusy,
    uploadError,
    upload,
    addPiece,
    limitPrompt: user ? limitPrompt : null,
    promptLimit,
    closeLimitPrompt,
  };
}
