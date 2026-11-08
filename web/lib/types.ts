// ---------------------------------------------------------------------------
// Contrat d'API de Kerdaxis.
// Le front (Kerdaxis.tsx) consomme exactement cette forme ; /api/analyze la
// produit. Garder les clés stables : account, window, totals, natures, poles,
// levers, flux, score, runway (cf. PRD §15).
// ---------------------------------------------------------------------------

/** Langues supportées. */
export type Lang = "fr" | "en" | "de" | "es" | "it";

/**
 * Chaîne bilingue produite côté serveur (engine.ts), résolue par le front.
 * Volontairement limitée à fr/en : de/es/it retombent sur `en` via le resolver
 * `loc()` du front. Ne PAS élargir cette interface.
 */
export interface Localized {
  fr: string;
  en: string;
}

/** Les 4 natures de flux — le tri est le cœur différenciant (PRD §4). */
export type Nature = "pilotable" | "structurel" | "ponctuel" | "perso";

/** Pôles métier pour agréger le pilotable. */
export type Pole =
  | "IA & Dev"
  | "Outbound / Sales"
  | "Infra / Prod"
  | "Marketing Ads"
  | "Bureau / Telco / Banque"
  | "Perso"
  | "Sous-traitance"
  | "Certif"
  | "Voyage"
  | "Autre";

export type Risk = "safe" | "med" | "hard";

/** Actions proposées par le classifieur — l'euro est calculé par le moteur. */
export type LeverAction =
  | "keep"
  | "cancel"
  | "downgrade"
  | "switch"
  | "consolidate"
  | "renegotiate";

/**
 * Motif d'un levier — la taxonomie ORTHOGONALE à la nature. Un levier n'existe
 * que pour un flux `pilotable` dont le motif est `abonnement`, `doublon` ou
 * `fx`. `variable` (dépense pilotable non récurrente) ne produit jamais de
 * levier : on n'annualise pas un one-off. Peut être fourni par l'appelant (API
 * moteur) ou dérivé par le moteur, mais reste toujours une CATÉGORIE — jamais
 * un montant.
 */
export type Motif = "abonnement" | "doublon" | "fx" | "variable";

export interface NatureSlice {
  key: Nature;
  label: string;
  /** Montant OBSERVÉ sur la fenêtre (pas annualisé). Somme = totals.out. */
  amount: number;
}

export interface PoleSlice {
  label: string;
  /** Run-rate mensuel pilotable de ce pôle (€/mois). */
  amount: number;
}

/**
 * Hausse silencieuse détectée sur un abonnement récurrent :
 * comparaison de la 1re et de la dernière occurrence (triées par date).
 * Seuil de déclenchement : +5 %. Présent seulement si détecté.
 */
export interface Hausse {
  /** % d'augmentation (arrondi à 1 décimale), ex : 12.5. */
  pct: number;
  /** Montant de la 1re occurrence (€). */
  avantEur: number;
  /** Montant de la dernière occurrence (€). */
  apresEur: number;
}

/**
 * D'où vient l'euro d'un levier :
 *   - observed   : constaté sur le relevé (résiliation, hausse, frais de change) ;
 *   - pending    : l'économie dépend d'un prix du marché pas encore cherché sur le
 *                  web (switch, downgrade, renégociation). Économie = 0 tant que
 *                  le benchmark Linkup n'a pas tourné, jamais une estimation ;
 *   - sourced    : calculée par le moteur à partir d'un prix public sourcé + daté ;
 *   - unverified : le benchmark a tourné sans prix exploitable (règle 4).
 */
export type PriceBasis = "observed" | "pending" | "sourced" | "unverified";

/** Prix public trouvé sur le web, toujours rattaché à sa source (règle 4). */
export interface SourcedOffer {
  name: string;
  /** Prix mensuel en €, par poste si `perSeat`. */
  monthlyPrice: number;
  perSeat: boolean;
  sourceUrl: string;
  /** Date portée par la source (souvent une année), ou "". */
  sourceDate: string;
  /** Jour où le prix a été relevé (AAAA-MM-JJ) : la date minimale garantie. */
  checkedAt: string;
}

/** Preuve d'un levier `sourced` : l'offre retenue et le nombre de postes déduit. */
export interface LeverEvidence {
  offer: SourcedOffer;
  /** Postes déduits du montant payé et du tarif actuel, null si offre forfaitaire. */
  seats: number | null;
}

