// ---------------------------------------------------------------------------
// Repli du benchmark : lire la page tarifs OFFICIELLE avec l'agent H Company
// `h/web-scraper-flash` (navigateur textuel, une page lue en ~15 s).
//
// Pourquoi : la réponse synthétisée de Linkup perd souvent la grille tarifaire
// (prix par poste, paliers, mensuel vs annuel). Sans palier chiffré du
// fournisseur actuel, `engine/pricing.ts` ne peut pas déduire le nombre de
// postes payés, et le levier reste « non vérifié ». L'agent lit la grille sur
// le site du fournisseur lui-même.
//
// Garde-fous :
//   • Règle 2 : l'agent ÉTIQUETTE (prix affiché, devise, période de
//     facturation) ; la division d'un total annuel par 12 est faite ici.
//     Un prix hors euros est écarté, jamais converti.
//   • Règle 3 : seuls le nom du marchand et sa catégorie, déjà nettoyés par
//     `sanitizeMerchantQuery`, partent vers H, revérifiés par `assertNoPii`.
//   • Règle 4 : chaque prix porte l'URL de la page lue et la date du relevé.
//     Une page hors du domaine du marchand est rejetée.
//
// Contrat API constaté le 2026-11-08 : un agent pré-construit se nomme par une
// chaîne (`agent: "h/web-scraper-flash"`), le schéma de réponse et l'URL de
// départ passent par `overrides`. Une session qui a répondu reste `idle` : on
// l'annule toujours, sinon elle attend jusqu'à son délai d'inactivité.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { cancelSession, createSession, getChanges, getSession, haiConfigured } from "@/lib/execution/hcompany";
import { recordAccess } from "@/lib/privacy/access-log";
import { assertNoPii } from "@/lib/privacy/egress";

export const SCRAPER_AGENT = "h/web-scraper-flash";
const SCRAPER_MAX_TIME_S = 60;
const SCRAPER_BUDGET_MS = 45_000;
const POLL_WAIT_S = 10;
const MONTHS_PER_YEAR = 12;
const CENTS = 100;
const MIN_BRAND_LENGTH = 3;
const SEARCH_URL = "https://www.bing.com/search?q=";
const PRICING_PATH = /pric|tarif|prix|plans|preise|precios|prezzi/i;
const EURO_CURRENCIES = new Set(["EUR", "€"]);
const FAILED_STATUSES = new Set(["failed", "timed_out", "interrupted"]);

const BILLING = ["monthly", "annual_per_month", "annual_total"] as const;

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    pageUrl: { type: "string" },
    plans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          billing: { type: ["string", "null"], enum: [...BILLING, null] },
          perSeat: { type: "boolean" },
        },
        required: ["name", "price", "currency", "billing", "perSeat"],
      },
    },
  },
  required: ["pageUrl", "plans"],
} as const;

const ScrapedPlan = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative().nullable(),
  // Null sur un palier « Contact sales » : constaté en direct le 2026-11-08.
  currency: z.string().nullable(),
  billing: z.enum(BILLING).nullable(),
  perSeat: z.boolean(),
});
type ScrapedPlan = z.infer<typeof ScrapedPlan>;

/**
 * Ce que rend l'agent est une donnée externe : revalidé avant usage. Chaque
 * palier est validé à part : un palier mal formé est écarté sans emporter les autres.
 */
const ScrapedAnswer = z.object({
  pageUrl: z.string().url(),
  plans: z.array(z.unknown()),
});

export interface ScrapedPricing {
  /** Page officielle où les prix ont été lus (la source affichée). */
  pageUrl: string;
  plans: Array<{ name: string; monthlyPrice: number | null; perSeat: boolean }>;
}

