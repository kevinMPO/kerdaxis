import { beforeEach, describe, expect, it, vi } from "vitest";

const startExecution = vi.fn();
const getApproval = vi.fn();
const putApproval = vi.fn();
const putExecution = vi.fn();

vi.mock("@/lib/execution/runner", () => ({ startExecution }));
vi.mock("@/lib/execution/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/execution/store")>();
  return { ...actual, getApproval, putApproval, putExecution };
});

const { trialMayAccess } = await import("../http");
const { REPLAY_SUPPLIER_ID, trialRunsReplay } = await import("../replay");
const { POST: startRoute } = await import("@/app/api/execution/start/route");
type Execution = import("../store").Execution;

const APPROVAL_ID = "00000000-0000-4000-8000-000000000001";
const FORBIDDEN = 403;

const exec = (extra: Partial<Execution>): Execution => ({ id: "e1", events: [], ...extra }) as unknown as Execution;

function startRequest(role: "trial" | null): Request {
  const headers = new Headers({ "content-type": "application/json", host: "app.kerdaxis.com" });
  if (role) headers.set("x-kx-role", role);
  return new Request("https://app.kerdaxis.com/api/execution/start", {
    method: "POST",
    headers,
    body: JSON.stringify({ approvalId: APPROVAL_ID }),
  });
}

describe("free trial: the recorded replay only, never a real H Company agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should replay only the recorded demo supplier", () => {
    expect(REPLAY_SUPPLIER_ID).toBe("nuvio");
    expect(trialRunsReplay("nuvio")).toBe(true);
    expect(trialRunsReplay("lumen")).toBe(false);
    expect(trialRunsReplay("unknown")).toBe(false);
  });

  it("should let a trial account follow a replay but never a real run", () => {
    expect(trialMayAccess(exec({ replay: { startedMs: 0, goMs: null, shown: 0 } }))).toBe(true);
    expect(trialMayAccess(exec({}))).toBe(false);
  });

  it("should refuse a trial start on Lumen without consuming the approval or starting the agent", async () => {
    getApproval.mockResolvedValue({ id: APPROVAL_ID, params: { supplierId: "lumen" } });

    const response = await startRoute(startRequest("trial"));
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(FORBIDDEN);
    expect(body.error).toBe("trial_replay_only");
    expect(body.message).toMatch(/subscribers/);
    expect(startExecution).not.toHaveBeenCalled();
    expect(putApproval).not.toHaveBeenCalled();
    expect(putExecution).not.toHaveBeenCalled();
  });
});
