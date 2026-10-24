// Controls: which device a wheel event comes from, what it does to the
// view, settings read from anywhere, pen pressure, two-finger gestures and
// the view's keyboard shortcuts.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONTROLS,
  applyPressure,
  clampZoom,
  classifyWheel,
  pinchState,
  sanitizeControls,
  wheelAction,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../features/mapmaker/controls.ts";
import {
  pressed,
  resolveBindings,
  shortcutConflicts,
} from "../features/mapmaker/shortcuts.ts";
import { controlsEn, controlsAr } from "../lib/locales/controls.ts";

const wheel = (over = {}) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  timeStamp: 1000,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
});

test("a mouse wheel and a trackpad are told apart (and a gesture keeps its kind)", () => {
  // Windows mouse notch, Firefox line steps: a wheel.
  assert.equal(classifyWheel(wheel({ deltaY: 100 }), null), "mouse");
  assert.equal(
    classifyWheel(wheel({ deltaY: 3, deltaMode: 1 }), null),
    "mouse",
  );
  // Fingers: fractions, sideways movement, small steps.
  assert.equal(classifyWheel(wheel({ deltaY: 2.5 }), null), "trackpad");
  assert.equal(
    classifyWheel(wheel({ deltaX: 4, deltaY: 1 }), null),
    "trackpad",
  );
  assert.equal(classifyWheel(wheel({ deltaY: 12 }), null), "trackpad");
  // A fast flick inside a trackpad gesture stays a trackpad.
  assert.equal(
    classifyWheel(wheel({ deltaY: 120, timeStamp: 1050 }), {
      kind: "trackpad",
      time: 1000,
    }),
    "trackpad",
  );
  assert.equal(
    classifyWheel(wheel({ deltaY: 120, timeStamp: 3000 }), {
      kind: "trackpad",
      time: 1000,
    }),
    "mouse",
  );
});

test("the wheel zooms or moves the view, as set", () => {
  const s = DEFAULT_CONTROLS;
  const up = wheelAction(wheel({ deltaY: -100 }), "mouse", s);
  assert.equal(up.kind, "zoom");
  assert.ok(up.factor > 1.15 && up.factor < 1.4, `${up.factor}`);
  const down = wheelAction(wheel({ deltaY: 100 }), "mouse", s);
  assert.ok(Math.abs(up.factor * down.factor - 1) < 1e-9, "in and out cancel");
  // Inverted, and faster.
  assert.ok(
    wheelAction(wheel({ deltaY: -100 }), "mouse", { ...s, invertZoom: true })
      .factor < 1,
  );
  assert.ok(
    wheelAction(wheel({ deltaY: -100 }), "mouse", { ...s, zoomSpeed: 2 })
      .factor > up.factor,
  );
  // A trackpad's two fingers move the view; its pinch (Ctrl) zooms.
  assert.deepEqual(
    wheelAction(wheel({ deltaX: 5, deltaY: -8 }), "trackpad", s),
    {
      kind: "pan",
      dx: 5,
      dy: -8,
    },
  );
  const pinch = wheelAction(
    wheel({ deltaY: -10, ctrlKey: true }),
    "trackpad",
    s,
  );
  assert.equal(pinch.kind, "zoom");
  assert.ok(pinch.factor > 1.05);
  // A mouse with Shift scrolls sideways; line steps become pixels.
  assert.deepEqual(
    wheelAction(wheel({ deltaY: 100, shiftKey: true }), "mouse", s),
    {
      kind: "pan",
      dx: 100,
      dy: 0,
    },
  );
  assert.deepEqual(
    wheelAction(wheel({ deltaY: 3, deltaMode: 1 }), "trackpad", s),
    { kind: "pan", dx: 0, dy: 48 },
  );
  assert.equal(clampZoom(100), ZOOM_MAX);
  assert.equal(clampZoom(0), ZOOM_MIN);
});

test("settings from storage, a file or the account are made safe", () => {
  assert.deepEqual(sanitizeControls(undefined), DEFAULT_CONTROLS);
  assert.deepEqual(sanitizeControls("nonsense"), DEFAULT_CONTROLS);
  const s = sanitizeControls({
    wheel: "trackpad",
    zoomSpeed: 99,
    panStep: -5,
    invertZoom: "yes",
    touch: { fingerDraws: false, longPressMs: 20 },
    pen: { curve: "wobbly", sideButton: "menu" },
    extra: 1,
  });
  assert.equal(s.wheel, "trackpad");
  assert.equal(s.zoomSpeed, 3);
  assert.equal(s.panStep, 10);
  assert.equal(s.invertZoom, false);
  assert.equal(s.touch.fingerDraws, false);
  assert.equal(s.touch.longPressMs, 300);
  assert.equal(s.touch.pinchZoom, true);
  assert.equal(s.pen.curve, "linear");
  assert.equal(s.pen.sideButton, "menu");
  assert.ok(!("extra" in s));
});

test("pen pressure curves keep the ends and bend the middle", () => {
  for (const c of ["soft", "linear", "firm"]) {
    assert.equal(applyPressure(0, c), 0);
    assert.equal(applyPressure(1, c), 1);
  }
  assert.ok(applyPressure(0.5, "soft") > 0.5);
  assert.equal(applyPressure(0.5, "linear"), 0.5);
  assert.ok(applyPressure(0.5, "firm") < 0.5);
  assert.equal(applyPressure(3, "linear"), 1);
});

test("two touches: their middle and how far apart", () => {
  assert.deepEqual(pinchState({ x: 0, y: 0 }, { x: 6, y: 8 }), {
    x: 3,
    y: 4,
    d: 10,
  });
});

test("the view's keys: zoom, fit, actual size, hand, grid and this guide", () => {
  const b = resolveBindings();
  const k = (code, mods = {}) => ({
    code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });
  assert.ok(pressed(k("Equal", { ctrlKey: true }), "view.zoomIn", b));
  assert.ok(pressed(k("Minus", { metaKey: true }), "view.zoomOut", b));
  assert.ok(pressed(k("Digit1", { shiftKey: true }), "view.fit", b));
  assert.ok(pressed(k("Digit0", { shiftKey: true }), "view.actual", b));
  assert.ok(pressed(k("KeyH"), "view.hand", b));
  assert.ok(pressed(k("Slash", { shiftKey: true }), "help.controls", b));
  // Shift + 1 fits; 1 alone is still the Select tool.
  assert.ok(!pressed(k("Digit1", { shiftKey: true }), "tool.select", b));
  assert.ok(pressed(k("Digit1"), "tool.select", b));
  assert.deepEqual(shortcutConflicts(b), []);
});

test("every controls string has its Arabic", () => {
  for (const key of Object.keys(controlsEn)) assert.ok(controlsAr[key], key);
  // Each "at a glance" input has its action.
  for (const key of Object.keys(controlsEn).filter((k) =>
    k.startsWith("ctIn_"),
  ))
    assert.ok(controlsEn[`ctDo_${key.slice(5)}`], key);
});