export interface Lever {
  id: string;
  label: string;
  /** Alternative / action lisible (« 1 seul workspace », « Claude seul »…), en français. */
  to: string;
  /** Même proposition, localisée pour l'écran. Absent : afficher `to`. */
  toLabel?: Localized;
  /** Nom affiché localisé, quand le moteur nomme lui-même le levier (frais de change). */
  labelText?: Localized;
  /** Économie mensuelle en € — calculée par le moteur, jamais par le LLM. */
  saving: number;
  /** Économie annuelle en € = saving × 12, calculée par le moteur (jamais un
   *  client/LLM). Toujours présente en sortie de `build()`. */
  savingYearly?: number;
  /** Motif du levier (abonnement / doublon / fx) — sert au tri et aux libellés. */
  motif?: Motif;
  risk: Risk;
  active: boolean;
  /** Type d'action, pour contextualiser la lettre (résiliation vs renégo…). */
  action?: LeverAction;
  /** Dépense mensuelle observée du marchand (€) — sert au benchmark. */
  monthly?: number;
  /** Hausse silencieuse (1re vs dernière occurrence) — présent seulement si détectée. */
  hausse?: Hausse;
  /** Pôle métier du marchand : la seule « catégorie » envoyée au benchmark web. */
  pole?: Pole;
  /** Origine de l'euro. Absent sur les anciens clients : lu comme `observed`. */
  basis?: PriceBasis;
  /** Présent seulement si `basis === "sourced"`. */
  evidence?: LeverEvidence;
  /** Présent seulement si `basis === "unverified"` : pourquoi aucun euro n'est affiché. */
  unverifiedReason?: UnverifiedReason;
  /** Résiliation en ligne ou non, relevée par Linkup sur accord. Absent tant que non vérifié. */
  cancelChannel?: CancelChannelCheck;
}

export type UnverifiedReason = "no_price" | "no_seats" | "not_cheaper" | "web_down";

/**
 * Où se résilie un abonnement, d'après la doc officielle du fournisseur lue par
 * Linkup. `online` : l'agent H Company peut le faire ; sinon, une lettre.
 */
export type CancelChannel = "online" | "offline" | "unknown";

export interface CancelChannelCheck {
  channel: CancelChannel;
  /** Page qui fonde la réponse (règle 4). Vide quand `channel === "unknown"`. */
  sourceUrl: string;
  /** Jour du relevé (AAAA-MM-JJ). */
  checkedAt: string;
}

export interface FluxItem {
  kind: "new" | "check" | "dup" | "ghost";
  label: Localized;
  value: Localized;
  tone: "amber" | "danger" | "neutral";
}

export interface Score {
  value: number;
  drivers: Localized[];
}

export interface Runway {
  months: number;
  note: Localized;
}

/**
 * TVA déductible perdue : dépenses PRO où un justificatif était requis
 * (attachment_required) mais absent (aucune pièce jointe). Levier fiscal :
 * à confirmer avec un comptable. Présent seulement si tvaRecuperableEur > 0.
 */
export interface TvaPerdue {
  /** Nombre de transactions concernées. */
  transactions: number;
  /** Base TTC totale (€) = somme des montants. */
  baseTtcEur: number;
  /** TVA récupérable estimée (€) = baseTTC × 20/120 (taux France standard 20 %). */
  tvaRecuperableEur: number;
}

export interface AnalyzeResult {
  account: { name: string; bank: string; balance: number };
  window: { label: Localized };
  totals: { out: number; runRate: number };
  natures: NatureSlice[];
  poles: PoleSlice[];
  score: Score;
  runway: Runway;
  levers: Lever[];
  flux: FluxItem[];
  /** TVA déductible perdue (justificatifs PRO manquants) — présent seulement si > 0. */
  tvaPerdue?: TvaPerdue;
  /** Métadonnées non affichées : d'où viennent les données. */
  meta?: { source: "qonto" | "mock"; categorized: Categorizer; txCount: number };
}

// --- Transaction normalisée (interne, entre qonto.ts et engine.ts) ----------
export interface Tx {
  id: string;
  merchant: string;        // clean_counterparty_name || label
  amount: number;          // EUR, positif
  localCurrency: string;   // pour repérer le FX
  isFx: boolean;
  side: "debit" | "credit";
  operationType: string;
  date: string;            // YYYY-MM-DD (settled_at || emitted_at)
  attachmentRequired: boolean;
  hasAttachment: boolean;
  /** Frais de change associé (€), optionnel — alimente le levier `fx` agrégé. */
  fee?: number;
}

// --- Sortie du classifieur LLM (par marchand) -------------------------------
/**
 * Qui a posé les étiquettes : un modèle H Company Holo (/api/analyze), Claude
 * (étiquettes fournies à l'API moteur, ex. Claude Tag) ou les règles par mots-clés.
 */
export type Categorizer = "hcompany" | "claude" | "rules";

export interface MerchantVerdict {
  name: string;
  nature: Nature;
  pole: Pole;
  isSubscription: boolean;
  action: LeverAction;
  /** Texte de l'alternative, en français (vide si action = keep). */
  alternative: string;
  /** Même texte en anglais, pour l'écran ; absent : on retombe sur `alternative`. */
  alternativeEn?: string;
  /**
   * Motif du levier, OPTIONNEL. Le LLM ne l'émet pas : le moteur le dérive
   * (récurrence, action, frais de change). L'API moteur peut le fournir pour
   * forcer la catégorie. Jamais un montant : le moteur traduit l'action en euros,
   * à partir du relevé ou d'un prix sourcé (règle #2 : le LLM ne calcule pas).
   */
  motif?: Motif;
  risk: Risk;
}
