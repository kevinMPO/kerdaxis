// ---------------------------------------------------------------------------
// Relevé FICTIF de la démo publique : une petite structure de conseil sur un
// compte EI (pro et perso mélangés), 60 jours d'opérations au format `Tx`.
//
// Ce module ne contient AUCUN résultat : ni économie, ni score, ni risque, ni
// alternative. Il ne contient que des opérations, comme un vrai relevé Qonto.
// Tout ce que la démo affiche sort du pipeline réel (lib/analysis/pipeline.ts) :
// catégorisation Holo, moteur, puis prix Linkup sur accord.
//
// Les dates sont relatives au jour de la visite, pour que la fenêtre « 30
// derniers jours » du moteur tombe toujours sur ce relevé.
//
// Public et sans authentification : société FICTIVE, montants FICTIFS, aucune
// donnée d'un compte réel. Les fournisseurs logiciels sont de vrais produits
// (leurs prix publics se vérifient sur le web), sauf Nuvio et Lumen.
// ---------------------------------------------------------------------------

import type { MerchantVerdict, Tx } from "@/lib/types";

export const DEMO_WINDOW_DAYS = 60;

export const DEMO_ACCOUNT = { name: "ACME Conseil (démo)", bank: "Qonto", balance: 9380 } as const;

const DAY_MS = 86_400_000;

interface TxSpec {
  merchant: string;
  amount: number;
  /** Jours avant la visite, un par opération. */
  daysAgo: number[];
  operationType?: string;
  side?: Tx["side"];
  isFx?: boolean;
  /** Justificatif exigé mais absent : alimente la TVA déductible perdue. */
  missingReceipt?: boolean;
}

