import { NextResponse } from "next/server";
import { checkPassword, createAccount, findAccount, isActive } from "@/lib/accounts/store";
import { normalizeEmail, sessionConfigured } from "@/lib/auth/user-session";
import { createCheckout, publicOrigin, stripeConfigured } from "@/lib/billing/stripe";
import { rateLimitHit } from "../test-login/limit";
import { clientIp } from "@/lib/auth/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Création de compte → Stripe Checkout (abonnement 5 €/mois). */
export async function POST(req: Request): Promise<Response> {
  if (!sessionConfigured() || !stripeConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (rateLimitHit(`signup:${clientIp(req)}`)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!email) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  if (password.length < 10 || password.length > 200) return NextResponse.json({ error: "weak_password" }, { status: 400 });

  let acc = await findAccount(email);
  if (acc) {
    // Compte existant : seul son propriétaire peut reprendre le paiement.
    if (!(await checkPassword(password, acc.passwordHash))) return NextResponse.json({ error: "account_exists" }, { status: 409 });
    if (isActive(acc.subscriptionStatus)) return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
  } else {
    try {
      acc = await createAccount(email, password);
    } catch {
      return NextResponse.json({ error: "account_exists" }, { status: 409 });
    }
  }
  try {
    const url = await createCheckout({ accountId: acc.id, email, customerId: acc.stripeCustomerId, origin: publicOrigin(req) });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[signup] checkout", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
