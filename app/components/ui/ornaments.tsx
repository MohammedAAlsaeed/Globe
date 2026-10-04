import type React from "react";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18M5 6.5h14M5 17.5h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-4-4 4 4 4-4M4 17v4h16v-4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="m3 17 6-6 4 4 3-3 5 5" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 3v6m8 0v6M10 15v6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    link: (
      <>
        <path
          d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
          transform="translate(1 -1)"
        />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    ruler: (
      <>
        <path d="m3 16 13-13 5 5L8 21Z" />
        <path d="m7 12 3 3m1-7 3 3m1-7 3 3" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M5 12h14M12 5v14" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-11v2" />
      </>
    ),
    grid: (
      <>
        <path d="M4 3v18m5-18v18m6-18v18m5-18v18M3 3h18M3 21h18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.globe}
    </svg>
  );
}
export function Astrolabe() {
  return (
    <svg className="astrolabe" viewBox="0 0 280 280" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth=".8">
        <circle cx="140" cy="140" r="115" />
        <circle cx="140" cy="140" r="108" />
        <circle cx="140" cy="140" r="92" />
        <circle cx="140" cy="140" r="62" />
        <ellipse
          cx="140"
          cy="140"
          rx="45"
          ry="108"
          transform="rotate(35 140 140)"
        />
        <ellipse
          cx="140"
          cy="140"
          rx="45"
          ry="108"
          transform="rotate(-35 140 140)"
        />
        <path d="M25 140h230M140 25v230M59 59l162 162M59 221 221 59" />
        {Array.from({ length: 60 }, (_, i) => (
          <path
            key={i}
            d={`M140 25v${i % 5 === 0 ? 10 : 4}`}
            transform={`rotate(${i * 6} 140 140)`}
          />
        ))}
        <path d="m140 63 16 61 61 16-61 16-16 61-16-61-61-16 61-16Z" />
        <circle cx="140" cy="140" r="9" />
      </g>
    </svg>
  );
}
