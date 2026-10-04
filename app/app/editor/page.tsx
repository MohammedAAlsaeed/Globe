"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "../../lib/i18n";
// Imported here too (not only from the home page) so a direct load or
// refresh of /editor is styled, not just client-side navigation from "/".
import "../../features/mapmaker/mapmaker.css";
import { createProject } from "../../features/mapmaker/domain";
import { lastProjectId, loadProject, takeInitialProject } from "../../features/mapmaker/storage";
import type { MMProject } from "../../features/mapmaker/types";

const MapCreatorEditor = dynamic(
  () => import("../../features/mapmaker/MapCreatorEditor").then((m) => m.MapCreatorEditor),
  { ssr: false },
);

export default function EditorPage() {
  const [project, setProject] = useState<MMProject | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const fresh = takeInitialProject();
      if (fresh) {
        if (alive) setProject(fresh);
        return;
      }
      const id = lastProjectId();
      const saved = id ? await loadProject(id).catch(() => null) : null;
      if (!alive) return;
      setProject(
        saved ??
          createProject({
            name: "",
            resolutionTier: "medium",
            aspect: "landscape",
            cols: 40,
            rows: 30,
          }),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!project) return null;
  return <MapCreatorEditor initial={project} />;
}
