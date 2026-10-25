"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails are signed URLs from the API */
/**
 * Everyone's maps, for support and moderation: thumbnails and metadata, the
 * trash, and — for the owner only, with a reason that is logged — opening a
 * map's document to investigate a problem report.
 */
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RequirePermission, useAdmin } from "../AdminApp";
import { admin } from "../api";
import type { AdminMapRow } from "../types";
import {
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  ErrorNote,
  PageHead,
  Pager,
  SearchBox,
  Select,
  Skeleton,
  adminError,
  fmtAgo,
  fmtBytes,
  fmtNumber,
  useLoad,
  useToast,
  useUrlQuery,
  type ConfirmSpec,
} from "../ui";

export function Maps() {
  return (
    <RequirePermission permission="maps.view">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    toast = useToast(),
    { can, guard } = useAdmin(),
    { values, set, page } = useUrlQuery([
      "q",
      "state",
      "sort",
      "user",
    ] as const),
    { data, error, loading, reload } = useLoad(
      () => admin.maps.list({ ...values, page, per_page: 24 }),
      [values, page],
    ),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  function download(m: AdminMapRow) {
    setConfirm({
      title: t("adOpenDocument"),
      body: t("adOpenDocumentLead"),
      confirmLabel: t("adDownload"),
      reason: true,
      run: async (reason) => {
        const doc = await guard(() => admin.maps.document(m.id, reason));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([JSON.stringify(doc)], { type: "application/json" }),
        );
        a.download = `${m.name.replace(/[^\p{L}\p{N}_ -]+/gu, "_") || "map"}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
    });
  }

  return (
    <>
      <PageHead
        title={t("adNavMaps")}
        lead={
          data
            ? t("adMapsCount", { n: fmtNumber(data.meta.total, L) })
            : t("adMapsLead")
        }
      />
      <div className="adm-filters">
        <SearchBox
          value={values.q}
          onChange={(q) => set({ q })}
          placeholder={t("adMapsSearch")}
        />
        <Select
          label={t("adFilterState")}
          value={values.state}
          onChange={(state) => set({ state })}
          options={[
            { value: "", label: t("adMapsLive") },
            { value: "trashed", label: t("adInTrash") },
            { value: "all", label: t("adMapsAll") },
          ]}
        />
        <Select
          label={t("adSort")}
          value={values.sort}
          onChange={(sort) => set({ sort })}
          options={[
            { value: "", label: t("adSortUpdated") },
            { value: "-created_at", label: t("adSortCreated") },
            { value: "-document_bytes", label: t("adSortLargest") },
            { value: "name", label: t("adSortName") },
          ]}
        />
        {values.user && (
          <Button size="sm" variant="ghost" onClick={() => set({ user: null })}>
            {t("adClearPerson")} ×
          </Button>
        )}
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton rows={8} />
      ) : data.data.length === 0 ? (
        <Empty title={t("adNoResults")} />
      ) : (
        <div className={loading ? "is-loading" : undefined}>
          <ul className="adm-map-grid">
            {data.data.map((m) => (
              <li key={m.id} className={m.deleted_at ? "trashed" : undefined}>
                <span className="adm-thumb">
                  {m.thumbnail_url ? (
                    <img src={m.thumbnail_url} alt="" loading="lazy" />
                  ) : (
                    <span className="adm-thumb-blank" />
                  )}
                  {m.deleted_at && <Badge tone="warn">{t("adInTrash")}</Badge>}
                </span>
                <div className="adm-map-info">
                  <b title={m.name}>{m.name}</b>
                  {m.user && (
                    <Link
                      href={`/admin/users/${m.user.id}`}
                      className="adm-map-owner"
                      dir="auto"
                    >
                      {m.user.name}
                    </Link>
                  )}
                  <small>
                    {m.width}×{m.height} · {fmtBytes(m.bytes, L)} · r
                    {m.revision} · {fmtAgo(m.updated_at, L)}
                  </small>
                </div>
                <div className="adm-map-actions">
                  {can("maps.manage") &&
                    (m.deleted_at ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await guard(() => admin.maps.restore(m.id));
                            toast("ok", t("adRestored"));
                            void reload();
                          } catch (e) {
                            toast("error", adminError(t, e));
                          }
                        }}
                      >
                        {t("adRestore")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setConfirm({
                            title: t("adTrashMap"),
                            body: t("adTrashMapLead"),
                            confirmLabel: t("adTrashMap"),
                            danger: true,
                            reason: true,
                            run: async (reason) => {
                              await guard(() => admin.maps.trash(m.id, reason));
                              toast("ok", t("adSaved"));
                              void reload();
                            },
                          })
                        }
                      >
                        {t("adTrashMap")}
                      </Button>
                    ))}
                  {can("maps.read") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => download(m)}
                    >
                      {t("adOpenDocument")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pager meta={data.meta} onPage={(p) => set({ page: p })} />
        </div>
      )}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
