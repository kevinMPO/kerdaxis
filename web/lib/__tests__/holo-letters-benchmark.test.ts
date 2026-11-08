// ---------------------------------------------------------------------------
// Lettres et benchmark sur H Company Holo (Models API). Le réseau est simulé.
// On vérifie que l'app n'appelle plus que H Company comme LLM, que chaque
// repli (sans clé, en échec) garde un résultat utilisable, et que les prix
// extraits reviennent revalidés et rattachés aux sources Linkup.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { benchmark } from "@/lib/benchmark";
import { generateLetter, type LetterRequest } from "@/lib/letters";

const HOLO_URL = "https://api.hcompany.ai/v1/chat/completions";
const LINKUP_URL = "https://api.linkup.so/v1/search";
const SCRAPER_SESSIONS_URL = "https://agp.eu.hcompany.ai/api/v2/sessions";
const ENV_KEYS = ["HAI_API_KEY", "LINKUP_API_KEY", "HAI_MODELS_BASE_URL", "HAI_LLM_MODEL"] as const;

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

const LETTER: LetterRequest = {
  merchant: "Notion Labs",
  action: "downgrade",
  alternative: "plan Plus",
  savingMonthly: 24,
  savingAnnual: 288,
  lang: "fr",
};

const LINKUP_ANSWER = {
  answer: "Coda coûte 10 €/utilisateur/mois. Notion Plus coûte 12 €.",
  sources: [
    { name: "Coda pricing", url: "https://coda.io/pricing", snippet: "Pricing 2026" },
    { name: "Notion pricing", url: "https://notion.so/pricing", snippet: "Plans 2026" },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function holoReply(content: string): Response {
  return json({ choices: [{ message: { role: "assistant", content } }] });
}

let calls: CapturedCall[];
let routes: Map<string, () => Response>;
const envInitial: Record<string, string | undefined> = {};
let fetchInitial: typeof fetch;

beforeEach(() => {
  calls = [];
  routes = new Map();
  for (const key of ENV_KEYS) {
    envInitial[key] = process.env[key];
    delete process.env[key];
  }
  fetchInitial = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, body: JSON.parse(String(init?.body ?? "{}")) });
    const route = routes.get(target);
    if (!route) throw new Error(`unexpected fetch to ${target}`);
    return route();
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

describe("generateLetter", () => {
  it("should return the template without any network call when HAI_API_KEY is missing", async () => {
    const letter = await generateLetter(LETTER);

    expect(letter).toContain("Objet : Révision de mon contrat Notion Labs");
    expect(calls).toHaveLength(0);
  });

  it("should draft the letter with Holo when HAI_API_KEY is set", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    routes.set(HOLO_URL, () => holoReply("Objet : Passage au plan Plus\n\nBonjour,"));

    const letter = await generateLetter(LETTER);

    expect(letter).toBe("Objet : Passage au plan Plus\n\nBonjour,");
    expect(calls.map((c) => c.url)).toEqual([HOLO_URL]);
    expect(calls[0].body.model).toBe("holo4-27b");
    expect(calls[0].body.response_format).toBeUndefined();
  });

  it("should fall back to the template when the Models API fails", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    routes.set(HOLO_URL, () => new Response("overloaded", { status: 503 }));

    const letter = await generateLetter(LETTER);

    expect(letter).toContain("Brouillon préparé par Kerdaxis");
  });
});

