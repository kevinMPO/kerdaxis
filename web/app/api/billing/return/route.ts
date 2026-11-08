import { NextResponse } from "next/server";
import { getAccountById, isActive, updateAccount } from "@/lib/accounts/store";
import { COOKIE_OPTS, issueSession, MEMBER_TTL_S, SESSION_COOKIE } from "@/lib/auth/user-session";
import { getCheckout, publicOrigin } from "@/lib/billing/stripe";
import { LIVE_DASHBOARD_PATH } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retour de Stripe Checkout. Le navigateur ne fait que transmettre l'id de
 * session : l'état payé est relu CHEZ STRIPE, jamais pris dans l'URL.
 */
export async function GET(req: Request): Promise<Response> {
  const origin = publicOrigin(req);
  const id = new URL(req.url).searchParams.get("session_id") ?? "";
  try {
    const cs = await getCheckout(id);
    const acc = cs.client_reference_id ? await getAccountById(cs.client_reference_id) : null;
    if (!acc || cs.status !== "complete" || !cs.subscription) throw new Error("checkout_incomplete");
    await updateAccount(acc.id, {
      stripeCustomerId: cs.customer,
      stripeSubscriptionId: cs.subscription.id,
      subscriptionStatus: cs.subscription.status,
    });
    if (!isActive(cs.subscription.status)) throw new Error(`subscription_${cs.subscription.status}`);
    const res = NextResponse.redirect(`${origin}${LIVE_DASHBOARD_PATH}?welcome=1`, 303);
    res.cookies.set(SESSION_COOKIE, await issueSession("member", acc.email), { ...COOKIE_OPTS, maxAge: MEMBER_TTL_S });
    return res;
  } catch (err) {
    console.error("[billing/return]", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/signin?payment=pending`, 303);
  }
}