interface ScrapeTarget {
  merchant: string;
  category: string;
  /** URL de départ si une source Linkup est déjà la page officielle. */
  knownSourceUrls: string[];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function brandOf(merchant: string): string {
  return normalize(merchant.split(/[\s/×·+|(]+/)[0] || merchant);
}

/** Vrai si l'hôte de l'URL appartient au marchand (notion.com pour « Notion Labs »). */
export function isOfficialUrl(url: string, merchant: string): boolean {
  const brand = brandOf(merchant);
  if (brand.length < MIN_BRAND_LENGTH) return false;
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    host = parsed.hostname;
  } catch {
    return false;
  }
  return host
    .split(".")
    .slice(0, -1)
    .map(normalize)
    .some((label) => label.length >= MIN_BRAND_LENGTH && (label.includes(brand) || brand.includes(label)));
}

/** Page de départ : la source Linkup officielle (page tarifs de préférence), sinon une recherche web. */
export function pickStartUrl(target: ScrapeTarget): string {
  const official = target.knownSourceUrls.filter((url) => isOfficialUrl(url, target.merchant));
  const pricingPage = official.find((url) => PRICING_PATH.test(new URL(url).pathname));
  return pricingPage ?? official[0] ?? `${SEARCH_URL}${encodeURIComponent(`${target.merchant} pricing`)}`;
}

/**
 * Prix mensuel en euros, ou null : devise étrangère ou inconnue écartée, période
 * de facturation inconnue écartée (aucune supposition), total annuel divisé par 12.
 */
export function toMonthlyEuro(plan: ScrapedPlan): number | null {
  if (plan.price === null || plan.currency === null || plan.billing === null) return null;
  if (!EURO_CURRENCIES.has(plan.currency.trim().toUpperCase())) return null;
  if (plan.billing !== "annual_total") return plan.price;
  return Math.round((plan.price / MONTHS_PER_YEAR) * CENTS) / CENTS;
}

function instructions(merchant: string, category: string): string {
  return (
    `Find the official public pricing of "${merchant}" (category: ${category}). ` +
    `Read prices ONLY on ${merchant}'s own website, never on a review or comparison site. ` +
    "For each plan, give its name and the price exactly as displayed, with its currency code (EUR, USD...). " +
    "billing: monthly if billed month to month; annual_per_month if the price is per month but billed yearly; annual_total if it is a yearly total. " +
    "If a monthly billing option exists, report that one. perSeat: true if the price is per user or per seat. " +
    'price is null when no number is shown (for example "Contact sales"). Never invent a price. ' +
    "pageUrl: the exact URL of the page where you read the prices."
  );
}

async function waitForAnswer(sessionId: string): Promise<unknown> {
  const deadline = Date.now() + SCRAPER_BUDGET_MS;
  let fromIndex = 0;
  while (Date.now() < deadline) {
    const changes = await getChanges(sessionId, fromIndex, POLL_WAIT_S);
    if (changes) {
      fromIndex = (changes.first_index ?? fromIndex) + (changes.new_events ?? []).length;
      if (changes.answer != null) return changes.answer;
      if (FAILED_STATUSES.has(changes.status)) throw new Error(`scraper session ${changes.status}: ${changes.error_code ?? "no detail"}`);
      if (changes.status !== "completed" && changes.status !== "idle") continue;
    }
    const current = await getSession(sessionId);
    if (current?.latest_answer != null) return current.latest_answer;
    const status = current?.status?.status ?? "";
    if (FAILED_STATUSES.has(status) || status === "completed") throw new Error(`scraper session ended without answer (${status})`);
  }
  throw new Error("scraper session too slow");
}

/**
 * Lit la grille tarifaire officielle du marchand. Ne lève jamais : tout échec
 * (pas de clé, session en erreur, page hors domaine, réponse invalide) rend null,
 * et le benchmark garde ce qu'il avait.
 */
export async function scrapeOfficialPricing(target: ScrapeTarget): Promise<ScrapedPricing | null> {
  if (!haiConfigured()) return null;
  const { merchant, category } = target;
  const body = {
    agent: SCRAPER_AGENT,
    messages: instructions(merchant, category),
    overrides: {
      "agent.environments[kind=web].start_url": pickStartUrl(target),
      "agent.answer_format": ANSWER_SCHEMA,
    },
    max_time_s: SCRAPER_MAX_TIME_S,
  };

  let sessionId: string | null = null;
  try {
    assertNoPii(body, "lecture de page tarifs H Company");
    void recordAccess({ service: "hcompany", operation: "pricing page read", direction: "sent", sent: `${merchant} · ${category}` });
    const session = await createSession(body, crypto.randomUUID());
    if (!session) return null;
    sessionId = session.id;
    const answer = ScrapedAnswer.parse(await waitForAnswer(session.id));
    if (!isOfficialUrl(answer.pageUrl, merchant)) {
      console.error("Benchmark (scraper) : page hors du domaine du marchand, prix écartés", { merchant, host: new URL(answer.pageUrl).hostname });
      return null;
    }
    const plans = answer.plans.flatMap((raw) => {
      const parsed = ScrapedPlan.safeParse(raw);
      return parsed.success ? [{ name: parsed.data.name, monthlyPrice: toMonthlyEuro(parsed.data), perSeat: parsed.data.perSeat }] : [];
    });
    return { pageUrl: answer.pageUrl, plans };
  } catch (err) {
    console.error("Benchmark (scraper) échoué :", { merchant, error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    if (sessionId) await cancelSession(sessionId).catch(() => undefined);
  }
}
