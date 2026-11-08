// ---------------------------------------------------------------------------
// Benchmark web (web app — surface de démo).
//
// Passe 1, la recherche : Linkup (le même fournisseur que le MCP Linkup du
// skill) renvoie une réponse synthétisée et ses sources. Passe 2, l'extraction :
// H Company Holo transforme ce texte public en prix structurés. Sans clé
// Linkup, aucune recherche : le benchmark reste « non vérifié » (règle 4).
//
// Deux règles respectées :
//   • Zéro PII (règle 3) : on n'envoie QUE le nom du marchand + sa catégorie,
//     et ce nom est d'abord NETTOYÉ par `sanitizeMerchantQuery` — le `merchant`
//     d'une transaction Qonto retombe sur le `label` brut, qui contient
//     couramment « VIR SEPA M. DUPONT REF … ». Chaque charge utile sortante
//     passe ensuite par `assertNoPii`, juste avant le `fetch`.
//   • Chaque prix = source + date (règle 4) : sans source datée → « non vérifié ».
//
// Le montant mensuel constaté N'EST PLUS transmis : c'est une donnée du compte
// du client, attachée à un marchand nommé, et la passe 1 pilote une recherche
// web dont le modèle choisit les requêtes. Elle reste un paramètre (la route
// s'en sert pour soustraire), mais elle ne franchit plus la frontière réseau.
//
// Le calcul de l'économie N'EST PAS fait ici : `engine/pricing.ts` transforme
// ces prix en euros. Le LLM ne fournit que de la donnée sourcée.
//
// Deux listes reviennent : les paliers publics du fournisseur ACTUEL (pour
// déduire le nombre de postes payés et proposer un downgrade) et les
// concurrents moins chers (switch, ou point d'appui d'une renégociation).
// Un résultat vérifié est mis en cache 30 jours (lib/benchmark-cache.ts).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { holoChat, holoConfigured } from "@/lib/llm/holo";
import { assertNoPii, redactForLogs, sanitizeMerchantQuery } from "@/lib/privacy/egress";
import type { Lang } from "./types";
import { recordAccess } from "@/lib/privacy/access-log";
import { readCachedBenchmark, writeCachedBenchmark } from "@/lib/benchmark-cache";

const EXTRACT_TIMEOUT_MS = 30_000;
const EXTRACT_MAX_TOKENS = 2000;
/** Règle 4 : une extraction rejetée a droit à UN nouvel essai, pas plus. */
const EXTRACT_ATTEMPTS = 2;

export interface BenchSource {
  title: string;
  url: string;
  date: string; // page_age brut (« 3 months ago », « April 2025 »…) ou ""
}

export interface BenchPlan {
  name: string;
  /** Prix mensuel public en € (par utilisateur si `perSeat`), ou null si non chiffrable. */
  monthlyPrice: number | null;
  unit: string; // « /utilisateur/mois », « /mois »…
  perSeat: boolean;
  sourceUrl: string;
  sourceDate: string;
}

export interface BenchAlternative extends BenchPlan {
  /** Étiquette du modèle : fait le même travail que l'outil actuel. */
  comparable: boolean;
}

export interface BenchmarkResult {
  merchant: string;
  verified: boolean;
  summary: string;
  sources: BenchSource[];
  /** Paliers publics du fournisseur actuel. */
  ownPlans: BenchPlan[];
  alternatives: BenchAlternative[];
  /** Jour du relevé (AAAA-MM-JJ) : la date garantie de chaque prix. */
  checkedAt: string;
  note?: string;
  /** Qui a fait la recherche. */
  provider?: "linkup";
  /** Vrai si le résultat sort du cache D1 plutôt que d'une recherche fraîche. */
  cached?: boolean;
}

export function hasLinkupKey(): boolean {
  return !!process.env.LINKUP_API_KEY;
}

function yearFrom(text: string): string {
  const m = text.match(/\b(20[12]\d)\b/);
  return m ? m[1] : "";
}

/**
 * Recherche via l'API Linkup (le même fournisseur que le MCP Linkup du skill).
 * `merchant` et `category` sont DÉJÀ nettoyés par l'appelant : c'est la seule
 * charge utile autorisée (règle 3, zéro PII), et `assertNoPii` le re-vérifie
 * juste avant le `fetch`.
 */
type SearchKind = "ownPlans" | "alternatives";

/**
 * Deux questions séparées plutôt qu'une : posées ensemble, la réponse
 * synthétisée de Linkup couvrait les tarifs du fournisseur et laissait tomber
 * les concurrents (constaté en direct sur Waalaxy).
 */
