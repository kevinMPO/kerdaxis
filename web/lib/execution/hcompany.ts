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

export const REQUEST_TIMEOUT_MS = 20_000;
export const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const MAX_RETRY_AFTER_MS = 5_000;
/** Statuts où le serveur n'a rien fait, ou où rejouer une requête sans effet de bord ne coûte rien. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

interface HaiRequest extends RequestInit {
  idempotencyKey?: string;
  /**
   * Rejouer la requête ne change rien chez H (lecture, annulation, pause,
   * création avec clé d'idempotence). Par défaut : GET, DELETE, ou clé présente.
   * Un message ou un résultat d'outil n'est PAS rejouable : après une coupure
   * réseau, le feu vert est peut-être déjà dans la file de l'agent.
   */
  replayable?: boolean;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** (attempt - 1);
}

function retryAfterMs(header: string | null): number | null {
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/** Envoie la requête ; une coupure réseau ou un délai dépassé devient une HaiError sans en-têtes. */
async function send(url: string, init: RequestInit, timeoutMs: number, route: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    if (timedOut) throw new HaiError(504, "timeout", `H Company ${route} : pas de réponse en ${timeoutMs / 1000} s`);
    throw new HaiError(502, "network_error", `H Company ${route} : erreur réseau (${err instanceof Error ? err.message : String(err)})`);
  }
}

async function hai<T>(path: string, init: HaiRequest = {}): Promise<T | null> {
  const key = process.env.HAI_API_KEY;
  if (!key) throw new HaiError(503, "not_configured", "HAI_API_KEY manquante");
  const { idempotencyKey, replayable, timeoutMs = REQUEST_TIMEOUT_MS, ...requestInit } = init;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const method = (requestInit.method ?? "GET").toUpperCase();
  const canReplay = replayable ?? (method === "GET" || method === "DELETE" || Boolean(idempotencyKey));
  const route = path.split("?")[0];

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await send(`${BASE}${path}`, { ...requestInit, headers, cache: "no-store" }, timeoutMs, route);
    } catch (err) {
      if (!canReplay || attempt >= MAX_ATTEMPTS) throw err;
      await sleep(backoffMs(attempt));
      continue;
    }
    if (res.status === 204) return null;
    if (res.ok) {
      // Certaines routes répondent 202 sans corps (ex. envoi de message) : un corps
      // vide n'est pas une erreur.
      const text = await res.text();
      return text ? (JSON.parse(text) as T) : null;
    }
    // On garde un extrait court du corps (diagnostic), jamais les en-têtes.
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const failure = new HaiError(res.status, `http_${res.status}`, `H Company ${res.status} ${route} : ${body}`);
    // 429 : la requête a été refusée avant tout traitement, la rejouer est toujours sûr.
    const retryable = res.status === 429 || (canReplay && RETRYABLE_STATUSES.has(res.status));
    if (!retryable || attempt >= MAX_ATTEMPTS) throw failure;
    await sleep(retryAfterMs(res.headers.get("retry-after")) ?? backoffMs(attempt));
  }
}

export function createSession(body: unknown, idempotencyKey: string): Promise<HaiSession | null> {
  return hai<HaiSession>("/sessions", { method: "POST", body: JSON.stringify(body), idempotencyKey });
}

export function getSession(id: string): Promise<HaiSession | null> {
  return hai<HaiSession>(`/sessions/${encodeURIComponent(id)}`);
}

/** Long-poll : le serveur garde la requête jusqu'à `waitForSeconds`, le délai s'y ajoute. */
export function getChanges(id: string, fromIndex: number, waitForSeconds: number): Promise<HaiChanges | null> {
  const q = new URLSearchParams({ from_index: String(fromIndex), wait_for_seconds: String(waitForSeconds) });
  return hai<HaiChanges>(`/sessions/${encodeURIComponent(id)}/changes?${q}`, {
    timeoutMs: waitForSeconds * 1000 + REQUEST_TIMEOUT_MS,
  });
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
  return hai(`/sessions/${encodeURIComponent(id)}/pause`, { method: "POST", replayable: true });
}

/**
 * Reprend une session mise en pause. Un message seul ne la réveille pas
 * toujours : constaté le 2026-11-07, une session en pause qui reçoit le feu
 * vert dans la même seconde reste en pause, message non lu.
 */
export function resumeSession(id: string): Promise<unknown> {
  return hai(`/sessions/${encodeURIComponent(id)}/resume`, { method: "POST", replayable: true });
}

/** Envoie un message à l'agent ; une session en attente (`idle`) reprend, une session en pause non (voir resumeSession). */
export function sendMessage(id: string, message: string): Promise<unknown> {
  return hai(`/sessions/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "user_message", message }),
  });
}
