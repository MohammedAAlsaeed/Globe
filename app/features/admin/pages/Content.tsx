"use client";
/**
 * The official library: stamp and line-art packs, and the line, text and
 * shape styles everyone gets. Here staff decide which plan each item needs
 * and when it goes live; the art itself is made in the editor (styles) or
 * uploaded in the library (stamps). Every change is audited.
 */
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  library,
  lineStyles,
  shapeStyles,
  textStyles,
} from "../../account/api";
import type { AssetPack } from "../../account/types";
import { RequirePermission, useAdmin } from "../AdminApp";
import { Icon } from "../icons";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  PageHead,
  Skeleton,
  adminError,
  fmtNumber,
  useLoad,
  useToast,
  useUrlQuery,
  type ConfirmSpec,
} from "../ui";

const TIERS = ["explorer", "cartographer", "atlas"];
const TABS = ["packs", "lines", "texts", "shapes"] as const;
type Tab = (typeof TABS)[number];

export function Content() {
  return (
    <RequirePermission permission="content.manage">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const { t } = useTranslation(),
    { values, set } = useUrlQuery(["tab"] as const),
    tab = (TABS as readonly string[]).includes(values.tab)
      ? (values.tab as Tab)
      : "packs";
  return (
    <>
      <PageHead title={t("adNavContent")} lead={t("adContentLead")} />
      <div className="adm-tabs" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => set({ tab: k === "packs" ? null : k })}
          >
            {t(`adTab_${k}`)}
          </button>
        ))}
      </div>
      {tab === "packs" ? <Packs /> : <Styles kind={tab} />}
    </>
  );
}

function TierSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <select
      className="adm-select sm"
      value={value}
      disabled={disabled}
      aria-label={t("adTier")}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {TIERS.map((p, i) => (
        <option key={p} value={i}>
          {t("adTierFrom", { plan: t(`acPlan_${p}`) })}
        </option>
      ))}
    </select>
  );
}

function PublishToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`adm-switch${value ? " on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!value)}
    >
      <span />
      {value ? t("adPublished") : t("adDraft")}
    </button>
  );
}

// ---- packs ---------------------------------------------------------------------------
function Packs() {
  const { t, i18n } = useTranslation(),
    toast = useToast(),
    { data, error, reload, setData } = useLoad(async () => {
      const [stamps, lines] = await Promise.all([
        library.packs(),
        library.linePacks(),
      ]);
      return [...stamps, ...lines].filter((p) => p.official);
    }, []),
    [busy, setBusy] = useState<string | null>(null),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null),
    [creating, setCreating] = useState(false);

  async function change(
    p: AssetPack,
    patch: { tier?: number; published?: boolean; name?: string },
  ) {
    setBusy(p.id);
    try {
      const np = await library.updatePack(p.id, patch);
      setData((data ?? []).map((x) => (x.id === p.id ? { ...x, ...np } : x)));
      toast("ok", t("adSaved"));
    } catch (e) {
      toast("error", adminError(t, e));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Skeleton rows={6} />;
  return (
    <>
      <div className="adm-toolbar">
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          {t("adNewPack")}
        </Button>
        <Link className="adm-btn ghost sm" href="/library">
          <Icon name="external" size={14} />
          {t("adManageStamps")}
        </Link>
      </div>
      {data.length === 0 ? (
        <Empty title={t("adNoPacks")}>{t("adNoPacksLead")}</Empty>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>{t("adColName")}</th>
              <th>{t("adColKind")}</th>
              <th className="num">{t("adColItems")}</th>
              <th>{t("adTier")}</th>
              <th>{t("adColStatus")}</th>
              <th>
                <span className="adm-sr-only">{t("adActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td>
                  <Badge>{t(`adKind_${p.kind}`)}</Badge>
                </td>
                <td className="num">
                  {fmtNumber(p.assets_count ?? 0, i18n.language)}
                </td>
                <td>
                  <TierSelect
                    value={p.tier}
                    disabled={busy === p.id}
                    onChange={(tier) => change(p, { tier })}
                  />
                </td>
                <td>
                  <PublishToggle
                    value={p.published}
                    disabled={busy === p.id}
                    onChange={(published) => change(p, { published })}
                  />
                </td>
                <td className="adm-row-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        title: t("adDeletePack"),
                        body: t("adDeletePackLead", { n: p.assets_count ?? 0 }),
                        confirmLabel: t("adDeleteForever"),
                        danger: true,
                        typed: p.name,
                        run: async () => {
                          await library.removePack(p.id);
                          setData(data.filter((x) => x.id !== p.id));
                          toast("ok", t("adDeleted"));
                        },
                      })
                    }
                  >
                    {t("adDelete")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      {creating && (
        <NewPackDialog
          onClose={() => setCreating(false)}
          onDone={(p) => {
            setData([...(data ?? []), p]);
            toast("ok", t("adSaved"));
          }}
        />
      )}
    </>
  );
}

function NewPackDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (p: AssetPack) => void;
}) {
  const { t } = useTranslation(),
    [name, setName] = useState(""),
    [kind, setKind] = useState<"stamps" | "lines">("stamps"),
    [tier, setTier] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      onDone(
        await library.createPack({
          name: name.trim(),
          kind,
          official: true,
          tier,
          published: false,
        }),
      );
      onClose();
    } catch (e) {
      setError(adminError(t, e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("adNewPack")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={name.trim().length < 2}
            onClick={go}
          >
            {t("adCreate")}
          </Button>
        </>
      }
    >
      <div className="adm-stack">
        <Field label={t("adColName")}>
          <input
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("adColKind")}>
          <div className="adm-seg" role="radiogroup">
            {(["stamps", "lines"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
              >
                {t(`adKind_${k}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("adTier")}>
          <TierSelect value={tier} onChange={setTier} />
        </Field>
        <p className="adm-muted small">{t("adNewPackNote")}</p>
        {error && <p className="adm-notice error">{error}</p>}
      </div>
    </Dialog>
  );
}

// ---- styles ---------------------------------------------------------------------------
type StyleKind = Exclude<Tab, "packs">;
interface StyleRow {
  id: string;
  name: string;
  official: boolean;
  tier: number;
  published: boolean;
  look: unknown;
}
const STYLE_API = {
  lines: lineStyles,
  texts: textStyles,
  shapes: shapeStyles,
} as unknown as Record<
  StyleKind,
  {
    list: () => Promise<{ data: StyleRow[] }>;
    create: (i: {
      name: string;
      look: unknown;
      official: boolean;
      tier: number;
      published: boolean;
    }) => Promise<StyleRow>;
    update: (
      id: string,
      p: { name?: string; tier?: number; published?: boolean },
    ) => Promise<StyleRow>;
    remove: (id: string) => Promise<void>;
  }
>;

