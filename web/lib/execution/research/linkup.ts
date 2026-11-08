// ---------------------------------------------------------------------------
// Linkup lit la documentation OFFICIELLE de résiliation d'un fournisseur et la
// rend en parcours clic par clic, avec les libellés exacts des boutons.
//
// Seul le NOM du fournisseur part vers Linkup (règle « zéro PII » du projet,
// vérifiée par assertNoPii avant chaque appel).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { assertNoPii } from "@/lib/privacy/egress";
import { ResearchError, type WrittenPath } from "./types";
import { recordAccess } from "@/lib/privacy/access-log";

export const LINKUP_SEARCH_URL = "https://api.linkup.so/v1/search";
const LINKUP_FETCH_URL = "https://api.linkup.so/v1/fetch";
const SEARCH_TIMEOUT_MS = 120_000;
const FETCH_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS_PER_DEPTH = 2;
const BACKOFF_BASE_MS = 2_000;
const MAX_STEP_CHARS = 300;
const MAX_BUTTON_LABEL_CHARS = 40;
/** « deep » trouve les pages d'aide officielles ; « standard » est 5× plus rapide mais cite surtout des blogs. */
const DEPTHS_IN_ORDER = ["deep", "standard"] as const;

export function linkupConfigured(): boolean {
  return Boolean(process.env.LINKUP_API_KEY);
}

function linkupKey(): string {
  const key = process.env.LINKUP_API_KEY;
  if (!key) throw new ResearchError("LINKUP_API_KEY manquante");
  return key;
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: { type: "string" },
      description:
        "Ordered actions only, each one click or one field, with exact button labels in double quotes. One short imperative sentence per step, no caveats or commentary. If the path differs by plan type, pick the main paid plan instead of listing every variant in one step.",
    },
    final_confirm_label: {
      type: "string",
      description: "Exact text of the final irreversible button, a few words. Empty string if unknown.",
    },
    retention_traps: {
      type: "array",
      items: { type: "string" },
      description: "Discount offers, pause offers, surveys or decoy buttons shown during cancellation, one short phrase each",
    },
    official_doc_url: { type: "string", description: "URL of the merchant's own help page used" },
  },
  required: ["steps", "official_doc_url"],
};

const LinkupPlan = z.object({
  steps: z.array(z.string()).default([]),
  final_confirm_label: z.string().nullish(),
  retention_traps: z.array(z.string()).nullish(),
  official_doc_url: z.string().nullish(),
});

const LinkupSearchResponse = z.object({
  data: z.unknown().optional(),
  sources: z.array(z.object({ url: z.string().optional() }).passthrough()).nullish(),
});

/** Linkup écrit parfois « non précisé dans la doc » dans un champ URL : on ne garde que de vraies URL. */
function onlyUrl(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return /^https?:\/\//.test(v) ? v : "";
}

function onlyShortLabel(value: string | null | undefined): string {
  const label = (value ?? "").trim().replace(/^"+|"+$/g, "");
  return label.length > 0 && label.length <= MAX_BUTTON_LABEL_CHARS ? label : "";
}

export function buildCancelQuery(merchant: string): string {
  return (
    `Official ${merchant} help center: how does a customer cancel their paid ${merchant} subscription ` +
    "on the website? Give the exact menu path and button labels in order, the final confirmation button, " +
    "and any retention offer or survey shown before the cancellation goes through."
  );
}

