/// <reference types="@cloudflare/workers-types" />
// ---------------------------------------------------------------------------
// Kerdaxis accounts — Worker Cloudflare des comptes utilisateurs (/auth/*) et de
// la liste d'attente (/waitlist), appelé par l'app web (web/lib/site.ts).
// ---------------------------------------------------------------------------

import {
  handleSignup,
  handleLogin,
  handleMe,
  handleLogout,
  handleVerify,
  handleResendVerification,
  authCors,
} from "./auth";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Rate-limit best-effort par IP, adossé au KV WAITLIST (fenêtre glissante).
 * Pas d'IP (dev local, appel interne) → on ne bloque pas. TTL KV mini = 60 s.
 * Objectif : empêcher le spam de /waitlist (pollution KV) et le brute-force sur /auth/*.
 */
async function rateLimit(
  env: Env,
  bucket: string,
  ip: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  if (!ip) return true;
  const key = `rl:${bucket}:${ip}`;
  const count = parseInt((await env.WAITLIST.get(key)) || "0", 10);
  if (count >= limit) return false;
  await env.WAITLIST.put(key, String(count + 1), { expirationTtl: windowSec });
  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Liste d'attente — stocke l'email dans Cloudflare KV.
    if (url.pathname === "/waitlist") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: CORS });
      }
      // Anti-spam : 5 inscriptions max par IP et par heure.
      const wlIp = request.headers.get("CF-Connecting-IP") || "";
      if (!(await rateLimit(env, "wl", wlIp, 5, 3600))) {
        return Response.json(
          { ok: false, error: "rate_limited" },
          { status: 429, headers: CORS },
        );
      }
      let email = "";
      let lang = "";
      let source = "";
      try {
        const body = (await request.json()) as { email?: string; lang?: string; source?: string };
        email = (body.email ?? "").trim().toLowerCase();
        lang = (body.lang ?? "").slice(0, 5);
        source = (body.source ?? "").slice(0, 40);
      } catch {
        /* body invalide */
      }
      if (!email.includes("@") || email.length < 5 || email.length > 200) {
        return Response.json({ ok: false, error: "invalid_email" }, { status: 400, headers: CORS });
      }
      await env.WAITLIST.put(
        `wl:${email}`,
        JSON.stringify({ email, lang, source, at: new Date().toISOString() }),
      );
      return Response.json({ ok: true }, { headers: CORS });
    }

    // Comptes utilisateurs — inscription / connexion (mots de passe hachés, KV).
    if (url.pathname.startsWith("/auth/")) {
      if (request.method === "OPTIONS") return authCors();
      const ip = request.headers.get("CF-Connecting-IP") || "";
      const postRoutes = ["/auth/signup", "/auth/login", "/auth/verify", "/auth/resend-verification"];
      if (postRoutes.includes(url.pathname) && request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: CORS });
      }
      // /auth/resend-verification déclenche un envoi d'email (coûteux) : plafond
      // serré, 3 par IP et par heure. Les autres routes POST : anti-brute-force
      // classique, 10 par IP toutes les 5 minutes.
      if (url.pathname === "/auth/resend-verification") {
        if (!(await rateLimit(env, "resend", ip, 3, 3600))) {
          return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: CORS });
        }
      } else if (postRoutes.includes(url.pathname)) {
        if (!(await rateLimit(env, "auth", ip, 10, 300))) {
          return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: CORS });
        }
      }
      try {
        if (url.pathname === "/auth/signup") return await handleSignup(request, env);
        if (url.pathname === "/auth/login") return await handleLogin(request, env);
        if (url.pathname === "/auth/me") return await handleMe(request, env);
        if (url.pathname === "/auth/logout") return await handleLogout(request, env);
        if (url.pathname === "/auth/verify") return await handleVerify(request, env);
        if (url.pathname === "/auth/resend-verification") return await handleResendVerification(request, env);
      } catch (err) {
        // Un bug d'auth doit rendre du JSON, jamais un 1101 brut. On journalise
        // le détail côté serveur mais on ne le renvoie PAS (pas de fuite interne).
        console.error("[auth] exception:", err);
        return Response.json({ ok: false, error: "server_error" }, { status: 500, headers: CORS });
      }
      return new Response("Not found", { status: 404, headers: CORS });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Kerdaxis accounts · POST /auth/* · POST /waitlist");
    }
    return new Response("Not found", { status: 404 });
  },
};
