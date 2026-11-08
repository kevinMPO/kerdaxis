// ---------------------------------------------------------------------------
// Repli du benchmark sur la page tarifs officielle (agent H web-scraper-flash).
// Le réseau est simulé. On vérifie que seuls des prix lus sur le domaine du
// marchand, en euros, sont gardés, que l'annualisation inverse est faite par le
// code, que la session est toujours fermée, et que le repli ne tourne que s'il
// manque un palier chiffré.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { benchmark } from "@/lib/benchmark";
import { isOfficialUrl, pickStartUrl, scrapeOfficialPricing, SCRAPER_AGENT, toMonthlyEuro } from "@/lib/benchmark-scraper";

const HAI_BASE = "https://agp.eu.hcompany.ai/api/v2";
const SESSIONS_URL = `${HAI_BASE}/sessions`;
const SESSION_ID = "session-123";
const SESSION_URL = `${SESSIONS_URL}/${SESSION_ID}`;
const HOLO_URL = "https://api.hcompany.ai/v1/chat/completions";
const LINKUP_URL = "https://api.linkup.so/v1/search";
const ENV_KEYS = ["HAI_API_KEY", "LINKUP_API_KEY", "HAI_MODELS_BASE_URL", "HAI_LLM_MODEL", "HAI_BASE_URL"] as const;

const NOTION_PAGE = "https://www.notion.com/pricing";
const NOTION_ANSWER = {
  pageUrl: NOTION_PAGE,
  plans: [
    { name: "Free", price: 0, currency: "EUR", billing: "monthly", perSeat: true },
    { name: "Plus", price: 12, currency: "EUR", billing: "monthly", perSeat: true },
    { name: "Business", price: 288, currency: "EUR", billing: "annual_total", perSeat: true },
    { name: "Enterprise", price: null, currency: null, billing: null, perSeat: true },
  ],
};

interface CapturedCall {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function idleWithAnswer(answer: unknown): Response {
  return json({ status: "idle", error: null, error_code: null, outcome: null, answer, new_events: [], first_index: 0, pending_tool_calls: [] });
}

let calls: CapturedCall[];
let changesReply: () => Response;
let holoReply: () => Response;
const envInitial: Record<string, string | undefined> = {};
let fetchInitial: typeof fetch;

beforeEach(() => {
  calls = [];
  changesReply = () => idleWithAnswer(NOTION_ANSWER);
  holoReply = () => json({ choices: [{ message: { role: "assistant", content: JSON.stringify({ ownPlans: [], alternatives: [] }) } }] });
  for (const key of ENV_KEYS) {
    envInitial[key] = process.env[key];
    delete process.env[key];
  }
  fetchInitial = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    const method = init?.method ?? "GET";
    calls.push({ method, url: target, body: JSON.parse(String(init?.body ?? "{}")) });
    if (target === SESSIONS_URL && method === "POST") return json({ id: SESSION_ID, status: { status: "running" } });
    if (target.startsWith(`${SESSION_URL}/changes`)) return changesReply();
    if (target === SESSION_URL && method === "DELETE") return new Response(null, { status: 204 });
    if (target === SESSION_URL) return json({ id: SESSION_ID, status: { status: "idle" }, latest_answer: null });
    if (target === LINKUP_URL) {
      return json({ answer: "Notion pricing overview.", sources: [{ name: "Notion pricing", url: NOTION_PAGE, snippet: "Plans 2026" }] });
    }
    if (target === HOLO_URL) return holoReply();
    throw new Error(`unexpected fetch to ${method} ${target}`);
  }) as unknown as typeof fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = fetchInitial;
  for (const key of ENV_KEYS) {
    if (envInitial[key] === undefined) delete process.env[key];
    else process.env[key] = envInitial[key];
  }
  vi.restoreAllMocks();
});

const sessionCreations = (): CapturedCall[] => calls.filter((c) => c.url === SESSIONS_URL && c.method === "POST");
const sessionCancels = (): CapturedCall[] => calls.filter((c) => c.url === SESSION_URL && c.method === "DELETE");

describe("toMonthlyEuro", () => {
  it("should keep a monthly euro price as displayed", () => {
    expect(toMonthlyEuro({ name: "Plus", price: 12, currency: "EUR", billing: "monthly", perSeat: true })).toBe(12);
  });

  it("should keep a per-month price billed yearly as displayed", () => {
    expect(toMonthlyEuro({ name: "Plus", price: 10, currency: "€", billing: "annual_per_month", perSeat: true })).toBe(10);
  });

  it("should divide a yearly total by 12 in code, never in the model", () => {
    expect(toMonthlyEuro({ name: "Pro", price: 100, currency: "eur", billing: "annual_total", perSeat: false })).toBe(8.33);
  });

  it("should drop a non-euro price instead of converting it", () => {
    expect(toMonthlyEuro({ name: "Plus", price: 12, currency: "USD", billing: "monthly", perSeat: true })).toBeNull();
  });

  it("should not guess a period when the billing is unknown", () => {
    expect(toMonthlyEuro({ name: "Plus", price: 12, currency: "EUR", billing: null, perSeat: true })).toBeNull();
  });

  it("should keep an unpriced plan unpriced", () => {
    expect(toMonthlyEuro({ name: "Enterprise", price: null, currency: "EUR", billing: "monthly", perSeat: true })).toBeNull();
  });
});