function linkupQuestion(kind: SearchKind, merchant: string, category: string, lang: Lang): string {
  if (kind === "ownPlans") {
    return lang === "fr"
      ? `Quels sont les tarifs publics actuels de "${merchant}" (catégorie : ${category}) ? Liste chaque formule avec son prix mensuel en euros et précise s'il est par utilisateur.`
      : `What are the current public prices of "${merchant}" (category: ${category})? List each plan with its monthly price in euros and say whether it is per user.`;
  }
  return lang === "fr"
    ? `Quelles sont les 3 meilleures alternatives MOINS CHÈRES à "${merchant}" (catégorie : ${category}) en 2026 ? Pour chaque CONCURRENT (jamais ${merchant} lui-même), donne son nom, son prix mensuel public actuel (par utilisateur si applicable) et l'URL de sa page tarifs.`
    : `What are the 3 best CHEAPER alternatives to "${merchant}" (category: ${category}) in 2026? For each COMPETITOR (never ${merchant} itself), give its name, its current public monthly price (per user if applicable) and its pricing-page URL.`;
}

/**
 * Lance les deux recherches en parallèle et fusionne leurs sources dans UNE
 * liste numérotée (l'extraction cite un index de cette liste). Une recherche en
 * échec n'emporte pas l'autre ; les deux en échec = web indisponible.
 */
async function searchLinkup(
  merchant: string,
  category: string,
  lang: Lang,
): Promise<{ summary: string; sources: BenchSource[] }> {
  const kinds: SearchKind[] = ["ownPlans", "alternatives"];
  const settled = await Promise.allSettled(kinds.map((kind) => searchLinkupOnce(linkupQuestion(kind, merchant, category, lang), merchant, category)));
  const answers = settled.flatMap((r, i) => (r.status === "fulfilled" ? [{ kind: kinds[i], ...r.value }] : []));
  if (answers.length === 0) {
    throw settled[0].status === "rejected" ? settled[0].reason : new Error("Linkup indisponible");
  }
  const sources: BenchSource[] = [];
  const parts: string[] = [];
  for (const answer of answers) {
    const heading = answer.kind === "ownPlans" ? `TARIFS DE ${merchant}` : "ALTERNATIVES";
    parts.push(`## ${heading}\n${answer.summary}`);
    for (const src of answer.sources) {
      if (!sources.some((known) => known.url === src.url)) sources.push(src);
    }
  }
  return { summary: parts.join("\n\n"), sources };
}

async function searchLinkupOnce(
  q: string,
  merchant: string,
  category: string,
): Promise<{ summary: string; sources: BenchSource[] }> {
  // sourcedAnswer = réponse synthétisée (liste de concurrents + prix) + sources.
  // Bien plus exploitable par l'extraction que des snippets bruts (searchResults).
  const corps = { q, depth: "standard", outputType: "sourcedAnswer" };

  // Dernière barrière avant le réseau. Ici l'échec est FRANC (pas de
  // caviardage) : la charge utile ne vient que de `sanitizeMerchantQuery`, donc
  // une détection signifie que le nettoyage a été contourné — il faut que ça
  // casse bruyamment, pas que ça parte quand même.
  assertNoPii(corps, "recherche Linkup");
  void recordAccess({ service: "linkup", operation: "price search", direction: "sent", sent: `${merchant} · ${category}` });

  const res = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINKUP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`Linkup ${res.status}`);

  const data = (await res.json()) as {
    answer?: string;
    sources?: Array<{ name?: string; url?: string; snippet?: string }>;
  };
  const srcs = (data.sources ?? []).filter((s) => s.url).slice(0, 6);
  const sources: BenchSource[] = srcs.map((s) => ({
    title: s.name ?? s.url!,
    url: s.url!,
    date: yearFrom(s.snippet ?? ""),
  }));
  const summary =
    (data.answer ?? "").trim() ||
    srcs.map((s) => `${s.name ?? ""}: ${(s.snippet ?? "").slice(0, 500)}`).join("\n\n");
  return { summary, sources };
}

const PLAN_PROPERTIES = {
  name: { type: "string" },
  monthlyPrice: { type: ["number", "null"] },
  unit: { type: "string" },
  perSeat: { type: "boolean" },
  sourceIndex: { type: "integer" },
} as const;
const PLAN_REQUIRED = ["name", "monthlyPrice", "unit", "perSeat", "sourceIndex"] as const;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    ownPlans: {
      type: "array",
      items: { type: "object", properties: PLAN_PROPERTIES, required: PLAN_REQUIRED, additionalProperties: false },
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: { ...PLAN_PROPERTIES, comparable: { type: "boolean" } },
        required: [...PLAN_REQUIRED, "comparable"],
        additionalProperties: false,
      },
    },
  },
  required: ["ownPlans", "alternatives"],
  additionalProperties: false,
} as const;

const ExtractedPlan = z.object({
  name: z.string().min(1),
  monthlyPrice: z.number().nonnegative().nullable(),
  unit: z.string(),
  perSeat: z.boolean(),
  sourceIndex: z.number().int(),
});

