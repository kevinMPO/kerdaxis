import { NextResponse } from "next/server";
import { recordLead } from "@/lib/accounts/store";
import { COOKIE_OPTS, issueSession, normalizeEmail, sessionConfigured, SESSION_COOKIE, TRIAL_TTL_S, verifySession } from "@/lib/auth/user-session";
import { readCookie } from "@/lib/auth/test-access";
import { rateLimitHit } from "../test-login/limit";
import { clientIp } from "@/lib/auth/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Essai gratuit : e-mail seul → session « trial » (Nuvio rejoué, aucun agent H Company réel). */
export async function POST(req: Request): Promise<Response> {
  if (!sessionConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (rateLimitHit(`try:${clientIp(req)}`)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  // Un abonné déjà connecté garde sa session (pas de rétrogradation silencieuse).
  const current = await verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  await recordLead(email);
  const res = NextResponse.json({ ok: true, role: current?.role === "member" ? "member" : "trial" });
  if (current?.role !== "member") {
    res.cookies.set(SESSION_COOKIE, await issueSession("trial", email), { ...COOKIE_OPTS, maxAge: TRIAL_TTL_S });
  }
  return res;
}
