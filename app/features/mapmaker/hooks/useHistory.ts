"use client";
import { useCallback, useReducer } from "react";
import type { MMProject } from "../types";

/** Undo/redo for the map-creator project, mirroring the print studio's own
 * `useDocument` reducer (features/studio/hooks/useDocument.ts) so both
 * editors share the same history pattern. */
interface HistoryState {
  present: MMProject;
  past: MMProject[];
  future: MMProject[];
}
type HistoryAction =
  | { type: "update"; updater: (p: MMProject) => MMProject }
  | { type: "undo" }
  | { type: "redo" };
function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "update") {
    const next = action.updater(state.present);
    if (next === state.present) return state;
    return { present: next, past: [...state.past, state.present].slice(-60), future: [] };
  }
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      present: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { present: state.future[0], past: [...state.past, state.present], future: state.future.slice(1) };
  }
  return state;
}

export function useHistory(initial: MMProject) {
  const [history, dispatchHistory] = useReducer(historyReducer, {
    present: initial,
    past: [],
    future: [],
  });
  const updateProject = useCallback(
    (updater: (p: MMProject) => MMProject) => dispatchHistory({ type: "update", updater }),
    [],
  );
  const undo = useCallback(() => dispatchHistory({ type: "undo" }), []);
  const redo = useCallback(() => dispatchHistory({ type: "redo" }), []);
  return {
    project: history.present,
    updateProject,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