/** Ce qui revient du modèle est une donnée externe : revalidé avant usage. */
const ExtractSchema = z.object({
  ownPlans: z.array(ExtractedPlan),
  alternatives: z.array(ExtractedPlan.extend({ comparable: z.boolean() })),
});
type Extracted = z.infer<typeof ExtractSchema>;

const NOTE: Record<"noKey" | "webDown" | "noSource" | "noMerchant", Record<Lang, string>> = {
  noMerchant: {
    fr: "Non vérifié — libellé inexploitable après filtrage anti-PII : aucune recherche lancée.",
    en: "Not verified — label unusable after PII filtering: no search was run.",
    de: "Nicht verifiziert — Bezeichnung nach PII-Filterung unbrauchbar: keine Suche gestartet.",
    es: "No verificado — etiqueta inutilizable tras el filtrado anti-PII: no se lanzó ninguna búsqueda.",
    it: "Non verificato — etichetta inutilizzabile dopo il filtro anti-PII: nessuna ricerca avviata.",
  },
  noKey: {
    fr: "Non vérifié — clé Linkup absente (benchmark désactivé).",
    en: "Not verified — Linkup key missing (benchmark disabled).",
    de: "Nicht verifiziert — Linkup-Schlüssel fehlt (Benchmark deaktiviert).",
    es: "No verificado — falta la clave de Linkup (benchmark desactivado).",
    it: "Non verificato — chiave Linkup assente (benchmark disattivato).",
  },
  webDown: {
    fr: "Non vérifié — recherche web indisponible.",
    en: "Not verified — web search unavailable.",
    de: "Nicht verifiziert — Websuche nicht verfügbar.",
    es: "No verificado — búsqueda web no disponible.",
    it: "Non verificato — ricerca web non disponibile.",
  },
  noSource: {
    fr: "Non vérifié — aucune source datée trouvée. Ne pas afficher de prix.",
    en: "Not verified — no dated source found. Do not display a price.",
    de: "Nicht verifiziert — keine datierte Quelle gefunden. Keinen Preis anzeigen.",
    es: "No verificado — no se encontró ninguna fuente con fecha. No mostrar precio.",
    it: "Non verificato — nessuna fonte datata trovata. Non mostrare il prezzo.",
  },
};

/**
 * Vrai/faux : l'alternative est en réalité le MÊME produit que le marchand
 * (ex. « HeyGen Pro » quand on benchmarke « HeyGen »). On veut des CONCURRENTS,
 * jamais le produit qu'on cherche à remplacer.
 */
