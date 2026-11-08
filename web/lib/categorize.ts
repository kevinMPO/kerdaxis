// ---------------------------------------------------------------------------
// Catégorisation des marchands via un modèle Holo de H Company (PRD §5.2),
// par la Models API de H (compatible OpenAI, même clé HAI_API_KEY que l'agent).
//
// RÈGLE : le LLM CLASSE (nature, pôle, action, risque). Il ne calcule JAMAIS un
// montant en euros ni un ratio : c'est le moteur qui applique RATIO_ECONOMIE.
//
// Sans HAI_API_KEY, ou si l'appel échoue, on retombe sur un classifieur
// déterministe par mots-clés (categorizeByRules) : l'app reste démontrable
// hors-ligne.
//
// RÈGLE 3 (zéro PII) : le nom du marchand vient de `clean_counterparty_name`
// SINON du `label` Qonto brut, qui contient couramment le nom d'une personne
// physique et une référence de paiement. Ce qui sort d'ici est donc nettoyé par
// `sanitizeMerchantQuery`, puis re-contrôlé par `assertNoPii` avant l'appel. Le
// montant en euros, lui, ne sort plus du tout : le classifieur produit des
// étiquettes et un ratio, il n'a jamais eu besoin du montant pour cela.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { holoChat, holoConfigured } from "@/lib/llm/holo";
import { assertNoPii, sanitizeMerchantQuery } from "@/lib/privacy/egress";
import type { MerchantVerdict, Nature, Pole, Risk, LeverAction } from "./types";
import { recordAccess } from "@/lib/privacy/access-log";

/** Au-delà, /api/analyze retombe sur les règles plutôt que de faire attendre le dashboard. */
const HOLO_TIMEOUT_MS = 30_000;
const RISKS: Risk[] = ["safe", "med", "hard"];

const NATURES: Nature[] = ["pilotable", "structurel", "ponctuel", "perso"];
const POLES: Pole[] = [
  "IA & Dev",
  "Outbound / Sales",
  "Infra / Prod",
  "Marketing Ads",
  "Bureau / Telco / Banque",
  "Perso",
  "Sous-traitance",
  "Certif",
  "Voyage",
  "Autre",
];
const ACTIONS: LeverAction[] = [
  "keep",
  "cancel",
  "downgrade",
  "switch",
  "consolidate",
  "renegotiate",
];

export interface MerchantInput {
  name: string;
  occurrences: number;
  /** Indicatif, calculé par engine.ts. Usage INTERNE : jamais transmis (règle 3). */
  monthlyEstimate: number;
  isRecurring: boolean;
}

const SYSTEM = `Tu es le moteur de catégorisation de Kerdaxis, un agent d'optimisation
financière pour TPE et entreprises individuelles françaises clientes de Qonto.

Pour chaque marchand fourni, tu renvoies une classification. Tu ne calcules AUCUN
montant en euros ET AUCUN ratio : un moteur déterministe s'en charge. Tu fournis
UNIQUEMENT des étiquettes (catégories). C'est le moteur qui, à partir de l'action
que tu choisis, applique sa propre table d'économie et calcule l'euro.

Les 4 natures de flux :
- "pilotable" : abonnements SaaS, outils, télécom, frais bancaires. C'est là qu'on optimise.
- "structurel" : prélèvements du dirigeant, sous-traitants, salaires, charges sociales,
  certifications, assurances pro. On pilote mais on ne coupe pas.
- "ponctuel" : voyages, gros achats isolés, échéances fiscales. Exclu du run-rate récurrent.
- "perso" : dépenses personnelles (courses, resto perso, streaming perso) sur un compte EI.

Pour un marchand pilotable, choisis une "action" seulement si une optimisation crédible existe.
L'action est une ÉTIQUETTE — tu ne dis pas combien on économise, le moteur le déduit :
- "consolidate" : doublon fonctionnel (2 outils qui font la même chose).
- "downgrade" : plan surdimensionné.
- "switch" : alternative moins chère à usage égal.
- "cancel" : outil dormant ou superflu.
- "renegotiate" : contrat renégociable (télécom, banque).
- "keep" : rien à optimiser, alternative = "".
Le risque : "safe" (sans perte de capacité), "med" (à valider), "hard" (projet, changement lourd).
Ne propose jamais de couper un outil manifestement critique (banque, assurance obligatoire).`;

const SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          nature: { type: "string", enum: NATURES },
          pole: { type: "string", enum: POLES },
          isSubscription: { type: "boolean" },
          action: { type: "string", enum: ACTIONS },
          alternative: { type: "string" },
          risk: { type: "string", enum: RISKS },
        },
        required: [
          "name",
          "nature",
          "pole",
          "isSubscription",
          "action",
          "alternative",
          "risk",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

/** Ce qui revient du modèle est une donnée externe : revalidé avant d'atteindre le moteur. */
const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      name: z.string(),
      nature: z.enum(NATURES),
      pole: z.enum(POLES),
      isSubscription: z.boolean(),
      action: z.enum(ACTIONS),
      alternative: z.string(),
      risk: z.enum(RISKS),
    }),
  ),
});

