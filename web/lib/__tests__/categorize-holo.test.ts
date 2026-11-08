// ---------------------------------------------------------------------------
// categorizeWithHolo : la catégorisation par H Company Holo (Models API).
// Le réseau est simulé. On vérifie ce qui SORT (règle 3 : ni montant ni PII),
// ce qui REVIENT (revalidé par Zod avant d'atteindre le moteur) et le recollage
// sur les noms d'origine.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { categorizeWithHolo, hasHoloKey, type MerchantInput } from "@/lib/categorize";
import { HaiError } from "@/lib/execution/hcompany";

const HOLO_KEY = "hai-test-key";

const MERCHANTS: MerchantInput[] = [
  { name: "NOTION LABS", occurrences: 3, monthlyEstimate: 48.37, isRecurring: true },
  { name: "SNCF", occurrences: 1, monthlyEstimate: 112.5, isRecurring: false },
];

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_VERDICTS = {
  verdicts: [
    { name: "NOTION LABS", nature: "pilotable", pole: "IA & Dev", isSubscription: true, action: "downgrade", alternative: "plan Plus", risk: "safe" },
    { name: "SNCF", nature: "ponctuel", pole: "Voyage", isSubscription: false, action: "keep", alternative: "", risk: "safe" },
  ],
};

let captured: CapturedRequest | null;
const fakeFetch = vi.fn();
let initialFetch: typeof fetch;
let initialKey: string | undefined;

beforeEach(() => {
  captured = null;
  initialFetch = globalThis.fetch;
  initialKey = process.env.HAI_API_KEY;
  process.env.HAI_API_KEY = HOLO_KEY;
  fakeFetch.mockReset();
  globalThis.fetch = fakeFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = initialFetch;
  if (initialKey === undefined) delete process.env.HAI_API_KEY;
  else process.env.HAI_API_KEY = initialKey;
});

function respondWith(response: Response): void {
  fakeFetch.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    captured = {
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    return response;
  });
}

describe("categorizeWithHolo", () => {
  it("should report the key as configured only when HAI_API_KEY is set", () => {
    expect(hasHoloKey()).toBe(true);
    delete process.env.HAI_API_KEY;
    expect(hasHoloKey()).toBe(false);
  });

  it("should call the H Company Models API with a JSON schema and thinking turned off", async () => {
    respondWith(completion(JSON.stringify(VALID_VERDICTS)));

    await categorizeWithHolo(MERCHANTS);

    expect(captured?.url).toBe("https://api.hcompany.ai/v1/chat/completions");
    expect(captured?.headers.Authorization).toBe(`Bearer ${HOLO_KEY}`);
    expect(captured?.body.model).toBe("holo4-27b");
    expect(captured?.body.temperature).toBe(0);
    expect(captured?.body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(captured?.body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("should never send euro amounts to the model", async () => {
    respondWith(completion(JSON.stringify(VALID_VERDICTS)));

    await categorizeWithHolo(MERCHANTS);

    const sent = JSON.stringify(captured?.body.messages);
    expect(sent, "monthly estimates must stay inside the app").not.toContain("48.37");
    expect(sent).not.toContain("112.5");
    expect(sent).not.toContain("monthlyEstimate");
  });

  it("should return one verdict per merchant, keyed on the original name", async () => {
    respondWith(completion(JSON.stringify(VALID_VERDICTS)));

    const verdicts = await categorizeWithHolo(MERCHANTS);

    expect(verdicts.map((v) => v.name)).toEqual(["NOTION LABS", "SNCF"]);
    expect(verdicts[0]).toMatchObject({ nature: "pilotable", action: "downgrade" });
  });

  it("should fall back to the rule verdict for a merchant the model forgot", async () => {
    respondWith(completion(JSON.stringify({ verdicts: [VALID_VERDICTS.verdicts[0]] })));

    const verdicts = await categorizeWithHolo(MERCHANTS);

    expect(verdicts[1]).toMatchObject({ name: "SNCF", nature: "ponctuel", pole: "Voyage" });
  });

  it("should reject a label outside the allowed lists instead of passing it to the engine", async () => {
    const tampered = structuredClone(VALID_VERDICTS);
    (tampered.verdicts[0] as Record<string, unknown>).action = "cancel-and-refund-500-eur";
    respondWith(completion(JSON.stringify(tampered)));

    await expect(categorizeWithHolo(MERCHANTS)).rejects.toThrow();
  });

  it("should throw a HaiError without the API key when the Models API fails", async () => {
    respondWith(new Response("model overloaded", { status: 503 }));

    const error = await categorizeWithHolo(MERCHANTS).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(HaiError);
    expect((error as HaiError).status).toBe(503);
    expect(String((error as Error).message)).not.toContain(HOLO_KEY);
  });

  it("should throw when the completion has no content", async () => {
    respondWith(new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 }));

    await expect(categorizeWithHolo(MERCHANTS)).rejects.toBeInstanceOf(HaiError);
  });
});
