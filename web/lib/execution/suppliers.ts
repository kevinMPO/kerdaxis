// ---------------------------------------------------------------------------
// Fournisseurs que Kerdaxis sait résilier par le navigateur.
//
// Catalogue CÔTÉ SERVEUR : le navigateur du client n'envoie qu'un identifiant
// (`nuvio`). Montant, compte, domaine autorisé et lien de connexion viennent
// d'ici, jamais de la requête — un client ne peut pas élargir l'action.
//
// Deux fournisseurs, deux façons de savoir où cliquer :
//  - « Nuvio CRM » : portail FICTIF que nous contrôlons (dossier portal/), au
//    parcours écrit à la main. Il sert aussi de vérificateur (son API d'état).
//  - « Lumen Analytics » : fournisseur fictif facturé par Stripe (mode test).
//    L'interface est le VRAI portail client de Stripe, que nous n'avons pas
//    écrit : le parcours est RECHERCHÉ dans la doc officielle de Stripe
//    (Linkup + captures lues par un agent H), la preuve vient de l'API Stripe.
// ---------------------------------------------------------------------------

import { stripeConfigured } from "@/lib/billing/stripe";
import { readPortalSubscription, STRIPE_PORTAL_HOST } from "./stripe-portal";

/** Chemin d'URL exact, ou motif quand le chemin contient des identifiants. */
export type PathRule = string | RegExp;

/** D'où l'agent tient son parcours. */
export type SupplierGuide =
  | { source: "catalog"; text: string }
  | {
      source: "research";
      /** Nom à chercher : celui de l'interface que l'agent verra (ex. le portail Stripe), jamais une donnée client. */
      merchant: string;
      /** Écouter aussi un tutoriel vidéo (Gladia). */
      video: boolean;
      /** Consigne générique si la recherche échoue : la résiliation ne dépend jamais d'elle. */
      fallback: string;
    };

export interface Supplier {
  id: string;
  vendor: string;
  plan: string;
  /** Raison sociale attendue sur le portail : un autre compte = arrêt. */
  account: string;
  /** Identifiant du compte côté portail (API de vérification). */
  accountKey: string;
  monthlyCents: number;
  currency: "EUR";
  baseUrl: string;
  allowedHost: string;
  /**
   * Fiche de parcours (« playbook ») du fournisseur : chemin de la page de
   * confirmation FINALE (avant le clic irréversible) et de la page « c'est
   * fait ». Kerdaxis met l'agent en pause dès qu'il voit la première, et
   * coupe tout s'il voit la seconde sans feu vert humain.
   */
  finalStepPath: PathRule;
  /** `null` quand la page « c'est fait » n'a pas d'adresse stable : la preuve facturier prend le relais. */
  donePath: PathRule | null;
  /** Libellé exact du bouton irréversible sur la page de confirmation finale. */
  finalButtonLabel: string;
  kind: "demo_portal" | "stripe_portal";
  guide: SupplierGuide;
  /**
   * Preuve de la résiliation : le numéro affiché par le portail et relu par son
   * API (`portal_number`), ou l'état de l'abonnement chez le facturier
   * (`billing_api`, aucun numéro à recopier par l'agent).
   */
  proof: "portal_number" | "billing_api";
}

/** Ce que l'exécution a créé chez le fournisseur (abonnement de test Stripe). */
export interface SupplierTarget {
  subscriptionId: string;
  /** Client Stripe : permet d'ouvrir un nouveau lien de portail si la session H doit être relancée. */
  customerId?: string;
}

/**
 * Langue du portail de démo : `PORTAL_LANG=en` pour l'anglais, vide = français.
 * Elle passe dans le lien de connexion (`&lang=en`), le portail la mémorise.
 */
function portalLang(): "fr" | "en" {
  return process.env.PORTAL_LANG?.trim().toLowerCase() === "en" ? "en" : "fr";
}

/**
 * Parcours de résiliation du portail Stripe : …/p/session/subscriptions/sub_…/cancel
 * (relevé sur une session réelle le 2026-11-07). Le motif, la page « Review your
 * changes » et le bouton final partagent CETTE adresse : le chien de garde met
 * donc l'agent en pause au début du parcours, une étape avant le bouton. Il est
 * en avance, jamais en retard ; ce qui suit le feu vert (motif, relecture) est
 * réversible, et une offre de rétention acceptée apparaîtrait en « discounted »
 * dans la preuve Stripe.
 */
const STRIPE_FINAL_STEP = /\/subscriptions\/[^/]+\/cancel\/?$/;

