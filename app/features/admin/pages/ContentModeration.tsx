"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails are signed URLs from the API */
/**
 * Everything the editor uses that is stored as data: uploaded stamps and
 * line art, saved line / text / shape styles — people's own and the
 * official library's — with the trash.
 *
 * "Move to trash" makes an item disappear at once (from the library and
 * from maps that use it); it can be restored for 30 days, then it is
 * deleted for good. A person's own item needs a reason, kept in the audit log.
 */
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdmin } from "../AdminApp";
import { admin } from "../api";
import type { ContentItemRow, ContentItemType } from "../types";
import {
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  ErrorNote,
  Pager,
  SearchBox,
  Select,
  Skeleton,
  adminError,
  fmtAgo,
  fmtBytes,
  fmtDate,
  fmtNumber,
  useLoad,
  useToast,
  useUrlQuery,
  type ConfirmSpec,
} from "../ui";

/** What the "kind" filter offers: uploaded pictures by kind, then styles. */
const KINDS: { value: string; type: ContentItemType; kind?: string }[] = [
  { value: "", type: "assets", kind: "stamps" },
  { value: "lines", type: "assets", kind: "lines" },
  { value: "line_styles", type: "line_styles" },
  { value: "text_styles", type: "text_styles" },
  { value: "shape_styles", type: "shape_styles" },
];

export function ContentModeration() {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    toast = useToast(),
    { can, guard } = useAdmin(),
    moderator = can("content.moderate"),
    { values, set, page } = useUrlQuery([
      "kind",
      "scope",
      "state",
      "q",
      "user",
    ] as const),
    choice = KINDS.find((k) => k.value === values.kind) ?? KINDS[0],
    // Without `content.moderate` only the official library is listed.
    scope = moderator ? values.scope || "users" : "official",
    { data, error, loading, reload } = useLoad(
      () =>
        admin.content.items({
          type: choice.type,
          kind: choice.kind,
          scope,
          state: values.state,
          q: values.q,
          user: values.user,
          page,
          per_page: 24,
        }),
      [choice.value, scope, values.state, values.q, values.user, page],
    ),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  function trash(i: ContentItemRow) {
    setConfirm({
      title: t("adToTrash"),
      body: t(i.official ? "adToTrashOfficialLead" : "adToTrashLead"),
      confirmLabel: t("adToTrash"),
      danger: true,
      reason: !i.official,
      run: async (reason) => {
        await guard(() => admin.content.trash(i.type, i.id, reason));
        toast("ok", t("adMovedToTrash"));
        void reload();
      },
    });
  }
  async function restore(i: ContentItemRow) {
    try {
      await guard(() => admin.content.restore(i.type, i.id));
      toast("ok", t("adRestored"));
      void reload();
    } catch (e) {
      toast("error", adminError(t, e));
    }
  }

  return (
    <>
      <p className="adm-bi-note">{t("adUploadsLead")}</p>
      <div className="adm-filters">
        <SearchBox
          value={values.q}
          onChange={(q) => set({ q })}
          placeholder={t("adUploadsSearch")}
        />
        <Select
          label={t("adColKind")}
          value={choice.value}
          onChange={(kind) => set({ kind })}
          options={KINDS.map((k) => ({
            value: k.value,
            label: t(`adUpKind_${k.value || "stamps"}`),
          }))}
        />
        {moderator && (
          <Select
            label={t("adUpScope")}
            value={values.scope}
            onChange={(s) => set({ scope: s })}
            options={[
              { value: "", label: t("adUpScope_users") },
              { value: "official", label: t("adUpScope_official") },
              { value: "all", label: t("adUpScope_all") },
            ]}
          />
        )}
        <Select
          label={t("adFilterState")}
          value={values.state}
          onChange={(state) => set({ state })}
          options={[
            { value: "", label: t("adUpLive") },
            { value: "trashed", label: t("adInTrash") },
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
          <p className="adm-muted small">
            {t("adUploadsCount", { n: fmtNumber(data.meta.total, L) })}
          </p>
          <ul className="adm-map-grid">
            {data.data.map((i) => (
              <li key={i.id} className={i.deleted_at ? "trashed" : undefined}>
                {i.type === "assets" && (
                  <span className="adm-thumb contain">
                    {i.url ? (
                      <img src={i.url} alt="" loading="lazy" />
                    ) : (
                      <span className="adm-thumb-blank" />
                    )}
                    {i.deleted_at && (
                      <Badge tone="warn">{t("adInTrash")}</Badge>
                    )}
                  </span>
                )}
                <div className="adm-map-info">
                  <b title={i.name} dir="auto">
                    {i.name}
                  </b>
                  {i.owner ? (
                    <Link
                      href={`/admin/users/${i.owner.id}`}
                      className="adm-map-owner"
                      dir="auto"
                      title={i.owner.email}
                    >
                      {i.owner.name}
                    </Link>
                  ) : (
                    <small>{t("adUpScope_official")}</small>
                  )}
                  <span className="adm-item-meta">
                    {i.type === "assets" ? (
                      <span>
                        {i.width}×{i.height} · {fmtBytes(i.bytes ?? 0, L)} ·{" "}
                        {fmtAgo(i.created_at, L)}
                      </span>
                    ) : (
                      <span>
                        {i.deleted_at && (
                          <>
                            <Badge tone="warn">{t("adInTrash")}</Badge>{" "}
                          </>
                        )}
                        {fmtAgo(i.created_at, L)}
                      </span>
                    )}
                    {i.pack && (
                      <span>{t("adInPack", { name: i.pack.name })}</span>
                    )}
                    {i.deleted_at && i.purge_at && (
                      <span>
                        {t("adPurgeOn", { at: fmtDate(i.purge_at, L) })}
                      </span>
                    )}
                    {i.removed_reason && <q dir="auto">{i.removed_reason}</q>}
                  </span>
                </div>
                <div className="adm-map-actions">
                  {i.deleted_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => restore(i)}
                    >
                      {t("adRestore")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => trash(i)}>
                      {t("adToTrash")}
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
