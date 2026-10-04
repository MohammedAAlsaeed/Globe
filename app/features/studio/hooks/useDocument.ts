"use client";
import { useCallback, useReducer } from "react";
import { DEFAULT_DOCUMENT, type StudioDocument } from "../domain/types";
interface History {
  present: StudioDocument;
  past: StudioDocument[];
  future: StudioDocument[];
  version: number;
}
type Action =
  | { type: "change"; update: (old: StudioDocument) => StudioDocument }
  | { type: "replace"; document: StudioDocument }
  | { type: "undo" | "redo" };
function reducer(h: History, action: Action): History {
  if (action.type === "replace")
    return {
      present: action.document,
      past: [],
      future: [],
      version: h.version + 1,
    };
  if (action.type === "change") {
    const next = action.update(h.present);
    if (next === h.present) return h;
    return {
      present: next,
      past: [...h.past, h.present].slice(-40),
      future: [],
      version: h.version + 1,
    };
  }
  if (action.type === "undo" && h.past.length)
    return {
      present: h.past[h.past.length - 1],
      past: h.past.slice(0, -1),
      future: [h.present, ...h.future],
      version: h.version + 1,
    };
  if (action.type === "redo" && h.future.length)
    return {
      present: h.future[0],
      past: [...h.past, h.present],
      future: h.future.slice(1),
      version: h.version + 1,
    };
  return h;
}
/** Undo history spans geometry, printing and layers, but never changes the source file. */
export function useDocument() {
  const [history, dispatch] = useReducer(reducer, {
    present: DEFAULT_DOCUMENT,
    past: [],
    future: [],
    version: 0,
  });
  const change = useCallback(
    (update: (old: StudioDocument) => StudioDocument) =>
      dispatch({ type: "change", update }),
    [],
  );
  const replace = useCallback(
    (document: StudioDocument) => dispatch({ type: "replace", document }),
    [],
  );
  return {
    document: history.present,
    change,
    replace,
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    version: history.version,
  };
}