function Styles({ kind }: { kind: StyleKind }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { guard } = useAdmin(),
    apiFor = STYLE_API[kind],
    { data, error, reload, setData } = useLoad(
      () => apiFor.list().then((r) => r.data),
      [kind],
    ),
    [busy, setBusy] = useState<string | null>(null),
    [confirm, setConfirm] = useState<ConfirmSpec | null>(null),
    [promote, setPromote] = useState(false),
    [renaming, setRenaming] = useState<StyleRow | null>(null);

  async function change(
    s: StyleRow,
    patch: { tier?: number; published?: boolean; name?: string },
  ) {
    setBusy(s.id);
    try {
      const ns = await guard(() => apiFor.update(s.id, patch));
      setData((data ?? []).map((x) => (x.id === s.id ? { ...x, ...ns } : x)));
      toast("ok", t("adSaved"));
    } catch (e) {
      toast("error", adminError(t, e));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Skeleton rows={6} />;
  const official = data.filter((s) => s.official),
    mine = data.filter((s) => !s.official && s.look);
  return (
    <>
      <div className="adm-toolbar">
        <Button
          variant="primary"
          size="sm"
          disabled={!mine.length}
          onClick={() => setPromote(true)}
        >
          {t("adPublishMine")}
        </Button>
        <span className="adm-muted small">
          {mine.length ? t("adPublishMineLead") : t("adPublishMineNone")}
        </span>
      </div>
      {official.length === 0 ? (
        <Empty title={t("adNoStyles")} />
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>{t("adColName")}</th>
              <th>{t("adTier")}</th>
              <th>{t("adColStatus")}</th>
              <th>
                <span className="adm-sr-only">{t("adActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {official.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                </td>
                <td>
                  <TierSelect
                    value={s.tier}
                    disabled={busy === s.id}
                    onChange={(tier) => change(s, { tier })}
                  />
                </td>
                <td>
                  <PublishToggle
                    value={s.published}
                    disabled={busy === s.id}
                    onChange={(published) => change(s, { published })}
                  />
                </td>
                <td className="adm-row-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRenaming(s)}
                  >
                    {t("adRename")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        title: t("adDeleteStyle"),
                        body: t("adDeleteStyleLead"),
                        confirmLabel: t("adDelete"),
                        danger: true,
                        run: async () => {
                          await guard(() => apiFor.remove(s.id));
                          setData(data.filter((x) => x.id !== s.id));
                          toast("ok", t("adDeleted"));
                        },
                      })
                    }
                  >
                    {t("adDelete")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      {renaming && (
        <RenameDialog
          name={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => change(renaming, { name })}
        />
      )}
      {promote && (
        <PromoteDialog
          mine={mine}
          onClose={() => setPromote(false)}
          onSave={async (src, name, tier) => {
            const created = await guard(() =>
              apiFor.create({
                name,
                look: src.look,
                official: true,
                tier,
                published: false,
              }),
            );
            setData([...(data ?? []), created]);
            toast("ok", t("adPromoted"));
          }}
        />
      )}
    </>
  );
}

function RenameDialog({
  name,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (n: string) => Promise<void>;
}) {
  const { t } = useTranslation(),
    [v, setV] = useState(name);
  return (
    <Dialog
      open
      title={t("adRename")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button
            variant="primary"
            disabled={!v.trim() || v.trim() === name}
            onClick={async () => {
              await onSave(v.trim());
              onClose();
            }}
          >
            {t("adSave")}
          </Button>
        </>
      }
    >
      <Field label={t("adColName")}>
        <input
          value={v}
          autoFocus
          maxLength={60}
          onChange={(e) => setV(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}

function PromoteDialog({
  mine,
  onClose,
  onSave,
}: {
  mine: StyleRow[];
  onClose: () => void;
  onSave: (src: StyleRow, name: string, tier: number) => Promise<void>;
}) {
  const { t } = useTranslation(),
    [id, setId] = useState(mine[0]?.id ?? ""),
    src = mine.find((m) => m.id === id),
    [name, setName] = useState(mine[0]?.name ?? ""),
    [tier, setTier] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      title={t("adPublishMine")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("adCancel")}</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!src || !name.trim()}
            onClick={async () => {
              if (!src) return;
              setBusy(true);
              setError(null);
              try {
                await onSave(src, name.trim(), tier);
                onClose();
              } catch (e) {
                setError(adminError(t, e));
                setBusy(false);
              }
            }}
          >
            {t("adAddAsDraft")}
          </Button>
        </>
      }
    >
      <div className="adm-stack">
        <Field label={t("adYourStyle")}>
          <select
            className="adm-select"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setName(mine.find((m) => m.id === e.target.value)?.name ?? "");
            }}
          >
            {mine.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("adOfficialName")}>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("adTier")}>
          <TierSelect value={tier} onChange={setTier} />
        </Field>
        <p className="adm-muted small">{t("adPromoteNote")}</p>
        {error && <p className="adm-notice error">{error}</p>}
      </div>
    </Dialog>
  );
}
