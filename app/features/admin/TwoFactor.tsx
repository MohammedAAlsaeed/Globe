"use client";
/**
 * Two-factor sign-in for the admin panel: setting it up (a QR code for an
 * authenticator app, a first code, recovery codes to keep), the code asked
 * once per session, and the fresh code sensitive changes ask for.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { encode } from "uqr";
import { admin } from "./api";
import { Icon } from "./icons";
import { Button, CopyButton, Dialog, Field, adminError } from "./ui";

/** The otpauth:// URI as a QR code, drawn as one SVG path. */
export function QrCode({
  value,
  size = 184,
}: {
  value: string;
  size?: number;
}) {
  const path = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, n: qr.size };
  }, [value]);
  return (
    <svg
      className="adm-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${path.n} ${path.n}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR"
    >
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#0d1636" />
    </svg>
  );
}

/** Six digits, with the phone's one-time-code autofill. */
export function CodeInput({
  value,
  onChange,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      className="adm-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      maxLength={7}
      dir="ltr"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
      }
      placeholder="000000"
    />
  );
}

/** The recovery codes, shown once: copy, download, and a promise to keep them. */
export function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation(),
    [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  return (
    <div className="adm-stack">
      <p className="adm-dialog-text">{t("adRecoveryLead")}</p>
      <ol className="adm-recovery" dir="ltr">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="adm-row">
        <CopyButton text={text} label={t("adCopy")} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(
              new Blob([`${t("adRecoveryFileTitle")}\n\n${text}\n`], {
                type: "text/plain",
              }),
            );
            a.download = "al-idrisi-admin-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          {t("adDownload")}
        </Button>
      </div>
      <label className="adm-check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        {t("adRecoverySaved")}
      </label>
      <Button variant="primary" disabled={!saved} onClick={onDone}>
        {t("adContinue")}
      </Button>
    </div>
  );
}

function GateCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="adm-gate">
      <div className="adm-gate-card">
        <span className="adm-gate-mark">
          <Icon name="shield" size={26} />
        </span>
        <h1>{title}</h1>
        <p className="adm-gate-lead">{lead}</p>
        {children}
      </div>
    </div>
  );
}

/** First visit: set up an authenticator app. */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(),
    [secret, setSecret] = useState<{ secret: string; uri: string } | null>(
      null,
    ),
    [code, setCode] = useState(""),
    [codes, setCodes] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSecret(await admin.twoFactor.setup());
    } catch (e) {
      setError(adminError(t, e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      setCodes(await admin.twoFactor.confirm(code));
    } catch (err) {
      setError(adminError(t, err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (codes)
    return (
      <GateCard title={t("adRecoveryTitle")} lead={t("adSetupDoneLead")}>
        <RecoveryCodes codes={codes} onDone={onDone} />
      </GateCard>
    );
  return (
    <GateCard title={t("adSetupTitle")} lead={t("adSetupLead")}>
      {!secret ? (
        <div className="adm-stack">
          <ol className="adm-steps">
            <li>{t("adSetupStep1")}</li>
            <li>{t("adSetupStep2")}</li>
            <li>{t("adSetupStep3")}</li>
          </ol>
          {error && <p className="adm-notice error">{error}</p>}
          <Button variant="primary" busy={busy} onClick={start}>
            {t("adSetupStart")}
          </Button>
        </div>
      ) : (
        <form className="adm-stack" onSubmit={confirm}>
          <div className="adm-qr-wrap">
            <QrCode value={secret.uri} />
            <div className="adm-secret">
              <span>{t("adSetupManual")}</span>
              <code dir="ltr">
                {secret.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
              <CopyButton text={secret.secret} label={t("adCopy")} />
            </div>
          </div>
          <Field label={t("adSetupCode")}>
            <CodeInput value={code} onChange={setCode} />
          </Field>
          {error && <p className="adm-notice error">{error}</p>}
          <Button
            variant="primary"
            type="submit"
            busy={busy}
            disabled={code.length !== 6}
          >
            {t("adSetupConfirm")}
          </Button>
        </form>
      )}
    </GateCard>
  );
}

/** Verifies a code (or a recovery code) for this session. */
function useVerify(onDone: () => void) {
  const { t } = useTranslation(),
    [code, setCode] = useState(""),
    [recovery, setRecovery] = useState(""),
    [useRecovery, setUseRecovery] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function submit(e?: FormEvent, typed = code) {
    e?.preventDefault();
    if (busy || (useRecovery ? recovery.trim().length < 8 : typed.length !== 6))
      return;
    setBusy(true);
    setError(null);
    try {
      await admin.twoFactor.verify(
        useRecovery ? { recovery_code: recovery.trim() } : { code: typed },
      );
      onDone();
    } catch (err) {
      setError(adminError(t, err));
      setCode("");
      setBusy(false);
    }
  }
  const form = (
    <form className="adm-stack" onSubmit={submit}>
      {useRecovery ? (
        <Field label={t("adRecoveryCode")}>
          <input
            value={recovery}
            autoFocus
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setRecovery(e.target.value)}
            placeholder="xxxxx-xxxxx"
          />
        </Field>
      ) : (
        <Field label={t("adCodeLabel")}>
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              // Six digits typed: send at once.
              if (v.length === 6) void submit(undefined, v);
            }}
          />
        </Field>
      )}
      {error && (
        <p className="adm-notice error" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" busy={busy}>
        {t("adVerify")}
      </Button>
      <button
        type="button"
        className="adm-link"
        onClick={() => {
          setUseRecovery((v) => !v);
          setError(null);
        }}
      >
        {useRecovery ? t("adUseApp") : t("adUseRecovery")}
      </button>
    </form>
  );
  return form;
}

export function TwoFactorVerify({
  onDone,
  email,
}: {
  onDone: () => void;
  email: string;
}) {
  const { t } = useTranslation();
  const form = useVerify(onDone);
  return (
    <GateCard
      title={t("adVerifyTitle")}
      lead={t("adVerifyLead", { email: `\u2068${email}\u2069` })}
    >
      {form}
    </GateCard>
  );
}

/** The fresh code a sensitive change asks for. */
export function StepUpDialog({
  open,
  onDone,
  onCancel,
}: {
  open: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} title={t("adStepUpTitle")} onClose={onCancel}>
      <p className="adm-dialog-text">{t("adStepUpLead")}</p>
      {open && <StepUpForm onDone={onDone} />}
    </Dialog>
  );
}

function StepUpForm({ onDone }: { onDone: () => void }) {
  return useVerify(onDone);
}
