// ---------------------------------------------------------------------------
// engine/core.ts — le moteur de calcul DÉTERMINISTE de Kerdaxis.
//
// RÈGLE D'OR (règle #2 du projet) : tout montant en euros est calculé ICI, par
// du code. Le LLM ne fait que CLASSER (nature, pôle, action, motif) ; il ne
// multiplie jamais, il n'émet jamais un nombre qui deviendrait un euro.
//
// Deux origines d'euro, et aucune troisième :
//   • le RELEVÉ : résiliation (tout le mensuel), doublon, hausse, frais de change ;
//   • un PRIX PUBLIC sourcé et daté (Linkup), pour switch / downgrade /
//     renégociation, transformé en économie par `pricing.ts`.
// Tant que ce prix n'est pas cherché, le levier est `pending` à 0 € : plus de
// pourcentage forfaitaire par action, qui n'était qu'une estimation figée.
//
// Produit un AnalyzeResult complet à partir des transactions normalisées et
// des verdicts de catégorisation.
// ---------------------------------------------------------------------------

import type {
  AnalyzeResult,
  Categorizer,
  FluxItem,
  Hausse,
  Lever,
  LeverAction,
  Localized,
  MerchantVerdict,
  Motif,
  Nature,
  NatureSlice,
  PoleSlice,
  Risk,
  TvaPerdue,
  Tx,
} from "@/lib/types";
import { classifyEI, type MerchantInput } from "@/lib/categorize";
import { isMarketPriced } from "./pricing";

/**
 * Version du contrat de calcul. Exposée par l'API moteur (/api/v1/engine) et
 * jointe à chaque réponse : un client peut détecter qu'une règle a changé.
 * À incrémenter dès qu'une règle métier modifie un chiffre produit.
 */
export const ENGINE_VERSION = "2.0.0";

const DAY = 86_400_000;
const NATURE_LABEL: Record<Nature, string> = {
  pilotable: "Pilotable",
  structurel: "Structurel",
  ponctuel: "Ponctuel",
  perso: "Perso",
};

// ---------------------------------------------------------------------------
// Part du mensuel OBSERVÉ récupérable, pour les seules actions dont l'économie
// se lit sur le relevé. Résilier rend tout le mensuel ; dans un doublon, on garde
// un des deux outils, et chacun des deux porte la moitié de la paire.
// Les autres actions passent par un prix sourcé (pricing.ts), jamais par ici.
// ---------------------------------------------------------------------------
const PART_OBSERVEE: Partial<Record<LeverAction, number>> = {
  cancel: 1.0,
  consolidate: 0.5,
};

// ---------------------------------------------------------------------------
// Risque d'une action, fixé par le moteur et non par le modèle :
//   • renégocier ou fusionner un doublon ne retire aucune capacité ;
//   • résilier, descendre de palier ou changer d'outil demande de vérifier
//     l'usage réel, que le relevé bancaire ne montre pas.
// Le modèle ne garde qu'un drapeau : `hard` = migration lourde (CRM, téléphonie).
// ---------------------------------------------------------------------------
const RISQUE_PAR_ACTION: Record<LeverAction, Risk> = {
  renegotiate: "safe",
  consolidate: "safe",
  cancel: "med",
  downgrade: "med",
  switch: "med",
  keep: "safe",
};

export function riskFor(action: LeverAction, llmRisk: Risk): Risk {
  return llmRisk === "hard" ? "hard" : RISQUE_PAR_ACTION[action];
}

/** Libellé d'attente tant que le prix du marché n'est pas cherché. */
export const PENDING_LABEL = "prix à vérifier sur le web";

const eurL = (n: number): Localized => ({
  fr: Math.round(n).toLocaleString("fr-FR") + " €",
  en: Math.round(n).toLocaleString("en-US") + " €",
});

// --- Utilitaires numériques ------------------------------------------------
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ordinal(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / DAY);
}

