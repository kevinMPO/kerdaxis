import { describe, expect, it } from "vitest";
import { advanceReplay, decideReplay, startReplay } from "../replay";
import type { Approval } from "../policy";

const approval = {
  id: "00000000-0000-4000-8000-000000000001",
  actionHash: "abcdef0123456789",
  channel: "ui",
  params: { vendor: "Nuvio CRM", plan: "Growth", account: "ACME", monthlyCents: 12900 },
} as unknown as Approval;

describe("rediffusion de l'essai gratuit", () => {
  it("s'arrête devant le bouton final et n'avance pas sans feu vert", () => {
    const e = startReplay({ ...approval });
    const t0 = e.replay!.startedMs;
    advanceReplay(e, t0 + 34_000);
    expect(e.status).toBe("awaiting_final_approval");
    advanceReplay(e, t0 + 300_000);
    expect(e.status).toBe("awaiting_final_approval");
    expect(e.confirmationNumber).toBeNull();
  });
  it("confirme NUV-RW3L2Y seulement après le feu vert", () => {
    const e = startReplay({ ...approval });
    advanceReplay(e, e.replay!.startedMs + 34_000);
    decideReplay(e, "approve");
    advanceReplay(e, e.replay!.goMs! + 12_000);
    expect(e.status).toBe("supplier_confirmed");
    expect(e.confirmationNumber).toBe("NUV-RW3L2Y");
    expect(e.sessionId).toBeNull();
  });
  it("le refus arrête tout", () => {
    const e = startReplay({ ...approval });
    advanceReplay(e, e.replay!.startedMs + 34_000);
    decideReplay(e, "refuse");
    expect(e.status).toBe("stopped_by_user");
  });
});
