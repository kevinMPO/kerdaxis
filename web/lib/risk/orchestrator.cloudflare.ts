// ---------------------------------------------------------------------------
// Remplaçant de `orchestrator.ts` dans le build Cloudflare Workers.
//
// Le CompanyRiskAgent repose sur Mastra + LibSQL (modules natifs Node) que
// workerd ne peut pas charger. `next.config.mjs` substitue ce fichier à
// l'orchestrateur quand KERDAXIS_TARGET=cloudflare : /api/risk répond alors
// une erreur explicite au lieu de faire échouer tout le build.
// ---------------------------------------------------------------------------

export async function analyzeCompany(_siren: string, _opts?: unknown): Promise<never> {
  throw new Error("Analyse de risque indisponible sur cette instance (Cloudflare Workers).");
}
