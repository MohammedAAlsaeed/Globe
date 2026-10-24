"use client";
/**
 * Controls & shortcuts: how the editor answers each kind of input, as
 * settings the person can change and a guide to what everything does.
 *
 *   Mouse        the wheel, zoom speed and direction, the middle button,
 *                Space + drag, Ctrl + wheel with stamps
 *   Trackpad     two-finger scrolling and pinching
 *   Touch & pen  what one finger does, pinch, touch and hold, pen pressure,
 *                palm rejection and the pen's side button
 *   Keyboard     every shortcut, each one re-assignable (press the new key;
 *                a key already used elsewhere is shown before it's taken)
 *
 * Used in a dialog inside the editor ("?", the Edit menu or the status bar) and as
 * its own page (/settings/controls). Everything is saved as it changes
 * (../controls, ../shortcuts) and follows the account (../controlsSync).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Glyph } from "../glyphs";
import { Slider, Toggle } from "./EditorControls";
import {
  DEFAULT_CONTROLS,
  applyPressure,
  sanitizeControls,
  setControls,
  updateControls,
  useControls,
  type ControlSettings,
} from "../controls";
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  formatBinding,
  normalizeBinding,
  resolveBindings,
  setShortcutOverrides,
  shortcutConflicts,
  shortcutDef,
  shortcutOverrides,
  useShortcuts,
  type ShortcutDef,
  type ShortcutId,
  type ShortcutOverrides,
} from "../shortcuts";
import { useAuth } from "../../account/AuthProvider";

type T = (k: string, o?: Record<string, unknown>) => string;
export type ControlsTab = "mouse" | "trackpad" | "touch" | "keys";
const TABS: { id: ControlsTab; icon: string }[] = [
  { id: "mouse", icon: "mouse" },
  { id: "trackpad", icon: "trackpad" },
  { id: "touch", icon: "touch" },
  { id: "keys", icon: "keyboard" },
];

/** A first guess at the tab that matters to this device. */
function guessTab(): ControlsTab {
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(pointer: coarse)").matches
  )
    return "touch";
  return "mouse";
}

function Choice<V extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: V;
  options: { id: V; label: string }[];
  onChange: (v: V) => void;
  hint?: string;
}) {
  return (
    <div className="mm-ct-row">
      <span className="mm-ct-label">{label}</span>
      <div className="mm-bp-segment small" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={value === o.id}
            className={value === o.id ? "active" : ""}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="mm-ct-hint">{hint}</p>}
    </div>
  );
}

