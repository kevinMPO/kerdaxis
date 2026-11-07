import { NextResponse } from "next/server";
import { COOKIE_OPTS, SESSION_COOKIE } from "@/lib/auth/user-session";
import { TEST_COOKIE } from "@/lib/auth/test-access";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set(TEST_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}
