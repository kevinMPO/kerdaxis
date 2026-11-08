// ---------------------------------------------------------------------------
// Client minimal de la Models API de H Company (compatible OpenAI), le seul LLM
// appelé par l'app web : catégorisation, courriers, extraction de prix, risque
// fournisseur. Même clé (HAI_API_KEY) que l'agent de navigation.
//
// Appels HTTP directs, sans SDK : portable tel quel sur Cloudflare Workers.
// La clé ne sort jamais de ce module et n'apparaît dans aucun message d'erreur.
// Ce module n'applique PAS le filtre anti-PII : chaque appelant passe sa charge
// utile par `assertNoPii` avant d'appeler `holoChat` (règle 3).
// ---------------------------------------------------------------------------

import { HaiError, haiConfigured } from "@/lib/execution/hcompany";

const DEFAULT_MODEL = "holo4-27b";
const DEFAULT_TIMEOUT_MS = 30_000;
const ERROR_EXCERPT_CHARS = 300;

export interface HoloJsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface HoloChatRequest {
  system: string;
  user: string;
  /** Contraint la sortie à ce schéma JSON. Absent : texte libre. */
  jsonSchema?: HoloJsonSchema;
  /** Surcharge du modèle (sinon HAI_LLM_MODEL, sinon holo4-27b). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

interface HoloChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export function holoConfigured(): boolean {
  return haiConfigured();
}

export function holoModel(override?: string): string {
  return override || process.env.HAI_LLM_MODEL || DEFAULT_MODEL;
}

function baseUrl(): string {
  return (process.env.HAI_MODELS_BASE_URL ?? "https://api.hcompany.ai/v1").replace(/\/+$/, "");
}

/** Un tour de chat. Renvoie le texte de la réponse (du JSON si `jsonSchema`). */
export async function holoChat(req: HoloChatRequest): Promise<string> {
  const key = process.env.HAI_API_KEY;
  if (!key) throw new HaiError(503, "not_configured", "HAI_API_KEY manquante");

  const corps = {
    model: holoModel(req.model),
    temperature: req.temperature ?? 0,
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    // Réponses en un coup : la trace de raisonnement ne ferait que ralentir.
    chat_template_kwargs: { enable_thinking: false },
    ...(req.jsonSchema
      ? { response_format: { type: "json_schema", json_schema: req.jsonSchema } }
      : {}),
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  };

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corps),
    cache: "no-store",
    signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Extrait court du corps pour le diagnostic, jamais les en-têtes (la clé).
    const extrait = (await res.text().catch(() => "")).slice(0, ERROR_EXCERPT_CHARS);
    throw new HaiError(res.status, `http_${res.status}`, `H Company Models API ${res.status} : ${extrait}`);
  }

  const completion = (await res.json()) as HoloChatCompletion;
  const contenu = completion.choices?.[0]?.message?.content?.trim();
  if (!contenu) throw new HaiError(502, "empty_completion", "Réponse Holo vide");
  return contenu;
}
