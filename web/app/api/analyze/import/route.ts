// ---------------------------------------------------------------------------
// POST /api/analyze/import — analysis of a PDF statement read in the browser.
//
// The PDF itself never reaches the server: the browser sends the parsed rows
// (date, cleaned label, amount, side). They go through the same pipeline as a
// live Qonto account, badged `source: "import"`. Nothing is stored.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { reponseTropDeRequetes, verifierDebit } from "@/lib/api/rate-limit";
import { analyzeImportedStatement, importRequestSchema } from "@/lib/statement/import-analysis";

export const dynamic = "force-dynamic";

const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const debit = await verifierDebit(request, "statement_import");
  if (!debit.autorise) return reponseTropDeRequetes(debit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "invalid_body" }, { status: HTTP_BAD_REQUEST }));
  }

  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(NextResponse.json({ error: "invalid_statement" }, { status: HTTP_BAD_REQUEST }));
  }

  try {
    return noStore(NextResponse.json(await analyzeImportedStatement(parsed.data)));
  } catch (error) {
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        route: "analyze/import",
        rows: parsed.data.transactions.length,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return noStore(NextResponse.json({ error: "analysis_failed" }, { status: HTTP_SERVER_ERROR }));
  }
}
