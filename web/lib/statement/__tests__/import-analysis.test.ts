import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/categorize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/categorize")>()),
  hasHoloKey: () => false,
}));

const { analyzeImportedStatement, importRequestSchema, statementPeriod, toTransactions } = await import(
  "@/lib/statement/import-analysis"
);
const { POST } = await import("@/app/api/analyze/import/route");

type Row = {
  date: string;
  label: string;
  amount: number;
  side: "debit" | "credit";
  operationType: "card" | "direct_debit" | "transfer" | "bank_fee" | "other";
  isFx: boolean;
};

const row = (date: string, label: string, amount: number, extra: Partial<Row> = {}): Row => ({
  date,
  label,
  amount,
  side: "debit",
  operationType: "card",
  isFx: false,
  ...extra,
});

const STATEMENT = {
  closingBalance: 1234.5,
  transactions: [
    row("2026-08-14", "Figma", 42),
    row("2026-09-14", "Figma", 42),
    row("2026-10-14", "Figma", 48),
    row("2026-08-03", "Notion", 10, { operationType: "direct_debit" }),
    row("2026-09-03", "Notion", 10, { operationType: "direct_debit" }),
    row("2026-10-03", "Notion", 10, { operationType: "direct_debit" }),
    row("2026-09-13", "Commission Frais De Change USD", 3.1, { operationType: "bank_fee", isFx: true }),
    row("2026-10-04", "Apple Store", 1499),
    row("2026-10-10", "Client Lambda SAS", 6500, { side: "credit", operationType: "transfer" }),
  ],
};

describe("importRequestSchema", () => {
  it("should reject impossible dates, negative amounts and empty statements", () => {
    expect(importRequestSchema.safeParse({ ...STATEMENT, transactions: [row("2026-02-31", "X", 1)] }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...STATEMENT, transactions: [row("2026-13-01", "X", 1)] }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...STATEMENT, transactions: [row("2026-09-01", "X", -5)] }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...STATEMENT, transactions: [] }).success).toBe(false);
    expect(importRequestSchema.safeParse(STATEMENT).success).toBe(true);
  });
});

describe("statementPeriod", () => {
  it("should end on the statement's last day and span at least 30 days", () => {
    const { asOf, windowDays } = statementPeriod(STATEMENT.transactions);
    expect(asOf.toISOString().slice(0, 10)).toBe("2026-10-14");
    expect(windowDays).toBe(73);
    expect(statementPeriod([row("2026-10-01", "A", 1)]).windowDays).toBe(30);
  });
});

describe("toTransactions", () => {
  it("should route bank FX commissions to the fee field and claim no missing receipt", () => {
    const txs = toTransactions(STATEMENT.transactions);
    const fx = txs.find((t) => t.merchant.startsWith("Commission"));
    expect(fx).toMatchObject({ isFx: true, fee: 3.1, operationType: "bank_fee" });
    expect(txs.every((t) => !t.attachmentRequired)).toBe(true);
  });
});

describe("analyzeImportedStatement", () => {
  it("should run the engine on the imported rows, badged as an import", async () => {
    const result = await analyzeImportedStatement(STATEMENT);
    expect(result.meta).toEqual({ source: "import", categorized: "rules", txCount: STATEMENT.transactions.length });
    expect(result.account.balance).toBe(1234.5);

    const figma = result.levers.find((l) => l.id === "figma");
    expect(figma?.hausse).toBeDefined();
    expect(result.levers.some((l) => l.motif === "fx")).toBe(true);
    // A one-off is never annualised into a lever.
    expect(result.levers.some((l) => l.id.startsWith("apple"))).toBe(false);
  });
});

describe("POST /api/analyze/import", () => {
  const post = (body: string): Promise<Response> =>
    POST(new Request("http://localhost/api/analyze/import", { method: "POST", body, headers: { "content-type": "application/json" } }));

  it("should answer 400 to a malformed statement", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ transactions: "nope" }))).status).toBe(400);
  });

  it("should answer the analysis, never cached", async () => {
    const response = await post(JSON.stringify(STATEMENT));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const result = (await response.json()) as { meta: { source: string } };
    expect(result.meta.source).toBe("import");
  });
});
