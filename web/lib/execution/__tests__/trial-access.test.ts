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

const { DEMO_ORG, trialMayAccess } = await import("../http");
const { actionHash } = await import("../policy");
type ActionParams = import("../policy").ActionParams;
const { REPLAY_SUPPLIER_IDS, trialRunsReplay } = await import("../replay");
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

  it("should replay only the suppliers with a recorded session", () => {
    expect(REPLAY_SUPPLIER_IDS).toEqual(["nuvio", "lumen"]);
    expect(trialRunsReplay("nuvio")).toBe(true);
    expect(trialRunsReplay("lumen")).toBe(true);
    expect(trialRunsReplay("unknown")).toBe(false);
    expect(trialRunsReplay("toString")).toBe(false);
  });

  it("should let a trial account follow a replay but never a real run", () => {
    expect(trialMayAccess(exec({ replay: { startedMs: 0, goMs: null, shown: 0 } }))).toBe(true);
    expect(trialMayAccess(exec({}))).toBe(false);
  });

  it("should replay the recorded Lumen session in the trial without starting the agent", async () => {
    const params = {
      orgId: DEMO_ORG,
      supplierId: "lumen",
      vendor: "Lumen Analytics",
      plan: "Lumen Analytics Pro",
      account: "Acme Conseil SAS",
      monthlyCents: 3900,
    } as unknown as ActionParams;
    getApproval.mockResolvedValue({
      id: APPROVAL_ID,
      actionHash: await actionHash(params),
      channel: "ui",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      usedAt: null,
      params,
    });

    const response = await startRoute(startRequest("trial"));
    const body = (await response.json()) as { replay: boolean; status: string };

    expect(response.status).toBe(200);
    expect(body.replay).toBe(true);
    expect(startExecution).not.toHaveBeenCalled();
    expect(putExecution).toHaveBeenCalledTimes(1);
  });

  it("should refuse a trial start on a supplier without a recording, without consuming the approval or starting the agent", async () => {
    getApproval.mockResolvedValue({ id: APPROVAL_ID, params: { supplierId: "unrecorded" } });

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
