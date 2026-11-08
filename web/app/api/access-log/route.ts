import { NextResponse } from "next/server";
import { accessScopeFor, listAccess } from "@/lib/privacy/access-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The visitor's own third-party calls, newest first. Never cached: it is per-session data. */
export async function GET(req: Request): Promise<Response> {
  try {
    const entries = await listAccess(await accessScopeFor(req));
    const response = NextResponse.json({ entries });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Vary", "Cookie");
    return response;
  } catch (error) {
    console.error("[kerdaxis][access-log] list failed", { error });
    return NextResponse.json({ error: { code: "ACCESS_LOG_UNAVAILABLE", message: "Access log unavailable." } }, { status: 503 });
  }
}
