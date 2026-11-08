// ---------------------------------------------------------------------------
// POST /api/benchmark : déclenché SUR ACCORD (règle 3). Linkup cherche les tarifs
// publics du fournisseur et des concurrents moins chers (sourcés + datés), Holo
// en extrait les prix ; ICI le moteur (`engine/pricing.ts`) transforme ces prix
// en économie pour l'action du levier. Le LLM ne chiffre jamais l'euro.
//
// ACCÈS : ouvert, mais PLAFONNÉ par IP (cf. lib/api/rate-limit.ts). Chaque appel
// consomme du Linkup et du H Company facturés. Exiger une session Qonto
// fermerait le trou plus proprement, mais casserait /demo : la page benchmarke
// pour un visiteur qui n'a jamais connecté de compte. Le plafond par IP garde la
// démo vivante et borne la facture. Un résultat déjà en cache (D1, 30 jours) ne
// coûte rien : il est servi AVANT le contrôle de débit.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { z } from "zod";
import { benchmark, cachedBenchmark, type BenchmarkResult, type BenchPlan } from "@/lib/benchmark";
import { describeEvidence, isMarketPriced, priceLever, type PricingOutcome } from "@/lib/engine";
import {
  messageTropDeRequetes,
  reponseTropDeRequetes,
  verifierDebit,
} from "@/lib/api/rate-limit";
import type { Lang, LeverAction, SourcedOffer } from "@/lib/types";
import { withAccessScope } from "@/lib/privacy/access-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // la recherche web peut prendre quelques secondes

const LANGS = ["fr", "en", "de", "es", "it"] as const satisfies readonly Lang[];
const ACTIONS = ["keep", "cancel", "downgrade", "switch", "consolidate", "renegotiate"] as const satisfies readonly LeverAction[];
const DEFAULT_CATEGORY = "outil SaaS";
const MAX_MERCHANT_LENGTH = 120;
const MAX_CATEGORY_LENGTH = 80;

const BenchmarkBody = z.object({
  merchant: z.string().trim().min(1).max(MAX_MERCHANT_LENGTH),
  category: z.string().trim().max(MAX_CATEGORY_LENGTH).optional(),
  monthly: z.number().nonnegative().finite().optional(),
  action: z.enum(ACTIONS).optional(),
  lang: z.enum(LANGS).optional(),
});

export type BenchmarkResponse = BenchmarkResult & {
  /** Économie calculée par le moteur pour l'action du levier, null si l'action ne dépend pas d'un prix. */
  pricing: (PricingOutcome & { savingYearly?: number; to?: string }) | null;
  bestSaving: number;
  bestAlternative: string | null;
};

function toOffer(plan: BenchPlan, checkedAt: string): SourcedOffer | null {
  if (plan.monthlyPrice === null) return null;
  return {
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    perSeat: plan.perSeat,
    sourceUrl: plan.sourceUrl,
    sourceDate: plan.sourceDate,
    checkedAt,
  };
}

function withPricing(result: BenchmarkResult, monthly: number, action: LeverAction | undefined): BenchmarkResponse {
  if (!action || !isMarketPriced(action)) {
    return { ...result, pricing: null, bestSaving: 0, bestAlternative: null };
  }
  const ownPlans = (result.ownPlans ?? []).map((p) => toOffer(p, result.checkedAt)).filter((o): o is SourcedOffer => o !== null);
  const alternatives = (result.alternatives ?? []).flatMap((a) => {
    const offer = toOffer(a, result.checkedAt);
    return offer ? [{ ...offer, comparable: a.comparable }] : [];
  });
  const pricing = priceLever({ action, monthly, ownPlans, alternatives });
  if (pricing.status !== "sourced") {
    return { ...result, pricing, bestSaving: 0, bestAlternative: null };
  }
  return {
    ...result,
    pricing: { ...pricing, savingYearly: pricing.saving * 12, to: describeEvidence(action, pricing.evidence) },
    bestSaving: pricing.saving,
    bestAlternative: pricing.evidence.offer.name,
  };
}

async function handlePost(request: Request): Promise<Response> {
  let parsed: z.infer<typeof BenchmarkBody>;
  try {
    parsed = BenchmarkBody.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Corps attendu : { merchant, category?, monthly?, action?, lang? }." } },
      { status: 400 },
    );
  }
  const { merchant, action } = parsed;
  const category = parsed.category || DEFAULT_CATEGORY;
  const monthly = parsed.monthly ?? 0;
  const lang: Lang = parsed.lang ?? "fr";

  const hit = await cachedBenchmark(merchant, category, lang);
  if (hit) return NextResponse.json(withPricing(hit, monthly, action));

  // Avant TOUT travail payant : le contrôle de débit.
  const debit = await verifierDebit(request, "benchmark");
  if (!debit.autorise) {
    // La forme d'un résultat vide est reprise ici pour que l'écran affiche
    // l'explication au lieu d'un encart muet.
    return reponseTropDeRequetes(debit, {
      verified: false,
      note: messageTropDeRequetes(debit),
      ownPlans: [],
      alternatives: [],
      sources: [],
      pricing: null,
      bestSaving: 0,
      bestAlternative: null,
    });
  }

  const result = await benchmark(merchant, category, monthly, lang);
  return NextResponse.json(withPricing(result, monthly, action));
}

export async function POST(request: Request): Promise<Response> {
  return withAccessScope(request, () => handlePost(request));
}
