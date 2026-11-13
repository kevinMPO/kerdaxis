import { describe, expect, it } from "vitest";
import { analyzeDemo } from "@/lib/demo/analysis";
import { leverName, leverProposal } from "@/lib/lever-text";
import { poleLabel } from "@/lib/i18n";
import type { ExecutionView } from "../use-execution";
import type { RunRef } from "../use-dashboard";
import { foundMonthly, ledgerValues } from "../ledger";

const NOW = new Date("2026-11-13T12:00:00Z");
const NUVIO_RUN: RunRef = { id: "run-1", supplierId: "nuvio", vendor: "Nuvio CRM", startedAt: NOW.toISOString() };
const CONFIRMED_VIEW = { status: "supplier_confirmed", monthlyCents: 12900, finalDecision: { decision: "approve" } } as ExecutionView;

describe("ledgerValues on the public demo", () => {
  it("should never show a potential smaller than an approved or confirmed saving", async () => {
    const { levers } = await analyzeDemo(NOW);
    const values = ledgerValues(levers, [NUVIO_RUN], { [NUVIO_RUN.id]: CONFIRMED_VIEW });

    expect(values.potential, "potential must cover the approved Nuvio cancellation").toBeGreaterThanOrEqual(values.approved);
    expect(values.potential).toBeGreaterThanOrEqual(values.confirmed);
  });

  it("should count unticked levers in the potential, since ticking is only a simulation", async () => {
    const { levers } = await analyzeDemo(NOW);
    const allUnticked = levers.map((lever) => ({ ...lever, active: false }));

    expect(ledgerValues(allUnticked, [], {}).potential).toBe(foundMonthly(levers) * 12);
    expect(foundMonthly(levers)).toBeGreaterThan(0);
  });
});

describe("demo screen text in English", () => {
  it("should name the demo suppliers like the run view does, with an English proposal", async () => {
    const { levers } = await analyzeDemo(NOW);
    const nuvio = levers.find((lever) => lever.id === "nuvio");
    const lumen = levers.find((lever) => lever.id === "lumen");

    expect(nuvio && leverName(nuvio, "en")).toBe("Nuvio CRM");
    expect(lumen && leverName(lumen, "en")).toBe("Lumen Analytics");
    expect(nuvio && leverProposal(nuvio, "en")).toBe("cancel · CRM duplicates HubSpot");
    expect(nuvio && leverProposal(nuvio, "fr")).toBe("résilier · CRM en doublon avec HubSpot");
  });

  it("should translate pole labels outside French and keep the French key in French", () => {
    expect(poleLabel("IA & Dev", "en")).toBe("AI & Dev");
    expect(poleLabel("Bureau / Telco / Banque", "en")).toBe("Office / Telco / Bank");
    expect(poleLabel("IA & Dev", "fr")).toBe("IA & Dev");
    expect(poleLabel("Unknown pole", "en")).toBe("Unknown pole");
  });
});
