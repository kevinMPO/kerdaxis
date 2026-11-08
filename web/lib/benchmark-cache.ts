// ---------------------------------------------------------------------------
// Cache D1 des benchmarks de prix publics (table `market_benchmarks`, db/0003).
//
// Contenu public, partagé entre organisations : la clé ne porte que le marchand
// NETTOYÉ, sa catégorie et la langue. Le cache est un confort : sans binding D1
// (next dev, Vercel, tests) ou si la table manque, il se tait et la recherche
// repart sur le web. Une panne de cache ne casse jamais un benchmark.
// ---------------------------------------------------------------------------

import { baseD1SiPresente } from "@/lib/runtime/bindings";
import type { BenchmarkResult } from "@/lib/benchmark";
import type { Lang } from "@/lib/types";

const DAY_MS = 86_400_000;
export const BENCHMARK_TTL_DAYS = 30;

export function benchmarkCacheKey(merchant: string, category: string, lang: Lang): string {
  return [merchant, category, lang].map((part) => part.trim().toLowerCase()).join("|");
}

export async function readCachedBenchmark(
  merchant: string,
  category: string,
  lang: Lang,
  now: number = Date.now(),
): Promise<BenchmarkResult | null> {
  const db = baseD1SiPresente();
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT result_json FROM market_benchmarks WHERE cache_key = ? AND expires_at > ?")
      .bind(benchmarkCacheKey(merchant, category, lang), now)
      .first<{ result_json: string }>();
    return row ? (JSON.parse(row.result_json) as BenchmarkResult) : null;
  } catch (error) {
    console.error("[kerdaxis][benchmark-cache] lecture impossible :", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function writeCachedBenchmark(
  merchant: string,
  category: string,
  lang: Lang,
  result: BenchmarkResult,
  now: number = Date.now(),
): Promise<void> {
  const db = baseD1SiPresente();
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO market_benchmarks
           (cache_key, merchant, category, lang, result_json, checked_at, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           result_json = excluded.result_json,
           checked_at  = excluded.checked_at,
           updated_at  = excluded.updated_at,
           expires_at  = excluded.expires_at`,
      )
      .bind(
        benchmarkCacheKey(merchant, category, lang),
        merchant,
        category,
        lang,
        JSON.stringify(result),
        result.checkedAt,
        now,
        now,
        now + BENCHMARK_TTL_DAYS * DAY_MS,
      )
      .run();
  } catch (error) {
    console.error("[kerdaxis][benchmark-cache] écriture impossible :", error instanceof Error ? error.message : error);
  }
}
