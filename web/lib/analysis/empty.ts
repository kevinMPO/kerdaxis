import type { AnalyzeResult } from "@/lib/types";

/**
 * État initial des écrans avant la réponse de /api/analyze, et ce qu'ils gardent
 * si l'analyse est refusée : aucun chiffre plutôt que des chiffres d'un autre.
 */
export const EMPTY_ANALYSIS: AnalyzeResult = {
  account: { name: "", bank: "Qonto", balance: 0 },
  window: { label: { fr: "", en: "" } },
  totals: { out: 0, runRate: 0 },
  natures: [],
  poles: [],
  score: { value: 0, drivers: [] },
  runway: { months: 0, note: { fr: "", en: "" } },
  levers: [],
  flux: [],
};
