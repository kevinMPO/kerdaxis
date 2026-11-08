// ---------------------------------------------------------------------------
// La démo publique passe par le pipeline réel : aucun chiffre écrit à la main.
// Servie sans authentification, elle reste aussi strictement anonyme.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeDemo } from "@/lib/demo/analysis";
import { DEMO_WINDOW_DAYS, demoTransactions } from "@/lib/demo/transactions";

const TODAY = new Date("2026-11-08T10:00:00Z");
const ENV_KEYS = ["HAI_API_KEY", "HAI_MODELS_BASE_URL", "HAI_LLM_MODEL", "HAI_CATEGORIZE_MODEL"] as const;
/** Identité réelle du fondateur : interdite dans le code servi publiquement. */
const FORBIDDEN_IDENTITIES = [/mamforma/i];

const envBefore: Record<string, string | undefined> = {};
let fetchBefore: typeof fetch;

beforeEach(() => {
  for (const key of ENV_KEYS) {
    envBefore[key] = process.env[key];
    delete process.env[key];
  }
  fetchBefore = globalThis.fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = fetchBefore;
  for (const key of ENV_KEYS) {
    if (envBefore[key] === undefined) delete process.env[key];
    else process.env[key] = envBefore[key];
  }
  vi.restoreAllMocks();
});

describe("demo anonymity", () => {
  it("should carry no real identity in the served account or the demo modules", async () => {
    const result = await analyzeDemo(TODAY);
    for (const file of ["../transactions.ts", "../analysis.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      for (const identity of FORBIDDEN_IDENTITIES) expect(source, `${file} : ${identity}`).not.toMatch(identity);
    }
    for (const identity of FORBIDDEN_IDENTITIES) expect(result.account.name).not.toMatch(identity);
  });

  it("should announce a demo source so the front badges it", async () => {
    expect((await analyzeDemo(TODAY)).meta?.source).toBe("mock");
  });
});

describe("demo built by the real pipeline", () => {
  it("should date every transaction inside the analysis window", () => {
    const earliest = new Date(TODAY.getTime() - DEMO_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const tx of demoTransactions(TODAY)) expect(tx.date >= earliest && tx.date <= "2026-11-08").toBe(true);
  });

  it("should price the cancellation of the fictional suppliers from the statement", async () => {
    const { levers } = await analyzeDemo(TODAY);
    expect(levers.find((l) => l.id === "nuvio")).toMatchObject({ action: "cancel", saving: 129, basis: "observed" });
    expect(levers.find((l) => l.id === "lumen")).toMatchObject({ action: "cancel", saving: 39, basis: "observed" });
  });

  it("should leave market-dependent levers pending at 0 EUR until the web is checked", async () => {
    const pending = (await analyzeDemo(TODAY)).levers.filter((l) => l.basis === "pending");
    expect(pending.length).toBeGreaterThan(0);
    for (const lever of pending) expect(lever.saving, lever.label).toBe(0);
  });

  it("should surface what the engine detects on the statement", async () => {
    const result = await analyzeDemo(TODAY);
    expect(result.levers.find((l) => l.label === "Figma")?.hausse).toEqual({ pct: 14.3, avantEur: 42, apresEur: 48 });
    expect(result.levers.find((l) => l.motif === "fx")).toBeDefined();
    expect(result.flux.map((f) => f.kind)).toEqual(expect.arrayContaining(["new", "dup"]));
    expect(result.runway.months).toBeLessThan(24);
    expect(result.tvaPerdue?.transactions).toBeGreaterThan(0);
  });

  it("should answer without calling Holo, even with a key configured", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    const network = vi.fn();
    globalThis.fetch = network as unknown as typeof fetch;

    const result = await analyzeDemo(TODAY);

    expect(network).not.toHaveBeenCalled();
    expect(result.meta?.categorized).toBe("rules");
  });
});
