// ---------------------------------------------------------------------------
// Stockage des accords et des exécutions.
//
//   - Cloudflare Workers : table D1 `exec_records` (db/0002_*.sql), un JSON par
//     accord / exécution. Les isolats ne partagent pas leur mémoire : sans ça,
//     un sondage atterrissant sur un autre isolat ne retrouverait pas
//     l'exécution.
//   - `next dev` sans binding : en mémoire du processus (globalThis, survit au
//     rechargement à chaud).
//
// Concurrence : toute modification d'une exécution passe par
// `withExecution`, qui relit l'état sous un verrou (`lock_until`), applique la
// modification, puis réécrit. Un feu vert humain ne peut donc pas être écrasé
// par un sondage parti juste avant lui. Les événements restent en AJOUT SEUL.
// ---------------------------------------------------------------------------

import type { Approval, ActionParams } from "./policy";
import type { ToolCall } from "./hcompany";
import type { SupplierState } from "./suppliers";
import { baseD1SiPresente } from "@/lib/runtime/bindings";

/** Statuts du PRD Kerdaxis (§4.5), + `running` et `stopped_by_user` pour l'affichage. */
export type ExecutionStatus =
  | "prepared"
  | "running"
  | "awaiting_final_approval"
  | "submitted"
  | "supplier_confirmed"
  | "failed"
  | "needs_manual_action"
  | "stopped_by_user";

export const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  "supplier_confirmed",
  "failed",
  "needs_manual_action",
  "stopped_by_user",
]);

export interface ExecutionEvent {
  at: string;
  kind: "system" | "agent" | "observation" | "approval" | "verification" | "warning" | "error";
  message: string;
  url?: string;
  screenshot?: string;
}

export interface Execution {
  id: string;
  approvalId: string;
  actionHash: string;
  params: ActionParams;
  status: ExecutionStatus;
  sessionId: string | null;
  agentViewUrl: string | null;
  liveViewUrl: string | null;
  fromIndex: number;
  pendingToolCall: ToolCall | null;
  /** Résumé de la page de confirmation finale, tiré de l'observation de l'agent. */
  finalPage: { summary: string; account_shown?: string; button_label?: string } | null;
  /** Kerdaxis a mis la session en pause devant la confirmation finale. */
  paused: boolean;
  finalDecision: { decision: "approve" | "refuse"; at: string } | null;
  answer: unknown;
  /** Nombre de réponses de l'agent vues, et ce nombre au moment du feu vert. */
  answerCount: number;
  answerCountAtDecision: number;
  confirmationNumber: string | null;
  supplierState: SupplierState | null;
  lastScreenshot: string | null;
  steps: number;
  costUsd: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  events: ExecutionEvent[];
  /** Essai gratuit : rediffusion d'une session réelle enregistrée (aucun appel H Company). */
  replay?: { startedMs: number; goMs: number | null; shown: number };
}

interface Db {
  approvals: Map<string, Approval>;
  executions: Map<string, Execution>;
  /** Verrou : une seule avance à la fois par exécution. */
  advancing: Set<string>;
}

const g = globalThis as unknown as { __kerdaxisDb?: Db };
export const db: Db = (g.__kerdaxisDb ??= {
  approvals: new Map(),
  executions: new Map(),
  advancing: new Set(),
});

export function appendEvent(exec: Execution, ev: Omit<ExecutionEvent, "at"> & { at?: string }): void {
  exec.events.push({ at: ev.at ?? new Date().toISOString(), ...ev });
  exec.updatedAt = new Date().toISOString();
}

