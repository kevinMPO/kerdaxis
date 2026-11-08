import { describe, expect, it } from "vitest";
import { playbookFromResearch } from "../runner";
import { publicView, type Execution } from "../store";
import type { CancelResearch } from "../research";

const RESEARCH: CancelResearch = {
  merchant: "Stripe customer portal",
  researchedAt: "2026-11-07T19:26:30.151Z",
  written: {
    steps: ["Open the portal link.", "Select the subscription.", 'Click "Cancel plan".'],
    finalConfirmLabel: "",
    retentionTraps: [],
    officialDocUrl: "https://docs.stripe.com/customer-management/cancellation-page",
    sourceUrls: Array.from({ length: 10 }, (_, index) => `https://docs.stripe.com/page-${index}`),
    depthUsed: "deep",
  },
  screenshots: null,
  screenshotsError: "no images",
  video: null,
  videoError: "not requested",
};

function exec(events: Execution["events"]): Execution {
  const now = new Date().toISOString();
  return {
    id: "e1",
    approvalId: "a1",
    actionHash: "h",
    params: {
      orgId: "demo-acme",
      supplierId: "lumen",
      vendor: "Lumen Analytics",
      account: "Acme Conseil SAS",
      action: "cancel",
      plan: "Lumen Analytics Pro",
      monthlyCents: 3900,
      currency: "EUR",
      allowedHost: "billing.stripe.com",
    },
    status: "running",
    sessionId: "s1",
    agentViewUrl: null,
    liveViewUrl: null,
    fromIndex: 0,
    pendingToolCall: null,
    finalPage: null,
    paused: false,
    finalDecision: null,
    answer: null,
    answerCount: 0,
    answerCountAtDecision: 0,
    confirmationNumber: null,
    supplierState: null,
    lastScreenshot: null,
    steps: 0,
    costUsd: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    events,
    playbook: playbookFromResearch(RESEARCH, "Cancel subscription"),
  };
}

describe("playbookFromResearch", () => {
  it("should carry the research date, the first sources and where the final label came from", () => {
    const playbook = playbookFromResearch(RESEARCH, "Cancel subscription");
    expect(playbook.researchedAt).toBe("2026-11-07T19:26:30.151Z");
    expect(playbook.sourceUrls).toHaveLength(5);
    expect(playbook.finalLabelSource).toBe("catalog");
  });

  it("should credit the docs when Linkup found the final label", () => {
    const research = { ...RESEARCH, written: { ...RESEARCH.written, finalConfirmLabel: "Cancel plan" } };
    expect(playbookFromResearch(research, "Cancel plan").finalLabelSource).toBe("docs");
  });
});

describe("publicView research check", () => {
  it("should check the docs against the whole log, not only the 40 events sent to the browser", () => {
    const early = { at: "2026-11-08T10:00:00.000Z", kind: "agent" as const, message: 'Clicked "Cancel plan".' };
    const filler = Array.from({ length: 50 }, (_, index) => ({
      at: "2026-11-08T10:01:00.000Z",
      kind: "observation" as const,
      message: `Page: step ${index}`,
    }));
    const view = publicView(exec([early, ...filler]));
    expect(view.events).toHaveLength(40);
    expect(view.researchCheck?.steps[2].check).toBe("seen");
  });

  it("should skip the check when the agent followed the generic fallback", () => {
    const run = exec([{ at: "2026-11-08T10:00:00.000Z", kind: "agent", message: "Clicked." }]);
    run.playbook = { ...run.playbook!, fallbackReason: "Linkup 503" };
    expect(publicView(run).researchCheck).toBeNull();
  });
});
