import localFont from "next/font/local";

// The user pinned an H Company x Qonto x Linear blend; H Company's own pairing is Plus Jakarta Sans with Fira Code.
// Self-hosted (variable woff2 subset to latin / latin-ext, OFL licenses alongside) because next/font/google
// downloads at build time and crashes when Google Fonts serves the CI runner extensionless font URLs.
export const sans = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--kd-font-sans",
  display: "swap",
});

export const mono = localFont({
  src: "./fonts/FiraCode-Variable.woff2",
  weight: "300 700",
  style: "normal",
  variable: "--kd-font-mono",
  display: "swap",
  adjustFontFallback: false,
});

export const DASHBOARD_FONT_CLASS = `${sans.variable} ${mono.variable}`;