describe("benchmark", () => {
  it("should stay unverified without calling anyone when LINKUP_API_KEY is missing", async () => {
    process.env.HAI_API_KEY = "hai-test-key";

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(result.verified).toBe(false);
    expect(result.note).toContain("Linkup");
    expect(calls).toHaveLength(0);
  });

  it("should search with Linkup and extract prices with Holo, keeping the merchant's own plans apart", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));
    routes.set(HOLO_URL, () =>
      holoReply(
        JSON.stringify({
          ownPlans: [{ name: "Plus", monthlyPrice: 12, unit: "/utilisateur/mois", perSeat: true, sourceIndex: 1 }],
          alternatives: [
            { name: "Coda", monthlyPrice: 10, unit: "/utilisateur/mois", perSeat: true, comparable: true, sourceIndex: 0 },
            { name: "Notion Plus", monthlyPrice: 12, unit: "/utilisateur/mois", perSeat: true, comparable: true, sourceIndex: 1 },
          ],
        }),
      ),
    );

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(calls.map((c) => c.url)).toEqual([LINKUP_URL, LINKUP_URL, HOLO_URL]);
    expect(result.provider).toBe("linkup");
    expect(result.verified).toBe(true);
    expect(result.alternatives).toEqual([
      {
        name: "Coda",
        monthlyPrice: 10,
        unit: "/utilisateur/mois",
        perSeat: true,
        comparable: true,
        sourceUrl: "https://coda.io/pricing",
        sourceDate: "2026",
      },
    ]);
    expect(result.ownPlans).toEqual([
      { name: "Plus", monthlyPrice: 12, unit: "/utilisateur/mois", perSeat: true, sourceUrl: "https://notion.so/pricing", sourceDate: "2026" },
    ]);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should drop a price whose source index points nowhere instead of borrowing another source", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));
    routes.set(HOLO_URL, () =>
      holoReply(
        JSON.stringify({
          ownPlans: [],
          alternatives: [{ name: "Coda", monthlyPrice: 10, unit: "/mois", perSeat: false, comparable: true, sourceIndex: 7 }],
        }),
      ),
    );

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(result.alternatives).toEqual([]);
  });

  it("should ask Linkup two separate questions: the supplier's own prices and cheaper competitors", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));
    routes.set(HOLO_URL, () => holoReply(JSON.stringify({ ownPlans: [], alternatives: [] })));

    await benchmark("Notion Labs", "IA & Dev", 48, "en");

    const questions = calls.filter((c) => c.url === LINKUP_URL).map((c) => String(c.body.q));
    expect(questions).toHaveLength(2);
    expect(questions[0]).toContain("current public prices");
    expect(questions[1]).toContain("CHEAPER alternatives");
  });

  it("should keep the search alive when one of the two Linkup questions fails", async () => {
    process.env.LINKUP_API_KEY = "linkup-test-key";
    let linkupCalls = 0;
    routes.set(LINKUP_URL, () => (++linkupCalls === 1 ? json({}, 500) : json(LINKUP_ANSWER)));

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(result.verified).toBe(true);
    expect(result.sources).toHaveLength(2);
  });

  it("should retry a rejected extraction exactly once", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));
    routes.set(HOLO_URL, () => holoReply("not json"));

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    const searchAndExtract = calls.map((c) => c.url).filter((url) => url !== SCRAPER_SESSIONS_URL);
    expect(searchAndExtract).toEqual([LINKUP_URL, LINKUP_URL, HOLO_URL, HOLO_URL]);
    expect(result.verified).toBe(true);
    expect(result.alternatives).toEqual([]);
  });

  it("should never send the observed monthly amount to Linkup, Holo or the scraper agent", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));
    routes.set(HOLO_URL, () => holoReply(JSON.stringify({ ownPlans: [], alternatives: [] })));

    await benchmark("Notion Labs", "IA & Dev", 48.37);

    expect(calls.map((c) => c.url)).toEqual([LINKUP_URL, LINKUP_URL, HOLO_URL, SCRAPER_SESSIONS_URL]);
    for (const call of calls) expect(JSON.stringify(call.body)).not.toContain("48.37");
  });

  it("should keep the sourced summary when Holo returns an invalid shape", async () => {
    process.env.HAI_API_KEY = "hai-test-key";
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));
    routes.set(HOLO_URL, () => holoReply(JSON.stringify({ alternatives: [{ name: "Coda", monthlyPrice: "dix" }] })));

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(result.verified).toBe(true);
    expect(result.summary).toContain("Coda");
    expect(result.sources).toHaveLength(2);
    expect(result.alternatives).toEqual([]);
  });

  it("should keep the sourced summary without structured prices when HAI_API_KEY is missing", async () => {
    process.env.LINKUP_API_KEY = "linkup-test-key";
    routes.set(LINKUP_URL, () => json(LINKUP_ANSWER));

    const result = await benchmark("Notion Labs", "IA & Dev", 48);

    expect(calls.map((c) => c.url)).toEqual([LINKUP_URL, LINKUP_URL]);
    expect(result.verified).toBe(true);
    expect(result.alternatives).toEqual([]);
  });
});
