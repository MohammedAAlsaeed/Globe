/**
 * The editor's camera: moving and zooming the view of the map, whatever
 * asked for it (wheel, trackpad, touch, pen, keyboard, buttons).
 *
 * The map is drawn at `zoom` × "fit" inside a scrolling area with half a
 * screen of room around it, so it can be moved freely and the point under
 * the pointer can always stay put. Panning is scrolling. Zooming happens
 * in two steps, so it stays smooth on big maps:
 *
 *   preview   the drawn map is scaled at once with a CSS transform around
 *             the zoom point (cheap: no redraw), as many times as the wheel,
 *             pinch or keys ask;
 *   commit    shortly after the last change, the map is redrawn at the new
 *             zoom and the scroll set so that nothing moves on screen.
 *
 * A drawing gesture in progress delays the commit until it ends.
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { clampZoom } from "../controls";

export interface ViewNavigation {
  /** Zooms by `factor` at a point (client px; the middle of the view when omitted). */
  zoomAt(
    factor: number,
    at?: { x: number; y: number } | null,
    opts?: { smooth?: boolean },
  ): void;
  /** Sets the zoom (× fit) at the middle of the view, or at a point. */
  zoomTo(zoom: number, at?: { x: number; y: number } | null): void;
  /** Moves the view by screen pixels (positive: the map moves left/up). */
  panBy(dx: number, dy: number): void;
  /** Fits the whole map in the view, centred. */
  fit(): void;
  /** Puts the map's middle in the middle of the view (keeps the zoom). */
  center(): void;
  /** Applies a pending preview now. */
  commit(): void;
  /** The zoom being shown (the committed zoom × the preview). */
  shownZoom(): number;
}

/**
 * The box's layout top-left on screen: where it's drawn, less the preview's
 * move as shown right now (mid-glide, that isn't the target move yet).
 */
function layoutOrigin(box: HTMLElement) {
  const r = box.getBoundingClientRect(),
    shown = getComputedStyle(box).transform,
    m = new DOMMatrixReadOnly(shown && shown !== "none" ? shown : undefined);
  return { x: r.left - m.e, y: r.top - m.f };
}

