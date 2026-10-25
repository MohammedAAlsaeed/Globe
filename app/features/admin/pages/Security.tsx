"use client";
/** Your own admin access: role and permissions, two-factor, recovery codes. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdmin } from "../AdminApp";
import { admin } from "../api";
import { RecoveryCodes } from "../TwoFactor";
import {
  Badge,
  Button,
  Card,
  Dialog,
  PageHead,
  StepUpCancelled,
  adminError,
  fmtDateTime,
  useToast,
} from "../ui";

export function Security() {
  const { t, i18n } = useTranslation(),
    { session, guard, reloadSession } = useAdmin(),
    toast = useToast(),
    [codes, setCodes] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    [now] = useState(() => Date.now());
  const left = session.two_factor.recovery_codes_left ?? 0;
  return (
    <>
      <PageHead title={t("adNavSecurity")} lead={t("adSecurityLead")} />
      <div className="adm-grid-2">
        <Card title={t("adYourRole")}>
          <p>
            <Badge tone="accent">{t(`adRole_${session.role}`)}</Badge>{" "}
            <span className="adm-muted">{t(`adRoleLead_${session.role}`)}</span>
          </p>
          <ul className="adm-perms">
            {session.permissions.map((p) => (
              <li key={p}>
                <code dir="ltr">{p}</code>
                <span>{t(`adPerm_${p.replace(".", "_")}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("adTwoFactor")}>
          <dl className="adm-kv">
            <dt>{t("adColStatus")}</dt>
            <dd>
              <Badge tone="ok">{t("adTwoFactorOn")}</Badge>
            </dd>
            <dt>{t("adRecoveryLeft")}</dt>
            <dd>
              {left}{" "}
              {left <= 2 && <Badge tone="warn">{t("adRecoveryLow")}</Badge>}
            </dd>
            <dt>{t("adStepUpOpen")}</dt>
            <dd>
              {session.two_factor.step_up_until &&
              session.two_factor.step_up_until * 1000 > now
                ? t("adUntil", {
                    at: fmtDateTime(
                      new Date(
                        session.two_factor.step_up_until * 1000,
                      ).toISOString(),
                      i18n.language,
                    ),
                  })
                : t("adNo")}
            </dd>
          </dl>
          <div className="adm-actions">
            <Button
              size="sm"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setCodes(await guard(() => admin.twoFactor.recoveryCodes()));
                } catch (e) {
                  if (!(e instanceof StepUpCancelled))
                    toast("error", adminError(t, e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("adNewRecoveryCodes")}
            </Button>
          </div>
          <p className="adm-muted small">{t("adLostPhone")}</p>
        </Card>
      </div>
      <Dialog
        open={!!codes}
        title={t("adRecoveryTitle")}
        onClose={() => {
          setCodes(null);
          void reloadSession();
        }}
      >
        {codes && (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes(null);
              void reloadSession();
            }}
          />
        )}
      </Dialog>
    </>
  );
}