/** Transforme la réponse brute de Linkup en parcours validé (exporté pour les tests). */
export function parseWrittenPath(body: unknown, depth: WrittenPath["depthUsed"]): WrittenPath {
  const response = LinkupSearchResponse.safeParse(body);
  if (!response.success) throw new ResearchError("Réponse Linkup illisible");
  const plan = LinkupPlan.safeParse(response.data.data ?? {});
  if (!plan.success) throw new ResearchError("La réponse Linkup ne respecte pas le schéma du parcours");
  const steps = plan.data.steps.map((step) => step.trim().slice(0, MAX_STEP_CHARS)).filter(Boolean);
  if (steps.length === 0) throw new ResearchError("Linkup n'a renvoyé aucune étape");
  return {
    steps,
    finalConfirmLabel: onlyShortLabel(plan.data.final_confirm_label),
    retentionTraps: (plan.data.retention_traps ?? []).map((trap) => trap.trim()).filter(Boolean),
    officialDocUrl: onlyUrl(plan.data.official_doc_url),
    sourceUrls: (response.data.sources ?? []).map((source) => source.url ?? "").filter((url) => url.startsWith("http")),
    depthUsed: depth,
  };
}

async function postLinkup(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${linkupKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new ResearchError(`Linkup ${response.status}`);
  return response.json();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Parcours documenté par le fournisseur, avec reprise sur erreur puis repli sur une profondeur plus rapide. */
export async function searchWrittenPath(merchant: string): Promise<WrittenPath> {
  let lastError: unknown = null;
  for (const depth of DEPTHS_IN_ORDER) {
    const body = {
      q: buildCancelQuery(merchant),
      depth,
      outputType: "structured",
      structuredOutputSchema: JSON.stringify(PLAN_SCHEMA),
      includeSources: true,
    };
    assertNoPii(body, "recherche Linkup (parcours de résiliation)");
    void recordAccess({ service: "linkup", operation: "cancellation docs", direction: "sent", sent: merchant });
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_DEPTH; attempt++) {
      try {
        return parseWrittenPath(await postLinkup(LINKUP_SEARCH_URL, body, SEARCH_TIMEOUT_MS), depth);
      } catch (error) {
        lastError = error;
        await sleep(BACKOFF_BASE_MS * 2 ** attempt);
      }
    }
  }
  throw new ResearchError(`Aucun parcours pour ${merchant} : ${lastError instanceof Error ? lastError.message : lastError}`);
}

const FetchResponse = z.object({
  markdown: z.string().nullish(),
  images: z.array(z.object({ url: z.string().optional() }).passthrough()).nullish(),
});

/** Article d'aide officiel (markdown) et ses images dans l'ordre de la page. */
export async function fetchArticle(docUrl: string): Promise<{ markdown: string; imageUrls: string[] }> {
  const body = await postLinkup(LINKUP_FETCH_URL, { url: docUrl, extractImages: true, renderJs: true }, FETCH_TIMEOUT_MS);
  const parsed = FetchResponse.safeParse(body);
  if (!parsed.success) throw new ResearchError("Article Linkup illisible");
  return {
    markdown: parsed.data.markdown ?? "",
    imageUrls: (parsed.data.images ?? []).map((image) => image.url ?? "").filter((url) => url.startsWith("http")),
  };
}

/** Vidéos YouTube « comment résilier », les meilleures d'abord. */
export async function searchTutorialVideos(merchant: string): Promise<{ title: string; url: string }[]> {
  const body = {
    q: `YouTube video tutorial: how to cancel a ${merchant} subscription, screen recording walkthrough`,
    depth: "standard",
    outputType: "searchResults",
    includeDomains: ["youtube.com"],
  };
  assertNoPii(body, "recherche Linkup (tutoriel vidéo)");
  void recordAccess({ service: "linkup", operation: "video tutorial search", direction: "sent", sent: merchant });
  const response = z
    .object({ results: z.array(z.object({ name: z.string().optional(), url: z.string().optional() }).passthrough()).nullish() })
    .safeParse(await postLinkup(LINKUP_SEARCH_URL, body, SEARCH_TIMEOUT_MS));
  if (!response.success) throw new ResearchError("Résultats vidéo Linkup illisibles");
  return (response.data.results ?? [])
    .filter((result) => /(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(result.url ?? ""))
    .map((result) => ({ title: (result.name ?? "").replace(/ - YouTube$/, ""), url: result.url ?? "" }));
}
