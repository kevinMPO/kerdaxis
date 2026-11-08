import type { Localized } from "./types";

const MS_PER_DAY = 86_400_000;

// UTC so the server render and the client hydration print the same dates.
const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", timeZone: "UTC" };

/** Label of the analysis window: the `days` days ending at `end`, e.g. "May 20 – June 19, 2026". */
export function rollingWindowLabel(days: number, end: Date = new Date()): Localized {
  const start = new Date(end.getTime() - days * MS_PER_DAY);
  const format = (date: Date, locale: string): string => date.toLocaleDateString(locale, DATE_FORMAT);
  const year = end.getUTCFullYear();
  return {
    fr: `${format(start, "fr-FR")} – ${format(end, "fr-FR")} ${year}`,
    en: `${format(start, "en-US")} – ${format(end, "en-US")}, ${year}`,
  };
}
