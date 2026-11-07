import { NextResponse } from "next/server";
import { readCookie, TEST_COOKIE, verifyTestCookie } from "@/lib/auth/test-access";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Qui est connecté (pour la barre de compte). Jamais de secret renvoyé. */
export async function GET(req: Request): Promise<Response> {
  const cookies = req.headers.get("cookie");
  const s = await verifySession(readCookie(cookies, SESSION_COOKIE));
  const tester = await verifyTestCookie(readCookie(cookies, TEST_COOKIE));
  const res = NextResponse.json({
    role: s?.role ?? (tester ? "tester" : null),
    email: s?.email ?? null,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