export function useViewNavigation({
  containerRef,
  boxRef,
  zoom,
  setZoom,
  busy,
  commitDelay = 160,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  setZoom: (z: number) => void;
  /** True while a gesture must not see the map redrawn (a stroke…). */
  busy: () => boolean;
  commitDelay?: number;
}): ViewNavigation {
  const zoomRef = useRef(zoom);
  // The preview: translate (tx, ty) then scale s, about the box's top-left.
  const pv = useRef({ s: 1, tx: 0, ty: 0 });
  /** Where the box's top-left should be on screen after the redraw (client px). */
  const pending = useRef<{ left: number; top: number } | null>(null);
  /** After a redraw: put this map point (fraction) at this client point. */
  const anchor = useRef<{
    fx: number;
    fy: number;
    x: number;
    y: number;
  } | null>(null);
  const centerNext = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const busyRef = useRef(busy);
  useLayoutEffect(() => {
    busyRef.current = busy;
  });

  const style = useCallback(
    (smooth: boolean) => {
      const box = boxRef.current;
      if (!box) return;
      const { s, tx, ty } = pv.current;
      box.style.transformOrigin = "0 0";
      box.style.transition = smooth ? "transform 110ms ease-out" : "none";
      box.style.transform =
        s === 1 && !tx && !ty ? "" : `translate(${tx}px, ${ty}px) scale(${s})`;
    },
    [boxRef],
  );

  /** The latest `commit`, for retrying later. */
  const retry = useRef<() => void>(() => {});
  const commit = useCallback(() => {
    window.clearTimeout(timer.current);
    const box = boxRef.current;
    const { s, tx, ty } = pv.current;
    if (!box || (s === 1 && !tx && !ty)) return;
    if (busyRef.current()) {
      timer.current = window.setTimeout(() => retry.current(), 120);
      return;
    }
    const o = layoutOrigin(box);
    const next = clampZoom(zoomRef.current * s);
    // Where the preview puts the map's top-left (even if a glide toward it
    // is still running); the redraw keeps it there.
    pending.current = { left: o.x + tx, top: o.y + ty };
    if (next === zoomRef.current) {
      // Nothing to redraw (only a move): drop the preview and scroll instead.
      const el = containerRef.current;
      pv.current = { s: 1, tx: 0, ty: 0 };
      style(false);
      if (el) {
        const now = box.getBoundingClientRect();
        el.scrollLeft += now.left - pending.current.left;
        el.scrollTop += now.top - pending.current.top;
      }
      pending.current = null;
      return;
    }
    zoomRef.current = next;
    setZoom(next);
  }, [boxRef, containerRef, setZoom, style]);

  useLayoutEffect(() => {
    retry.current = commit;
  });

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, commitDelay);
  }, [commit, commitDelay]);

  // After a redraw at a new zoom: drop the preview and scroll so the map
  // shows exactly where the preview had it (or where an anchor asks).
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const box = boxRef.current,
      el = containerRef.current;
    if (!box || !el) return;
    if (pending.current) {
      pv.current = { s: 1, tx: 0, ty: 0 };
      style(false);
      const r = box.getBoundingClientRect();
      el.scrollLeft += r.left - pending.current.left;
      el.scrollTop += r.top - pending.current.top;
      pending.current = null;
    } else if (anchor.current) {
      const a = anchor.current;
      const r = box.getBoundingClientRect();
      el.scrollLeft += r.left + a.fx * r.width - a.x;
      el.scrollTop += r.top + a.fy * r.height - a.y;
      anchor.current = null;
    }
    if (centerNext.current) {
      centerNext.current = false;
      const r = box.getBoundingClientRect(),
        v = el.getBoundingClientRect();
      el.scrollLeft += r.left + r.width / 2 - (v.left + el.clientWidth / 2);
      el.scrollTop += r.top + r.height / 2 - (v.top + el.clientHeight / 2);
    }
  });

  const viewCenter = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const v = el.getBoundingClientRect();
    return { x: v.left + el.clientWidth / 2, y: v.top + el.clientHeight / 2 };
  }, [containerRef]);

  const zoomAt = useCallback<ViewNavigation["zoomAt"]>(
    (factor, at, opts) => {
      const box = boxRef.current;
      if (!box || !Number.isFinite(factor) || factor <= 0) return;
      const z = zoomRef.current,
        p = pv.current;
      const s = clampZoom(z * p.s * factor) / z,
        f = s / p.s;
      if (Math.abs(f - 1) < 1e-4) return;
      const point = at ?? viewCenter();
      // The box's layout origin on screen: where it is drawn, less the
      // preview's move as shown right now (mid-glide, that isn't p.tx yet).
      const o = layoutOrigin(box);
      const px = point.x - o.x,
        py = point.y - o.y;
      // Scale about the point: M' = T(p)·S(f)·T(−p)·M.
      pv.current = { s, tx: px + f * (p.tx - px), ty: py + f * (p.ty - py) };
      style(!!opts?.smooth);
      schedule();
    },
    [boxRef, schedule, style, viewCenter],
  );

  const panBy = useCallback<ViewNavigation["panBy"]>(
    (dx, dy) => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollLeft += dx;
      el.scrollTop += dy;
    },
    [containerRef],
  );

  const zoomTo = useCallback<ViewNavigation["zoomTo"]>(
    (z, at) => {
      const box = boxRef.current;
      if (!box) return;
      commit();
      const next = clampZoom(z);
      if (next === zoomRef.current) return;
      const point = at ?? viewCenter();
      const r = box.getBoundingClientRect();
      anchor.current = {
        fx: r.width ? (point.x - r.left) / r.width : 0.5,
        fy: r.height ? (point.y - r.top) / r.height : 0.5,
        x: point.x,
        y: point.y,
      };
      zoomRef.current = next;
      setZoom(next);
    },
    [boxRef, commit, setZoom, viewCenter],
  );

  const center = useCallback(() => {
    const box = boxRef.current,
      el = containerRef.current;
    if (!box || !el) return;
    const r = box.getBoundingClientRect(),
      v = el.getBoundingClientRect();
    el.scrollLeft += r.left + r.width / 2 - (v.left + el.clientWidth / 2);
    el.scrollTop += r.top + r.height / 2 - (v.top + el.clientHeight / 2);
  }, [boxRef, containerRef]);

  const fit = useCallback(() => {
    window.clearTimeout(timer.current);
    pv.current = { s: 1, tx: 0, ty: 0 };
    style(false);
    pending.current = null;
    anchor.current = null;
    centerNext.current = true;
    if (zoomRef.current === 1) {
      center();
      return;
    }
    zoomRef.current = 1;
    setZoom(1);
  }, [center, setZoom, style]);

  const shownZoom = useCallback(() => zoomRef.current * pv.current.s, []);

  return { zoomAt, zoomTo, panBy, fit, center, commit, shownZoom };
}
