import type { Lang, Lever, Localized } from "@/lib/types";

/** Engine text is French and English; German, Spanish and Italian read the English. */
function pick(text: Localized, lang: Lang): string {
  return lang === "fr" ? text.fr : text.en;
}

/** Name of a lever on screen: the engine's localized name when it named the lever itself. */
export function leverName(lever: Lever, lang: Lang): string {
  return lever.labelText ? pick(lever.labelText, lang) : lever.label;
}

/** Proposal of a lever on screen; levers from older analyses only carry the French `to`. */
export function leverProposal(lever: Lever, lang: Lang): string {
  return lever.toLabel ? pick(lever.toLabel, lang) : lever.to;
}
