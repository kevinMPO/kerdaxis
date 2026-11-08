// ---------------------------------------------------------------------------
// Le pipeline d'analyse, UNIQUE pour un compte réel et pour la démo :
//   transactions → CATÉGORISE (Holo, sinon règles) → CALCULE (engine).
//
// La démo publique n'a plus de résultat écrit à la main : elle passe ici avec
// des transactions fictives, et chaque chiffre qu'elle montre sort du moteur.
// ---------------------------------------------------------------------------

import { build, toMerchantInputs } from "@/lib/engine";
import { categorizeByRules, categorizeWithHolo, hasHoloKey, type MerchantInput } from "@/lib/categorize";
import type { AnalyzeResult, Categorizer, MerchantVerdict, Tx } from "@/lib/types";
import { rollingWindowLabel } from "@/lib/window-label";

const DAYS_PER_MONTH = 30;

export interface AnalysisInput {
  account: { name: string; bank: string; balance: number };
  txs: Tx[];
  windowDays: number;
  source: "qonto" | "mock";
  /**
   * Étiquettes déjà posées par l'appelant, comme `labels` de l'API moteur. Ces
   * marchands ne partent pas au modèle. Ce sont des CATÉGORIES, jamais des euros.
   */
  labels?: MerchantVerdict[];
  /** Jour de référence de la fenêtre affichée (injectable pour les tests). */
  now?: Date;
}

async function categorize(inputs: MerchantInput[]): Promise<{ verdicts: MerchantVerdict[]; categorized: Categorizer }> {
  if (!hasHoloKey() || inputs.length === 0) return { verdicts: categorizeByRules(inputs), categorized: "rules" };
  try {
    return { verdicts: await categorizeWithHolo(inputs), categorized: "hcompany" };
  } catch (error) {
    console.error("Catégorisation H Company échouée, fallback règles :", error);
    return { verdicts: categorizeByRules(inputs), categorized: "rules" };
  }
}

export async function runAnalysis(input: AnalysisInput): Promise<AnalyzeResult> {
  const { txs, windowDays } = input;
  const months = Math.max(1, windowDays / DAYS_PER_MONTH);
  const labels = input.labels ?? [];
  const labelled = new Set(labels.map((l) => l.name.toLowerCase()));
  const inputs = toMerchantInputs(
    txs.filter((t) => t.side === "debit"),
    months,
  ).filter((m) => !labelled.has(m.name.toLowerCase()));

  const { verdicts, categorized } = await categorize(inputs);

  return build({
    account: input.account,
    windowLabel: rollingWindowLabel(windowDays, input.now),
    txs,
    verdicts: [...verdicts, ...labels],
    windowDays,
    source: input.source,
    categorized,
  });
}
