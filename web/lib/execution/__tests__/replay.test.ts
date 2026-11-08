import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { advanceReplay, decideReplay, startReplay } from "../replay";
import { RECORDINGS } from "../replay-recordings";
import type { Approval } from "../policy";

const approval = {
  id: "00000000-0000-4000-8000-000000000001",
  actionHash: "abcdef0123456789",
  channel: "ui",
  params: { supplierId: "nuvio", vendor: "Nuvio CRM", plan: "Growth", account: "ACME", monthlyCents: 12900 },
} as unknown as Approval;

const lumenApproval = {
  ...approval,
  params: { supplierId: "lumen", vendor: "Lumen Analytics", plan: "Lumen Analytics Pro", account: "Acme Conseil SAS", monthlyCents: 3900 },
} as unknown as Approval;

const PUBLIC_DIR = fileURLToPath(new URL("../../../public/", import.meta.url));

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

describe("Lumen replay on Stripe's customer portal", () => {
  it("should pause on Stripe's cancellation page before cancelling anything", () => {
    const e = startReplay({ ...lumenApproval });
    advanceReplay(e, e.replay!.startedMs + 22_000);
    expect(e.status).toBe("awaiting_final_approval");
    expect(e.finalPage?.button_label).toBe("Cancel subscription");
    expect(e.lastScreenshot).toBe("/replay/lumen/obs-03-124829.png");
    advanceReplay(e, e.replay!.startedMs + 300_000);
    expect(e.supplierState).toBeNull();
  });

  it("should show the Stripe subscription read back only after the final go", () => {
    const e = startReplay({ ...lumenApproval });
    advanceReplay(e, e.replay!.startedMs + 22_000);
    decideReplay(e, "approve");
    advanceReplay(e, e.replay!.goMs! + 29_000);
    expect(e.status).toBe("running");
    advanceReplay(e, e.replay!.goMs! + 31_000);
    expect(e.status).toBe("supplier_confirmed");
    expect(e.confirmationNumber).toBe("sub_1UZVVzAOMU6pNz5C7purhfeP");
    expect(e.supplierState?.status).toBe("cancelled");
    expect(e.costUsd).toBe(0.035);
  });

  it("should refuse to replay a supplier without a recording", () => {
    const unrecorded = { ...approval, params: { ...approval.params, supplierId: "unrecorded" } } as unknown as Approval;
    expect(() => startReplay(unrecorded)).toThrow("aucune_session_enregistree");
  });
});

describe("recorded sessions", () => {
  it.each(Object.values(RECORDINGS))("should ship every $supplierId screenshot in public/replay", (recording) => {
    for (const step of [...recording.before, ...recording.after]) {
      expect(existsSync(`${PUBLIC_DIR}replay/${step.shot}`), step.shot).toBe(true);
    }
  });

  it.each(Object.values(RECORDINGS))("should keep the $supplierId steps in time order, the gate after the last step before it", (recording) => {
    const times = (steps: readonly { t: number }[]) => steps.map((step) => step.t);
    expect(times(recording.before)).toEqual([...times(recording.before)].sort((a, b) => a - b));
    expect(times(recording.after)).toEqual([...times(recording.after)].sort((a, b) => a - b));
    expect(recording.gateAt).toBeGreaterThanOrEqual(recording.before.at(-1)!.t);
    expect(recording.verifyAt).toBeGreaterThanOrEqual(recording.after.at(-1)!.t);
  });
});