/** Fournisseur pris en charge, ou `null` s'il n'est pas configuré. */
export function getSupplier(id: string): Supplier | null {
  if (id === "lumen") return lumenSupplier();
  if (id !== "nuvio") return null;
  const baseUrl = process.env.PORTAL_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl || !process.env.PORTAL_API_KEY || !process.env.PORTAL_LOGIN_TOKEN) return null;
  return {
    id: "nuvio",
    vendor: "Nuvio CRM",
    plan: "Nuvio Growth",
    account: "Acme Conseil SAS",
    accountKey: "acme",
    monthlyCents: 12900,
    currency: "EUR",
    baseUrl,
    allowedHost: new URL(baseUrl).host,
    finalStepPath: "/cancel/confirm",
    donePath: "/cancel/done",
    finalButtonLabel: portalLang() === "en" ? "Confirm cancellation" : "Confirmer la résiliation",
    kind: "demo_portal",
    guide: {
      source: "catalog",
      text: "Go to Billing / subscription management, start the cancellation, give the reason \"Je n'utilise plus l'outil\" if asked.",
    },
    proof: "portal_number",
  };
}

/** Fournisseurs exécutables, dans l'ordre d'affichage. */
export const SUPPLIER_IDS = ["nuvio", "lumen"] as const;

/** Lumen Analytics : facturé par Stripe, l'interface est le portail client hébergé de Stripe. */
function lumenSupplier(): Supplier | null {
  if (!stripeConfigured()) return null;
  return {
    id: "lumen",
    vendor: "Lumen Analytics",
    plan: "Lumen Analytics Pro",
    account: "Acme Conseil SAS",
    accountKey: "acme",
    monthlyCents: 3900,
    currency: "EUR",
    baseUrl: `https://${STRIPE_PORTAL_HOST}`,
    allowedHost: STRIPE_PORTAL_HOST,
    finalStepPath: STRIPE_FINAL_STEP,
    donePath: null,
    finalButtonLabel: "Cancel subscription",
    kind: "stripe_portal",
    guide: {
      source: "research",
      // L'écran est celui de Stripe : c'est la doc de Stripe qui lui correspond.
      merchant: "Stripe customer portal",
      // Les vidéos sur Stripe montrent le tableau de bord marchand, pas le portail abonné.
      video: false,
      fallback: 'Find the active subscription, choose "Cancel subscription", pick a reason if asked, and continue to the final confirmation.',
    },
    proof: "billing_api",
  };
}

/**
 * Le navigateur de l'agent H tourne dans le cloud de H : il ne voit pas la
 * machine locale. Un portail en http://localhost ne peut donc pas être piloté,
 * et lancer une session pour rien consommerait des crédits.
 */
export function reachableByAgent(s: Supplier): boolean {
  try {
    const u = new URL(s.baseUrl);
    const h = u.hostname.toLowerCase();
    const local = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".local");
    return u.protocol === "https:" && !local;
  } catch {
    return false;
  }
}

/** Lien de connexion du portail. Contient un jeton : ne jamais le renvoyer au client. */
export function supplierLoginUrl(s: Supplier): string {
  const token = process.env.PORTAL_LOGIN_TOKEN ?? "";
  const lang = portalLang() === "en" ? "&lang=en" : "";
  return `${s.baseUrl}/login?token=${encodeURIComponent(token)}${lang}`;
}

export interface SupplierState {
  status: "active" | "discounted" | "cancelled";
  confirmation_number: string | null;
  cancelled_at: string | null;
  access_until?: string;
  company?: string;
  plan?: string;
}

/** État réel de l'abonnement chez le fournisseur (la source de vérité). */
export async function readSupplierState(s: Supplier, target: SupplierTarget | null = null): Promise<SupplierState> {
  if (s.kind === "stripe_portal") {
    if (!target) throw new Error("abonnement Stripe inconnu pour cette exécution");
    return readPortalSubscription(target.subscriptionId);
  }
  const res = await fetch(`${s.baseUrl}/api/state?account=${encodeURIComponent(s.accountKey)}`, {
    headers: { "x-portal-key": process.env.PORTAL_API_KEY ?? "" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`portail ${res.status}`);
  return (await res.json()) as SupplierState;
}

/** Remet le compte de démo à l'état « actif » (avant une nouvelle démo). Inutile pour Stripe : abonnement neuf à chaque exécution. */
export async function resetSupplier(s: Supplier): Promise<void> {
  if (s.kind !== "demo_portal") return;
  const res = await fetch(`${s.baseUrl}/api/reset`, {
    method: "POST",
    headers: { "x-portal-key": process.env.PORTAL_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ account: s.accountKey }),
  });
  if (!res.ok) throw new Error(`portail ${res.status}`);
}
