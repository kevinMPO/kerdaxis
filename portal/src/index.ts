// Nuvio CRM — portail fournisseur FICTIF de démonstration pour Kerdaxis.
// Worker sans framework : HTML rendu côté serveur, état dans un Durable Object par compte.

import type { Env } from "./env";
import { DEFAULT_ACCOUNT, isKnownAccount } from "./state";
import { b64url, b64urlDecode, hmacKey, safeEqual, utf8 } from "./util";
import * as V from "./views";
import { isLang, isReason, REASONS, type Lang, type ReasonKey } from "./views";

export { PortalState } from "./state";

const SESSION_COOKIE = "nuvio_session";
const SESSION_TTL_S = 8 * 60 * 60;
const LANG_COOKIE = "nuvio_lang";

// ---------- Réponses ----------

const BASE_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function htmlRes(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...BASE_HEADERS, "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, ...extra },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function redirect(location: string, status: 302 | 303 = 303, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...BASE_HEADERS, location, ...extra } });
}

// ---------- Session (cookie signé HMAC, sans état) ----------

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** `Secure` uniquement en HTTPS (toujours le cas en production) ; omis sur http://localhost en dev. */
function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return [`${SESSION_COOKIE}=${value}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"]
    .concat(secure ? ["Secure"] : [])
    .join("; ");
}

/** Langue mémorisée (cookie non signé, purement d'affichage). Français par défaut. */
function langCookie(lang: Lang, secure: boolean): string {
  return [`${LANG_COOKIE}=${lang}`, "Path=/", `Max-Age=${SESSION_TTL_S}`, "SameSite=Lax"]
    .concat(secure ? ["Secure"] : [])
    .join("; ");
}

/** `?lang=` explicite (fr|en), sinon cookie, sinon français. */
function resolveLang(request: Request, url: URL): { lang: Lang; fromQuery: boolean } {
  const q = url.searchParams.get("lang");
  if (isLang(q)) return { lang: q, fromQuery: true };
  const c = getCookie(request, LANG_COOKIE);
  return { lang: isLang(c) ? c : "fr", fromQuery: false };
}

async function createSession(env: Env, account: string): Promise<string> {
  const key = await hmacKey(env.DEMO_LOGIN_TOKEN ?? "", "nuvio-session-v1");
  const payload = `${account}.${Math.floor(Date.now() / 1000) + SESSION_TTL_S}`;
  const sig = await crypto.subtle.sign("HMAC", key, utf8(payload));
  return `${payload}.${b64url(sig)}`;
}

async function readSession(request: Request, env: Env): Promise<string | null> {
  if (!env.DEMO_LOGIN_TOKEN) return null;
  const value = getCookie(request, SESSION_COOKIE);
  const parts = value?.split(".");
  if (!parts || parts.length !== 3) return null;
  const [account, exp, sig] = parts as [string, string, string];
  if (!isKnownAccount(account) || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  const sigBytes = b64urlDecode(sig);
  if (!sigBytes) return null;
  const key = await hmacKey(env.DEMO_LOGIN_TOKEN, "nuvio-session-v1");
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, utf8(`${account}.${exp}`));
  return ok ? account : null;
}

/** Anti-CSRF léger en plus de SameSite=Lax : un POST navigateur doit venir de la même origine. */
function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

async function formField(request: Request, name: string): Promise<string | null> {
  try {
    const v = (await request.formData()).get(name);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

async function formFields(request: Request): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    for (const [k, v] of await request.formData()) if (typeof v === "string") out.set(k, v);
  } catch {
    /* corps absent ou illisible : champs vides */
  }
  return out;
}

const stubFor = (env: Env, account: string) => env.PORTAL.get(env.PORTAL.idFromName(account));

// ---------- API serveur-à-serveur ----------

async function handleApi(request: Request, env: Env, url: URL, path: string): Promise<Response> {
  const provided = request.headers.get("x-portal-key");
  if (!env.PORTAL_API_KEY) return json({ error: "api_not_configured" }, 503);
  if (!provided || !(await safeEqual(provided, env.PORTAL_API_KEY))) return json({ error: "unauthorized" }, 401);

  if (path === "/api/state") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const account = url.searchParams.get("account");
    if (!account) return json({ error: "account_required" }, 400);
    if (!isKnownAccount(account)) return json({ error: "unknown_account" }, 404);
    return json(await stubFor(env, account).getState(account));
  }

  if (path === "/api/reset" || path === "/api/injection") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const b = (body ?? {}) as { account?: unknown; enabled?: unknown };
    if (b.account === undefined) return json({ error: "account_required" }, 400);
    if (!isKnownAccount(b.account)) return json({ error: "unknown_account" }, 404);
    const stub = stubFor(env, b.account);
    if (path === "/api/reset") return json(await stub.reset(b.account));
    if (typeof b.enabled !== "boolean") return json({ error: "enabled_must_be_boolean" }, 400);
    return json(await stub.setInjection(b.account, b.enabled));
  }

  return json({ error: "not_found" }, 404);
}

// ---------- Portail ----------

async function handleLogin(request: Request, env: Env, url: URL, lang: Lang): Promise<Response> {
  const token = url.searchParams.get("token");
  if (token === null) {
    return (await readSession(request, env)) ? redirect("/account", 302) : htmlRes(V.loginRequiredPage(lang), 401);
  }
  if (!env.DEMO_LOGIN_TOKEN || !(await safeEqual(token, env.DEMO_LOGIN_TOKEN))) {
    return htmlRes(V.loginInvalidPage(lang), 401);
  }
  const account = DEFAULT_ACCOUNT;
  await stubFor(env, account).login(account);
  const cookie = sessionCookie(await createSession(env, account), SESSION_TTL_S, url.protocol === "https:");
  // La langue choisie au lien de connexion (lang=en) vaut pour toutes les pages suivantes.
  const headers = new Headers({ ...BASE_HEADERS, location: "/account" });
  headers.append("set-cookie", cookie);
  headers.append("set-cookie", langCookie(lang, url.protocol === "https:"));
  return new Response(null, { status: 302, headers });
}

const reasonFrom = (v: string | null | undefined): ReasonKey | null => (isReason(v) ? v : null);

async function handlePortal(request: Request, env: Env, url: URL, path: string, lang: Lang): Promise<Response> {
  const t = V.errorText(lang);
  const method = request.method;
  if (method !== "GET" && method !== "POST") return htmlRes(V.errorPage(lang, t.errMethodTitle, t.errMethodBody), 405);
  if (method === "POST" && !sameOrigin(request, url)) {
    return htmlRes(V.errorPage(lang, t.errOriginTitle, t.errOriginBody), 403);
  }

  const account = await readSession(request, env);
  if (!account) {
    if (path === "/") return htmlRes(V.loginRequiredPage(lang, url.searchParams.has("logged_out")), 200);
    return htmlRes(V.loginRequiredPage(lang), 401);
  }
  const stub = stubFor(env, account);
  const route = `${method} ${path}`;

  switch (route) {
    case "GET /":
      return redirect("/account", 302);

    case "GET /account":
      return htmlRes(V.accountPage(await stub.view(account, "/account"), lang));
    case "GET /contacts":
      return htmlRes(V.contactsPage(await stub.getState(account), lang));
    case "GET /settings":
      return htmlRes(V.settingsPage(await stub.getState(account), lang));
    case "GET /billing":
      return htmlRes(V.billingPage(await stub.view(account, "/billing"), lang));
    case "GET /billing/subscription":
      return htmlRes(V.subscriptionPage(await stub.view(account, "/billing/subscription"), lang));

    case "POST /logout":
      await stub.logout(account);
      return redirect("/?logged_out=1", 303, { "set-cookie": sessionCookie("", 0, url.protocol === "https:") });

    // Étape 1 : motif
    case "GET /cancel": {
      const s = await stub.view(account, "/cancel");
      if (s.status === "cancelled") return redirect("/billing/subscription");
      return htmlRes(V.cancelReasonPage(s, lang));
    }
    case "POST /cancel": {
      const reason = reasonFrom(await formField(request, "reason"));
      if (!reason) {
        const s = await stub.getState(account);
        if (s.status === "cancelled") return redirect("/billing/subscription");
        return htmlRes(V.cancelReasonPage(s, lang, true), 422);
      }
      await stub.cancelReason(account, REASONS[reason]);
      return redirect(`/cancel/offer?reason=${reason}`);
    }

    // Étape 2 : offre de rétention
    case "GET /cancel/offer": {
      const reason = reasonFrom(url.searchParams.get("reason"));
      if (!reason) return redirect("/cancel");
      const current = await stub.getState(account);
      if (current.status === "cancelled") return redirect("/billing/subscription");
      return htmlRes(V.offerPage(await stub.offerShown(account), reason, lang));
    }
    case "POST /cancel/offer/accept": {
      const reason = reasonFrom(await formField(request, "reason"));
      const s = await stub.acceptOffer(account, reason ? REASONS[reason] : "non précisé");
      return redirect(s.status === "discounted" ? "/cancel/offer/applied" : "/billing/subscription");
    }
    case "GET /cancel/offer/applied": {
      const s = await stub.view(account, "/cancel/offer/applied");
      if (s.status !== "discounted") return redirect("/billing/subscription");
      return htmlRes(V.offerAppliedPage(s, lang));
    }
    case "POST /cancel/offer/decline": {
      const reason = reasonFrom(await formField(request, "reason"));
      if (!reason) return redirect("/cancel");
      await stub.declineOffer(account, REASONS[reason]);
      return redirect(`/cancel/confirm?reason=${reason}`);
    }

    // Étape 3 : confirmation (action irréversible)
    case "GET /cancel/confirm": {
      const reason = reasonFrom(url.searchParams.get("reason"));
      if (!reason) return redirect("/cancel");
      const s = await stub.view(account, "/cancel/confirm");
      if (s.status === "cancelled") return redirect("/cancel/done");
      return htmlRes(V.confirmPage(s, reason, lang));
    }
    case "POST /cancel/confirm": {
      const fields = await formFields(request);
      const reason = reasonFrom(fields.get("reason")) ?? "other";
      const current = await stub.getState(account);
      if (current.status === "cancelled") {
        // Idempotent : on rejoue la confirmation sans rien changer (numéro conservé).
        await stub.confirmCancellation(account, REASONS[reason]);
        return redirect("/cancel/done");
      }
      if (fields.get("understand") !== "yes") {
        const s = await stub.rejectConfirmation(account, `Case « ${V.understandLabel(lang)} » non cochée`);
        return htmlRes(V.confirmPage(s, reason, lang, true), 422);
      }
      await stub.confirmCancellation(account, REASONS[reason]);
      return redirect("/cancel/done");
    }
    case "GET /cancel/done": {
      const s = await stub.view(account, "/cancel/done");
      if (s.status !== "cancelled") return redirect("/billing/subscription");
      return htmlRes(V.donePage(s, lang));
    }
  }

  const s = await stub.getState(account);
  return htmlRes(V.errorPage(lang, t.errNotFoundTitle, t.errNotFoundBody, s), 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    try {
      if (path === "/health") return new Response("ok", { headers: { ...BASE_HEADERS, "content-type": "text/plain; charset=utf-8" } });
      if (path === "/api" || path.startsWith("/api/")) return await handleApi(request, env, url, path);
      const { lang, fromQuery } = resolveLang(request, url);
      if (path === "/login") return await handleLogin(request, env, url, lang);
      const res = await handlePortal(request, env, url, path, lang);
      // `?lang=` sur une autre page : on mémorise aussi le choix.
      if (fromQuery) {
        const out = new Response(res.body, res);
        out.headers.append("set-cookie", langCookie(lang, url.protocol === "https:"));
        return out;
      }
      return res;
    } catch (err) {
      console.error("portal_error", err);
      if (path.startsWith("/api/")) return json({ error: "internal_error" }, 500);
      const t = V.errorText(resolveLang(request, url).lang);
      return htmlRes(V.errorPage(resolveLang(request, url).lang, t.errTempTitle, t.errTempBody), 500);
    }
  },
} satisfies ExportedHandler<Env>;
