"use client";
/**
 * Keeps the person's controls and shortcuts the same on every device they
 * sign in on: the account holds a copy (GET/PUT auth/me/preferences) and
 * whichever copy changed last wins.
 *
 *   signing in     the account's copy is newer → it's applied here;
 *                  this device's is newer → it's sent up
 *   a change here  sent up a moment later (changes in a row go as one)
 *
 * Signed out, nothing leaves the device. Mounted once, for the whole app.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "../account/AuthProvider";
import { preferences } from "../account/api";
import {
  controls,
  controlsChangedAt,
  sanitizeControls,
  setControls,
  subscribeControls,
} from "./controls";
import {
  setShortcutOverrides,
  shortcutOverrides,
  subscribeShortcuts,
  type ShortcutOverrides,
} from "./shortcuts";

/** The account sends `{}` back as an object, but be lenient with lists. */
function overridesOf(v: unknown): ShortcutOverrides {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as ShortcutOverrides)
    : {};
}

export function ControlsSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  /** While applying the account's copy, its change events aren't sent back. */
  const applying = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true,
      timer: number | undefined;
    const push = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void preferences
          .put({
            controls: controls(),
            shortcuts: shortcutOverrides(),
            updated_at: controlsChangedAt() || Date.now(),
          })
          .catch(() => {
            // Offline or refused: this device keeps its copy; the next change retries.
          });
      }, 1200);
    };
    void preferences
      .get()
      .then((remote) => {
        if (!alive) return;
        const local = controlsChangedAt();
        if (remote.controls && remote.updated_at > local) {
          applying.current = true;
          setControls(sanitizeControls(remote.controls), {
            remote: remote.updated_at,
          });
          setShortcutOverrides(overridesOf(remote.shortcuts), {
            remote: remote.updated_at,
          });
          applying.current = false;
        } else if (local > (remote.updated_at ?? 0)) push();
      })
      .catch(() => {});
    const onChange = () => {
      if (!applying.current) push();
    };
    const offA = subscribeControls(onChange),
      offB = subscribeShortcuts(onChange);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      offA();
      offB();
    };
  }, [userId]);

  return null;
}
