// ---------------------------------------------------------------------------
// engine/pricing.ts : l'euro d'un levier qui dépend d'un prix du marché.
//
// Le web (Linkup) fournit des prix publics sourcés et datés, Holo les range en
// données (nom, prix, par poste ou non, comparable ou non). ICI, et seulement
// ici, ces prix deviennent une économie : règle #2, le moteur calcule.
//
// Aucune estimation : si un prix manque, ou si le nombre de postes payés ne se
// déduit pas du tarif actuel, le levier reste « non vérifié » avec la raison.
// ---------------------------------------------------------------------------

import type { LeverAction, LeverEvidence, Localized, SourcedOffer, UnverifiedReason } from "@/lib/types";

/** Écart toléré entre le montant payé et « postes × tarif » (TVA, arrondis). */
const SEAT_MATCH_TOLERANCE = 0.06;
/** Au-delà, un « nombre de postes » déduit n'est plus crédible pour une TPE. */
const MAX_INFERRED_SEATS = 200;

/** Actions dont l'économie dépend d'un prix du marché. */
export const MARKET_PRICED_ACTIONS: readonly LeverAction[] = ["switch", "downgrade", "renegotiate"];

export function isMarketPriced(action: LeverAction | undefined): boolean {
  return action !== undefined && MARKET_PRICED_ACTIONS.includes(action);
}

export interface MarketAlternative extends SourcedOffer {
  /** Étiquette du LLM : fait le même travail que l'outil actuel. */
  comparable: boolean;
}

export interface PricingInput {
  action: LeverAction;
  /** Dépense mensuelle observée sur le relevé (€). */
  monthly: number;
  /** Paliers publics du fournisseur actuel. */
  ownPlans: SourcedOffer[];
  /** Concurrents trouvés sur le web. */
  alternatives: MarketAlternative[];
}


export type PricingOutcome =
  | { status: "sourced"; saving: number; evidence: LeverEvidence }
  | { status: "unverified"; reason: Exclude<UnverifiedReason, "web_down"> };

interface CurrentPlan {
  plan: SourcedOffer;
  seats: number | null;
}

/**
 * Retrouve le palier payé aujourd'hui : celui dont « postes × tarif » (ou le
 * forfait) colle au montant observé. Null si aucun ne colle.
 */
export function inferCurrentPlan(monthly: number, ownPlans: SourcedOffer[]): CurrentPlan | null {
  if (monthly <= 0) return null;
  let best: (CurrentPlan & { error: number }) | null = null;
  for (const plan of ownPlans) {
    if (plan.monthlyPrice <= 0) continue;
    const seats = plan.perSeat ? Math.round(monthly / plan.monthlyPrice) : 1;
    if (seats < 1 || seats > MAX_INFERRED_SEATS) continue;
    const expected = plan.monthlyPrice * seats;
    const error = Math.abs(monthly - expected) / monthly;
    if (error > SEAT_MATCH_TOLERANCE) continue;
    if (!best || error < best.error) best = { plan, seats: plan.perSeat ? seats : null, error };
  }
  return best ? { plan: best.plan, seats: best.seats } : null;
}

function costFor(offer: SourcedOffer, seats: number | null): number | null {
  if (!offer.perSeat) return offer.monthlyPrice;
  return seats === null ? null : offer.monthlyPrice * seats;
}

function cheapest(
  offers: SourcedOffer[],
  seats: number | null,
): { offer: SourcedOffer; cost: number } | null {
  let best: { offer: SourcedOffer; cost: number } | null = null;
  for (const offer of offers) {
    const cost = costFor(offer, seats);
    if (cost === null) continue;
    if (!best || cost < best.cost) best = { offer, cost };
  }
  return best;
}

function outcome(monthly: number, pick: { offer: SourcedOffer; cost: number }, seats: number | null): PricingOutcome {
  const saving = Math.round(monthly - pick.cost);
  if (saving <= 0) return { status: "unverified", reason: "not_cheaper" };
  const { name, monthlyPrice, perSeat, sourceUrl, sourceDate, checkedAt } = pick.offer;
  const offer: SourcedOffer = { name, monthlyPrice, perSeat, sourceUrl, sourceDate, checkedAt };
  return { status: "sourced", saving, evidence: { offer, seats: perSeat ? seats : null } };
}

/**
 * switch / renegotiate : coût du concurrent comparable le moins cher (pour une
 * renégociation, c'est le point d'appui). downgrade : palier inférieur du même
 * fournisseur, le plus cher sous le palier actuel (on descend d'un cran).
 */
export function priceLever(input: PricingInput): PricingOutcome {
  const { action, monthly } = input;
  if (!isMarketPriced(action) || monthly <= 0) return { status: "unverified", reason: "no_price" };

  const current = inferCurrentPlan(monthly, input.ownPlans);
  const seats = current?.seats ?? null;

  if (action === "downgrade") {
    if (!current) return { status: "unverified", reason: input.ownPlans.length ? "no_seats" : "no_price" };
    // Un palier gratuit n'est pas un downgrade, c'est une résiliation déguisée :
    // il retire presque toujours la capacité qu'on paie aujourd'hui.
    const lower = input.ownPlans
      .filter((offer) => offer.monthlyPrice > 0)
      .map((offer) => ({ offer, cost: costFor(offer, seats) }))
      .filter((o): o is { offer: SourcedOffer; cost: number } => o.cost !== null && o.cost < monthly)
      .sort((a, b) => b.cost - a.cost)[0];
    return lower ? outcome(monthly, lower, seats) : { status: "unverified", reason: "not_cheaper" };
  }

  // Même règle que le downgrade : un palier gratuit ne fait pas le travail payé aujourd'hui.
  const comparable = input.alternatives.filter((a) => a.comparable && a.monthlyPrice > 0);
  if (comparable.length === 0) return { status: "unverified", reason: "no_price" };
  const pick = cheapest(comparable, seats);
  if (!pick) return { status: "unverified", reason: "no_seats" };
  return outcome(monthly, pick, seats);
}

/** Libellé de la proposition, construit par le moteur à partir de l'offre sourcée. */
export function describeEvidence(action: LeverAction, evidence: LeverEvidence): Localized {
  const { offer, seats } = evidence;
  const seatNote = seats !== null ? ` × ${seats}` : "";
  const fr = `${offer.monthlyPrice} €${offer.perSeat ? "/poste/mois" : "/mois"}${seatNote}`;
  const en = `€${offer.monthlyPrice}${offer.perSeat ? "/seat/mo" : "/mo"}${seatNote}`;
  if (action === "downgrade") return { fr: `formule ${offer.name} (${fr})`, en: `${offer.name} plan (${en})` };
  if (action === "renegotiate") {
    return { fr: `renégocier, appui : ${offer.name} à ${fr}`, en: `renegotiate, anchor: ${offer.name} at ${en}` };
  }
  return { fr: `passer à ${offer.name} (${fr})`, en: `switch to ${offer.name} (${en})` };
}
