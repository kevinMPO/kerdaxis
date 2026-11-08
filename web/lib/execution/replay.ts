// ---------------------------------------------------------------------------
// Rediffusion pour l'essai gratuit.
//
// Pour le fournisseur de démo (Nuvio CRM), un visiteur en essai ne lance pas
// d'agent H Company : il voit une session RÉELLE enregistrée le 7 nov. 2026
// (18:43:07–18:44:00, Paris, portail de démo en anglais, injection de prompt
// active, confirmation NUV-RW3L2Y), rejouée à ses horaires réels, avec le même
// feu vert final : le visiteur doit cliquer pour que la suite se joue.
// L'affichage le dit (« Replay · recorded session »). Aucune valeur inventée :
// captures, horaires, étapes et coût viennent de cette session. Les autres
// fournisseurs (Lumen sur Stripe) sont refusés en essai : un vrai agent coûte
// du quota H Company et bloquerait la garde « un seul agent actif » pour tous.
// ---------------------------------------------------------------------------

import type { Approval } from "./policy";
import { appendEvent, type Execution } from "./store";
import { runCopy, type RunCopy, type RunLang } from "./run-copy";

/** Replays saved before the language was recorded were written in English. */
const replayCopy = (exec: Execution): RunCopy => runCopy(exec.lang ?? "en");

/** Le seul fournisseur rejoué en essai : la session enregistrée est celle de Nuvio CRM. */
export const REPLAY_SUPPLIER_ID = "nuvio";

/** En essai, seul le fournisseur enregistré est rejoué ; tout autre fournisseur est refusé. */
export function trialRunsReplay(supplierId: string): boolean {
  return supplierId === REPLAY_SUPPLIER_ID;
}

const SHOT = (f: string) => `/replay/${f}`;

/** Avant le feu vert : secondes depuis le lancement (session lancée à 18:43:07). */
/** Step texts come from run-copy (replayBefore / replayAfter), in the same order. */
const BEFORE: { t: number; shot: string; kind: "agent" | "observation" | "warning" | "system"; url: string }[] = [
  { t: 8, shot: "obs-01-184315-account.png", kind: "observation", url: "https://portal.kerdaxis.com/account" },
  { t: 13, shot: "obs-02-184320-billing.png", kind: "agent", url: "https://portal.kerdaxis.com/billing" },
  { t: 17, shot: "obs-03-184324-subscription.png", kind: "agent", url: "https://portal.kerdaxis.com/subscription" },
  { t: 21, shot: "obs-04-184328-reason-empty.png", kind: "observation", url: "https://portal.kerdaxis.com/cancel/reason" },
  { t: 24, shot: "obs-05-184331-reason.png", kind: "agent", url: "https://portal.kerdaxis.com/cancel/reason" },
  { t: 29, shot: "obs-06-184336-offer.png", kind: "warning", url: "https://portal.kerdaxis.com/cancel/offer" },
  { t: 33, shot: "obs-07-184340-confirm-paused.png", kind: "system", url: "https://portal.kerdaxis.com/cancel/confirm" },
];
const GATE_AT = 33;

/** Après le feu vert : secondes depuis le clic humain. */
const AFTER: { t: number; shot: string; kind: "agent" | "verification"; url: string }[] = [
  { t: 1, shot: "obs-08-184349-confirm-resumed.png", kind: "agent", url: "https://portal.kerdaxis.com/cancel/confirm" },
  { t: 5, shot: "obs-09-184354-confirm-checked.png", kind: "agent", url: "https://portal.kerdaxis.com/cancel/confirm" },
  { t: 8, shot: "obs-10-184357-done.png", kind: "agent", url: "https://portal.kerdaxis.com/cancel/done" },
];
const VERIFY_AT = 11;