export function hasHoloKey(): boolean {
  return holoConfigured();
}

/** Un marchand et le nom, nettoyé, sous lequel il a le droit de sortir. */
interface MarchandSortant {
  entree: MerchantInput;
  /** `null` : il ne restait rien d'exploitable après nettoyage anti-PII. */
  nomSortant: string | null;
}

/**
 * Nom transmissible à un tiers, ou `null` si le libellé n'était en réalité
 * qu'un identifiant / une référence de virement.
 */
function nettoyerNom(nom: string): string | null {
  try {
    return sanitizeMerchantQuery(nom).merchant;
  } catch {
    return null;
  }
}

/** Classifieur LLM (H Company Holo). Renvoie un verdict par marchand fourni. */
export async function categorizeWithHolo(
  merchants: MerchantInput[],
): Promise<MerchantVerdict[]> {
  // Charge utile sortante : nom nettoyé, nombre d'occurrences, récurrence.
  // Pas de montant, pas d'identifiant, pas de date (règle 3).
  const sortants: MarchandSortant[] = merchants.map((m) => ({
    entree: m,
    nomSortant: nettoyerNom(m.name),
  }));
  const transmis = sortants.filter((s) => s.nomSortant !== null);

  // Plus rien à demander : le classifieur déterministe fait le travail sans
  // qu'un seul octet ne sorte.
  if (transmis.length === 0) return categorizeByRules(merchants);

  const userPayload = transmis.map((s) => ({
    name: s.nomSortant,
    occurrences: s.entree.occurrences,
    recurrent: s.entree.isRecurring,
  }));

  // Dernière barrière avant le réseau.
  assertNoPii(userPayload, "catégorisation H Company");
  void recordAccess({
    service: "hcompany",
    operation: "categorize",
    direction: "sent",
    sent: `${userPayload.length} merchant names, occurrence counts, recurring flag: ${userPayload.map((m) => m.name).join(", ")}`,
  });

  const contenu = await holoChat({
    model: process.env.HAI_CATEGORIZE_MODEL,
    system: SYSTEM,
    user: `Classe chacun de ces marchands. Renvoie un verdict par marchand, même ordre.\n\n${JSON.stringify(userPayload, null, 2)}`,
    jsonSchema: { name: "merchant_verdicts", schema: SCHEMA },
    timeoutMs: HOLO_TIMEOUT_MS,
  });
  const parsed = VerdictsSchema.parse(JSON.parse(contenu));
  return recomposer(parsed.verdicts, sortants);
}

/**
 * Recolle les verdicts sur les marchands d'ORIGINE.
 *
 * Deux raisons de ne pas se contenter du nom renvoyé par le modèle :
 *  1. c'est le nom NETTOYÉ qui est parti ; engine.ts, lui, indexe ses agrégats
 *     sur le nom d'origine — sans ce recollage, aucun verdict ne serait
 *     retrouvé et tout retomberait sur les règles ;
 *  2. le modèle peut oublier un marchand : celui-là garde son verdict
 *     déterministe.
 */
function recomposer(
  verdicts: MerchantVerdict[],
  sortants: MarchandSortant[],
): MerchantVerdict[] {
  const parNom = new Map(
    (verdicts ?? [])
      .filter((v) => typeof v?.name === "string")
      .map((v) => [v.name.toLowerCase(), v]),
  );

  return sortants.map(({ entree, nomSortant }) => {
    const verdict = nomSortant ? parNom.get(nomSortant.toLowerCase()) : undefined;
    // Le nom d'origine est restauré : c'est la clé de jointure d'engine.ts.
    return verdict ? { ...verdict, name: entree.name } : ruleVerdict(entree);
  });
}

// --- Fallback déterministe (pas de clé H Company, ou appel en échec) --------
const PERSO = [
  "carrefour", "monoprix", "leclerc", "franprix", "auchan", "lidl", "intermarche",
  "grand frais", "boulangerie", "mcdonald", "starbucks", "uber eats", "deliveroo",
  "netflix", "spotify", "disney", "nespresso", "pharmacie", "zara", "h&m", "sephora",
];
const PILOTABLE = [
  "hubspot", "apollo", "ringover", "google workspace", "gsuite", "notion", "slack",
  "aws", "github", "gitlab", "stripe", "ovh", "scaleway", "figma", "zoom", "openai",
  "anthropic", "claude", "chatgpt", "vercel", "make", "zapier", "airtable", "instantly",
  "waalaxy", "loom", "replit", "skool", "webflow", "heygen", "capcut", "mailjet",
  "free mobile", "bouygues", "uber one", "mailchimp", "canva",
];
const STRUCTUREL = ["hiscox", "urssaf", "impot", "salaire", "sous-trait", "certif", "inkrea", "assur"];
const VOYAGE = ["sofitel", "air france", "booking", "sncf", "hotel", "uber", "airbnb"];