describe("isOfficialUrl", () => {
  it("should accept the merchant's own domain and subdomains", () => {
    expect(isOfficialUrl("https://www.notion.com/pricing", "Notion Labs")).toBe(true);
    expect(isOfficialUrl("https://workspace.google.com/pricing", "Google Workspace")).toBe(true);
  });

  it("should reject review sites, plain http and malformed URLs", () => {
    expect(isOfficialUrl("https://www.g2.com/products/notion/pricing", "Notion Labs")).toBe(false);
    expect(isOfficialUrl("http://www.notion.com/pricing", "Notion Labs")).toBe(false);
    expect(isOfficialUrl("not a url", "Notion Labs")).toBe(false);
  });

  it("should reject everything when the brand is too short to match safely", () => {
    expect(isOfficialUrl("https://x.com/pricing", "X")).toBe(false);
  });
});

describe("pickStartUrl", () => {
  it("should prefer the official pricing page among known sources", () => {
    const start = pickStartUrl({
      merchant: "Notion Labs",
      category: "IA & Dev",
      knownSourceUrls: ["https://www.g2.com/notion", "https://www.notion.com/blog", NOTION_PAGE],
    });
    expect(start).toBe(NOTION_PAGE);
  });

  it("should fall back to a web search on the merchant name when no source is official", () => {
    const start = pickStartUrl({ merchant: "Notion Labs", category: "IA & Dev", knownSourceUrls: ["https://www.g2.com/notion"] });
    expect(start).toBe("https://www.bing.com/search?q=Notion%20Labs%20pricing");
  });
});

describe("scrapeOfficialPricing", () => {
  const target = { merchant: "Notion Labs", category: "IA & Dev", knownSourceUrls: [NOTION_PAGE] };

  it("should not call anyone when HAI_API_KEY is missing", async () => {
    expect(await scrapeOfficialPricing(target)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("should run the pre-built scraper agent on the official page and return monthly euro prices", async () => {
    process.env.HAI_API_KEY = "hai-test-key";

    const result = await scrapeOfficialPricing(target);

    const [creation] = sessionCreations();
    expect(creation.body.agent).toBe(SCRAPER_AGENT);
    expect(creation.body.overrides).toMatchObject({ "agent.environments[kind=web].start_url": NOTION_PAGE });
    expect(result).toEqual({
      pageUrl: NOTION_PAGE,
      plans: [
        { name: "Free", monthlyPrice: 0, perSeat: true },
        { name: "Plus", monthlyPrice: 12, perSeat: true },
        { name: "Business", monthlyPrice: 24, perSeat: true },
        { name: "Enterprise", monthlyPrice: null, perSeat: true },
      ],
    });
    expect(sessionCancels()).toHaveLength(1);
  });

  it("should discard prices read outside the merchant's domain and still close the session", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    changesReply = () => idleWithAnswer({ ...NOTION_ANSWER, pageUrl: "https://www.capterra.com/notion-pricing" });

    expect(await scrapeOfficialPricing(target)).toBeNull();
    expect(sessionCancels()).toHaveLength(1);
  });

  it("should return null and close the session when the agent fails", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    changesReply = () => json({ status: "failed", error: "boom", error_code: "agent_error", answer: null, new_events: [], first_index: 0 });

    expect(await scrapeOfficialPricing(target)).toBeNull();
    expect(sessionCancels()).toHaveLength(1);
  });

  it("should drop a malformed plan without losing the valid ones", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    changesReply = () =>
      idleWithAnswer({
        pageUrl: NOTION_PAGE,
        plans: [{ name: "Plus", price: 12, currency: "EUR", billing: "monthly", perSeat: true }, { name: "Team", price: "douze" }],
      });

    expect((await scrapeOfficialPricing(target))?.plans).toEqual([{ name: "Plus", monthlyPrice: 12, perSeat: true }]);
  });

  it("should reject an answer without a valid page URL", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    changesReply = () => idleWithAnswer({ pageUrl: "unknown", plans: NOTION_ANSWER.plans });

    expect(await scrapeOfficialPricing(target)).toBeNull();
  });
});

describe("benchmark with the scraper fallback", () => {
  beforeEach(() => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
  });

  it("should fill the supplier's own plans from its official page when extraction found no priced plan", async () => {
    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(sessionCreations()).toHaveLength(1);
    expect(result.provider).toBe("linkup+scraper");
    expect(result.ownPlans.find((plan) => plan.name === "Plus")).toEqual({
      name: "Plus",
      monthlyPrice: 12,
      perSeat: true,
      unit: "/utilisateur/mois",
      sourceUrl: NOTION_PAGE,
      sourceDate: result.checkedAt,
    });
  });

  it("should not run the scraper when extraction already found a priced own plan", async () => {
    holoReply = () =>
      json({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                ownPlans: [{ name: "Plus", monthlyPrice: 12, unit: "/utilisateur/mois", perSeat: true, sourceIndex: 0 }],
                alternatives: [],
              }),
            },
          },
        ],
      });

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(sessionCreations()).toHaveLength(0);
    expect(result.provider).toBe("linkup");
  });

  it("should keep the Linkup result unchanged when the scraper finds nothing usable", async () => {
    changesReply = () => idleWithAnswer({ pageUrl: NOTION_PAGE, plans: [{ name: "Plus", price: 12, currency: "USD", billing: "monthly", perSeat: true }] });

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(result.provider).toBe("linkup");
    expect(result.ownPlans).toEqual([]);
    expect(result.verified).toBe(true);
  });
});
