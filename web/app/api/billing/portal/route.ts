import { NextResponse } from "next/server";
import { findAccount } from "@/lib/accounts/store";
import { readCookie } from "@/lib/auth/test-access";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/user-session";
import { createPortal, publicOrigin } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Portail client Stripe (gérer / résilier l'abonnement). */
export async function POST(req: Request): Promise<Response> {
  const s = await verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (s?.role !== "member") return NextResponse.json({ error: "members_only" }, { status: 403 });
  const acc = await findAccount(s.email);
  if (!acc?.stripeCustomerId) return NextResponse.json({ error: "no_customer" }, { status: 404 });
  try {
    return NextResponse.json({ url: await createPortal(acc.stripeCustomerId, publicOrigin(req)) });
  } catch (err) {
    console.error("[billing/portal]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "portal_unavailable" }, { status: 502 });
  }
}