function sameBrand(altName: string, merchant: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const alt = norm(altName);
  // Marque = premier « mot » significatif du marchand (avant /, ×, +, espace…).
  const brand = norm((merchant.split(/[\s/×·+|(]+/)[0] || merchant));
  if (!alt || brand.length < 3) return false;
  return alt.includes(brand) || brand.includes(alt);
}

/**
 * @param currentMonthly dépense mensuelle observée. Sert UNIQUEMENT à l'appelant
 *   (soustraction du meilleur prix trouvé) : elle n'est transmise à aucun tiers.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Lecture du cache seule, sans réseau : la route l'appelle AVANT le plafond de débit. */
export async function cachedBenchmark(merchant: string, category: string, lang: Lang = "fr"): Promise<BenchmarkResult | null> {
  try {
    const clean = sanitizeMerchantQuery(merchant, category);
    const hit = await readCachedBenchmark(clean.merchant, clean.category, lang);
    return hit ? { ...hit, merchant, cached: true } : null;
  } catch {
    return null;
  }
}

/**
 * Rattache chaque prix extrait à SA source. Un index de source invalide fait
 * tomber le prix : jamais de repli sur une autre source (règle 4).
 */
function attachSources(extracted: Extracted, sources: BenchSource[], merchant: string): Pick<BenchmarkResult, "ownPlans" | "alternatives"> {
  const withSource = <T extends { sourceIndex: number; unit: string }>(item: T): (Omit<T, "sourceIndex"> & { sourceUrl: string; sourceDate: string }) | null => {
    const src = sources[item.sourceIndex];
    if (!src) return null;
    const { sourceIndex: _ignored, ...rest } = item;
    return { ...rest, unit: item.unit || "/mois", sourceUrl: src.url, sourceDate: src.date };
  };
  const ownPlans = extracted.ownPlans.map(withSource).filter((p): p is NonNullable<typeof p> => p !== null);
  const alternatives = extracted.alternatives
    .filter((a) => !sameBrand(a.name, merchant))
    .map(withSource)
    .filter((a): a is NonNullable<typeof a> => a !== null);
  return { ownPlans, alternatives };
}

export async function benchmark(
  merchant: string,
  category: string,
  currentMonthly: number,
  lang: Lang = "fr",
): Promise<BenchmarkResult> {
  const base: BenchmarkResult = {
    merchant,
    verified: false,
    summary: "",
    sources: [],
    ownPlans: [],
    alternatives: [],
    checkedAt: today(),
  };

  if (!hasLinkupKey()) {
    return { ...base, note: NOTE.noKey[lang] };
  }

  // Charge utile sortante = nom du marchand + catégorie, NETTOYÉS. S'il ne
  // reste rien d'exploitable (le libellé n'était qu'un identifiant), on
  // n'interroge personne : mieux vaut « non vérifié » qu'une fuite.
  let marchandSortant: string;
  let categorieSortante: string;
  try {
    ({ merchant: marchandSortant, category: categorieSortante } = sanitizeMerchantQuery(
      merchant,
      category,
    ));
  } catch (err) {
    console.error("Benchmark : libellé rejeté par le filtre anti-PII :", err);
    return { ...base, note: NOTE.noMerchant[lang] };
  }

  const hit = await readCachedBenchmark(marchandSortant, categorieSortante, lang);
  if (hit) return { ...hit, merchant, cached: true };

  // --- Passe 1 : recherche des prix (Linkup) --------------------------------
  const provider = "linkup" as const;
  let summary: string;
  let sources: BenchSource[];
  try {
    ({ summary, sources } = await searchLinkup(marchandSortant, categorieSortante, lang));
  } catch (err) {
    console.error("Benchmark (passe 1) échoué :", err);
    return { ...base, provider, note: NOTE.webDown[lang] };
  }

  if (sources.length === 0) {
    return { ...base, provider, summary, note: NOTE.noSource[lang] };
  }

  // --- Passe 2 : extraction structurée (le prix devient de la donnée) ------
  // Sans clé H Company, le résumé sourcé reste affiché, sans prix structurés.
  const verifiedBase: BenchmarkResult = { ...base, verified: true, summary, sources, provider };
  if (!holoConfigured()) return verifiedBase;

  const sourceList = sources
    .map((s, i) => `[${i}] ${s.title} — ${s.url} (${s.date || "date n.c."})`)
    .join("\n");

  // Ici, la matière première vient du WEB (résumé + titres + URL de sources),
  // pas du compte : une page tarifaire peut très bien contenir un e-mail de
  // contact ou une URL à identifiant. On CAVIARDE donc au lieu d'échouer —
  // sinon une page mal fichue suffirait à priver l'utilisateur de son
  // extraction. Les URL réellement affichées viennent de `sources`, jamais du
  // texte renvoyé par le modèle : rien n'est cassé par le caviardage.
  const contenu = redactForLogs(
    `TEXTE :\n${summary}\n\nSOURCES :\n${sourceList}`,
  ) as string;
  const systemeExtraction =
    "Tu extrais des prix depuis un texte de benchmark et une liste de sources numérotées. " +
    "Pour chaque prix, donne le prix MENSUEL en euros (null si non chiffré ; un prix annuel est divisé par 12), " +
    "l'unité, perSeat = vrai si le prix est par utilisateur, et l'index [n] de la source qui l'atteste. " +
    "N'invente aucun prix ni source. " +
    `ownPlans : les formules de « ${marchandSortant} » lui-même (Free, Pro, Business…). ` +
    `alternatives : UNIQUEMENT des produits CONCURRENTS différents, jamais « ${marchandSortant} » ni ses formules ; ` +
    "comparable = vrai seulement si le concurrent fait le même travail principal.";
  try {
    assertNoPii({ system: systemeExtraction, user: contenu }, "extraction de prix H Company (passe 2)");
  } catch (err) {
    console.error("Benchmark (passe 2) bloqué par le filtre anti-PII :", err);
    return verifiedBase;
  }
  void recordAccess({ service: "hcompany", operation: "price extraction", direction: "sent", sent: `public web results about ${marchandSortant}'s alternatives` });

  for (let attempt = 1; attempt <= EXTRACT_ATTEMPTS; attempt++) {
    try {
      const brut = await holoChat({
        system: systemeExtraction,
        user: contenu,
        jsonSchema: { name: "price_benchmark", schema: EXTRACT_SCHEMA },
        maxTokens: EXTRACT_MAX_TOKENS,
        timeoutMs: EXTRACT_TIMEOUT_MS,
      });
      const extracted = ExtractSchema.parse(JSON.parse(brut));
      const result: BenchmarkResult = { ...verifiedBase, ...attachSources(extracted, sources, merchant) };
      await writeCachedBenchmark(marchandSortant, categorieSortante, lang, { ...result, merchant: marchandSortant });
      return result;
    } catch (err) {
      console.error(`Benchmark (passe 2, extraction, essai ${attempt}/${EXTRACT_ATTEMPTS}) échoué :`, err);
    }
  }
  // On garde le résumé sourcé même sans extraction structurée.
  return verifiedBase;
}
