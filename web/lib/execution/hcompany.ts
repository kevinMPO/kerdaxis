// ---------------------------------------------------------------------------
// Client REST minimal de l'Agents API de H Company (computer use).
//
// Appels HTTP directs plutôt que le SDK `hai-agents` : aucune dépendance Node,
// donc portable tel quel sur Cloudflare Workers. Contrat vérifié dans la doc
// officielle (hub.hcompany.ai/agents-api, consultée le 2026-11-07) :
//   POST   /sessions                    (en-tête Idempotency-Key)
//   GET    /sessions/{id}
//   GET    /sessions/{id}/changes       (?from_index=&wait_for_seconds=)
//   POST   /sessions/{id}/tool_results  ({kind:"tool_result", tool_req, result})
//   DELETE /sessions/{id}               (annulation, état terminal)
// La clé (HAI_API_KEY) ne sort jamais de ce module et n'apparaît dans aucun
// message d'erreur.
// ---------------------------------------------------------------------------

const BASE = (process.env.HAI_BASE_URL ?? "https://agp.eu.hcompany.ai/api/v2").replace(/\/+$/, "");

export class HaiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "HaiError";
  }
}

export interface ToolCall {
  tool_name: string;
  args: Record<string, unknown>;
  id: string | null;
}

export interface HaiEvent {
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface HaiChanges {
  status: string;
  error: string | null;
  error_code: string | null;
  outcome: string | null;
  answer: unknown;
  new_events: HaiEvent[];
  first_index: number | null;
  pending_tool_calls: ToolCall[];
  metrics?: { steps?: number; total_cost?: number | null };
}

export interface HaiSession {
  id: string;
  status: { status: string; error: string | null; error_code: string | null; outcome: string | null };
  agent_view_url?: string;
  latest_answer: unknown;
}

export function haiConfigured(): boolean {
  return Boolean(process.env.HAI_API_KEY);
}

async function hai<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T | null> {
  const key = process.env.HAI_API_KEY;
  if (!key) throw new HaiError(503, "not_configured", "HAI_API_KEY manquante");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (res.status === 204) return null;
  if (!res.ok) {
    // On garde un extrait court du corps (diagnostic), jamais les en-têtes.
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new HaiError(res.status, `http_${res.status}`, `H Company ${res.status} ${path.split("?")[0]} : ${body}`);
  }
  // Certaines routes répondent 202 sans corps (ex. envoi de message) : un corps
  // vide n'est pas une erreur.
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

export function createSession(body: unknown, idempotencyKey: string): Promise<HaiSession | null> {
  return hai<HaiSession>("/sessions", { method: "POST", body: JSON.stringify(body), idempotencyKey });
}

export function getSession(id: string): Promise<HaiSession | null> {
  return hai<HaiSession>(`/sessions/${encodeURIComponent(id)}`);
}

export function getChanges(id: string, fromIndex: number, waitForSeconds: number): Promise<HaiChanges | null> {
  const q = new URLSearchParams({ from_index: String(fromIndex), wait_for_seconds: String(waitForSeconds) });
  return hai<HaiChanges>(`/sessions/${encodeURIComponent(id)}/changes?${q}`);
}

export function postToolResult(id: string, toolReq: ToolCall, result: string): Promise<unknown> {
  return hai(`/sessions/${encodeURIComponent(id)}/tool_results`, {
    method: "POST",
    body: JSON.stringify({ kind: "tool_result", tool_req: toolReq, result }),
  });
}

export function cancelSession(id: string): Promise<unknown> {
  return hai(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Met l'agent en pause (état conservé). Verrou côté Kerdaxis, indépendant du modèle. */
export function pauseSession(id: string): Promise<unknown> {
  return hai(`/sessions/${encodeURIComponent(id)}/pause`, { method: "POST" });
}

/** Envoie un message à l'agent ; une session en pause ou en attente reprend. */
export function sendMessage(id: string, message: string): Promise<unknown> {
  return hai(`/sessions/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "user_message", message }),
  });
}
