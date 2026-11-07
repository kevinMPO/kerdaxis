import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideFinal } from "../runner";
import type { Execution } from "../store";

function waitingExec(paused: boolean): Execution {
  return {
    id: "e1",
    status: "awaiting_final_approval",
    sessionId: "s1",
    paused,
    pendingToolCall: null,
    finalPage: { summary: "Cancel subscription", button_label: "Cancel subscription" },
    finalDecision: null,
    answerCount: 0,
    answerCountAtDecision: 0,
    events: [],
    updatedAt: new Date().toISOString(),
  } as unknown as Execution;
}

describe("decideFinal (human final go)", () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    process.env.HAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
        return new Response(null, { status: 202 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should send the APPROVED message, then resume a session Kerdaxis paused", async () => {
    const exec = await decideFinal(waitingExec(true), "approve");
    expect(calls).toEqual(["POST /api/v2/sessions/s1/messages", "POST /api/v2/sessions/s1/resume"]);
    expect(exec.status).toBe("running");
    expect(exec.paused).toBe(false);
  });

  it("should not resume a session that was only idle", async () => {
    await decideFinal(waitingExec(false), "approve");
    expect(calls).toEqual(["POST /api/v2/sessions/s1/messages"]);
  });
});
