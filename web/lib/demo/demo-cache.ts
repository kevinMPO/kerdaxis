// ---------------------------------------------------------------------------
// Cache D1 du résultat du jour de la démo (table `demo_results`, db/0004).
//
// Partagé entre isolats : le premier visiteur du jour (ou l'appel de
// préchauffage du déploiement) paie la catégorisation Holo, les suivants lisent
// la ligne. Comme le cache des benchmarks, c'est un confort : sans binding D1
// ou si la table manque, il se tait et la démo retombe sur le cache mémoire.
// ---------------------------------------------------------------------------

import { baseD1SiPresente } from "@/lib/runtime/bindings";
import type { AnalyzeResult } from "@/lib/types";

export async function readDemoResult(day: string): Promise<AnalyzeResult | null> {
  const db = baseD1SiPresente();
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT result_json FROM demo_results WHERE day = ?")
      .bind(day)
      .first<{ result_json: string }>();
    return row ? (JSON.parse(row.result_json) as AnalyzeResult) : null;
  } catch (error) {
    console.error("[kerdaxis][demo-cache] lecture impossible :", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Écrit le résultat du jour et purge les jours passés (une ligne vivante au plus). */
export async function writeDemoResult(day: string, result: AnalyzeResult, now: number = Date.now()): Promise<void> {
  const db = baseD1SiPresente();
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO demo_results (day, result_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(day) DO UPDATE SET
           result_json = excluded.result_json,
           updated_at  = excluded.updated_at`,
      )
      .bind(day, JSON.stringify(result), now, now)
      .run();
    await db.prepare("DELETE FROM demo_results WHERE day < ?").bind(day).run();
  } catch (error) {
    console.error("[kerdaxis][demo-cache] écriture impossible :", error instanceof Error ? error.message : error);
  }
}