export function startReplay(approval: Approval, lang: RunLang = "en"): Execution {
  approval.usedAt = new Date().toISOString();
  const now = new Date();
  const exec: Execution = {
    id: crypto.randomUUID(),
    approvalId: approval.id,
    actionHash: approval.actionHash,
    params: approval.params,
    status: "running",
    sessionId: null,
    agentViewUrl: null,
    liveViewUrl: null,
    fromIndex: 0,
    pendingToolCall: null,
    finalPage: null,
    paused: false,
    finalDecision: null,
    answer: null,
    answerCount: 0,
    answerCountAtDecision: 0,
    confirmationNumber: null,
    supplierState: null,
    lastScreenshot: null,
    steps: 0,
    costUsd: null,
    error: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    events: [],
    replay: { startedMs: now.getTime(), goMs: null, shown: 0 },
    lang,
  };
  const t = runCopy(lang);
  appendEvent(exec, {
    kind: "approval",
    message: t.approvalGiven(approval.channel === "voice", approval.params.plan, approval.params.vendor, approval.actionHash.slice(0, 12)),
  });
  appendEvent(exec, { kind: "system", message: t.replayIntro });
  return exec;
}

export function advanceReplay(exec: Execution, nowMs = Date.now()): Execution {
  const r = exec.replay;
  if (!r || exec.status === "stopped_by_user" || exec.status === "supplier_confirmed") return exec;

  if (r.goMs === null) {
    const el = (nowMs - r.startedMs) / 1000;
    while (r.shown < BEFORE.length && BEFORE[r.shown].t <= el) {
      const index = r.shown++;
      const s = BEFORE[index];
      exec.lastScreenshot = SHOT(s.shot);
      exec.steps = r.shown;
      appendEvent(exec, { kind: s.kind, message: replayCopy(exec).replayBefore[index], url: s.url });
    }
    if (el >= GATE_AT && exec.status === "running") {
      exec.status = "awaiting_final_approval";
      exec.paused = true;
      exec.finalPage = {
        summary: replayCopy(exec).replayFinalPage,
        account_shown: exec.params.account,
        button_label: "Confirm cancellation",
      };
    }
    return exec;
  }

  const el = (nowMs - r.goMs) / 1000;
  const done = r.shown - BEFORE.length;
  for (let i = done; i < AFTER.length && AFTER[i].t <= el; i++) {
    const s = AFTER[i];
    r.shown++;
    exec.lastScreenshot = SHOT(s.shot);
    exec.steps = BEFORE.length + i + 1;
    appendEvent(exec, { kind: s.kind, message: replayCopy(exec).replayAfter[i], url: s.url });
  }
  if (el >= VERIFY_AT && r.shown >= BEFORE.length + AFTER.length) {
    exec.confirmationNumber = "NUV-RW3L2Y";
    exec.supplierState = {
      status: "cancelled",
      confirmation_number: "NUV-RW3L2Y",
      cancelled_at: "2026-11-07T17:43:57Z",
      access_until: "2026-11-30",
    };
    exec.steps = 10;
    exec.costUsd = 0.027;
    exec.status = "supplier_confirmed";
    appendEvent(exec, {
      kind: "verification",
      message: replayCopy(exec).replayVerified,
    });
  }
  return exec;
}

export function decideReplay(exec: Execution, decision: "approve" | "refuse"): Execution {
  if (!exec.replay || exec.status !== "awaiting_final_approval") throw new Error("aucun_accord_final_en_attente");
  exec.finalDecision = { decision, at: new Date().toISOString() };
  if (decision === "refuse") {
    exec.status = "stopped_by_user";
    appendEvent(exec, { kind: "approval", message: replayCopy(exec).finalRefused });
    return exec;
  }
  exec.replay.goMs = Date.now();
  exec.paused = false;
  exec.status = "running";
  appendEvent(exec, { kind: "approval", message: replayCopy(exec).finalGiven });
  return exec;
}

export function stopReplay(exec: Execution): Execution {
  if (exec.status !== "supplier_confirmed") {
    exec.status = "stopped_by_user";
    appendEvent(exec, { kind: "system", message: replayCopy(exec).replayStopped });
  }
  return exec;
}
