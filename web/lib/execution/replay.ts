// ---------------------------------------------------------------------------
// Replay for the free trial.
//
// A trial visitor never launches an H Company agent: they watch a REAL
// recorded session (see replay-recordings.ts), replayed at its real timings,
// with the same final gate: the visitor has to click for the rest to play.
// The screen says so ("Replay · recorded session"). Suppliers without a
// recording are refused in the trial: a real agent spends H Company quota and
// would hold the "one active agent" guard for everyone.
// ---------------------------------------------------------------------------

import type { Approval } from "./policy";
import { appendEvent, type Execution } from "./store";
import { runCopy, type RunLang } from "./run-copy";
import { RECORDINGS, type Recording, type ReplayCopy } from "./replay-recordings";

/** Suppliers with a recorded session, in the order they were recorded. */
export const REPLAY_SUPPLIER_IDS: readonly string[] = Object.keys(RECORDINGS);

/** Replays saved before the supplier was recorded on the run are Nuvio's. */
const LEGACY_REPLAY_SUPPLIER = "nuvio";

/** In the trial, only a recorded supplier is replayed; any other is refused. */
export function trialRunsReplay(supplierId: string): boolean {
  return Object.hasOwn(RECORDINGS, supplierId);
}

function recordingOf(exec: Execution): Recording {
  return RECORDINGS[exec.params.supplierId ?? LEGACY_REPLAY_SUPPLIER] ?? RECORDINGS[LEGACY_REPLAY_SUPPLIER];
}

/** Replays saved before the language was recorded were written in English. */
const replayCopy = (exec: Execution): ReplayCopy => recordingOf(exec).copy[exec.lang ?? "en"];

const SHOT = (file: string): string => `/replay/${file}`;

export function startReplay(approval: Approval, lang: RunLang = "en"): Execution {
  const recording = RECORDINGS[approval.params.supplierId];
  if (!recording) throw new Error("aucune_session_enregistree");
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
  appendEvent(exec, {
    kind: "approval",
    message: runCopy(lang).approvalGiven(approval.channel === "voice", approval.params.plan, approval.params.vendor, approval.actionHash.slice(0, 12)),
  });
  appendEvent(exec, { kind: "system", message: recording.copy[lang].intro });
  return exec;
}

export function advanceReplay(exec: Execution, nowMs = Date.now()): Execution {
  const r = exec.replay;
  if (!r || exec.status === "stopped_by_user" || exec.status === "supplier_confirmed") return exec;
  const recording = recordingOf(exec);
  const { before, after } = recording;

  if (r.goMs === null) {
    const elapsed = (nowMs - r.startedMs) / 1000;
    while (r.shown < before.length && before[r.shown].t <= elapsed) {
      const index = r.shown++;
      const step = before[index];
      exec.lastScreenshot = SHOT(step.shot);
      exec.steps = r.shown;
      appendEvent(exec, { kind: step.kind, message: replayCopy(exec).before[index], url: step.url });
    }
    if (elapsed >= recording.gateAt && exec.status === "running") {
      exec.status = "awaiting_final_approval";
      exec.paused = true;
      exec.finalPage = {
        summary: replayCopy(exec).finalPage,
        account_shown: exec.params.account,
        button_label: recording.finalButtonLabel,
      };
    }
    return exec;
  }

  const elapsed = (nowMs - r.goMs) / 1000;
  const done = r.shown - before.length;
  for (let i = done; i < after.length && after[i].t <= elapsed; i++) {
    const step = after[i];
    r.shown++;
    exec.lastScreenshot = SHOT(step.shot);
    exec.steps = before.length + i + 1;
    appendEvent(exec, { kind: step.kind, message: replayCopy(exec).after[i], url: step.url });
  }
  if (elapsed >= recording.verifyAt && r.shown >= before.length + after.length) {
    const { outcome } = recording;
    exec.confirmationNumber = outcome.confirmationNumber;
    exec.supplierState = { ...outcome.supplierState };
    exec.steps = outcome.steps;
    exec.costUsd = outcome.costUsd;
    exec.status = "supplier_confirmed";
    appendEvent(exec, { kind: "verification", message: replayCopy(exec).verified });
  }
  return exec;
}

export function decideReplay(exec: Execution, decision: "approve" | "refuse"): Execution {
  if (!exec.replay || exec.status !== "awaiting_final_approval") throw new Error("aucun_accord_final_en_attente");
  exec.finalDecision = { decision, at: new Date().toISOString() };
  const t = runCopy(exec.lang ?? "en");
  if (decision === "refuse") {
    exec.status = "stopped_by_user";
    appendEvent(exec, { kind: "approval", message: t.finalRefused });
    return exec;
  }
  exec.replay.goMs = Date.now();
  exec.paused = false;
  exec.status = "running";
  appendEvent(exec, { kind: "approval", message: t.finalGiven });
  return exec;
}

export function stopReplay(exec: Execution): Execution {
  if (exec.status !== "supplier_confirmed") {
    exec.status = "stopped_by_user";
    appendEvent(exec, { kind: "system", message: runCopy(exec.lang ?? "en").replayStopped });
  }
  return exec;
}
