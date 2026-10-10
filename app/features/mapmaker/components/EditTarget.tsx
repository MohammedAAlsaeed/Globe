"use client";
/**
 * The edit target, shown at the top of the Brush and Land panels: which
 * layer the tool changes and *what* of it — the shape of the land, the
 * land's texture, or plain paint — so it is never a guess. When the tool
 * can't work on the active layer, it says so and offers the fix.
 */
import { Glyph } from "../glyphs";
import type { LayerRole } from "../types";

export function EditTarget({
  role,
  layerName,
  what,
  note,
  warning = false,
  action,
}: {
  role: LayerRole;
  layerName: string;
  /** What the tool edits, e.g. "Land shape" / "Land texture". */
  what: string;
  note?: string;
  /** The tool can't draw here (the note says why). */
  warning?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`mm-target mm-role-${role} ${warning ? "warning" : ""}`}>
      <div className="mm-target-head">
        <span className="mm-target-icon">
          <Glyph name={role === "custom" ? "layers" : role} size={14} />
        </span>
        <div className="mm-target-text">
          <b>{what}</b>
          <span>{layerName}</span>
        </div>
      </div>
      {note && <p>{note}</p>}
      {action && (
        <button className="secondary-button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