/** Vue envoyée au navigateur : pas de jeton, pas de paramètres sensibles. */
export function publicView(exec: Execution) {
  return {
    id: exec.id,
    status: exec.status,
    vendor: exec.params.vendor,
    plan: exec.params.plan,
    account: exec.params.account,
    monthlyCents: exec.params.monthlyCents,
    actionHash: exec.actionHash,
    agentViewUrl: exec.agentViewUrl,
    liveViewUrl: exec.liveViewUrl,
    pendingApproval:
      exec.status === "awaiting_final_approval"
        ? (exec.finalPage ?? (exec.pendingToolCall ? exec.pendingToolCall.args : null))
        : null,
    finalDecision: exec.finalDecision,
    confirmationNumber: exec.confirmationNumber,
    supplierState: exec.supplierState,
    hasScreenshot: Boolean(exec.lastScreenshot),
    steps: exec.steps,
    costUsd: exec.costUsd,
    error: exec.error,
    createdAt: exec.createdAt,
    updatedAt: exec.updatedAt,
    replay: Boolean(exec.replay),
    events: exec.events.slice(-40).map(({ screenshot: _s, ...rest }) => rest),
  };
}

// --- Persistance -------------------------------------------------------------

type Kind = "approval" | "execution";

/** Durée max d'un verrou : couvre un long-poll H Company (5 s) + marge. */
const LOCK_MS = 20_000;

async function load<T>(kind: Kind, id: string): Promise<T | null> {
  const d = baseD1SiPresente();
  if (!d) return ((kind === "approval" ? db.approvals : db.executions).get(id) as T | undefined) ?? null;
  const r = await d.prepare("SELECT body FROM exec_records WHERE kind = ? AND id = ?").bind(kind, id).first<{ body: string }>();
  return r ? (JSON.parse(r.body) as T) : null;
}

async function save(kind: Kind, id: string, value: unknown): Promise<void> {
  const d = baseD1SiPresente();
  if (!d) {
    if (kind === "approval") db.approvals.set(id, value as Approval);
    else db.executions.set(id, value as Execution);
    return;
  }
  await d
    .prepare(
      "INSERT INTO exec_records (kind, id, body, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(kind, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
    )
    .bind(kind, id, JSON.stringify(value), Date.now())
    .run();
}

async function tryLock(id: string): Promise<boolean> {
  const d = baseD1SiPresente();
  if (!d) {
    if (db.advancing.has(id)) return false;
    db.advancing.add(id);
    return true;
  }
  const now = Date.now();
  const r = await d
    .prepare(
      "UPDATE exec_records SET lock_until = ? WHERE kind = 'execution' AND id = ? AND (lock_until IS NULL OR lock_until < ?)",
    )
    .bind(now + LOCK_MS, id, now)
    .run();
  return Boolean(r.meta?.changes);
}

async function unlock(id: string): Promise<void> {
  const d = baseD1SiPresente();
  if (!d) {
    db.advancing.delete(id);
    return;
  }
  await d.prepare("UPDATE exec_records SET lock_until = NULL WHERE kind = 'execution' AND id = ?").bind(id).run();
}

export const getApproval = (id: string) => load<Approval>("approval", id);
export const putApproval = (a: Approval) => save("approval", a.id, a);
export const getExecution = (id: string) => load<Execution>("execution", id);
export const putExecution = (e: Execution) => save("execution", e.id, e);

/**
 * Modifie une exécution sous verrou : relit l'état frais, applique `fn`,
 * réécrit, libère. `wait` : attendre le verrou (action humaine) plutôt que
 * d'abandonner (sondage). Rend `null` si l'exécution n'existe pas, `"busy"`
 * si le verrou n'a pas pu être pris.
 */
export async function withExecution<R>(
  id: string,
  fn: (exec: Execution) => Promise<R> | R,
  opts: { wait?: boolean } = {},
): Promise<{ exec: Execution; result: R } | null | "busy"> {
  const deadline = Date.now() + (opts.wait ? 15_000 : 0);
  for (;;) {
    if (await tryLock(id)) break;
    if (Date.now() >= deadline) return (await getExecution(id)) ? "busy" : null;
    await new Promise((r) => setTimeout(r, 250));
  }
  try {
    const exec = await getExecution(id);
    if (!exec) return null;
    const result = await fn(exec);
    await putExecution(exec);
    return { exec, result };
  } finally {
    await unlock(id);
  }
}