interface MerchantAgg {
  name: string;
  txs: Tx[];
  total: number;
  occurrences: number;
  isRecurring: boolean;
  monthly: number; // run-rate mensuel normalisé
  dominantOp: string;
}

function aggregate(debits: Tx[], months: number): MerchantAgg[] {
  const groups = new Map<string, Tx[]>();
  for (const tx of debits) {
    const key = tx.merchant.toLowerCase();
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(tx);
  }

  const out: MerchantAgg[] = [];
  for (const txs of groups.values()) {
    const amounts = txs.map((t) => t.amount);
    const total = amounts.reduce((a, b) => a + b, 0);
    const n = txs.length;

    // Opération dominante
    const opCounts = new Map<string, number>();
    for (const t of txs) opCounts.set(t.operationType, (opCounts.get(t.operationType) ?? 0) + 1);
    const dominantOp = [...opCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Récurrence + normalisation mensuelle (règle : jamais annualiser un one-off)
    let isRecurring = false;
    let monthly = total / months; // défaut : dépense variable lissée
    if (n >= 2) {
      const ords = txs.map((t) => ordinal(t.date)).sort((a, b) => a - b);
      const intervals = ords.slice(1).map((v, i) => v - ords[i]);
      const medInt = median(intervals);
      const monthlyCadence = medInt >= 20 && medInt <= 45;
      if (monthlyCadence || dominantOp === "direct_debit") {
        isRecurring = true;
        monthly = median(amounts); // abonnement mensuel réel
      }
    }

    out.push({
      name: txs[0].merchant,
      txs,
      total,
      occurrences: n,
      isRecurring,
      monthly,
      dominantOp,
    });
  }
  return out;
}

export function toMerchantInputs(debits: Tx[], months: number): MerchantInput[] {
  return aggregate(debits, months).map((m) => ({
    name: m.name,
    occurrences: m.occurrences,
    monthlyEstimate: m.monthly,
    isRecurring: m.isRecurring,
  }));
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "x";
}

/**
 * Motif du levier — la TAXONOMIE orthogonale à la nature. Un levier n'existe QUE
 * pour un marchand `pilotable` dont le motif est `abonnement`, `doublon` ou `fx`.
 * `variable` (dépense pilotable non récurrente, one-off) ne produit jamais de
 * levier : on n'annualise pas un one-off.
 *
 * Le motif peut être fourni par l'appelant (API moteur) ; sinon on le DÉRIVE
 * des faits observés + de l'action classée. La dérivation reste déterministe.
 */
function deriveMotif(agg: MerchantAgg, v: MerchantVerdict): Motif {
  if (v.action === "keep") return "variable";
  if (v.action === "consolidate") return "doublon";
  if (v.isSubscription || agg.isRecurring) return "abonnement";
  return "variable";
}

/**
 * Transaction de FRAIS DE CHANGE — la SEULE à alimenter le levier fx agrégé.
 * On exige `isFx` (posé en amont par isFxFee : `qonto_fee` + référence « fx », ou
 * devise ≠ EUR avec un frais explicite) : chez Qonto TOUS les frais (forfait,
 * carte, SEPA, retrait DAB, change) portent `operation_type = qonto_fee`, seul
 * `isFx` isole le vrai change. Ces transactions sont ensuite EXCLUES de
 * l'agrégation par marchand pour ne jamais être comptées deux fois (levier fx +
 * levier par-marchand).
 */
function isFxLeverTx(t: Tx): boolean {
  return t.isFx && (t.operationType === "qonto_fee" || (t.fee ?? 0) > 0);
}
function fxFeeAmount(t: Tx): number {
  return t.operationType === "qonto_fee" ? t.amount : t.fee ?? 0;
}

export interface BuildInput {
  account: { name: string; bank: string; balance: number };
  windowLabel: Localized;
  txs: Tx[];
  verdicts: MerchantVerdict[];
  windowDays: number;
  source: "qonto" | "mock";
  categorized: Categorizer;
}

export function build(input: BuildInput): AnalyzeResult {
  const { txs, verdicts, windowDays } = input;
  const months = Math.max(1, windowDays / 30);

  const verdictOf = new Map(verdicts.map((v) => [v.name.toLowerCase(), v]));
  const natureOf = (name: string): Nature =>
    verdictOf.get(name.toLowerCase())?.nature ?? "ponctuel";

  const debits = txs.filter((t) => t.side === "debit");
  const credits = txs.filter((t) => t.side === "credit");

  // Les frais de change sont ISOLÉS ici : ils alimentent le levier fx agrégé, et
  // JAMAIS un levier par-marchand, le run-rate, les pôles ou les flux — sinon le
  // même euro serait compté deux fois. Tout le reste passe par merchantDebits.
  const feeDebits = debits.filter(isFxLeverTx);
  const merchantDebits = debits.filter((t) => !isFxLeverTx(t));

  // Fenêtre « ce mois » = 30 derniers jours (le relevé affiché).
  const monthCutoff = ordinal(new Date().toISOString().slice(0, 10)) - 30;
  const recentDebits = debits.filter((t) => ordinal(t.date) >= monthCutoff);

  // --- natures : montants OBSERVÉS sur 30 j (non annualisés) ----------------
  const natureSums: Record<Nature, number> = {
    pilotable: 0, structurel: 0, ponctuel: 0, perso: 0,
  };
  for (const t of recentDebits) natureSums[natureOf(t.merchant)] += t.amount;
  const natures: NatureSlice[] = (["structurel", "ponctuel", "perso", "pilotable"] as Nature[]).map(
    (key) => ({ key, label: NATURE_LABEL[key], amount: Math.round(natureSums[key]) }),
  );
  const totalOut = Math.round(recentDebits.reduce((s, t) => s + t.amount, 0));

  // --- run-rate pilotable + pôles (mensuel normalisé) -----------------------
  // aggs = marchands HORS frais de change (isolés dans le levier fx).
  const aggs = aggregate(merchantDebits, months);
  const poleSums = new Map<string, number>();
  let runRate = 0;
  for (const a of aggs) {
    const v = verdictOf.get(a.name.toLowerCase());
    if (!v || v.nature !== "pilotable") continue;
    runRate += a.monthly;
    poleSums.set(v.pole, (poleSums.get(v.pole) ?? 0) + a.monthly);
  }
  runRate = Math.round(runRate);
  const poles: PoleSlice[] = [...poleSums.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount) }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // --- leviers ----------------------------------------------------------------
  // Le levier n'existe que si nature==='pilotable' ET motif ∈ {abonnement,
  // doublon} (le motif `fx` est un levier agrégé, traité à part).
  //   • doublon / cancel   → part du mensuel OBSERVÉ (PART_OBSERVEE) ;
  //   • hausse silencieuse → traitée plus bas, delta observé ;
  //   • switch / downgrade / renegotiate → `pending` à 0 €, l'euro viendra d'un
  //     prix sourcé (benchmark Linkup puis pricing.ts). L'alternative citée de
  //     mémoire par le modèle n'est PAS affichée : seule une source du web l'est.
  const levers: Lever[] = [];
  const leverNames = new Set<string>();
  for (const a of aggs) {
    const v = verdictOf.get(a.name.toLowerCase());
    if (!v || v.nature !== "pilotable") continue;
    const motif = v.motif ?? deriveMotif(a, v);
    if (motif !== "abonnement" && motif !== "doublon") continue; // GATE
    const hausse = detectHausse(a);
    const action: LeverAction = motif === "doublon" ? "consolidate" : v.action;
    if (isMarketPriced(action)) {
      if (action === "renegotiate" && hausse) continue; // levier de hausse, plus solide
      levers.push({
        id: slug(a.name),
        label: a.name,
        to: PENDING_LABEL,
        saving: 0,
        motif,
        risk: riskFor(action, v.risk),
        active: false,
        action,
        monthly: Math.round(a.monthly),
        pole: v.pole,
        basis: "pending",
        ...(hausse ? { hausse } : {}),
      });
      leverNames.add(a.name.toLowerCase());
      continue;
    }
    const saving = Math.round(a.monthly * (PART_OBSERVEE[action] ?? 0));
    if (saving <= 0) continue;
    const risk = riskFor(action, v.risk);
    levers.push({
      id: slug(a.name),
      label: a.name,
      to: v.alternative || v.action,
      saving,
      motif,
      risk,
      active: risk === "safe",
      action,
      monthly: Math.round(a.monthly),
      pole: v.pole,
      basis: "observed",
      ...(hausse ? { hausse } : {}),
    });
    leverNames.add(a.name.toLowerCase());
  }

  // Hausses silencieuses sur des récurrents pilotables non déjà couverts par un
  // levier : on les remonte comme un levier « renégocier / revenir au tarif ».
  // Le montant récupérable = delta mensuel (dernière − 1re occurrence). C'est un
  // écart OBSERVÉ, 100 % déterministe — le levier le plus solide.
  for (const a of aggs) {
    const key = a.name.toLowerCase();
    if (leverNames.has(key)) continue;
    const v = verdictOf.get(key);
    if (!v || v.nature !== "pilotable") continue;
    const hausse = detectHausse(a);
    if (!hausse) continue;
    levers.push({
      id: slug(a.name),
      label: a.name,
      to: "revenir au tarif précédent",
      saving: Math.max(0, Math.round(hausse.apresEur - hausse.avantEur)),
      motif: "abonnement",
      risk: "safe",
      active: true,
      action: "renegotiate",
      monthly: Math.round(a.monthly),
      pole: v.pole,
      basis: "observed",
      hausse,
    });
    leverNames.add(key);
  }

  // Frais de change : levier AGRÉGÉ (règle métier — un seul levier). 100 %
  // pilotables (on peut les éviter), 100 % déterministes (somme des frais
  // observés, normalisée /mois).
  //
  // feeDebits = les transactions isolées plus haut par isFxLeverTx. Elles sont
  // la SEULE source du levier fx : pas de double comptage possible.
  const fxFees = feeDebits.reduce((s, t) => s + fxFeeAmount(t), 0);
  const fxMonthly = Math.round(fxFees / months);
  if (fxMonthly > 0) {
    levers.push({
      id: "frais-de-change",
      label: "Frais de change",
      to: "compte multi-devises / carte sans frais",
      saving: fxMonthly,
      motif: "fx",
      risk: "safe",
      active: true,
      action: "switch",
      monthly: fxMonthly,
      basis: "observed",
    });
  }

  levers.sort((x, y) => y.saving - x.saving);

  // Ids de leviers UNIQUES : slug() tronque à 24 car. et écrase la ponctuation,
  // donc deux marchands distincts peuvent produire le même id. La dédup ci-dessus
  // se fait sur le NOM, pas sur l'id → on suffixe -2, -3… pour garantir l'unicité
  // et ne jamais casser les clés React / le drag-and-drop / le toggle côté front.
  const seenIds = new Set<string>();
  for (const l of levers) {
    let id = l.id;
    for (let n = 2; seenIds.has(id); n++) id = `${l.id}-${n}`;
    l.id = id;
    seenIds.add(id);
  }

  // Économie ANNUELLE par levier = mensuel × 12, calculée PAR LE MOTEUR (jamais
  // par un client / un LLM). Un consommateur — l'API, Claude Tag — reprend ce
  // chiffre verbatim au lieu de multiplier lui-même (règle #2).
  for (const l of levers) l.savingYearly = l.saving * 12;

  // --- score /100 : grille transparente ------------------------------------
  const drivers: Localized[] = [];
  let score = 100;

  const consolidations = levers.filter((l) =>
    verdictOf.get(l.label.toLowerCase())?.action === "consolidate",
  );
  if (consolidations.length > 0) {
    const pen = 8;
    score -= pen;
    drivers.push({
      fr: `Doublons fonctionnels (${consolidations.length}) −${pen}`,
      en: `Functional duplicates (${consolidations.length}) −${pen}`,
    });
  }

  const needJustif = recentDebits.filter((t) => t.attachmentRequired && !t.hasAttachment);
  if (needJustif.length > 0) {
    const pen = Math.min(8, Math.ceil((needJustif.length / Math.max(1, recentDebits.length)) * 20));
    score -= pen;
    drivers.push({
      fr: `Justificatifs TVA manquants (${needJustif.length}) −${pen}`,
      en: `Missing VAT receipts (${needJustif.length}) −${pen}`,
    });
  }

  const activeSavings = levers.filter((l) => l.active).reduce((s, l) => s + l.saving, 0);
  if (runRate > 0 && activeSavings > 0) {
    const pen = Math.min(12, Math.round((activeSavings / runRate) * 12));
    if (pen > 0) {
      score -= pen;
      drivers.push({
        fr: `Part optimisable du run-rate −${pen}`,
        en: `Optimizable share of run-rate −${pen}`,
      });
    }
  }
  score = Math.max(0, Math.min(100, score));

  // --- runway : solde ÷ burn net mensuel, hors ponctuel --------------------
  const recentCredits = credits.filter((t) => ordinal(t.date) >= monthCutoff);
  const burnOut = recentDebits
    .filter((t) => natureOf(t.merchant) !== "ponctuel")
    .reduce((s, t) => s + t.amount, 0);
  const inflow = recentCredits.reduce((s, t) => s + t.amount, 0);
  const netBurn = burnOut - inflow;
  const months_left = netBurn > 0 ? input.account.balance / netBurn : 99;
  const runway = {
    months: Math.round(Math.min(99, Math.max(0, months_left)) * 10) / 10,
    note: { fr: "hors exceptionnel", en: "excl. one-offs" } as Localized,
  };

  // --- flux nouveaux & anomalies -------------------------------------------
  const flux = detectFlux(merchantDebits, aggs, verdictOf, monthCutoff);

  // --- TVA déductible perdue : dépenses PRO sans justificatif ---------------
  // PÉRIMÈTRE ALIGNÉ SUR engine.py (règle #2, engine.py fait foi) : on ne compte
  // QUE les marchands classés PRO par mots-clés (classifyEI, whitelist
  // PRO_KEYWORDS) — jamais A-CLARIFIER, structurel, voyage… On agrège les
  // transactions où un justificatif était requis mais absent. TVA = base × 20/120.
  // Levier fiscal indicatif : à confirmer avec un comptable.
  const tvaConcerned = debits.filter(
    (t) => t.attachmentRequired && !t.hasAttachment && classifyEI(t.merchant) === "PRO",
  );
  let tvaPerdue: TvaPerdue | undefined;
  if (tvaConcerned.length > 0) {
    const baseTtc = tvaConcerned.reduce((s, t) => s + t.amount, 0);
    const tva = (baseTtc * 20) / 120;
    if (tva > 0) {
      tvaPerdue = {
        transactions: tvaConcerned.length,
        baseTtcEur: Math.round(baseTtc * 100) / 100,
        tvaRecuperableEur: Math.round(tva * 100) / 100,
      };
    }
  }

  const noFlag: Localized = { fr: "Aucun point de vigilance majeur", en: "No major red flag" };

  return {
    account: input.account,
    window: { label: input.windowLabel },
    totals: { out: totalOut, runRate },
    natures,
    poles,
    score: { value: score, drivers: drivers.length ? drivers : [noFlag] },
    runway,
    levers,
    flux,
    ...(tvaPerdue ? { tvaPerdue } : {}),
    meta: { source: input.source, categorized: input.categorized, txCount: txs.length },
  };
}