const POLE_HINTS: Array<[RegExp, Pole]> = [
  [/hubspot|apollo|instantly|waalaxy|pipedrive|salesforce|mailjet|mailchimp/, "Outbound / Sales"],
  [/openai|anthropic|claude|chatgpt|replit|github|gitlab|cursor|make|zapier/, "IA & Dev"],
  [/meta|google ads|facebook|tiktok ads/, "Marketing Ads"],
  [/aws|ovh|scaleway|vercel|cloudflare/, "Infra / Prod"],
  [/ringover|free mobile|bouygues|orange|sfr|qonto|google workspace/, "Bureau / Telco / Banque"],
];

function classifyRule(name: string): { nature: Nature; pole: Pole } {
  const n = name.toLowerCase();
  if (STRUCTUREL.some((k) => n.includes(k))) return { nature: "structurel", pole: "Certif" };
  if (VOYAGE.some((k) => n.includes(k))) return { nature: "ponctuel", pole: "Voyage" };
  if (PERSO.some((k) => n.includes(k))) return { nature: "perso", pole: "Perso" };
  if (PILOTABLE.some((k) => n.includes(k))) {
    const hit = POLE_HINTS.find(([re]) => re.test(n));
    return { nature: "pilotable", pole: hit ? hit[1] : "IA & Dev" };
  }
  return { nature: "ponctuel", pole: "Autre" };
}

function ruleVerdict(m: MerchantInput): MerchantVerdict {
  const { nature, pole } = classifyRule(m.name);
  let action: LeverAction = "keep";
  let alternative = "";
  let risk: Risk = "safe";
  if (nature === "pilotable" && m.isRecurring) {
    action = "renegotiate";
    alternative = "revoir le plan / le tarif";
    risk = "med";
  }
  return {
    name: m.name,
    nature,
    pole,
    isSubscription: m.isRecurring && nature === "pilotable",
    action,
    alternative,
    risk,
  };
}

export function categorizeByRules(merchants: MerchantInput[]): MerchantVerdict[] {
  return merchants.map(ruleVerdict);
}

// ---------------------------------------------------------------------------
// Classification EI PRO / PERSO / A-CLARIFIER — MIROIR EXACT de engine.py.
//
// Règle #2 du projet : engine.py fait foi. Le périmètre « TVA perdue » ne
// compte QUE les dépenses classées PRO (whitelist PRO_KEYWORDS, jamais
// A-CLARIFIER ni « perso »). On réplique ici la même liste de mots-clés et la
// même fonction classify() pour que engine.ts produise le MÊME résultat
// qu'engine.py sur les mêmes transactions.
// ---------------------------------------------------------------------------
export const PRO_KEYWORDS = [
  "hubspot", "apollo", "ringover", "google workspace", "google gsuite",
  "notion", "slack", "aws", "amazon web services", "github", "gitlab",
  "linkedin", "stripe", "ovh", "scaleway", "figma", "zoom", "microsoft",
  "adobe", "openai", "anthropic", "vercel", "cloudflare", "sentry",
  "calendly", "typeform", "mailchimp", "mailjet", "sendgrid", "twilio",
  "make", "make.com", "zapier", "airtable", "pipedrive", "salesforce",
  "intercom", "canva", "webflow", "instantly", "waalaxy", "loom", "replit",
  "skool", "hiscox",
];

export const PERSO_KEYWORDS = [
  "zara", "h&m", "uniqlo", "restaurant", "uber eats", "deliveroo",
  "just eat", "carrefour", "monoprix", "leclerc", "franprix", "auchan",
  "lidl", "intermarche", "boulangerie", "mcdonald", "starbucks", "fnac",
  "decathlon", "sephora", "ikea", "netflix", "spotify", "disney+",
  "pharmacie", "nespresso", "barber", "action",
];

export type EiClass = "PRO" | "PERSO" | "A-CLARIFIER";

/**
 * Miroir de engine.py:classify() — PRO l'emporte sur PERSO, défaut A-CLARIFIER.
 * Source de vérité partagée pour le périmètre de la TVA perdue (règle #2).
 */
export function classifyEI(name: string): EiClass {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (PRO_KEYWORDS.some((k) => n.includes(k))) return "PRO";
  if (PERSO_KEYWORDS.some((k) => n.includes(k))) return "PERSO";
  return "A-CLARIFIER";
}
