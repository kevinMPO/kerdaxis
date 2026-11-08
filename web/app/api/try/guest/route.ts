import { NextResponse } from "next/server";
import { COOKIE_OPTS, issueSession, sessionConfigured, SESSION_COOKIE, TRIAL_TTL_S, verifySession } from "@/lib/auth/user-session";
import { readCookie } from "@/lib/auth/test-access";
import { GUEST_EMAIL, safeNext } from "@/lib/auth/guest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Essai sans email (« See it live, no signup ») : même session « trial » que /api/try.
 * Le rôle trial ne pilote que la rediffusion enregistrée (execGuard → mode "trial",
 * trialMayAccess) : aucun agent H Company réel ne peut être lancé depuis cette session.
 * L'email de /api/try n'étant pas vérifié, il ne protégeait rien de plus.
 * Pas de limite par IP : émettre un cookie ne coûte rien, et un jury derrière un
 * même wifi partage une seule IP.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const to = new URL(safeNext(url.searchParams.get("next")), url.origin);
  if (!sessionConfigured()) return NextResponse.redirect(new URL("/try", url.origin), 303);
  const res = NextResponse.redirect(to, 303);
  // Une session existante (essai ou abonné) est conservée telle quelle.
  const current = await verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!current) {
    res.cookies.set(SESSION_COOKIE, await issueSession("trial", GUEST_EMAIL), { ...COOKIE_OPTS, maxAge: TRIAL_TTL_S });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
