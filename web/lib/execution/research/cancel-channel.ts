// ---------------------------------------------------------------------------
// Peut-on résilier ce fournisseur EN LIGNE ? Linkup lit sa doc officielle.
//
// La réponse décide du livrable : en ligne, l'agent H Company résilie (avec le
// feu vert humain) ; sinon, Kerdaxis prépare une lettre. Rien n'est supposé :
// sans page source, la réponse est `unknown` et le livrable reste la lettre.
//
// Seul le NOM du fournisseur part vers Linkup (règle 3). Réponse sourcée et
// datée (règle 4) : sans URL, un seul nouvel essai, puis « non vérifié ».
// Cache D1 30 jours (table `cancel_channels`, db/0005) : du web public,
// partagé entre organisations, sans aucune donnée client.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { assertNoPii, sanitizeMerchantQuery } from "@/lib/privacy/egress";
import { recordAccess } from "@/lib/privacy/access-log";
import { baseD1SiPresente } from "@/lib/runtime/bindings";
import type { CancelChannelCheck } from "@/lib/types";
import { LINKUP_SEARCH_URL, linkupConfigured, onlyUrl, postLinkup } from "./linkup";
import { ResearchError } from "./types";

const DAY_MS = 86_400_000;
export const CANCEL_CHANNEL_TTL_DAYS = 30;
/** Deux essais de 25 s tiennent dans les 60 s de la route. */
const SEARCH_TIMEOUT_MS = 25_000;
/** Règle 4 : une réponse sans source est rejetée, puis un seul nouvel essai. */
const MAX_ATTEMPTS = 2;

const CHANNEL_SCHEMA = {
  type: "object",
  properties: {
    self_serve_online: {
      type: "boolean",
      description:
        "true only if the merchant's official help page says a customer can cancel their paid subscription themselves " +
        "on the website or in the app (account or billing settings), with no email, phone call, support ticket or letter required.",
    },
    official_doc_url: { type: "string", description: "URL of the merchant's own help page that states it" },
  },
  required: ["self_serve_online", "official_doc_url"],
};

const LinkupChannelResponse = z.object({
  data: z
    .object({
      self_serve_online: z.boolean().nullish(),
      official_doc_url: z.string().nullish(),
    })
    .nullish(),
  sources: z.array(z.object({ url: z.string().optional() }).passthrough()).nullish(),
});

export function buildChannelQuery(merchant: string): string {
  return (
    `Official ${merchant} help center: can a customer cancel their paid ${merchant} subscription themselves online, ` +
    "from the account or billing settings, without contacting support, calling or sending a letter?"
  );
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** Réponse Linkup → canal sourcé. Lève si la réponse n'a pas de source (exporté pour les tests). */
export function parseCancelChannel(body: unknown, checkedAt: string): CancelChannelCheck {
  const response = LinkupChannelResponse.safeParse(body);
  if (!response.success) throw new ResearchError("Réponse Linkup illisible");
  const answer = response.data.data;
  if (typeof answer?.self_serve_online !== "boolean") throw new ResearchError("Linkup n'a pas tranché");
  const firstSource = (response.data.sources ?? []).map((s) => s.url ?? "").find((url) => url.startsWith("http")) ?? "";
  const sourceUrl = onlyUrl(answer.official_doc_url) || firstSource;
  if (!sourceUrl) throw new ResearchError("Réponse Linkup sans source");
  return { channel: answer.self_serve_online ? "online" : "offline", sourceUrl, checkedAt };
}

const unknownChannel = (): CancelChannelCheck => ({ channel: "unknown", sourceUrl: "", checkedAt: today() });

async function readCached(key: string, now: number): Promise<CancelChannelCheck | null> {
  const db = baseD1SiPresente();
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT result_json FROM cancel_channels WHERE merchant_key = ? AND expires_at > ?")
      .bind(key, now)
      .first<{ result_json: string }>();
    return row ? (JSON.parse(row.result_json) as CancelChannelCheck) : null;
  } catch (error) {
    console.error("[kerdaxis][cancel-channel] lecture du cache impossible :", error instanceof Error ? error.message : error);
    return null;
  }
}

async function writeCached(key: string, result: CancelChannelCheck, now: number): Promise<void> {
  const db = baseD1SiPresente();
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO cancel_channels (merchant_key, result_json, checked_at, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(merchant_key) DO UPDATE SET
           result_json = excluded.result_json,
           checked_at  = excluded.checked_at,
           updated_at  = excluded.updated_at,
           expires_at  = excluded.expires_at`,
      )
      .bind(key, JSON.stringify(result), result.checkedAt, now, now, now + CANCEL_CHANNEL_TTL_DAYS * DAY_MS)
      .run();
  } catch (error) {
    console.error("[kerdaxis][cancel-channel] écriture du cache impossible :", error instanceof Error ? error.message : error);
  }
}

const cacheKey = (merchant: string): string => sanitizeMerchantQuery(merchant).merchant.toLowerCase();

/** Lecture du cache seule, sans réseau : la route l'appelle AVANT le plafond de débit. */
export async function cachedCancelChannel(merchant: string, now: number = Date.now()): Promise<CancelChannelCheck | null> {
  try {
    return await readCached(cacheKey(merchant), now);
  } catch {
    return null;
  }
}

/** Canal de résiliation sourcé, ou `unknown` (jamais mis en cache : on retentera). */
export async function checkCancelChannel(merchant: string, now: number = Date.now()): Promise<CancelChannelCheck> {
  if (!linkupConfigured()) return unknownChannel();
  let clean: string;
  try {
    clean = sanitizeMerchantQuery(merchant).merchant;
  } catch {
    return unknownChannel();
  }
  const body = {
    q: buildChannelQuery(clean),
    depth: "standard",
    outputType: "structured",
    structuredOutputSchema: JSON.stringify(CHANNEL_SCHEMA),
    includeSources: true,
  };
  assertNoPii(body, "recherche Linkup (résiliation en ligne)");
  void recordAccess({ service: "linkup", operation: "online cancellation check", direction: "sent", sent: clean });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = parseCancelChannel(await postLinkup(LINKUP_SEARCH_URL, body, SEARCH_TIMEOUT_MS), today());
      await writeCached(clean.toLowerCase(), result, now);
      return result;
    } catch (error) {
      console.error(`[kerdaxis][cancel-channel] essai ${attempt + 1} :`, error instanceof Error ? error.message : error);
    }
  }
  return unknownChannel();
}
