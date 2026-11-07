import { describe, expect, it } from "vitest";
import { applyChanges, matchesPath, withoutQuery } from "../runner";
import { portalStateOf } from "../stripe-portal";
import { getSupplier } from "../suppliers";
import type { Execution } from "../store";
import type { HaiChanges } from "../hcompany";

describe("portalStateOf (Stripe subscription → verifier state)", () => {
  it("should report an active subscription with no proof", () => {
    expect(portalStateOf({ id: "sub_1", status: "active" })).toMatchObject({ status: "active", confirmation_number: null });
  });

  it("should treat an immediate cancellation as proof, with the subscription id as reference", () => {
    const state = portalStateOf({ id: "sub_1", status: "canceled", canceled_at: 1_794_000_000, ended_at: 1_794_000_000 });
    expect(state.status).toBe("cancelled");
    expect(state.confirmation_number).toBe("sub_1");
    expect(state.cancelled_at).toMatch(/^2026-/);
  });

  it("should treat cancel at period end as cancelled", () => {
    expect(portalStateOf({ id: "sub_1", status: "active", cancel_at_period_end: true }).status).toBe("cancelled");
  });

  it("should flag an accepted retention coupon as discounted", () => {
    expect(portalStateOf({ id: "sub_1", status: "active", discounts: ["di_1"] }).status).toBe("discounted");
  });
});

describe("matchesPath (final-page watchdog rules)", () => {
  it("should match exact paths and patterns", () => {
    expect(matchesPath("/cancel/confirm", "/cancel/confirm")).toBe(true);
    expect(matchesPath("/cancel/confirmed", "/cancel/confirm")).toBe(false);
    expect(matchesPath("/p/session/test_abc/subscriptions/sub_123/cancel", /\/subscriptions\/[^/]+\/cancel\/?$/)).toBe(true);
    expect(matchesPath("/p/session/test_abc/subscriptions/sub_123", /\/subscriptions\/[^/]+\/cancel\/?$/)).toBe(false);
    expect(matchesPath("/anything", null)).toBe(false);
  });
});

describe("Stripe portal supplier", () => {
  it("should only exist with a Stripe test key", () => {
    const previous = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "";
    expect(getSupplier("lumen")).toBeNull();
    process.env.STRIPE_SECRET_KEY = "sk_live_not_allowed";
    expect(getSupplier("lumen")).toBeNull();
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const lumen = getSupplier("lumen");
    expect(lumen).toMatchObject({ kind: "stripe_portal", allowedHost: "billing.stripe.com", proof: "billing_api" });
    expect(lumen?.guide.source).toBe("research");
    process.env.STRIPE_SECRET_KEY = previous;
  });

  it("should pause the agent when it reaches the Stripe final confirmation page", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const lumen = getSupplier("lumen");
    if (!lumen) throw new Error("lumen should be configured");
    const now = new Date().toISOString();
    const exec = {
      id: "e1",
      params: { allowedHost: "billing.stripe.com", plan: "Lumen Analytics Pro", vendor: "Lumen Analytics", account: "Acme Conseil SAS" },
      events: [],
      finalDecision: null,
      finalPage: null,
      fromIndex: 0,
      answerCount: 0,
      updatedAt: now,
    } as unknown as Execution;
    const changes: HaiChanges = {
      status: "running",
      error: null,
      error_code: null,
      outcome: null,
      answer: null,
      first_index: 0,
      pending_tool_calls: [],
      new_events: [
        {
          type: "AgentEvent",
          timestamp: now,
          data: { kind: "observation_event", metadata: { url: "https://billing.stripe.com/p/session/subscriptions/sub_123/cancel?secret=test_abc" } },
        },
      ],
    };
    const result = applyChanges(exec, changes, { finalStepPath: lumen.finalStepPath, donePath: lumen.donePath, finalButtonLabel: "Cancel subscription" });
    expect(result.violation).toBeNull();
    expect(result.atFinalStep).toBe(true);
    expect(exec.finalPage?.button_label).toBe("Cancel subscription");
    expect(JSON.stringify(exec.events)).not.toContain("secret=");
  });

  it("should never put the portal session token in the log sent to the browser", () => {
    expect(withoutQuery("https://billing.stripe.com/p/session/subscriptions/sub_1/cancel?secret=test_abc")).toBe(
      "https://billing.stripe.com/p/session/subscriptions/sub_1/cancel",
    );
    expect(withoutQuery(undefined)).toBeUndefined();
    expect(withoutQuery("not a url")).toBeUndefined();
  });
});
