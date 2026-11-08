import { describe, expect, it } from "vitest";

import { inferCurrentPlan, priceLever, type MarketAlternative } from "@/lib/engine/pricing";
import type { SourcedOffer } from "@/lib/types";

function offer(name: string, monthlyPrice: number, perSeat: boolean): SourcedOffer {
  return { name, monthlyPrice, perSeat, sourceUrl: `https://${name.toLowerCase()}.example/pricing`, sourceDate: "2026", checkedAt: "2026-11-08" };
}

function alt(name: string, monthlyPrice: number, perSeat: boolean, comparable = true): MarketAlternative {
  return { ...offer(name, monthlyPrice, perSeat), comparable };
}

const HUBSPOT_PLANS = [offer("Starter", 20, true), offer("Pro", 90, true)];

describe("inferCurrentPlan", () => {
  it("should deduce 3 seats when 60 €/month is paid on a 20 €/seat plan", () => {
    expect(inferCurrentPlan(60, HUBSPOT_PLANS)).toEqual({ plan: HUBSPOT_PLANS[0], seats: 3 });
  });

  it("should accept a small gap from VAT or rounding", () => {
    expect(inferCurrentPlan(61.5, HUBSPOT_PLANS)?.seats).toBe(3);
  });

  it("should return null when no plan matches the amount paid", () => {
    expect(inferCurrentPlan(47, HUBSPOT_PLANS)).toBeNull();
  });

  it("should match a flat plan with no seat count", () => {
    expect(inferCurrentPlan(65, [offer("Forfait", 65, false)])).toEqual({ plan: offer("Forfait", 65, false), seats: null });
  });
});

describe("priceLever", () => {
  it("should compute a switch saving from the cheapest comparable sourced price", () => {
    const result = priceLever({
      action: "switch",
      monthly: 60,
      ownPlans: HUBSPOT_PLANS,
      alternatives: [alt("Pipedrive", 14, true), alt("Folk", 18, true), alt("Notion", 8, true, false)],
    });
    expect(result).toEqual({ status: "sourced", saving: 18, evidence: { offer: offer("Pipedrive", 14, true), seats: 3 } });
  });

  it("should use a flat competitor price without needing the seat count", () => {
    const result = priceLever({ action: "switch", monthly: 30, ownPlans: [], alternatives: [alt("Cursor", 20, false)] });
    expect(result).toMatchObject({ status: "sourced", saving: 10, evidence: { seats: null } });
  });

  it("should refuse a per-seat comparison when the seat count is unknown", () => {
    const result = priceLever({ action: "switch", monthly: 47, ownPlans: HUBSPOT_PLANS, alternatives: [alt("Pipedrive", 14, true)] });
    expect(result).toEqual({ status: "unverified", reason: "no_seats" });
  });

  it("should never report a saving when the alternative costs more", () => {
    const result = priceLever({ action: "switch", monthly: 10, ownPlans: [], alternatives: [alt("n8n cloud", 24, false)] });
    expect(result).toEqual({ status: "unverified", reason: "not_cheaper" });
  });

  it("should never treat a competitor's free tier as an equivalent offer", () => {
    const result = priceLever({ action: "switch", monthly: 25, ownPlans: [], alternatives: [alt("Windsurf", 0, false), alt("Cursor", 20, false)] });
    expect(result).toMatchObject({ status: "sourced", saving: 5, evidence: { offer: { name: "Cursor" } } });
  });

  it("should ignore alternatives the classifier marked as not comparable", () => {
    const result = priceLever({ action: "switch", monthly: 30, ownPlans: [], alternatives: [alt("Notepad", 0, false, false)] });
    expect(result).toEqual({ status: "unverified", reason: "no_price" });
  });

  it("should step down one plan for a downgrade, keeping the seat count", () => {
    const plans = [offer("Free", 0, true), offer("Creator", 24, true), offer("Team", 69, true)];
    const result = priceLever({ action: "downgrade", monthly: 69, ownPlans: plans, alternatives: [] });
    expect(result).toEqual({ status: "sourced", saving: 45, evidence: { offer: plans[1], seats: 1 } });
  });

  it("should never propose a free tier as a downgrade", () => {
    const plans = [offer("Free", 0, false), offer("Creator", 29, false), offer("Pro", 49, false)];
    expect(priceLever({ action: "downgrade", monthly: 29, ownPlans: plans, alternatives: [] })).toEqual({
      status: "unverified",
      reason: "not_cheaper",
    });
  });

  it("should use the cheapest competitor as the anchor of a renegotiation", () => {
    const result = priceLever({
      action: "renegotiate",
      monthly: 65,
      ownPlans: [offer("Smart", 65, false)],
      alternatives: [alt("Aircall", 40, false), alt("Onoff", 30, false)],
    });
    expect(result).toMatchObject({ status: "sourced", saving: 35, evidence: { offer: { name: "Onoff" } } });
  });

  it("should not price actions whose saving is read on the statement", () => {
    expect(priceLever({ action: "cancel", monthly: 40, ownPlans: [], alternatives: [alt("X", 1, false)] })).toEqual({
      status: "unverified",
      reason: "no_price",
    });
  });
});
