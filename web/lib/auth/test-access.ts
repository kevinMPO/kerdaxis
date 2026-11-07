// ---------------------------------------------------------------------------
// Accès « test » à l'app Kerdaxis exposée par tunnel (app.kerdaxis.com).
// Mot de passe de démo (KERDAXIS_TEST_PASSWORD) → cookie signé HMAC-SHA256
// (KERDAXIS_SESSION_SECRET), valable 12 h. Compatible edge (WebCrypto) :
// utilisé par le middleware ET par les routes Node.
// ---------------------------------------------------------------------------

import { base64UrlEncode, texteVersOctets } from "@/lib/encodage";

export const TEST_COOKIE = "kx_test";
export const TEST_TTL_S = 12 * 3600;

export async function hmac(payload: string): Promise<string> {
  const secret = process.env.KERDAXIS_SESSION_SECRET ?? "";
  const key = await crypto.subtle.importKey("raw", texteVersOctets(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, texteVersOctets(payload)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function testAccessConfigured(): boolean {
  return Boolean(process.env.KERDAXIS_TEST_PASSWORD && process.env.KERDAXIS_SESSION_SECRET);
}

export function passwordOk(candidate: string): boolean {
  const expected = process.env.KERDAXIS_TEST_PASSWORD ?? "";
  return testAccessConfigured() && safeEqual(candidate, expected);
}

export async function issueTestCookie(now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + TEST_TTL_S;
  return `${exp}.${await hmac(`test:${exp}`)}`;
}

export async function verifyTestCookie(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !testAccessConfigured()) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now || !sig) return false;
  return safeEqual(sig, await hmac(`test:${exp}`));
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function isLocalHost(host: string | null): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test((host ?? "").toLowerCase());
}
