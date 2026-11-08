// ---------------------------------------------------------------------------
// Imported statement → the same analysis pipeline as a live Qonto account.
//
// The browser sends parsed rows only (lib/statement/parse.ts). They are
// validated here, then categorized and computed exactly like a Qonto read:
// every euro comes from the engine, the model only returns labels.
// Nothing is stored: the rows live for the duration of the request.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { runAnalysis } from "@/lib/analysis/pipeline";
import type { AnalyzeResult, Tx } from "@/lib/types";

export const MAX_IMPORTED_TRANSACTIONS = 3000;
const MAX_AMOUNT_EUR = 10_000_000;
const MAX_LABEL_LENGTH = 160;
const MIN_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 400;
const DAY_MS = 86_400_000;

export const IMPORTED_ACCOUNT_NAME = "Relevé importé (PDF)";
const IMPORTED_BANK = "PDF";

function utcDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isCalendarDay(iso: string): boolean {
  const day = utcDay(iso);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === iso;
}

const importedTxSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarDay, "invalid_date"),
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
  amount: z.number().positive().max(MAX_AMOUNT_EUR),
  side: z.enum(["debit", "credit"]),
  operationType: z.enum(["card", "direct_debit", "transfer", "bank_fee", "other"]),
  isFx: z.boolean(),
});

export const importRequestSchema = z.object({
  transactions: z.array(importedTxSchema).min(1).max(MAX_IMPORTED_TRANSACTIONS),
  closingBalance: z.number().min(-MAX_AMOUNT_EUR).max(MAX_AMOUNT_EUR).nullable(),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;

export function toTransactions(rows: ImportRequest["transactions"]): Tx[] {
  return rows.map((row, index) => {
    const isFxFee = row.isFx && row.operationType === "bank_fee";
    return {
      id: `import-${index}`,
      merchant: row.label,
      amount: row.amount,
      localCurrency: "EUR",
      isFx: isFxFee,
      side: row.side,
      operationType: row.operationType,
      date: row.date,
      // A PDF says nothing about receipts: no lost-VAT claim can be made from it.
      attachmentRequired: false,
      hasAttachment: true,
      ...(isFxFee ? { fee: row.amount } : {}),
    };
  });
}

/** The statement's own period: from its first to its last row, never "today". */
export function statementPeriod(rows: ImportRequest["transactions"]): { asOf: Date; windowDays: number } {
  const days = rows.map((row) => utcDay(row.date).getTime());
  const first = Math.min(...days);
  const last = Math.max(...days);
  const span = Math.round((last - first) / DAY_MS) + 1;
  return { asOf: new Date(last), windowDays: Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, span)) };
}

export async function analyzeImportedStatement(request: ImportRequest): Promise<AnalyzeResult> {
  const { asOf, windowDays } = statementPeriod(request.transactions);
  return runAnalysis({
    account: { name: IMPORTED_ACCOUNT_NAME, bank: IMPORTED_BANK, balance: request.closingBalance ?? 0 },
    txs: toTransactions(request.transactions),
    windowDays,
    source: "import",
    now: asOf,
  });
}
