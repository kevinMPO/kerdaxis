// ---------------------------------------------------------------------------
// Analyse de la démo publique : le relevé fictif passe dans le pipeline réel,
// catégorisé par mots-clés, sans appel à Holo.
//
// Le relevé de la démo est fixe (seules les dates glissent avec le jour) : un
// appel Holo payant de 30 à 40 s n'y apprendrait rien, et faisait attendre le
// visiteur. Les règles répondent en quelques millisecondes, toujours de la même
// façon, donc aucun cache n'est nécessaire. Le moteur chiffre toujours chaque euro.
// ---------------------------------------------------------------------------

import { runAnalysis } from "@/lib/analysis/pipeline";
import type { AnalyzeResult } from "@/lib/types";
import { DEMO_ACCOUNT, DEMO_LABELS, DEMO_WINDOW_DAYS, demoTransactions } from "./transactions";

export async function analyzeDemo(now: Date = new Date()): Promise<AnalyzeResult> {
  return runAnalysis({
    account: { ...DEMO_ACCOUNT },
    txs: demoTransactions(now),
    windowDays: DEMO_WINDOW_DAYS,
    source: "mock",
    labels: [...DEMO_LABELS],
    now,
    rulesOnly: true,
  });
}