const SPECS: readonly TxSpec[] = [
  // Fournisseurs FICTIFS dont Kerdaxis contrôle le parcours de résiliation :
  // Nuvio (portail de démo, dossier portal/) et Lumen (portail client Stripe en
  // mode test). Leurs noms donnent les identifiants « nuvio » / « lumen » que
  // l'agent H Company connaît (lib/execution/suppliers.ts).
  { merchant: "Nuvio", amount: 129, daysAgo: [4, 34], operationType: "direct_debit" },
  { merchant: "Lumen", amount: 39, daysAgo: [9, 39], operationType: "direct_debit" },

  // Outils pilotables : la catégorisation et le benchmark se font en direct.
  { merchant: "HubSpot", amount: 60, daysAgo: [6, 36], missingReceipt: true },
  { merchant: "Instantly", amount: 97, daysAgo: [8, 38] },
  { merchant: "Apollo", amount: 59, daysAgo: [8, 38] },
  { merchant: "Waalaxy", amount: 49, daysAgo: [14, 44] },
  { merchant: "OpenAI ChatGPT", amount: 23, daysAgo: [12, 42] },
  { merchant: "Anthropic Claude", amount: 21.6, daysAgo: [13, 43] },
  { merchant: "Make", amount: 10.59, daysAgo: [18, 48] },
  { merchant: "Ringover", amount: 63, daysAgo: [3, 33], operationType: "direct_debit" },
  { merchant: "Notion", amount: 10, daysAgo: [5, 35] },
  { merchant: "Uber One", amount: 5.99, daysAgo: [7, 37] },
  { merchant: "AWS", amount: 41.2, daysAgo: [13] },
  { merchant: "AWS", amount: 38.9, daysAgo: [43] },
  { merchant: "Adobe", amount: 71.99, daysAgo: [19, 49], missingReceipt: true },
  // Hausse silencieuse : 42 € puis 48 €.
  { merchant: "Figma", amount: 42, daysAgo: [50] },
  { merchant: "Figma", amount: 48, daysAgo: [20], missingReceipt: true },
  // Deux comptes Workspace prélevés le même jour : un doublon à repérer.
  { merchant: "Google Workspace", amount: 14.4, daysAgo: [2, 2, 32, 32] },
  // Nouveau ce mois, et un abonnement qui ne prélève plus.
  { merchant: "Loom", amount: 15, daysAgo: [11] },
  { merchant: "CapCut", amount: 9.99, daysAgo: [45] },

  // Banque : forfait et frais de change (agrégés en un seul levier par le moteur).
  { merchant: "Qonto", amount: 29, daysAgo: [1, 31], operationType: "qonto_fee" },
  { merchant: "Qonto", amount: 2.4, daysAgo: [6], operationType: "qonto_fee", isFx: true },
  { merchant: "Qonto", amount: 3.1, daysAgo: [21], operationType: "qonto_fee", isFx: true },
  { merchant: "Qonto", amount: 1.8, daysAgo: [36], operationType: "qonto_fee", isFx: true },
  { merchant: "Qonto", amount: 2.9, daysAgo: [51], operationType: "qonto_fee", isFx: true },

  // Structurel : on pilote, on ne coupe pas.
  { merchant: "URSSAF", amount: 1240, daysAgo: [15, 45], operationType: "direct_debit" },
  { merchant: "Salaire dirigeant", amount: 3000, daysAgo: [1, 31], operationType: "transfer" },
  { merchant: "Hiscox assurance RC Pro", amount: 46, daysAgo: [20, 50], operationType: "direct_debit" },
  { merchant: "Atelier Nord (sous-traitance)", amount: 2400, daysAgo: [22], operationType: "transfer" },

  // Ponctuel : jamais annualisé.
  { merchant: "SNCF", amount: 186, daysAgo: [17] },
  { merchant: "Air France", amount: 412, daysAgo: [26] },
  { merchant: "Apple Store", amount: 1499, daysAgo: [24] },

  // Perso sur le compte EI.
  { merchant: "Carrefour", amount: 86, daysAgo: [3] },
  { merchant: "Carrefour", amount: 142, daysAgo: [23] },
  { merchant: "Netflix", amount: 13.49, daysAgo: [9, 39] },
  { merchant: "Nespresso", amount: 42, daysAgo: [11, 41] },
  { merchant: "Uber Eats", amount: 24, daysAgo: [5] },
  { merchant: "Pharmacie", amount: 18, daysAgo: [14] },

  // Encaissements clients.
  { merchant: "Client Lambda SAS", amount: 6500, daysAgo: [10], operationType: "transfer", side: "credit" },
  { merchant: "Client Boréal", amount: 4432, daysAgo: [40], operationType: "transfer", side: "credit" },
];

/**
 * Étiquettes des deux fournisseurs FICTIFS. Aucun modèle ne peut les connaître :
 * on les étiquette comme le ferait l'appelant de l'API moteur. Ce sont des
 * catégories, pas des euros : le moteur chiffre la résiliation sur le relevé.
 */
export const DEMO_LABELS: readonly MerchantVerdict[] = [
  {
    name: "Nuvio",
    nature: "pilotable",
    pole: "Outbound / Sales",
    isSubscription: true,
    action: "cancel",
    alternative: "résilier · CRM en doublon avec HubSpot",
    risk: "med",
  },
  {
    name: "Lumen",
    nature: "pilotable",
    pole: "IA & Dev",
    isSubscription: true,
    action: "cancel",
    alternative: "résilier · facturé via Stripe",
    risk: "med",
  },
];

function isoDay(today: Date, daysAgo: number): string {
  return new Date(today.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

export function demoTransactions(today: Date = new Date()): Tx[] {
  let sequence = 0;
  return SPECS.flatMap((spec) =>
    spec.daysAgo.map((daysAgo) => ({
      id: `demo-${sequence++}`,
      merchant: spec.merchant,
      amount: spec.amount,
      localCurrency: "EUR",
      isFx: spec.isFx ?? false,
      side: spec.side ?? "debit",
      operationType: spec.operationType ?? "card",
      date: isoDay(today, daysAgo),
      attachmentRequired: spec.missingReceipt ?? false,
      hasAttachment: false,
    })),
  );
}
