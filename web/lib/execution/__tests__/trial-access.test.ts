import { describe, expect, it } from "vitest";
import { trialMayAccess } from "../http";
import { REPLAY_SUPPLIER_ID, trialRunsReplay } from "../replay";
import type { Execution } from "../store";

const exec = (extra: Partial<Execution>): Execution => ({ id: "e1", events: [], ...extra }) as unknown as Execution;

describe("essai gratuit : rediffusion pour la démo, vrai agent pour le reste", () => {
  it("should replay only the recorded demo supplier", () => {
    expect(REPLAY_SUPPLIER_ID).toBe("nuvio");
    expect(trialRunsReplay("nuvio")).toBe(true);
  });

  it("should run the real agent for Lumen and any other supplier", () => {
    expect(trialRunsReplay("lumen")).toBe(false);
    expect(trialRunsReplay("unknown")).toBe(false);
  });

  it("should let a trial account follow its replays and its own real runs", () => {
    expect(trialMayAccess(exec({ replay: { startedMs: 0, goMs: null, shown: 0 } }))).toBe(true);
    expect(trialMayAccess(exec({ startedByTrial: true }))).toBe(true);
  });

  it("should deny a trial account access to an operator's real run", () => {
    expect(trialMayAccess(exec({}))).toBe(false);
    expect(trialMayAccess(exec({ startedByTrial: false }))).toBe(false);
  });
});
