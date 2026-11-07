// ---------------------------------------------------------------------------
// Session utilisateur de l'app exposée (app.kerdaxis.com) : essai gratuit ou
// abonné. Cookie signé HMAC-SHA256 (KERDAXIS_SESSION_SECRET), compatible edge
// (middleware) et Node (routes).
//
//   trial  : e-mail seul → toute l'app, mais l'agent H Company est REJOUÉ
//            (session réelle enregistrée), jamais lancé ;
//   member : abonnement Stripe actif → agent H Company réel (portail de démo).
// ---------------------------------------------------------------------------

import { base64UrlEncode, base64UrlVersTexte, texteVersOctets } from "@/lib/encodage";
import { hmac, safeEqual } from "./test-access";

export const SESSION_COOKIE = "kx_session";
export const TRIAL_TTL_S = 7 * 24 * 3600;
/** Court exprès : l'abonnement est revérifié chez Stripe à chaque connexion. */
export const MEMBER_TTL_S = 3 * 24 * 3600;

export type Role = "trial" | "member";
export interface UserSession {
  role: Role;
  email: string;
  exp: number;
}

export function sessionConfigured(): boolean {
  return Boolean(process.env.KERDAXIS_SESSION_SECRET && process.env.KERDAXIS_SESSION_SECRET.length >= 16);
}

export async function issueSession(role: Role, email: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + (role === "member" ? MEMBER_TTL_S : TRIAL_TTL_S);
  const payload = base64UrlEncode(texteVersOctets(JSON.stringify({ r: role, e: email, x: exp })));
  return `${payload}.${await hmac(`session:${payload}`)}`;
}

export async function verifySession(value: string | undefined, now = Date.now()): Promise<UserSession | null> {
  if (!value || !sessionConfigured()) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(`session:${payload}`))) return null;
  const json = base64UrlVersTexte(payload);
  if (!json) return null;
  try {
    const d = JSON.parse(json) as { r?: string; e?: string; x?: number };
    if ((d.r !== "trial" && d.r !== "member") || typeof d.e !== "string" || typeof d.x !== "number") return null;
    if (d.x * 1000 < now) return null;
    return { role: d.r, email: d.e, exp: d.x };
  } catch {
    return null;
  }
}

export const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}
