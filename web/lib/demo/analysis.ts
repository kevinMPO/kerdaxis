// ---------------------------------------------------------------------------
// Analyse de la démo publique : le relevé fictif passe dans le pipeline réel.
//
// La catégorisation Holo est payante et prend 30 à 40 s ; la démo est ouverte
// à tous. Deux niveaux de cache :
//   • D1 (`demo_results`) : le résultat Holo du jour, partagé entre isolats.
//     Le déploiement le préchauffe, pour qu'aucun visiteur n'attende.
//   • la mémoire de l'isolat : une journée quand Holo a répondu (les dates du
//     relevé glissent chaque jour), cinq minutes quand on est retombé sur les
//     règles, pour retenter Holo vite. Un repli sur les règles n'est jamais
//     écrit en D1.
// Les requêtes simultanées partagent la même promesse : une boucle anonyme ne
// déclenche pas une catégorisation par appel.
// ---------------------------------------------------------------------------

import { runAnalysis } from "@/lib/analysis/pipeline";
import type { AnalyzeResult } from "@/lib/types";
import { readDemoResult, writeDemoResult } from "./demo-cache";
import { DEMO_ACCOUNT, DEMO_LABELS, DEMO_WINDOW_DAYS, demoTransactions } from "./transactions";

const RULES_RESULT_TTL_MS = 5 * 60_000;

interface CachedDemo {
  day: string;
  expiresAt: number;
  result: Promise<AnalyzeResult>;
}

let cached: CachedDemo | null = null;

function endOfDayUtc(now: Date): number {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  return end.getTime();
}

export function __resetDemoCacheForTests(): void {
  cached = null;
}

async function loadOrAnalyze(day: string, now: Date): Promise<AnalyzeResult> {
  const stored = await readDemoResult(day);
  if (stored) return stored;
  const fresh = await runAnalysis({
    account: { ...DEMO_ACCOUNT },
    txs: demoTransactions(now),
    windowDays: DEMO_WINDOW_DAYS,
    source: "mock",
    labels: [...DEMO_LABELS],
    now,
  });
  if (fresh.meta?.categorized === "hcompany") await writeDemoResult(day, fresh, now.getTime());
  return fresh;
}

export async function analyzeDemo(now: Date = new Date()): Promise<AnalyzeResult> {
  const day = now.toISOString().slice(0, 10);
  if (cached && cached.day === day && cached.expiresAt > now.getTime()) return cached.result;

  const result = loadOrAnalyze(day, now);
  const entry: CachedDemo = { day, expiresAt: endOfDayUtc(now), result };
  cached = entry;

  try {
    const resolved = await result;
    if (resolved.meta?.categorized !== "hcompany") entry.expiresAt = now.getTime() + RULES_RESULT_TTL_MS;
    return resolved;
  } catch (error) {
    if (cached === entry) cached = null;
    throw error;
  }
}
