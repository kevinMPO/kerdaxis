// ---------------------------------------------------------------------------
// Fournisseur réel n°1 : un abonnement Stripe (MODE TEST) et son portail client
// hébergé par Stripe, billing.stripe.com.
//
// Contrairement au portail Nuvio, cette interface n'est pas écrite par nous :
// l'agent H Company affronte une vraie UI tierce, que son navigateur cloud
// atteint sans tunnel. La preuve vient de l'API Stripe (statut réel de
// l'abonnement), jamais de la parole de l'agent.
//
// Chaque exécution crée un client et un abonnement de test neufs : rien à
// remettre à zéro entre deux démos, et un rejeu ne peut pas viser un autre
// abonnement que celui de son exécution.
// ---------------------------------------------------------------------------

import { call } from "@/lib/billing/stripe";
import { SITE_URL } from "@/lib/site";

export const STRIPE_PORTAL_HOST = "billing.stripe.com";
const TEST_CARD_PAYMENT_METHOD = "pm_card_visa";
const CANCELLATION_REASONS = ["too_expensive", "missing_features", "unused", "other"];

export interface PortalTarget {
  subscriptionId: string;
  customerId: string;
  portalUrl: string;
}

export interface PortalProduct {
  supplierId: string;
  vendor: string;
  plan: string;
  account: string;
  monthlyCents: number;
}

let portalConfigurationId: string | null = null;
const priceIds = new Map<string, string>();

async function ensurePortalPrice(product: PortalProduct): Promise<string> {
  const lookupKey = `kerdaxis_demo_${product.supplierId}_${product.monthlyCents}_monthly_eur`;
  const known = priceIds.get(lookupKey);
  if (known) return known;
  const found = await call<{ data: { id: string }[] }>("GET", "/prices", { "lookup_keys[]": lookupKey, active: "true", limit: 1 });
  if (found.data[0]) {
    priceIds.set(lookupKey, found.data[0].id);
    return found.data[0].id;
  }
  const created = await call<{ id: string }>(
    "POST",
    "/products",
    { name: product.plan, description: `${product.vendor} (fictional supplier, Kerdaxis demo, Stripe test mode)` },
    `${lookupKey}-product-v1`,
  );
  const price = await call<{ id: string }>(
    "POST",
    "/prices",
    { product: created.id, currency: "eur", unit_amount: product.monthlyCents, "recurring[interval]": "month", lookup_key: lookupKey },
    `${lookupKey}-price-v1`,
  );
  priceIds.set(lookupKey, price.id);
  return price.id;
}

/** Portail : résiliation immédiate avec motif, comme la plupart des SaaS. */
async function ensurePortalConfiguration(): Promise<string> {
  if (portalConfigurationId) return portalConfigurationId;
  const params: Record<string, string> = {
    "business_profile[headline]": "Manage your subscription",
    "features[invoice_history][enabled]": "true",
    "features[payment_method_update][enabled]": "true",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "immediately",
    "features[subscription_cancel][cancellation_reason][enabled]": "true",
  };
  CANCELLATION_REASONS.forEach((reason, index) => {
    params[`features[subscription_cancel][cancellation_reason][options][${index}]`] = reason;
  });
  const configuration = await call<{ id: string }>("POST", "/billing_portal/configurations", params);
  portalConfigurationId = configuration.id;
  return configuration.id;
}

/** Client + abonnement de test neufs, et un lien à usage unique vers leur portail. Le lien ne sort jamais du serveur. */
export async function createPortalTarget(product: PortalProduct, executionId: string): Promise<PortalTarget> {
  const [priceId, configurationId] = await Promise.all([ensurePortalPrice(product), ensurePortalConfiguration()]);
  const tag = executionId.slice(0, 8);
  const customer = await call<{ id: string }>(
    "POST",
    "/customers",
    {
      name: product.account,
      email: `billing+${tag}@acme-conseil.example`,
      payment_method: TEST_CARD_PAYMENT_METHOD,
      "invoice_settings[default_payment_method]": TEST_CARD_PAYMENT_METHOD,
    },
    `kerdaxis-exec-${executionId}-customer`,
  );
  const subscription = await call<{ id: string }>(
    "POST",
    "/subscriptions",
    { customer: customer.id, "items[0][price]": priceId },
    `kerdaxis-exec-${executionId}-subscription`,
  );
  const portalUrl = await openPortalSession(customer.id, configurationId);
  return { subscriptionId: subscription.id, customerId: customer.id, portalUrl };
}

/** Nouveau lien de portail pour un client existant (relance d'une session H : même abonnement, nouveau lien). */
export async function openPortalSession(customerId: string, configurationId?: string): Promise<string> {
  const portal = await call<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: customerId,
    configuration: configurationId ?? (await ensurePortalConfiguration()),
    return_url: SITE_URL,
  });
  return portal.url;
}

export interface StripeSubscription {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  cancel_at?: number | null;
  ended_at?: number | null;
  discount?: unknown;
  discounts?: unknown[];
  customer?: { name?: string | null } | string;
}

const isoDate = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

/**
 * Traduit l'abonnement Stripe dans le vocabulaire du vérificateur Kerdaxis.
 * Une remise apparue en cours de route = offre de rétention acceptée.
 */
export function portalStateOf(subscription: StripeSubscription) {
  const cancelled = subscription.status === "canceled" || Boolean(subscription.cancel_at_period_end);
  const discounted = Boolean(subscription.discount) || (subscription.discounts?.length ?? 0) > 0;
  const accessUntil = isoDate(subscription.cancel_at ?? subscription.ended_at);
  return {
    status: (cancelled ? "cancelled" : discounted ? "discounted" : "active") as "active" | "discounted" | "cancelled",
    confirmation_number: cancelled ? subscription.id : null,
    cancelled_at: isoDate(subscription.canceled_at),
    ...(accessUntil ? { access_until: accessUntil.slice(0, 10) } : {}),
    ...(typeof subscription.customer === "object" && subscription.customer?.name ? { company: subscription.customer.name } : {}),
  };
}

export async function readPortalSubscription(subscriptionId: string) {
  const subscription = await call<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    "expand[]": "customer",
  });
  return portalStateOf(subscription);
}
