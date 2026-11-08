import React from "react";

const PATHS = {
  inbox: "M3 13h4l1.5 2.5h7L17 13h4M5.2 5h13.6L21 13v6H3v-6z",
  stack: "M12 3 3 7.5 12 12l9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6",
  check: "M5 12.5 10 17l9-10",
  close: "M6 6l12 12M18 6 6 18",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  pause: "M9 5v14M15 5v14",
  hand: "M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-4.5v-1a1.5 1.5 0 0 1 3 0V10m0-4a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 7.5-6.5 7.5-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.6L8 13",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  printer: "M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z",
  presentation: "M4 4h16M5 4v10h14V4M12 14v3M8 21l4-4 4 4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  dot: "M12 12h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The Kerdaxis K: a green stem and a lime branch, drawn after the brand logo. */
export function BrandMark({ className }: { className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kx-stem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fdc3c" />
          <stop offset="1" stopColor="#2e8b1f" />
        </linearGradient>
        <linearGradient id="kx-leg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e8b1f" />
          <stop offset="1" stopColor="#a6e33a" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="1.5" width="6.5" height="21" rx="2.2" fill="url(#kx-stem)" />
      <path d="M11.2 12.6 19.4 22.5H22L13.6 11.2z" fill="url(#kx-leg)" />
      <path d="M3.5 22.5 16.2 1.5h5.8L9.4 22.5z" fill="#d4f53c" />
    </svg>
  );
}