function Glance({ t, rows }: { t: T; rows: string[] }) {
  return (
    <section className="mm-ct-section">
      <h3>{t("ctAtAGlance")}</h3>
      <dl className="mm-ct-glance">
        {rows.map((r) => (
          <Fragment key={r}>
            <dt>{t(`ctIn_${r}`)}</dt>
            <dd>{t(`ctDo_${r}`)}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/** The wheel setting, shared by the Mouse and Trackpad tabs. */
function WheelSetting({ t, c }: { t: T; c: ControlSettings }) {
  return (
    <Choice
      label={t("ctWheel")}
      value={c.wheel}
      onChange={(wheel) => updateControls({ wheel })}
      options={[
        { id: "auto", label: t("ctWheel_auto") },
        { id: "mouse", label: t("ctWheel_mouse") },
        { id: "trackpad", label: t("ctWheel_trackpad") },
      ]}
      hint={t(`ctWheel_${c.wheel}Hint`)}
    />
  );
}

function PressureCurvePreview({
  curve,
}: {
  curve: ControlSettings["pen"]["curve"];
}) {
  const pts = Array.from({ length: 21 }, (_, i) => {
    const x = i / 20;
    return `${(x * 60).toFixed(1)},${(40 - applyPressure(x, curve) * 40).toFixed(1)}`;
  }).join(" ");
  return (
    <svg
      className="mm-ct-curve"
      viewBox="-2 -2 64 44"
      width="64"
      height="44"
      aria-hidden="true"
    >
      <path d="M0 40H60M0 0V40" />
      <polyline points={pts} />
    </svg>
  );
}

// ---- Keyboard ------------------------------------------------------------------------------------
/** A key as shown in the list: number-pad keys say so ("Num 5"), so they don't look like doubles. */
function keyLabel(k: string): string {
  const parts = k.split("+"),
    code = parts[parts.length - 1];
  if (!code.startsWith("Numpad")) return formatBinding(k);
  const sym =
    code === "NumpadAdd"
      ? "+"
      : code === "NumpadSubtract"
        ? "−"
        : code.slice(6);
  const mods =
    parts.length > 1
      ? formatBinding([...parts.slice(0, -1), "KeyX"].join("+")).replace(
          /X$/,
          "",
        )
      : "";
  return `${mods}Num ${sym}`;
}

/** The binding a key press stands for ("Mod+Shift+KeyZ"), or null for a lone modifier. */
function bindingOf(e: KeyboardEvent): string | null {
  if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(e.code)) return null;
  const mods = [
    e.ctrlKey || e.metaKey ? "Mod" : "",
    e.shiftKey ? "Shift" : "",
    e.altKey ? "Alt" : "",
  ].filter(Boolean);
  return [...mods, e.code].join("+");
}

function KeyboardTab({ t, c }: { t: T; c: ControlSettings }) {
  const bindings = useShortcuts();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [problem, setProblem] = useState<{
    id: ShortcutId;
    text: string;
    binding?: string;
    other?: ShortcutId;
  } | null>(null);

  const apply = (next: ShortcutOverrides) => setShortcutOverrides(next);
  const keysOf = (id: ShortcutId) => [...bindings[id]];
  const setKeys = (
    id: ShortcutId,
    keys: string[],
    base = shortcutOverrides(),
  ) => {
    const def = shortcutDef(id);
    const next: ShortcutOverrides = { ...base };
    if (
      keys.length === def.keys.length &&
      keys.every((k, i) => k === def.keys[i])
    )
      delete next[id];
    else next[id] = keys;
    return next;
  };

  // Recording: the next key pressed becomes the action's key.
  useEffect(() => {
    if (!recording) return;
    const id = recording;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setRecording(null);
        return;
      }
      const raw = bindingOf(e);
      if (!raw) return;
      const binding = normalizeBinding(raw);
      setRecording(null);
      if (!binding) {
        setProblem({ id, text: t("ctUnsupportedKey") });
        return;
      }
      if (keysOf(id).includes(binding)) return;
      const next = setKeys(id, [...keysOf(id), binding]);
      const clash = shortcutConflicts(resolveBindings(next)).find(
        (x) => (x.a === id || x.b === id) && x.key === binding,
      );
      if (clash) {
        const other = clash.a === id ? clash.b : clash.a;
        setProblem({
          id,
          binding,
          other,
          text: t("ctConflict", {
            key: formatBinding(binding),
            action: t(shortcutDef(other).labelKey),
          }),
        });
        return;
      }
      setProblem(null);
      apply(next);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const replace = () => {
    if (!problem?.binding || !problem.other) return;
    const { id, binding, other } = problem;
    let next = setKeys(id, [...keysOf(id), binding]);
    next = setKeys(
      other,
      keysOf(other).filter((k) => k !== binding),
      next,
    );
    apply(next);
    setProblem(null);
  };

  const q = query.trim().toLowerCase();
  const visible = (s: ShortcutDef) =>
    !q ||
    t(s.labelKey).toLowerCase().includes(q) ||
    bindings[s.id as ShortcutId].some((k) =>
      formatBinding(k).toLowerCase().includes(q),
    );
  const conflicts = useMemo(() => shortcutConflicts(bindings), [bindings]);
  const anyCustom = Object.keys(shortcutOverrides()).length > 0;

  return (
    <>
      <section className="mm-ct-section">
        <h3>{t("ctSettings")}</h3>
        <Slider
          label={t("ctPanStep")}
          value={c.panStep}
          min={10}
          max={600}
          step={10}
          defaultValue={DEFAULT_CONTROLS.panStep}
          format={(v) => `${v} px`}
          onChange={(panStep) => updateControls({ panStep })}
        />
        <Slider
          label={t("ctRotateStep")}
          value={c.rotateStep}
          min={1}
          max={90}
          step={1}
          defaultValue={DEFAULT_CONTROLS.rotateStep}
          format={(v) => `${v}°`}
          onChange={(rotateStep) => updateControls({ rotateStep })}
        />
      </section>
      <section className="mm-ct-section">
        <div className="mm-ct-keys-head">
          <div className="mm-st-search">
            <Glyph name="search" size={14} />
            <input
              type="search"
              value={query}
              placeholder={t("ctSearchKeys")}
              aria-label={t("ctSearchKeys")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className="mm-ct-link"
            disabled={!anyCustom}
            onClick={() => apply({})}
          >
            {t("ctResetAll")}
          </button>
        </div>
        {conflicts.length > 0 && (
          <p className="mm-ct-warn" role="alert">
            {t("ctConflictsFound", {
              list: conflicts
                .map(
                  (x) =>
                    `${formatBinding(x.key)} (${t(shortcutDef(x.a).labelKey)} / ${t(shortcutDef(x.b).labelKey)})`,
                )
                .join(", "),
            })}
          </p>
        )}
        <p className="mm-ct-hint">{t("ctKeysNote")}</p>
        {SHORTCUT_GROUPS.map((group) => {
          const list = (SHORTCUTS as readonly ShortcutDef[]).filter(
            (s) => s.group === group && visible(s),
          );
          if (!list.length) return null;
          return (
            <div key={group} className="mm-ct-group">
              <h4>{t(`kbGroup_${group}`)}</h4>
              {list.map((s) => {
                const id = s.id as ShortcutId;
                const keys = bindings[id];
                const changed = id in shortcutOverrides();
                return (
                  <div
                    key={id}
                    className={`mm-ct-key-row ${recording === id ? "recording" : ""}`}
                  >
                    <div className="mm-ct-key-name">
                      <span>{t(s.labelKey)}</span>
                      {!s.contexts.includes("global") && (
                        <small>
                          {s.contexts
                            .map((x) => t(`ctContext_${x}`))
                            .join(" · ")}
                        </small>
                      )}
                    </div>
                    <div className="mm-ct-key-keys">
                      {keys.length === 0 && (
                        <span className="mm-ct-nokey">{t("ctNoKey")}</span>
                      )}
                      {keys.map((k) => (
                        <span key={k} className="mm-ct-kbd">
                          <kbd>{keyLabel(k)}</kbd>
                          {s.customizable && (
                            <button
                              aria-label={t("ctRemoveKey", {
                                key: keyLabel(k),
                              })}
                              title={t("ctRemoveKey", { key: keyLabel(k) })}
                              onClick={() =>
                                apply(
                                  setKeys(
                                    id,
                                    keys.filter((x) => x !== k),
                                  ),
                                )
                              }
                            >
                              <Glyph name="close" size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                      {s.customizable ? (
                        <>
                          <button
                            className="mm-ct-add"
                            onClick={() =>
                              setRecording(recording === id ? null : id)
                            }
                            aria-pressed={recording === id}
                          >
                            {recording === id ? (
                              t("ctPressKey")
                            ) : (
                              <Glyph name="plus" size={12} />
                            )}
                            {recording !== id && (
                              <span className="mm-visually-hidden">
                                {t("ctAddKey")}
                              </span>
                            )}
                          </button>
                          {changed && (
                            <button
                              className="mm-ct-reset"
                              title={t("ctResetAction")}
                              aria-label={t("ctResetAction")}
                              onClick={() =>
                                apply(setKeys(id, [...shortcutDef(id).keys]))
                              }
                            >
                              <Glyph name="undo" size={12} />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="mm-ct-fixed">{t("ctFixedKey")}</span>
                      )}
                    </div>
                    {problem?.id === id && (
                      <div className="mm-ct-problem" role="alert">
                        <span>{problem.text}</span>
                        {problem.binding && (
                          <button className="mm-ct-link" onClick={replace}>
                            {t("ctReplace")}
                          </button>
                        )}
                        <button
                          className="mm-ct-link"
                          onClick={() => setProblem(null)}
                        >
                          {t("ctCancel")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!SHORTCUTS.some((s) => visible(s)) && (
          <p className="mm-ct-hint">{t("ctNoResults")}</p>
        )}
      </section>
    </>
  );
}

// ---- export / import ---------------------------------------------------------------------------
const FILE_FORMAT = "al-idrisi-controls";
function exportFile(c: ControlSettings) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: FILE_FORMAT,
          version: 1,
          controls: c,
          shortcuts: shortcutOverrides(),
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "controls.al-idrisi.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
/** A controls file → applied; false when it isn't one. */
export function importControls(text: string): boolean {
  try {
    const v = JSON.parse(text) as {
      format?: string;
      controls?: unknown;
      shortcuts?: unknown;
    };
    if (!v || v.format !== FILE_FORMAT) return false;
    setControls(sanitizeControls(v.controls));
    const sc = v.shortcuts;
    setShortcutOverrides(
      sc && typeof sc === "object" && !Array.isArray(sc)
        ? (sc as ShortcutOverrides)
        : {},
    );
    return true;
  } catch {
    return false;
  }
}

// ---- the whole settings view ---------------------------------------------------------------------
export function ControlsSettings({
  t,
  initialTab,
}: {
  t: T;
  initialTab?: ControlsTab;
}) {
  const c = useControls();
  const { user } = useAuth();
  const [tab, setTab] = useState<ControlsTab>(() => initialTab ?? guessTab());
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resetSection = (keys: (keyof ControlSettings)[]) => {
    const next = { ...c };
    for (const k of keys)
      (next as Record<string, unknown>)[k] = DEFAULT_CONTROLS[k];
    setControls(next);
  };

  return (
    <div className="mm-ct">
      <div className="mm-ct-tabs" role="tablist" aria-label={t("ctTitle")}>
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={tab === x.id ? "active" : ""}
            onClick={() => setTab(x.id)}
          >
            <Glyph name={x.icon} size={16} />
            <span>{t(`ctTab_${x.id}`)}</span>
          </button>
        ))}
      </div>

      <div className="mm-ct-body" role="tabpanel">
        {tab === "mouse" && (
          <>
            <section className="mm-ct-section">
              <h3>{t("ctSettings")}</h3>
              <WheelSetting t={t} c={c} />
              <Slider
                label={t("ctZoomSpeed")}
                value={c.zoomSpeed}
                min={0.25}
                max={3}
                step={0.05}
                defaultValue={DEFAULT_CONTROLS.zoomSpeed}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(zoomSpeed) => updateControls({ zoomSpeed })}
              />
              <Toggle
                label={t("ctZoomToCursor")}
                checked={c.zoomToCursor}
                onChange={(zoomToCursor) => updateControls({ zoomToCursor })}
              />
              <Toggle
                label={t("ctInvertZoom")}
                checked={c.invertZoom}
                onChange={(invertZoom) => updateControls({ invertZoom })}
              />
              <Toggle
                label={t("ctSmoothZoom")}
                checked={c.smoothZoom}
                onChange={(smoothZoom) => updateControls({ smoothZoom })}
              />
              <Toggle
                label={t("ctSpacePan")}
                checked={c.spacePan}
                onChange={(spacePan) => updateControls({ spacePan })}
              />
              <Choice
                label={t("ctMiddleButton")}
                value={c.middleButton}
                onChange={(middleButton) => updateControls({ middleButton })}
                options={[
                  { id: "pan", label: t("ctMiddle_pan") },
                  { id: "none", label: t("ctMiddle_none") },
                ]}
              />
              <Choice
                label={t("ctCtrlWheel")}
                value={c.ctrlWheel}
                onChange={(ctrlWheel) => updateControls({ ctrlWheel })}
                options={[
                  { id: "zoom", label: t("ctCtrlWheel_zoom") },
                  { id: "rotate", label: t("ctCtrlWheel_rotate") },
                ]}
              />
              <button
                className="mm-ct-link"
                onClick={() =>
                  resetSection([
                    "wheel",
                    "zoomSpeed",
                    "zoomToCursor",
                    "invertZoom",
                    "smoothZoom",
                    "spacePan",
                    "middleButton",
                    "ctrlWheel",
                  ])
                }
              >
                {t("ctResetSection")}
              </button>
            </section>
            <Glance
              t={t}
              rows={[
                "leftClick",
                "leftDrag",
                "double",
                "right",
                "middle",
                "wheel",
                "shiftWheel",
                "altWheel",
                "space",
                "shiftClick",
                "altDrag",
                "shiftDrag",
              ]}
            />
          </>
        )}

        {tab === "trackpad" && (
          <>
            <section className="mm-ct-section">
              <h3>{t("ctSettings")}</h3>
              <WheelSetting t={t} c={c} />
              <Slider
                label={t("ctZoomSpeed")}
                value={c.zoomSpeed}
                min={0.25}
                max={3}
                step={0.05}
                defaultValue={DEFAULT_CONTROLS.zoomSpeed}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(zoomSpeed) => updateControls({ zoomSpeed })}
              />
              <Toggle
                label={t("ctInvertZoom")}
                checked={c.invertZoom}
                onChange={(invertZoom) => updateControls({ invertZoom })}
              />
              <button
                className="mm-ct-link"
                onClick={() =>
                  resetSection(["wheel", "zoomSpeed", "invertZoom"])
                }
              >
                {t("ctResetSection")}
              </button>
            </section>
            <Glance
              t={t}
              rows={["twoScroll", "pinch", "twoClick", "space", "hand"]}
            />
          </>
        )}

        {tab === "touch" && (
          <>
            <section className="mm-ct-section">
              <h3>{t("ctTouchHeading")}</h3>
              <Toggle
                label={t("ctFingerDraws")}
                checked={c.touch.fingerDraws}
                onChange={(fingerDraws) =>
                  updateControls({ touch: { fingerDraws } })
                }
              />
              <p className="mm-ct-hint">{t("ctFingerDrawsHint")}</p>
              <Toggle
                label={t("ctPinchZoom")}
                checked={c.touch.pinchZoom}
                onChange={(pinchZoom) =>
                  updateControls({ touch: { pinchZoom } })
                }
              />
              <Toggle
                label={t("ctLongPress")}
                checked={c.touch.longPress}
                onChange={(longPress) =>
                  updateControls({ touch: { longPress } })
                }
              />
              {c.touch.longPress && (
                <Slider
                  label={t("ctLongPressMs")}
                  value={c.touch.longPressMs}
                  min={300}
                  max={1500}
                  step={50}
                  defaultValue={DEFAULT_CONTROLS.touch.longPressMs}
                  format={(v) => `${(v / 1000).toFixed(2)} s`}
                  onChange={(longPressMs) =>
                    updateControls({ touch: { longPressMs } })
                  }
                />
              )}
            </section>
            <section className="mm-ct-section">
              <h3>{t("ctPenHeading")}</h3>
              <Toggle
                label={t("ctPressure")}
                checked={c.pen.pressure}
                onChange={(pressure) => updateControls({ pen: { pressure } })}
              />
              {c.pen.pressure && (
                <div className="mm-ct-curve-row">
                  <Choice
                    label={t("ctCurve")}
                    value={c.pen.curve}
                    onChange={(curve) => updateControls({ pen: { curve } })}
                    options={[
                      { id: "soft", label: t("ctCurve_soft") },
                      { id: "linear", label: t("ctCurve_linear") },
                      { id: "firm", label: t("ctCurve_firm") },
                    ]}
                  />
                  <PressureCurvePreview curve={c.pen.curve} />
                </div>
              )}
              <Toggle
                label={t("ctPalm")}
                checked={c.pen.palmRejection}
                onChange={(palmRejection) =>
                  updateControls({ pen: { palmRejection } })
                }
              />
              <Choice
                label={t("ctSideButton")}
                value={c.pen.sideButton}
                onChange={(sideButton) =>
                  updateControls({ pen: { sideButton } })
                }
                options={[
                  { id: "pan", label: t("ctSide_pan") },
                  { id: "menu", label: t("ctSide_menu") },
                  { id: "none", label: t("ctSide_none") },
                ]}
              />
              <button
                className="mm-ct-link"
                onClick={() => resetSection(["touch", "pen"])}
              >
                {t("ctResetSection")}
              </button>
            </section>
            <Glance
              t={t}
              rows={[
                "tap",
                "oneFinger",
                "twoFingers",
                "hold",
                "doubleTap",
                "pen",
              ]}
            />
            <p className="mm-ct-hint">{t("ctTouchNote")}</p>
          </>
        )}

        {tab === "keys" && <KeyboardTab t={t} c={c} />}
      </div>

      <div className="mm-ct-foot">
        <span>{user ? t("ctSavedAccount") : t("ctSavedLocal")}</span>
        {note && (
          <span className={note.ok ? "mm-ct-ok" : "mm-ct-warn"}>
            {note.text}
          </span>
        )}
        <span className="mm-ct-foot-actions">
          <button className="mm-ct-link" onClick={() => exportFile(c)}>
            <Glyph name="download" size={13} /> {t("ctExport")}
          </button>
          <button
            className="mm-ct-link"
            onClick={() => fileRef.current?.click()}
          >
            <Glyph name="upload" size={13} /> {t("ctImport")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="mm-visually-hidden"
            tabIndex={-1}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const ok = importControls(await file.text());
              setNote({ ok, text: t(ok ? "ctImported" : "ctImportError") });
            }}
          />
        </span>
      </div>
    </div>
  );
}

/** The settings in a dialog over the editor. */
export function ControlsDialog({
  t,
  onClose,
  initialTab,
}: {
  t: T;
  onClose: () => void;
  initialTab?: ControlsTab;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="mm-export-dialog mm-ct-dialog"
      aria-labelledby="mm-ct-title"
      onCancel={(e) => {
        e.preventDefault();
        // Esc first stops a key being recorded (handled there); otherwise it closes.
        onClose();
      }}
    >
      <header className="mm-export-head">
        <div>
          <h2 id="mm-ct-title">{t("ctTitle")}</h2>
          <p>{t("ctSubtitle")}</p>
        </div>
        <button
          className="mm-export-close"
          onClick={onClose}
          aria-label={t("acUpgradeClose")}
        >
          <Glyph name="close" size={14} />
        </button>
      </header>
      <ControlsSettings t={t} initialTab={initialTab} />
    </dialog>
  );
}
