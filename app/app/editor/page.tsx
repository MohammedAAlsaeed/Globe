"use client";
/**
 * Opens the map editor with the right map:
 *  - /editor?map=<id>: a cloud map (signed-in users). If this device holds
 *    unsaved edits of it, those are resumed; offline, the device copy opens.
 *  - /editor: a map just created signed out, or the last map opened here.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
// Imported here too (not only from the home page) so a direct load or
// refresh of /editor is styled, not just client-side navigation from "/".
import "../../features/mapmaker/mapmaker.css";
import {CompassScreen} from "@/features/account/ui";
import {MMProject} from "@/features/mapmaker/types";
import {lastProjectId, loadProject, takeInitialProject} from "@/features/mapmaker/storage";
import {maps} from "@/features/account/api";
import {NetworkError} from "@/lib/api/client";
import {useAuth} from "@/features/account/AuthProvider";
import {createProject} from "@/features/mapmaker/domain";

const MapCreatorEditor = dynamic(
  () => import("../../features/mapmaker/MapCreatorEditor").then((m) => m.MapCreatorEditor),
  { ssr: false, loading: () => <CompassScreen /> },
);

/** A cloud map, or this device's newer unsaved copy of it. */
async function openCloudMap(id: string): Promise<MMProject> {
  const local = await loadProject(id).catch(() => null);
  const localDirty = !!local?.cloud && local.updatedAt > (local.cloud.savedAt ?? 0);
  try {
    const { project } = await maps.get(id);
    // Unsaved edits made here win; saving them may then raise a conflict.
    if (local && localDirty) return local;
    return { ...project, cloud: { ...project.cloud!, savedAt: Date.now() } };
  } catch (e) {
    if (e instanceof NetworkError && local) return local; // offline: keep working
    throw e;
  }
}

function EditorLoader() {
  const { t } = useTranslation(),
    router = useRouter(),
    params = useSearchParams(),
    mapId = params.get("map"),
    { user } = useAuth();
  const [open, setOpen] = useState<{ project: MMProject; key: number } | null>(null),
    [missing, setMissing] = useState(false),
    started = useRef(false);

  useEffect(() => {
    if (started.current || user === undefined) return;
    if (mapId && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/editor?map=${mapId}`)}`);
      return;
    }
    started.current = true;
    const show = (project: MMProject) => setOpen({ project, key: 1 });
    const fail = () => setMissing(true);
    if (mapId) {
      openCloudMap(mapId).then(show, fail);
      return;
    }
    (async () => {
      const fresh = takeInitialProject();
      if (fresh) return show(fresh);
      const id = lastProjectId();
      const saved = id ? await loadProject(id).catch(() => null) : null;
      if (saved?.cloud && user) {
        // The last map is a cloud map: open it at its own address.
        window.history.replaceState(window.history.state, "", `/editor?map=${saved.cloud.id}`);
        return openCloudMap(saved.cloud.id).then(show, () => show(saved));
      }
      show(saved ?? createProject({ name: "", resolutionTier: "medium", aspect: "landscape", cols: 40, rows: 30 }));
    })();
  }, [mapId, user, router]);

  if (missing)
    return (
      <div className="site maps-main">
        <p className="site-notice error">{t("acMapMissing")}</p>
        <Link className="site-btn" href="/maps">
          {t("acMyMaps")}
        </Link>
      </div>
    );
  if (!open) return <CompassScreen label={mapId ? t("acOpeningMap") : undefined} />;
  return (
    <MapCreatorEditor
      key={open.key}
      initial={open.project}
      onReplaceProject={(project) => setOpen((o) => ({ project, key: (o?.key ?? 0) + 1 }))}
    />
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<CompassScreen />}>
      <EditorLoader />
    </Suspense>
  );
}
