import { NextResponse } from "next/server";
import { issueTestCookie, passwordOk, TEST_COOKIE, TEST_TTL_S, testAccessConfigured } from "@/lib/auth/test-access";
import { rateLimitHit } from "./limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connexion test : mot de passe de démo → cookie signé 12 h. */
export async function POST(req: Request): Promise<Response> {
  if (!testAccessConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "local";
  if (rateLimitHit(ip)) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!passwordOk(String(body.password ?? ""))) return NextResponse.json({ error: "bad_password" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEST_COOKIE, await issueTestCookie(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TEST_TTL_S,
  });
  return res;
}
