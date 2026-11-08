// ---------------------------------------------------------------------------
// Garde HTTP des routes d'exécution. Elles déclenchent des actions RÉELLES chez
// un fournisseur : en P0 elles ne répondent qu'à la machine locale (démo sur le
// portable), ou à un jeton d'opérateur explicite (KERDAXIS_OPERATOR_TOKEN).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import type { Execution } from "./store";

/** P0 : un seul locataire de démonstration. P1 : l'organisation de la session. */
export const DEMO_ORG = "demo-acme";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function operatorGuard(req: Request): NextResponse | null {
  const token = process.env.KERDAXIS_OPERATOR_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (token && auth.startsWith("Bearer ") && timingSafeEqual(auth.slice(7), token)) return null;
  // Accès test via tunnel : en-tête posé UNIQUEMENT par middleware.ts après
  // vérification du cookie signé (toute valeur envoyée par le client est effacée).
  if (req.headers.get("x-kx-test-auth") === "1") return null;
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  if (local && process.env.NODE_ENV !== "production") return null;
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/**
 * Garde des routes d'exécution, essai compris :
 *  - "live"  : opérateur / test / abonné → agent H Company réel ;
 *  - "trial" : essai gratuit (x-kx-role posé par middleware.ts) → rediffusion
 *              enregistrée pour le fournisseur de démo (REPLAY_SUPPLIER_ID),
 *              aucun agent H Company réel, les autres fournisseurs sont refusés.
 */
export function execGuard(req: Request): { denied: NextResponse } | { mode: "live" | "trial" } {
  if (!operatorGuard(req)) return { mode: "live" };
  if (req.headers.get("x-kx-role") === "trial") return { mode: "trial" };
  return { denied: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
}

/** Un compte d'essai ne pilote que des rediffusions, jamais une exécution réelle. */
export function trialMayAccess(exec: Execution): boolean {
  return Boolean(exec.replay);
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
