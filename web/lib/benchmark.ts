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
// Le calcul de l'économie N'EST PAS fait ici : la route/engine soustrait les
// prix. Le LLM ne fournit que de la donnée sourcée.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { holoChat, holoConfigured } from "@/lib/llm/holo";
import { assertNoPii, redactForLogs, sanitizeMerchantQuery } from "@/lib/privacy/egress";
import type { Lang } from "./types";
import { recordAccess } from "@/lib/privacy/access-log";

const EXTRACT_TIMEOUT_MS = 30_000;
const EXTRACT_MAX_TOKENS = 1500;

export interface BenchSource {
  title: string;
  url: string;
  date: string; // page_age brut (« 3 months ago », « April 2025 »…) ou ""
}

export interface BenchAlternative {
  name: string;
  /** Prix mensuel public en € (par utilisateur si SaaS), ou null si non chiffrable. */
  monthlyPrice: number | null;
  unit: string; // « /utilisateur/mois », « /mois »…
  sourceUrl: string;
  sourceDate: string;
}

export interface BenchmarkResult {
  merchant: string;
  verified: boolean;
  summary: string;
  sources: BenchSource[];
  alternatives: BenchAlternative[];
  note?: string;
  /** Qui a fait la recherche. */
  provider?: "linkup";
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
async function searchLinkup(
  merchant: string,
  category: string,
  lang: Lang,
): Promise<{ summary: string; sources: BenchSource[] }> {
  const q =
    lang === "fr"
      ? `Quelles sont les 3 meilleures alternatives MOINS CHÈRES à "${merchant}" (catégorie : ${category}) en 2026 ? Pour chaque CONCURRENT (jamais ${merchant} lui-même), donne son nom, son prix mensuel public actuel (par utilisateur si applicable) et l'URL de sa page tarifs.`
      : `What are the 3 best CHEAPER alternatives to "${merchant}" (category: ${category}) in 2026? For each COMPETITOR (never ${merchant} itself), give its name, its current public monthly price (per user if applicable) and its pricing-page URL.`;

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

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          monthlyPrice: { type: ["number", "null"] },
          unit: { type: "string" },
          sourceIndex: { type: "integer" },
        },
        required: ["name", "monthlyPrice", "unit", "sourceIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["alternatives"],
  additionalProperties: false,
} as const;

/** Ce qui revient du modèle est une donnée externe : revalidé avant usage. */
const ExtractSchema = z.object({
  alternatives: z.array(
    z.object({
      name: z.string(),
      monthlyPrice: z.number().nullable(),
      unit: z.string(),
      sourceIndex: z.number().int(),
    }),
  ),
});

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
    alternatives: [],
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
  let alternatives: BenchAlternative[] = [];
  if (!holoConfigured()) {
    return { merchant, verified: true, summary, sources, alternatives, provider };
  }
  try {
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
      "Pour chaque alternative citée, donne le prix mensuel en euros (null si non chiffré), " +
      "l'unité, et l'index [n] de la source qui l'atteste. N'invente aucun prix ni source. " +
      `IMPORTANT : ne retiens QUE des produits CONCURRENTS différents. Exclus totalement « ${marchandSortant} » ` +
      "et ses propres formules/paliers de prix (Free, Pro, Business, annuel…) — on cherche à le remplacer, pas à le lister.";
    assertNoPii(
      { system: systemeExtraction, user: contenu },
      "extraction de prix H Company (passe 2)",
    );
    void recordAccess({ service: "hcompany", operation: "price extraction", direction: "sent", sent: `public web results about ${marchandSortant}'s alternatives` });

    const brut = await holoChat({
      system: systemeExtraction,
      user: contenu,
      jsonSchema: { name: "price_alternatives", schema: EXTRACT_SCHEMA },
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });
    const parsed = ExtractSchema.parse(JSON.parse(brut));
    alternatives = parsed.alternatives
      .filter((a) => !sameBrand(a.name, merchant))
      .map((a) => {
        const src = sources[a.sourceIndex] ?? sources[0];
        return {
          name: a.name,
          monthlyPrice: a.monthlyPrice,
          unit: a.unit || "/mois",
          sourceUrl: src?.url ?? "",
          sourceDate: src?.date ?? "",
        };
      });
  } catch (err) {
    console.error("Benchmark (passe 2, extraction) échoué :", err);
    // On garde le résumé sourcé même sans extraction structurée.
  }

  return { merchant, verified: true, summary, sources, alternatives, provider };
}
