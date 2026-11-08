import { Fira_Code, Plus_Jakarta_Sans } from "next/font/google";

// The user pinned an H Company x Qonto x Linear blend; H Company's own pairing is Plus Jakarta Sans with Fira Code.
export const sans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--kd-font-sans",
  display: "swap",
});

export const mono = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--kd-font-mono",
  display: "swap",
});

export const DASHBOARD_FONT_CLASS = `${sans.variable} ${mono.variable}`;
