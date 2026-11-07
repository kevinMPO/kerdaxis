import { describe, expect, it } from "vitest";
import { finalLabelOf, guideFromResearch } from "../index";
import { parseWrittenPath } from "../linkup";
import { articleWithMarkers, looksLikeScreenshotUrl, mergeReadings } from "../screenshots";
import { ResearchError, type CancelResearch } from "../types";
import { canonicalVideoUrl, parseNumberedSteps } from "../video";

describe("parseWrittenPath (Linkup → parcours)", () => {
  it("should keep the steps, the official doc URL and the source URLs", () => {
    const path = parseWrittenPath(
      {
        data: {
          steps: ['  Open "Billing & Usage".  ', 'Click "Cancel Plan".'],
          final_confirm_label: '"Cancel Plan"',
          retention_traps: ["Switch to annual"],
          official_doc_url: "https://help.example.com/cancel",
        },
        sources: [{ url: "https://help.example.com/cancel" }, { url: "not a url" }],
      },
      "deep",
    );
    expect(path.steps).toEqual(['Open "Billing & Usage".', 'Click "Cancel Plan".']);
    expect(path.finalConfirmLabel).toBe("Cancel Plan");
    expect(path.officialDocUrl).toBe("https://help.example.com/cancel");
    expect(path.sourceUrls).toEqual(["https://help.example.com/cancel"]);
    expect(path.depthUsed).toBe("deep");
  });

  it("should drop explanations Linkup writes into URL and label fields", () => {
    const path = parseWrittenPath(
      {
        data: {
          steps: ["Open billing."],
          final_confirm_label: "The documentation does not specify the exact label of the final button",
          official_doc_url: "not specified in the docs",
        },
      },
      "standard",
    );
    expect(path.officialDocUrl).toBe("");
    expect(path.finalConfirmLabel).toBe("");
  });

  it("should reject an answer without any step", () => {
    expect(() => parseWrittenPath({ data: { steps: ["  "], official_doc_url: "https://x.example" } }, "deep")).toThrow(ResearchError);
  });
});

describe("screenshot reading", () => {
  it("should skip logos, icons and vector images", () => {
    expect(looksLikeScreenshotUrl("https://cdn.example.com/i/o/123/image.png?expires=1")).toBe(true);
    expect(looksLikeScreenshotUrl("https://static.example.com/supported_browsers/chrome.png")).toBe(false);
    expect(looksLikeScreenshotUrl("https://example.com/brand/logo-dark.png")).toBe(false);
    expect(looksLikeScreenshotUrl("https://example.com/diagram.svg")).toBe(false);
  });

  it("should number kept images and remove dropped ones with their signed URLs", () => {
    const markdown = [
      "Go to Billing.",
      "[![](https://cdn.example.com/a.png?sig=1)](https://cdn.example.com/a.png?sig=1)",
      "Then cancel.",
      "![](https://cdn.example.com/logo.png)",
      "![alt](https://cdn.example.com/b.png)",
    ].join("\n");
    const article = articleWithMarkers(markdown, ["https://cdn.example.com/a.png?sig=1", "https://cdn.example.com/b.png"]);
    expect(article).toContain("[Screenshot 1]");
    expect(article).toContain("[Screenshot 2]");
    expect(article).not.toContain("cdn.example.com");
  });

  const answer = (relevant: number[], steps: string[], label = "") => ({
    relevant_screenshots: relevant,
    steps,
    final_confirm_label: label,
    retention_traps: [],
  });

  it("should merge batches in page order and ignore batches that show something else", () => {
    const reading = mergeReadings("https://help.example.com", 4, [0, 2], [
      { status: "fulfilled", value: answer([1], ['Click "Outbound".', 'Click "Cancel Plan".'], "Cancel Plan") },
      { status: "fulfilled", value: answer([], ['Click "Cancel all" (DFY accounts).'], "Cancel") },
    ]);
    expect(reading.relevantScreenshots).toEqual([1]);
    expect(reading.steps).toEqual(['Click "Outbound".', 'Click "Cancel Plan".']);
    expect(reading.finalConfirmLabel).toBe("Cancel Plan");
  });

  it("should not trust screenshot numbers outside the batch the reader was given", () => {
    expect(() =>
      mergeReadings("https://help.example.com", 4, [0, 2], [
        { status: "fulfilled", value: answer([3], ["step"]) },
        { status: "rejected", reason: new Error("H down") },
      ]),
    ).toThrow(/ne montrent pas/);
  });

  it("should fail when every reader session failed", () => {
    expect(() =>
      mergeReadings("https://help.example.com", 2, [0], [{ status: "rejected", reason: new Error("internal error") }]),
    ).toThrow(/tous les lots/);
  });
});

describe("video tutorial parsing", () => {
  it("should rebuild the plain watch URL that Gladia accepts", () => {
    expect(canonicalVideoUrl("https://www.youtube.com/watch?ntb=1&v=z2pKQXR-J2Q")).toBe("https://www.youtube.com/watch?v=z2pKQXR-J2Q");
    expect(canonicalVideoUrl("https://youtu.be/z2pKQXR-J2Q")).toBe("https://www.youtube.com/watch?v=z2pKQXR-J2Q");
  });

  it("should strip numbering and bullets from the steps Gladia heard", () => {
    expect(parseNumberedSteps('1. Click "Billing"\n\n2) Scroll down\n- Click "Cancel plan"')).toEqual([
      'Click "Billing"',
      "Scroll down",
      'Click "Cancel plan"',
    ]);
  });
});

describe("guide given to the H agent", () => {
  const research: CancelResearch = {
    merchant: "Instantly.ai",
    researchedAt: "2026-11-07T20:00:00.000Z",
    written: {
      steps: ['Open "Billing & Usage".', 'Click "Cancel Plan".'],
      finalConfirmLabel: "",
      retentionTraps: [],
      officialDocUrl: "https://help.instantly.ai/cancel",
      sourceUrls: [],
      depthUsed: "deep",
    },
    screenshots: {
      docUrl: "https://help.instantly.ai/cancel",
      screenshotsSent: 6,
      relevantScreenshots: [1],
      steps: ['Click "Outbound" tab.', 'Click "Cancel Plan".'],
      finalConfirmLabel: "Cancel Plan",
      retentionTraps: ["Switch to annual"],
    },
    screenshotsError: null,
    video: null,
    videoError: "vidéo non demandée pour ce fournisseur",
  };

  it("should take the final label from the screenshots when the written docs have none", () => {
    expect(finalLabelOf(research, "Cancel subscription")).toBe("Cancel Plan");
    expect(finalLabelOf({ ...research, screenshots: null }, "Cancel subscription")).toBe("Cancel subscription");
  });

  it("should give the documented path, the screenshot labels, the traps and the screen-is-truth rule", () => {
    const guide = guideFromResearch(research);
    expect(guide).toContain("source: https://help.instantly.ai/cancel");
    expect(guide).toContain('  2. Click "Cancel Plan".');
    expect(guide).toContain("read from the screenshots");
    expect(guide).toContain("Switch to annual");
    expect(guide).toContain("the screen is the truth");
    expect(guide).not.toContain("video tutorial");
  });
});
