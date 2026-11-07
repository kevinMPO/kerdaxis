import { describe, expect, it } from "vitest";
import { applyChanges, parseAnswer, type Playbook } from "../runner";
import type { Execution } from "../store";
import type { HaiChanges } from "../hcompany";

const HOST = "kerdaxis-portal.example.workers.dev";
const PLAYBOOK: Playbook = { finalStepPath: "/cancel/confirm", donePath: "/cancel/done" };

function exec(): Execution {
  const now = new Date().toISOString();
  return {
    id: "e1",
    approvalId: "a1",
    actionHash: "h",
    params: {
      orgId: "demo-acme",
      supplierId: "nuvio",
      vendor: "Nuvio CRM",
      account: "Acme Conseil SAS",
      action: "cancel",
      plan: "Nuvio Growth",
      monthlyCents: 12900,
      currency: "EUR",
      allowedHost: HOST,
    },
    status: "running",
    sessionId: "s1",
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
    createdAt: now,
    updatedAt: now,
    events: [],
  };
}

function changes(partial: Partial<HaiChanges>): HaiChanges {
  return {
    status: "running",
    error: null,
    error_code: null,
    outcome: null,
    answer: null,
    new_events: [],
    first_index: 0,
    pending_tool_calls: [],
    ...partial,
  };
}

const obs = (url: string, text = "") => ({
  type: "AgentEvent",
  timestamp: "2026-11-07T10:00:00Z",
  data: {
    kind: "observation_event",
    type: "web",
    image: { type: "url", source: "https://cdn.hcompany.ai/shot.png" },
    metadata: { url, title: "Nuvio", text },
  },
});

const answer = (a: unknown) => ({ type: "AgentEvent", timestamp: "2026-11-07T10:01:00Z", data: { kind: "answer_event", answer: a } });

describe("machine d'états — événements H Company", () => {
  it("avance l'index de lecture et garde la dernière capture", () => {
    const e = exec();
    applyChanges(e, changes({ new_events: [obs(`https://${HOST}/account`), obs(`https://${HOST}/billing`)] }), PLAYBOOK);
    expect(e.fromIndex).toBe(2);
    expect(e.lastScreenshot).toBe("https://cdn.hcompany.ai/shot.png");
    expect(e.events.filter((x) => x.kind === "observation")).toHaveLength(2);
  });

  it("signale une navigation hors du portail approuvé", () => {
    const e = exec();
    const r = applyChanges(e, changes({ new_events: [obs("https://www.google.com/search?q=x")] }), PLAYBOOK);
    expect(r.violation).toMatch(/hors du portail/);
  });

  it("détecte l'arrivée sur la page de confirmation finale et en garde un résumé", () => {
    const e = exec();
    const r = applyChanges(
      e,
      changes({ new_events: [obs(`https://${HOST}/cancel/confirm`, "## Confirmer la résiliation\nAction **définitive**.")] }),
      PLAYBOOK,
    );
    expect(r.atFinalStep).toBe(true);
    expect(e.finalPage?.summary).toContain("Confirmer la résiliation");
  });

  it("la page « c'est fait » sans feu vert humain est une violation (premier essai réel)", () => {
    const e = exec();
    const r = applyChanges(e, changes({ new_events: [obs(`https://${HOST}/cancel/done`)] }), PLAYBOOK);
    expect(r.violation).toMatch(/sans feu vert/);
  });

  it("la page « c'est fait » APRÈS le feu vert est normale", () => {
    const e = exec();
    e.finalDecision = { decision: "approve", at: "2026-11-07T10:02:00Z" };
    const r = applyChanges(e, changes({ new_events: [obs(`https://${HOST}/cancel/done`)] }), PLAYBOOK);
    expect(r.violation).toBeNull();
    expect(r.atFinalStep).toBe(false);
  });

  it("compte les réponses : tour 1 puis tour 2", () => {
    const e = exec();
    let r = applyChanges(e, changes({ new_events: [answer({ phase: "ready_for_final_confirmation", notes: "" })] }), PLAYBOOK);
    expect(r.newAnswer).toBe(true);
    expect(e.answerCount).toBe(1);
    e.answerCountAtDecision = e.answerCount;
    r = applyChanges(e, changes({ new_events: [answer({ phase: "cancelled", confirmation_number: "NUV-ABC234", notes: "" })] }), PLAYBOOK);
    expect(e.answerCount).toBe(2);
    expect(e.answerCount > e.answerCountAtDecision).toBe(true);
  });

  it("une même réponse relue plusieurs fois (après un 204) ne compte qu'une fois", () => {
    const e = exec();
    applyChanges(e, changes({ answer: { phase: "cancelled", confirmation_number: "NUV-X" } }), PLAYBOOK);
    applyChanges(e, changes({ answer: { phase: "cancelled", confirmation_number: "NUV-X" } }), PLAYBOOK);
    expect(e.answerCount).toBe(1);
  });

  it("lit la réponse structurée avec tolérance (champ outcome, ou seulement un numéro)", () => {
    expect(parseAnswer({ phase: "cancelled", confirmation_number: "NUV-ABC123" })?.confirmation_number).toBe("NUV-ABC123");
    expect(parseAnswer('{"phase":"needs_human","notes":"MFA"}')?.phase).toBe("needs_human");
    expect(parseAnswer({ notes: "résiliée", confirmation_number: "NUV-BXUD8R" })?.phase).toBe("cancelled");
    expect(parseAnswer({ outcome: "not_cancelled", notes: "" })?.phase).toBe("not_cancelled");
    expect(parseAnswer("texte libre")).toBeNull();
  });
});
