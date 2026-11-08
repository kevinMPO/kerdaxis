import { describe, expect, it } from "vitest";
import { ACTIVE_WINDOW_MS, applyChanges, findActiveExecution, isPreparationStalled, isStalled, PREPARE_STALL_MS, STALL_MS } from "../runner";
import type { Execution } from "../store";
import type { HaiChanges } from "../hcompany";

const STARTED = Date.parse("2026-11-07T21:27:16.000Z");

function exec(overrides: Partial<Execution> = {}): Execution {
  return {
    status: "running",
    finalDecision: null,
    sessionActed: false,
    sessionStartedAt: new Date(STARTED).toISOString(),
    params: { allowedHost: "billing.stripe.com" },
    events: [],
    fromIndex: 0,
    answerCount: 0,
    ...overrides,
  } as unknown as Execution;
}

describe("isStalled (H session that never starts acting)", () => {
  it("should flag a running session with no agent decision after the stall delay", () => {
    expect(isStalled(exec(), STARTED + STALL_MS + 1)).toBe(true);
  });

  it("should leave a fresh session alone", () => {
    expect(isStalled(exec(), STARTED + STALL_MS - 1)).toBe(false);
  });

  it("should never relaunch once the agent has acted", () => {
    expect(isStalled(exec({ sessionActed: true }), STARTED + 10 * STALL_MS)).toBe(false);
  });

  it("should never relaunch a session waiting for the human's final go, or after it", () => {
    expect(isStalled(exec({ status: "awaiting_final_approval" }), STARTED + 10 * STALL_MS)).toBe(false);
    expect(isStalled(exec({ finalDecision: { decision: "approve", at: "x" } }), STARTED + 10 * STALL_MS)).toBe(false);
  });

  it("should count the agent's first decision as acting", () => {
    const e = exec();
    const changes: HaiChanges = {
      status: "running",
      error: null,
      error_code: null,
      outcome: null,
      answer: null,
      first_index: 0,
      pending_tool_calls: [],
      new_events: [{ type: "AgentEvent", timestamp: "2026-11-07T21:27:30Z", data: { kind: "policy_event", content: "Let me click Cancel." } }],
    };
    applyChanges(e, changes, { finalStepPath: "/x", donePath: null });
    expect(isStalled(e, STARTED + 10 * STALL_MS)).toBe(false);
  });
});

describe("findActiveExecution (one H agent at a time)", () => {
  const now = Date.parse("2026-11-07T22:00:00.000Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const run = (status: string, updatedAt: string, replay = false) =>
    ({ status, updatedAt, replay: replay ? { startedMs: 0, goMs: null, shown: 0 } : undefined, params: { vendor: "Lumen Analytics" } }) as unknown as Execution;

  it("should block while a run is preparing, working or waiting for the final go", () => {
    for (const status of ["prepared", "running", "awaiting_final_approval", "submitted"]) {
      expect(findActiveExecution([run(status, at(1_000))], now)).not.toBeNull();
    }
  });

  it("should not block once runs are finished", () => {
    const done = ["supplier_confirmed", "failed", "needs_manual_action", "stopped_by_user"].map((s) => run(s, at(1_000)));
    expect(findActiveExecution(done, now)).toBeNull();
  });

  it("should ignore a run with no news for longer than the active window", () => {
    expect(findActiveExecution([run("running", at(ACTIVE_WINDOW_MS + 1))], now)).toBeNull();
  });

  it("should ignore free-trial replays, which never use the H agent", () => {
    expect(findActiveExecution([run("running", at(1_000), true)], now)).toBeNull();
  });
});

describe("isPreparationStalled (background preparation cut off by the Worker)", () => {
  const lastNews = Date.parse("2026-11-08T12:13:23.017Z");
  const prepared = (overrides: Partial<Execution> = {}) =>
    exec({ status: "prepared", sessionId: null, updatedAt: new Date(lastNews).toISOString(), ...overrides });

  it("should resume a run still preparing, without session, after the stall delay", () => {
    expect(isPreparationStalled(prepared(), lastNews + PREPARE_STALL_MS + 1)).toBe(true);
  });

  it("should leave a preparation that is still within the delay alone", () => {
    expect(isPreparationStalled(prepared(), lastNews + PREPARE_STALL_MS - 1)).toBe(false);
  });

  it("should never resume once an H session exists", () => {
    expect(isPreparationStalled(prepared({ sessionId: "s-1" }), lastNews + 10 * PREPARE_STALL_MS)).toBe(false);
  });

  it("should never resume a run that left the preparing state", () => {
    for (const status of ["running", "stopped_by_user", "failed"] as const) {
      expect(isPreparationStalled(prepared({ status }), lastNews + 10 * PREPARE_STALL_MS)).toBe(false);
    }
  });

  it("should ignore free-trial replays", () => {
    const replay = { startedMs: 0, goMs: null, shown: 0 };
    expect(isPreparationStalled(prepared({ replay } as Partial<Execution>), lastNews + 10 * PREPARE_STALL_MS)).toBe(false);
  });
});
