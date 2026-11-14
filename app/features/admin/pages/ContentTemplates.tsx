"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails are signed URLs from the API */
/**
 * Official templates: starting maps for the "Create a map" dialog. Staff
 * draw a map in the editor, save it to their cloud maps, then publish a
 * copy of it here. The copy is independent: later edits to the map reach
 * the template only with "Update from map". Removing one moves it to the
 * trash for 30 days.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { maps } from "../../account/api";
import type { CloudMap } from "../../account/types";
import { useAdmin } from "../AdminApp";
import { admin } from "../api";
import type { AdminTemplate } from "../types";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  Skeleton,
  adminError,
  fmtAgo,
  fmtBytes,
  fmtDate,
  useLoad,
  useToast,
  type ConfirmSpec,
} from "../ui";
import { ApiError } from "@/lib/api/client";
import { PublishToggle, TierSelect } from "./Content";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** The server's refusal of a map that places personal uploads, in words. */
function templateError(t: T, e: unknown) {
  return e instanceof ApiError && e.code === "template_private_assets"
    ? t("adTplPrivateAssets", { n: e.body.count })
    : adminError(t, e);
}

export function ContentTemplates() {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    toast = useToast(),
    { guard } = useAdmin(),
    { data, error, reload, setData } = useLoad(
      () => admin.content.templates.list(),
      [],
    ),
    [busy, setBusy] = useState<string | null>(null),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null),
    [editing, setEditing] = useState<AdminTemplate | "new" | null>(null);

  const put = (x: AdminTemplate) =>
    setData((list) =>
      (list ?? []).some((y) => y.id === x.id)
        ? (list ?? []).map((y) => (y.id === x.id ? x : y))
        : [...(list ?? []), x],
    );

  async function change(
    x: AdminTemplate,
    patch: { tier?: number; published?: boolean },
  ) {
    setBusy(x.id);
    try {
      put(await guard(() => admin.content.templates.update(x.id, patch)));
      toast("ok", t("adSaved"));
    } catch (e) {
      toast("error", adminError(t, e));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Skeleton rows={4} />;
  return (
    <section className="adm-bi">
      <div className="adm-toolbar">
        <h2 className="adm-subhead">{t("adTplOfficial")}</h2>
        <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
          {t("adTplNew")}
        </Button>
      </div>
      <p className="adm-bi-note">{t("adTplLead")}</p>
      {data.length === 0 ? (
        <Empty title={t("adTplNone")} />
      ) : (
        <ul className="adm-map-grid">
          {data.map((x) => (
            <li key={x.id} className={x.deleted_at ? "trashed" : undefined}>
              <span className="adm-thumb">
                {x.thumbnail_url ? (
                  <img src={x.thumbnail_url} alt="" loading="lazy" />
                ) : (
                  <span className="adm-thumb-blank" />
                )}
                {x.deleted_at && <Badge tone="warn">{t("adInTrash")}</Badge>}
              </span>
              <div className="adm-map-info">
                <b title={x.name} dir="auto">
                  {x.name}
                </b>
                {x.name_ar && <span dir="rtl">{x.name_ar}</span>}
                <small>
                  {x.width}×{x.height} · {fmtBytes(x.bytes, L)} ·{" "}
                  {fmtAgo(x.updated_at, L)}
                </small>
                {x.deleted_at && x.purge_at && (
                  <small>
                    {t("adPurgeOn", { at: fmtDate(x.purge_at, L) })}
                  </small>
                )}
              </div>
              {x.deleted_at ? (
                <div className="adm-map-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await guard(() =>
                          admin.content.templates.restore(x.id),
                        );
                        toast("ok", t("adRestored"));
                        void reload();
                      } catch (e) {
                        toast("error", adminError(t, e));
                      }
                    }}
                  >
                    {t("adRestore")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="adm-map-actions">
                    <TierSelect
                      value={x.tier}
                      disabled={busy === x.id}
                      onChange={(tier) => change(x, { tier })}
                    />
                    <PublishToggle
                      value={x.published}
                      disabled={busy === x.id}
                      onChange={(published) => change(x, { published })}
                    />
                  </div>
                  <div className="adm-map-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(x)}
                    >
                      {t("adTplEdit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirm({
                          title: t("adToTrash"),
                          body: t("adTplTrashLead"),
                          confirmLabel: t("adToTrash"),
                          danger: true,
                          run: async () => {
                            await guard(() =>
                              admin.content.templates.trash(x.id),
                            );
                            toast("ok", t("adMovedToTrash"));
                            void reload();
                          },
                        })
                      }
                    >
                      {t("adToTrash")}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      {editing && (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(x) => {
            put(x);
            toast("ok", t("adSaved"));
          }}
        />
      )}
    </section>
  );
}

/** A new template from one of your maps, or an existing one's names — and,
 * optionally, a fresh copy of a map in its place. */
function TemplateDialog({
  template,
  onClose,
  onDone,
}: {
  template: AdminTemplate | null;
  onClose: () => void;
  onDone: (x: AdminTemplate) => void;
}) {
  const { t } = useTranslation(),
    { guard } = useAdmin(),
    mine = useLoad(() => maps.list().then((r) => r.data), []),
    [mapId, setMapId] = useState(""),
    [name, setName] = useState(template?.name ?? ""),
    [nameAr, setNameAr] = useState(template?.name_ar ?? ""),
    [tier, setTier] = useState(template?.tier ?? 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const list: CloudMap[] = mine.data ?? [],
    // A new template needs a map; an existing one keeps its copy unless one is picked.
    chosen = mapId || (template ? "" : (list[0]?.id ?? "")),
    ready = name.trim().length >= 2 && (template !== null || chosen !== "");

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const names = { name: name.trim(), name_ar: nameAr.trim() || null };
      onDone(
        await guard(() =>
          template
            ? admin.content.templates.update(template.id, {
                ...names,
                ...(chosen ? { map_id: chosen } : {}),
              })
            : admin.content.templates.create({
                ...names,
                map_id: chosen,
                tier,
              }),
        ),
      );
      onClose();
    } catch (e) {
      setError(templateError(t as T, e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={template ? t("adTplEdit") : t("adTplNew")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button variant="primary" busy={busy} disabled={!ready} onClick={go}>
            {template ? t("adSave") : t("adAddAsDraft")}
          </Button>
        </>
      }
    >
      <div className="adm-stack">
        <Field label={template ? t("adTplUpdate") : t("adTplFromMap")}>
          <select
            className="adm-select"
            value={chosen}
            onChange={(e) => {
              setMapId(e.target.value);
              const m = list.find((x) => x.id === e.target.value);
              if (m && !template && !name.trim()) setName(m.name);
            }}
          >
            {template && <option value="">{t("adTplKeepCopy")}</option>}
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.width}×{m.height})
              </option>
            ))}
          </select>
        </Field>
        {mine.data && list.length === 0 && (
          <p className="adm-notice">{t("adTplNoMaps")}</p>
        )}
        <Field label={t("adTplNameEn")}>
          <input
            value={name}
            maxLength={80}
            dir="auto"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("adTplNameAr")}>
          <input
            value={nameAr}
            maxLength={80}
            dir="rtl"
            onChange={(e) => setNameAr(e.target.value)}
          />
        </Field>
        {!template && (
          <Field label={t("adTier")}>
            <TierSelect value={tier} onChange={setTier} />
          </Field>
        )}
        <p className="adm-muted small">{t("adTplNote")}</p>
        {error && <p className="adm-notice error">{error}</p>}
      </div>
    </Dialog>
  );
}
