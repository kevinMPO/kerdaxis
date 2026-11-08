// Browser-side reading of a statement PDF. pdf.js (via unpdf) is loaded only
// when the user picks a file: it is large and most visitors never import.

import { groupLines, parseStatement, type ParsedStatement } from "./parse";

export const MAX_STATEMENT_BYTES = 15 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

export type StatementImportErrorCode = "not_pdf" | "too_large" | "unreadable" | "no_transactions";

export class StatementImportError extends Error {
  constructor(readonly code: StatementImportErrorCode) {
    super(code);
    this.name = "StatementImportError";
  }
}

export async function readStatementPdf(file: File): Promise<ParsedStatement> {
  if (file.size > MAX_STATEMENT_BYTES) throw new StatementImportError("too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = [...PDF_MAGIC].every((char, index) => bytes[index] === char.charCodeAt(0));
  if (!isPdf) throw new StatementImportError("not_pdf");

  let pages;
  try {
    const { extractTextItems } = await import("unpdf");
    pages = (await extractTextItems(bytes)).items;
  } catch {
    throw new StatementImportError("unreadable");
  }

  const parsed = parseStatement(groupLines(pages));
  if (parsed.transactions.length === 0) throw new StatementImportError("no_transactions");
  return parsed;
}
