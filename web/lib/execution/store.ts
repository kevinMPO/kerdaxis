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
import type { SupplierState, SupplierTarget } from "./suppliers";
import type { RunLang } from "./run-copy";
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

/** Le parcours remis à l'agent, et d'où il vient. Visible dans le panneau d'exécution. */
export interface PlaybookView {
  source: "catalog" | "research";
  /** Nom recherché (l'interface que l'agent verra). */
  merchant: string | null;
  officialDocUrl: string | null;
  steps: string[];
  finalButtonLabel: string;
  retentionTraps: string[];
  screenshots: { read: number; sent: number; steps: string[] } | null;
  video: { title: string; url: string; steps: string[] } | null;
  /** Recherche en échec : l'agent suit la consigne générique du catalogue. */
  fallbackReason: string | null;
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
  /** Language of the run log and of the agent's notes; absent on runs saved before it was recorded. */
  lang?: RunLang;
  /** Essai gratuit : rediffusion d'une session réelle enregistrée (aucun appel H Company). */
  replay?: { startedMs: number; goMs: number | null; shown: number };
  playbook?: PlaybookView | null;
  /** Ce que l'exécution a créé chez le fournisseur (abonnement de test Stripe), pour la preuve. */
  target?: SupplierTarget | null;
  /** Consignes de la mission, gardées pour relancer une session H bloquée sans refaire la recherche. */
  launchGuide?: { text: string; finalLabel: string } | null;
  /** Session H en cours : début, numéro d'essai, et si l'agent a déjà agi (événement de décision). */
  sessionStartedAt?: string | null;
  sessionAttempts?: number;
  sessionActed?: boolean;
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
    playbook: exec.playbook ?? null,
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

/** Exécutions récentes (garde « un seul agent actif »). D1 : les 50 dernières. */
export async function recentExecutions(): Promise<Execution[]> {
  const d = baseD1SiPresente();
  if (!d) return [...db.executions.values()];
  const r = await d
    .prepare("SELECT body FROM exec_records WHERE kind = 'execution' ORDER BY updated_at DESC LIMIT 50")
    .all<{ body: string }>();
  return r.results.map((row) => JSON.parse(row.body) as Execution);
}

/**
 * Garde vivant un travail lancé après la réponse HTTP. Sur Cloudflare Workers,
 * une promesse non rattachée à `ctx.waitUntil` est coupée à la fin de la
 * requête ; en `next dev`, elle tourne simplement.
 */
export function keepAlive(work: Promise<unknown>): void {
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as
    | { ctx?: { waitUntil?: (p: Promise<unknown>) => void } }
    | undefined;
  const guarded = work.catch(() => undefined);
  if (ctx?.ctx?.waitUntil) ctx.ctx.waitUntil(guarded);
}

/**
 * Réinjecte dans l'état stocké ce que le lancement en arrière-plan a produit
 * (session, guide, cible, événements), sous verrou. Un arrêt humain survenu
 * pendant la préparation l'emporte : le statut terminal stocké est conservé.
 * Rend vrai si l'exécution a été arrêtée entre-temps.
 */
export async function mergeLaunch(local: Execution): Promise<boolean> {
  let stoppedMeanwhile = false;
  // La route enregistre l'exécution juste après le lancement : on l'attend si besoin.
  for (let i = 0; i < 20 && !(await getExecution(local.id)); i++) await new Promise((r) => setTimeout(r, 250));
  await withExecution(
    local.id,
    (stored) => {
      if (stored === local) return; // mémoire du processus : même objet
      const seen = new Set(stored.events.map((e) => `${e.at}|${e.message}`));
      for (const ev of local.events) if (!seen.has(`${ev.at}|${ev.message}`)) stored.events.push(ev);
      stored.events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      stored.sessionId = local.sessionId;
      stored.agentViewUrl = local.agentViewUrl;
      stored.liveViewUrl = local.liveViewUrl ?? stored.liveViewUrl;
      stored.launchGuide = local.launchGuide ?? stored.launchGuide;
      stored.target = local.target ?? stored.target;
      stored.fromIndex = Math.max(stored.fromIndex, local.fromIndex);
      if (TERMINAL_STATUSES.has(stored.status)) {
        stoppedMeanwhile = true;
      } else {
        stored.status = local.status;
        stored.error = local.error;
      }
      stored.updatedAt = new Date().toISOString();
    },
    { wait: true },
  );
  return stoppedMeanwhile;
}
