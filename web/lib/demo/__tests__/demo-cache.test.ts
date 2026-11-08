// ---------------------------------------------------------------------------
// Cache D1 du résultat du jour de la démo : partagé entre isolats, écrit
// seulement quand Holo a catégorisé, jamais pour un repli sur les règles.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyzeResult } from "@/lib/types";

const { readDemoResult, writeDemoResult, runAnalysis } = vi.hoisted(() => ({
  readDemoResult: vi.fn(),
  writeDemoResult: vi.fn(),
  runAnalysis: vi.fn(),
}));

vi.mock("@/lib/demo/demo-cache", () => ({ readDemoResult, writeDemoResult }));
vi.mock("@/lib/analysis/pipeline", () => ({ runAnalysis }));

import { __resetDemoCacheForTests, analyzeDemo } from "@/lib/demo/analysis";

const TODAY = new Date("2026-11-08T10:00:00Z");
const DAY = "2026-11-08";

function resultFrom(categorized: "hcompany" | "rules"): AnalyzeResult {
  return { meta: { categorized } } as unknown as AnalyzeResult;
}

beforeEach(() => {
  __resetDemoCacheForTests();
  vi.clearAllMocks();
  readDemoResult.mockResolvedValue(null);
  writeDemoResult.mockResolvedValue(undefined);
});

describe("analyzeDemo with the shared D1 cache", () => {
  it("should serve today's stored result without running the pipeline", async () => {
    const stored = resultFrom("hcompany");
    readDemoResult.mockResolvedValue(stored);

    expect(await analyzeDemo(TODAY)).toBe(stored);
    expect(readDemoResult).toHaveBeenCalledWith(DAY);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("should store a Holo-categorized result for the other isolates", async () => {
    const fresh = resultFrom("hcompany");
    runAnalysis.mockResolvedValue(fresh);

    expect(await analyzeDemo(TODAY)).toBe(fresh);
    expect(writeDemoResult).toHaveBeenCalledWith(DAY, fresh, TODAY.getTime());
  });

  it("should never store a rules fallback, so the next isolate retries Holo", async () => {
    runAnalysis.mockResolvedValue(resultFrom("rules"));

    await analyzeDemo(TODAY);

    expect(writeDemoResult).not.toHaveBeenCalled();
  });

  it("should share one run between concurrent visitors of the same isolate", async () => {
    runAnalysis.mockResolvedValue(resultFrom("hcompany"));

    await Promise.all([analyzeDemo(TODAY), analyzeDemo(TODAY), analyzeDemo(TODAY)]);

    expect(readDemoResult).toHaveBeenCalledTimes(1);
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });
});