/**
 * Hausse silencieuse : sur un marchand RÉCURRENT, compare le montant de la 1re
 * et de la dernière occurrence (triées par date). Seuil de déclenchement : +5 %.
 * Jamais sur un one-off (on exige isRecurring + ≥ 2 occurrences).
 */
function detectHausse(agg: MerchantAgg): Hausse | null {
  if (!agg.isRecurring || agg.txs.length < 2) return null;
  const ordered = [...agg.txs].sort((a, b) => ordinal(a.date) - ordinal(b.date));
  const avant = ordered[0].amount;
  const apres = ordered[ordered.length - 1].amount;
  if (avant <= 0 || apres < avant * 1.05) return null;
  return {
    pct: Math.round((apres / avant - 1) * 1000) / 10, // arrondi 1 décimale
    avantEur: Math.round(avant * 100) / 100,
    apresEur: Math.round(apres * 100) / 100,
  };
}

function detectFlux(
  debits: Tx[],
  aggs: MerchantAgg[],
  verdictOf: Map<string, MerchantVerdict>,
  monthCutoff: number,
): FluxItem[] {
  const flux: FluxItem[] = [];
  const prevCutoff = monthCutoff - 30;

  const recentByMerchant = new Map<string, Tx[]>();
  const prevByMerchant = new Map<string, Tx[]>();
  for (const t of debits) {
    const o = ordinal(t.date);
    const key = t.merchant.toLowerCase();
    if (o >= monthCutoff) (recentByMerchant.get(key) ?? recentByMerchant.set(key, []).get(key)!).push(t);
    else if (o >= prevCutoff) (prevByMerchant.get(key) ?? prevByMerchant.set(key, []).get(key)!).push(t);
  }

  // Nouveaux marchands (présents ce mois, absents le mois précédent)
  for (const [key, txs] of recentByMerchant) {
    if (prevByMerchant.has(key)) continue;
    const v = verdictOf.get(key);
    if (v?.nature === "perso") continue; // bruit
    const monthly = txs.reduce((s, t) => s + t.amount, 0);
    const m = eurL(monthly);
    flux.push({
      kind: "new",
      label: { fr: `${txs[0].merchant} · nouveau flux`, en: `${txs[0].merchant} · new flow` },
      value: v?.isSubscription
        ? { fr: `${m.fr}/mois`, en: `${m.en}/mo` }
        : m,
      tone: "amber",
    });
  }

  // Doublons même jour ce mois
  for (const [, txs] of recentByMerchant) {
    const byDay = new Map<string, number>();
    for (const t of txs) byDay.set(t.date, (byDay.get(t.date) ?? 0) + 1);
    for (const [day, cnt] of byDay) {
      if (cnt >= 2) {
        flux.push({
          kind: "dup",
          label: {
            fr: `Doublon : ${txs[0].merchant} ×${cnt} le ${day}`,
            en: `Duplicate: ${txs[0].merchant} ×${cnt} on ${day}`,
          },
          value: eurL(median(txs.map((t) => t.amount))),
          tone: "danger",
        });
      }
    }
  }

  // Abonnements dormants (vus avant, plus ce mois)
  for (const a of aggs) {
    const key = a.name.toLowerCase();
    const v = verdictOf.get(key);
    if (v?.isSubscription && prevByMerchant.has(key) && !recentByMerchant.has(key)) {
      flux.push({
        kind: "ghost",
        label: {
          fr: `${a.name} · abo dormant, plus prélevé`,
          en: `${a.name} · dormant subscription, no longer charged`,
        },
        value: { fr: "à confirmer", en: "to confirm" },
        tone: "neutral",
      });
    }
  }

  return flux.slice(0, 8);
}
