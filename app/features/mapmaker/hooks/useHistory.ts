"use client";
import { useCallback, useReducer } from "react";
import type { MMProject } from "../types";

/** Undo/redo for the map-creator project, mirroring the print studio's own
 * `useDocument` reducer (features/studio/hooks/useDocument.ts) so both
 * editors share the same history pattern.
 *
 * Changes can be *coalesced*: updates carrying the same key, close together
 * in time, become one undo step — a slider dragged across its range, or a
 * word typed into a text, is undone in one go instead of a step per pixel or
 * letter. `seal()` ends the current run early (a text's editing finished). */
interface HistoryState {
  present: MMProject;
  past: MMProject[];
  future: MMProject[];
  /** The key and time of the last coalescable update. */
  run: { key: string; at: number } | null;
}
type HistoryAction =
  | {
      type: "update";
      updater: (p: MMProject) => MMProject;
      coalesce?: string;
      at: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "seal" };

/** Updates with the same key this close together (ms) merge into one step. */
export const COALESCE_MS = 1200;

export function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  if (action.type === "update") {
    const next = action.updater(state.present);
    if (next === state.present) return state;
    const run = action.coalesce
      ? { key: action.coalesce, at: action.at }
      : null;
    if (
      run &&
      state.run &&
      state.run.key === run.key &&
      action.at - state.run.at < COALESCE_MS
    )
      return { present: next, past: state.past, future: [], run };
    return {
      present: next,
      past: [...state.past, state.present].slice(-60),
      future: [],
      run,
    };
  }
  if (action.type === "seal")
    return state.run ? { ...state, run: null } : state;
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      present: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
      run: null,
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      present: state.future[0],
      past: [...state.past, state.present],
      future: state.future.slice(1),
      run: null,
    };
  }
  return state;
}

export function useHistory(initial: MMProject) {
  const [history, dispatchHistory] = useReducer(historyReducer, {
    present: initial,
    past: [],
    future: [],
    run: null,
  });
  const updateProject = useCallback(
    (updater: (p: MMProject) => MMProject, coalesce?: string) =>
      dispatchHistory({ type: "update", updater, coalesce, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatchHistory({ type: "undo" }), []);
  const redo = useCallback(() => dispatchHistory({ type: "redo" }), []);
  const seal = useCallback(() => dispatchHistory({ type: "seal" }), []);
  return {
    project: history.present,
    updateProject,
    undo,
    redo,
    seal,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
