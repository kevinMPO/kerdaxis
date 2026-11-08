import { describe, expect, it } from "vitest";
import { checkResearchAgainstRun, quotedLabels, type RunEvent } from "../compare";

const STRIPE_PLAYBOOK = {
  steps: [
    "Open the merchant-provided link to the Stripe Customer Portal.",
    'Select the subscription you want to cancel.',
    'Click "Cancel plan".',
  ],
  finalButtonLabel: "Cancel subscription",
  finalLabelSource: "catalog" as const,
};

const agent = (message: string): RunEvent => ({ kind: "agent", message });
const page = (message: string): RunEvent => ({ kind: "observation", message });
const system = (message: string): RunEvent => ({ kind: "system", message });

describe("quotedLabels", () => {
  it("should read labels in straight, curly and French quotes", () => {
    expect(quotedLabels('Click "Cancel plan", then “Confirm” or « Résilier mon abonnement »')).toEqual([
      "Cancel plan",
      "Confirm",
      "Résilier mon abonnement",
    ]);
  });

  it("should ignore apostrophes and overlong quoted passages", () => {
    expect(quotedLabels("Open the customer's portal")).toEqual([]);
    expect(quotedLabels(`Read "${"x".repeat(80)}"`)).toEqual([]);
  });
});

describe("checkResearchAgainstRun", () => {
  it("should return null while the agent has not acted yet", () => {
    expect(checkResearchAgainstRun(STRIPE_PLAYBOOK, [system("Linkup: 3 steps in the official docs.")], null)).toBeNull();
  });

  it("should mark a documented label as seen when the agent names it", () => {
    const check = checkResearchAgainstRun(STRIPE_PLAYBOOK, [agent("I click 'cancel plan' on the subscription card.")], null);
    expect(check?.steps.map((step) => step.check)).toEqual(["no_label", "no_label", "seen"]);
    expect(check?.labelledSteps).toBe(1);
    expect(check?.seenSteps).toBe(1);
  });

  it("should mark a documented label as not seen when the screen used another one", () => {
    const check = checkResearchAgainstRun(STRIPE_PLAYBOOK, [agent('Clicked "Cancel subscription".')], null);
    expect(check?.steps[2].check).toBe("not_seen");
    expect(check?.seenSteps).toBe(0);
    expect(check?.finalLabel).toEqual({ label: "Cancel subscription", source: "catalog", check: "seen" });
  });

  it("should never count Kerdaxis system messages, which quote the docs themselves", () => {
    const check = checkResearchAgainstRun(
      STRIPE_PLAYBOOK,
      [system('Kerdaxis paused the agent before "Cancel plan".'), page("Page: Subscriptions (/p/session/abc)")],
      null,
    );
    expect(check?.steps[2].check).toBe("not_seen");
  });

  it("should read the agent's structured answer and keep its notes", () => {
    const check = checkResearchAgainstRun(
      STRIPE_PLAYBOOK,
      [page("Page: Cancel (/p/session/abc/subscriptions/sub_1/cancel)")],
      { phase: "cancelled", button_label: "Cancel plan", notes: "The docs said Cancel plan; the portal matched." },
    );
    expect(check?.steps[2].check).toBe("seen");
    expect(check?.agentNotes).toBe("The docs said Cancel plan; the portal matched.");
  });

  it("should match labels regardless of accents, case and spacing", () => {
    const check = checkResearchAgainstRun(
      { steps: ['Cliquez sur « Résilier  l’abonnement »'], finalButtonLabel: "" },
      [agent("J'ai cliqué sur RESILIER L'ABONNEMENT")],
      null,
    );
    expect(check?.steps[0].check).toBe("seen");
    expect(check?.finalLabel.check).toBe("no_label");
  });
});
