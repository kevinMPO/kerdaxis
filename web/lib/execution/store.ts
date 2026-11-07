// ---------------------------------------------------------------------------
// Stockage des accords et des exécutions.
//
// P0 (démo locale) : en mémoire du processus, attaché à globalThis pour
// survivre au rechargement à chaud de `next dev`. Les événements d'une
// exécution sont en AJOUT SEUL (jamais réécrits). Limite assumée : un
// redémarrage du serveur efface l'historique ; la cible P1 est une table
// d'événements D1 (Cloudflare) avec la même interface.
// ---------------------------------------------------------------------------

import type { Approval, ActionParams } from "./policy";
import type { ToolCall } from "./hcompany";
import type { SupplierState } from "./suppliers";

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
