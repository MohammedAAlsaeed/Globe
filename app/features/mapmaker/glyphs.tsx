import type React from "react";
/** Small glyph set for the standalone map creator's dark UI: tool rail, panel tabs and status bar. Kept separate from components/ui/ornaments.tsx, whose set targets the print studio's own icon language. */
const PATHS: Record<string, React.ReactNode> = {
  select: <path d="M5 3l3.5 17 2.2-6.8L17.5 12 5 3Z" />,
  brush: (
    <>
      <path d="M4 20c0-3 1.5-4.5 4-4.5S12 17 12 20" />
      <path d="M9.5 14.5 17 7a2.1 2.1 0 0 0 0-3 2.1 2.1 0 0 0-3 0l-7.5 7.5" />
    </>
  ),
  stamp: (
    <>
      <path d="M12 2C8.7 2 6 4.7 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6Z" />
      <circle cx="12" cy="8" r="2.2" />
    </>
  ),
  path: <path d="M3 17c3-7 6 7 9 0s6-7 9 0" />,
  region: <path d="M12 3.5 20 8l-2.5 12h-11L4 8Z" />,
  label: <path d="M4 5h16M12 5v14" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-4 4.8M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.6" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.6" />
      <path d="M8 11V7a4 4 0 0 1 7.4-2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="1.6" />
      <path d="M4 16V5.6C4 4.7 4.7 4 5.6 4H16" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.8c0-.4.4-.8.9-.8h4.2c.5 0 .9.4.9.8V7M6 7l1 13c0 .6.5 1 1 1h8c.5 0 1-.4 1-1l1-13" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  objects: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M10.5 8v5M8 10.5h5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M8 10.5h5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  fit: (
    <>
      <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" />
    </>
  ),
  grid: (
    <>
      <path d="M4 4v16M9 4v16M14 4v16M19 4v16M2 9h20M2 14h20" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="1.8" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
    </>
  ),
  chevronLeft: <path d="m14 5-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  print: (
    <>
      <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
      <rect x="6" y="14" width="12" height="7" />
    </>
  ),
  undo: <path d="M7 7 3 11l4 4M3 11h10.5a6.5 6.5 0 1 1 0 13H10" />,
  redo: <path d="M17 7l4 4-4 4M21 11H10.5a6.5 6.5 0 1 0 0 13H14" />,
  folder: (
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.6l1.8 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
  ),
};
export function Glyph({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.select}
    </svg>
  );
}
