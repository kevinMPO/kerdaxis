import { NextResponse } from "next/server";
import { checkPassword, findAccount, isActive, updateAccount } from "@/lib/accounts/store";
import { COOKIE_OPTS, issueSession, MEMBER_TTL_S, normalizeEmail, sessionConfigured, SESSION_COOKIE } from "@/lib/auth/user-session";
import { createCheckout, getSubscriptionStatus, publicOrigin, stripeConfigured } from "@/lib/billing/stripe";
import { rateLimitHit } from "../test-login/limit";
import { clientIp } from "@/lib/auth/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connexion abonné : mot de passe, puis abonnement revérifié chez Stripe. */
export async function POST(req: Request): Promise<Response> {
  if (!sessionConfigured() || !stripeConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (rateLimitHit(`signin:${clientIp(req)}`)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const acc = email ? await findAccount(email) : null;
  // Même réponse pour « inconnu » et « mauvais mot de passe ».
  if (!acc || !(await checkPassword(password, acc.passwordHash))) {
    return NextResponse.json({ error: "bad_credentials" }, { status: 401 });
  }

  let status = acc.subscriptionStatus;
  if (acc.stripeSubscriptionId) {
    try {
      status = await getSubscriptionStatus(acc.stripeSubscriptionId);
      if (status !== acc.subscriptionStatus) await updateAccount(acc.id, { subscriptionStatus: status });
    } catch (err) {
      console.error("[signin] stripe", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "billing_unavailable" }, { status: 502 });
    }
  }
  if (!isActive(status)) {
    // Pas (ou plus) d'abonnement actif : on renvoie vers le paiement.
    try {
      const url = await createCheckout({ accountId: acc.id, email: acc.email, customerId: acc.stripeCustomerId, origin: publicOrigin(req) });
      return NextResponse.json({ error: "subscription_required", url }, { status: 402 });
    } catch (err) {
      console.error("[signin] checkout", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "billing_unavailable" }, { status: 502 });
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await issueSession("member", acc.email), { ...COOKIE_OPTS, maxAge: MEMBER_TTL_S });
  return res;
}
