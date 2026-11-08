// ---------------------------------------------------------------------------
// Stripe — abonnement Kerdaxis 5 €/mois, via l'API REST (pas de SDK).
//
// MODE TEST IMPOSÉ : une clé `sk_live_` est refusée tant que
// STRIPE_ALLOW_LIVE=1 n'est pas posé explicitement (CGV, TVA, compte activé).
//
// Pas de webhook en P0 : au retour de Checkout, le serveur relit la session
// chez Stripe (source de vérité), et l'abonnement est revérifié à chaque
// connexion. La clé ne quitte jamais le serveur.
// ---------------------------------------------------------------------------

import { appOrigin, LIVE_DASHBOARD_PATH } from "@/lib/site";

const API = "https://api.stripe.com/v1";
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
export const PRICE_LOOKUP_KEY = "kerdaxis_monthly_eur_5";

export function stripeKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  if (k.startsWith("sk_test_") || k.startsWith("rk_test_")) return k;
  if ((k.startsWith("sk_live_") || k.startsWith("rk_live_")) && process.env.STRIPE_ALLOW_LIVE === "1") return k;
  return null;
}

export function stripeConfigured(): boolean {
  return stripeKey() !== null;
}

function form(params: Record<string, string | number | undefined>): string {
  const b = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) b.append(k, String(v));
  return b.toString();
}

/** Appel REST Stripe avec la garde mode test. Partagé avec le fournisseur de démo « portail Stripe ». */
export async function call<T>(method: "GET" | "POST", path: string, params?: Record<string, string | number | undefined>, idem?: string): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");
  const qs = method === "GET" && params ? `?${form(params)}` : "";
  const res = await fetch(`${API}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: method === "POST" && params ? form(params) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`stripe_${res.status}:${data.error?.message ?? "error"}`.slice(0, 200));
  return data;
}

let priceId: string | null = null;

/** Prix 5 €/mois : retrouvé par lookup_key, créé une seule fois s'il manque. */
export async function ensurePrice(): Promise<string> {
  if (priceId) return priceId;
  const found = await call<{ data: { id: string }[] }>("GET", "/prices", { "lookup_keys[]": PRICE_LOOKUP_KEY, active: "true", limit: 1 });
  if (found.data[0]) return (priceId = found.data[0].id);
  const product = await call<{ id: string }>("POST", "/products", {
    name: "Kerdaxis",
    description: "Kerdaxis subscription — finds the leaks, cancels with an H Company agent, stops before the final click.",
  }, "kerdaxis-product-v1");
  const price = await call<{ id: string }>("POST", "/prices", {
    product: product.id,
    currency: "eur",
    unit_amount: 500,
    "recurring[interval]": "month",
    lookup_key: PRICE_LOOKUP_KEY,
    nickname: "Kerdaxis monthly 5 EUR",
  }, "kerdaxis-price-eur5-v1");
  return (priceId = price.id);
}

export async function createCheckout(opts: { accountId: string; email: string; customerId: string | null; origin: string }): Promise<string> {
  const price = await ensurePrice();
  const s = await call<{ url: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    client_reference_id: opts.accountId,
    ...(opts.customerId ? { customer: opts.customerId } : { customer_email: opts.email }),
    "metadata[account_id]": opts.accountId,
    "subscription_data[metadata][account_id]": opts.accountId,
    success_url: `${opts.origin}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}/signup?canceled=1`,
    locale: "en",
  });
  return s.url;
}

export interface CheckoutResult {
  id: string;
  status: string; // open | complete | expired
  client_reference_id: string | null;
  customer: string | null;
  subscription: { id: string; status: string } | null;
}

export async function getCheckout(id: string): Promise<CheckoutResult> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) throw new Error("bad_session_id");
  return call<CheckoutResult>("GET", `/checkout/sessions/${id}`, { "expand[]": "subscription" });
}

export async function getSubscriptionStatus(id: string): Promise<string> {
  const s = await call<{ status: string }>("GET", `/subscriptions/${encodeURIComponent(id)}`);
  return s.status;
}

export async function createPortal(customerId: string, origin: string): Promise<string> {
  const s = await call<{ url: string }>("POST", "/billing_portal/sessions", { customer: customerId, return_url: `${origin}${LIVE_DASHBOARD_PATH}` });
  return s.url;
}

/** Origine publique pour les URL de retour : jamais tirée d'un en-tête libre du client. */
export function publicOrigin(req: Request): string {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (LOCAL_HOST.test(host)) return `http://${host}`;
  return appOrigin();
}
