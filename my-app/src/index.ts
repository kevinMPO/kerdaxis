/// <reference types="@cloudflare/workers-types" />
// ---------------------------------------------------------------------------
// Kerdaxis MCP — serveur MCP sur Cloudflare (McpAgent).
// Expose le MOTEUR DÉTERMINISTE de Kerdaxis comme outils MCP : n'importe quel
// client MCP (Claude, un agent CMA, l'agent vocal) peut auditer des flux, sans
// que le LLM ne calcule un seul euro (règle #2). 100 % déterministe.
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { build } from "./lib/engine";
import { categorizeByRules, classifyEI, type MerchantInput } from "./lib/categorize";
import type { Tx } from "./lib/types";
import { parseWaitlistBody } from "./waitlist";
import {
  handleSignup,
  handleLogin,
  handleMe,
  handleLogout,
  handleVerify,
  handleResendVerification,
  authCors,
} from "./auth";

const RULES = [
  "1. Read-only Qonto : seuls les tools de lecture. Aucune écriture, aucun mouvement d'argent.",
  "2. Le moteur (code déterministe) calcule chaque euro, jamais le LLM.",
  "3. Zéro PII vers le web : seulement nom marchand + catégorie.",
  "4. Chaque prix affiché = source + date, sinon « non vérifié ».",
];

export class ArgentierMCP extends McpAgent<Env, Record<string, never>, Record<string, never>> {
  // maxToolInputElements (SDK >= 1.32, désactivé par défaut) : plafonne le nombre
  // d'éléments de tableau + clés d'objet validés par tools/call (GHSA-46jr-4wx8-v453).
  // 50 000 couvre 5 000 transactions complètes (≈ 8 éléments chacune), la même
  // limite que l'API moteur web (web/lib/engine/api.ts).
  server = new McpServer(
    { name: "argentier-engine", version: "1.0.0" },
    { maxToolInputElements: 50_000 },
  );
  initialState = {};

  async init() {
    // 1) Les 4 règles non négociables (contexte pour l'agent appelant).
    this.server.registerTool(
      "argentier_rules",
      { description: "Renvoie les 4 règles non négociables de Kerdaxis.", inputSchema: {} },
      async () => ({ content: [{ type: "text", text: RULES.join("\n") }] }),
    );

    // 2) Classification EI d'un marchand (miroir déterministe de engine.py).
    this.server.registerTool(
      "argentier_classify_ei",
      {
        description: "Classe un marchand en PRO / PERSO / A-CLARIFIER (déterministe, mots-clés).",
        inputSchema: { merchant: z.string().describe("Nom du marchand") },
      },
      async ({ merchant }) => ({
        content: [{ type: "text", text: classifyEI(merchant) }],
      }),
    );

    // 3) Annualisation déterministe (règle : mensuel × 12 × facteur de cadence).
    this.server.registerTool(
      "argentier_annualize",
      {
        description: "Annualise un montant mensuel (× 12). Un one-off n'est jamais annualisé.",
        inputSchema: {
          monthly: z.number().describe("Montant mensuel en €"),
          cadenceFactor: z.number().default(1).describe("1 = mensuel, 1/3 = trimestriel…"),
        },
      },
      async ({ monthly, cadenceFactor }) => ({
        content: [{ type: "text", text: String(Math.round(monthly * cadenceFactor * 12)) }],
      }),
    );

    // 4) Audit complet d'une liste de transactions (le moteur, en MCP).
    this.server.registerTool(
      "argentier_analyze",
      {
        description:
          "Audite des transactions Qonto et renvoie l'analyse déterministe : natures, leviers " +
          "d'économie, TVA récupérable, hausses silencieuses. Aucun euro n'est calculé par le LLM.",
        inputSchema: {
          transactions: z
            .array(
              z.object({
                merchant: z.string(),
                amount: z.number().describe("Montant en € (positif)"),
                date: z.string().describe("AAAA-MM-JJ"),
                side: z.enum(["debit", "credit"]).default("debit"),
                isFx: z.boolean().default(false),
                attachmentRequired: z.boolean().default(false),
                hasAttachment: z.boolean().default(false),
              }),
            )
            .describe("Les transactions à auditer"),
          windowDays: z.number().default(90).describe("Fenêtre d'analyse en jours"),
        },
      },
      async ({ transactions, windowDays }) => {
        const txs: Tx[] = transactions.map((t, i) => ({
          id: `tx-${i}`,
          merchant: t.merchant,
          amount: t.amount,
          localCurrency: "EUR",
          isFx: t.isFx,
          side: t.side,
          operationType: "card",
          date: t.date,
          attachmentRequired: t.attachmentRequired,
          hasAttachment: t.hasAttachment,
        }));

        const months = Math.max(1, windowDays / 30);
        const byName = new Map<string, { occ: number; sum: number }>();
        for (const t of txs) {
          if (t.side !== "debit") continue;
          const e = byName.get(t.merchant) ?? { occ: 0, sum: 0 };
          e.occ += 1;
          e.sum += t.amount;
          byName.set(t.merchant, e);
        }
        const merchants: MerchantInput[] = [...byName.entries()].map(([name, { occ, sum }]) => ({
          name,
          occurrences: occ,
          monthlyEstimate: sum / months,
          isRecurring: occ >= 2,
        }));

        const result = build({
          account: { name: "Compte", bank: "Qonto", balance: 0 },
          windowLabel: { fr: `${windowDays} j`, en: `${windowDays} days` },
          txs,
          verdicts: categorizeByRules(merchants),
          windowDays,
          source: "mock",
          categorized: "rules",
        });

        const summary = {
          totals: result.totals,
          natures: result.natures,
          tvaPerdue: result.tvaPerdue ?? null,
          levers: result.levers.map((l) => ({
            label: l.label,
            to: l.to,
            savingMonthly: l.saving,
            savingYearly: l.saving * 12,
            action: l.action,
            hausse: l.hausse ?? null,
          })),
        };
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      },
    );
  }
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Rate-limit best-effort par IP, adossé au KV WAITLIST (fenêtre glissante).
 * Pas d'IP (dev local, appel interne) → on ne bloque pas. TTL KV mini = 60 s.
 * Objectif : empêcher le spam de /waitlist (pollution KV) et les floods sur /mcp,
 * sans casser le positionnement « /mcp appelable par n'importe quel client ».
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

// --- Garde DoS de POST /mcp ------------------------------------------------
// La couche HTTP de McpAgent (agents) ne passe PAS par le transport du SDK MCP :
// les limites du SDK >= 1.32 (taille de corps, longueur de lot) ne s'y
// appliquent donc pas. Constaté en local : un lot de 5 000 messages était
// accepté, et un corps « chunked » de 6 Mo sans Content-Length contournait la
// limite de 4 Mo d'agents et faisait tomber le Durable Object (SQLITE_TOOBIG).
// Même patron que web/lib/engine/handler.ts : on borne AVANT tout parse.

/** 5 000 transactions ≈ 700 Ko ; reste sous la limite de 2 Mo par valeur SQLite des Durable Objects. */
const MCP_MAX_BODY_BYTES = 1_048_576;
/** Longueur max d'un lot JSON-RPC (même seuil que le transport du SDK MCP >= 1.32). */
const MCP_MAX_BATCH = 100;

function mcpReject(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32600, message } },
    { status, headers: CORS },
  );
}

/**
 * Lit le corps d'un POST /mcp avec un plafond (y compris sans Content-Length),
 * refuse les lots JSON-RPC trop longs, puis rend une requête équivalente portant
 * le corps déjà lu. Une `Response` = refus à renvoyer tel quel.
 */
async function guardMcpPost(request: Request): Promise<Request | Response> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MCP_MAX_BODY_BYTES) {
    return mcpReject(413, "Request body too large");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MCP_MAX_BODY_BYTES) {
        await reader.cancel();
        return mcpReject(413, "Request body too large");
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (Array.isArray(parsed) && parsed.length > MCP_MAX_BATCH) {
      return mcpReject(400, `Batch too large (max ${MCP_MAX_BATCH} messages)`);
    }
  } catch {
    // JSON invalide : McpAgent renverra son erreur de parse habituelle.
  }

  const headers = new Headers(request.headers);
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  return new Request(request, { headers, body });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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
      // Liste d'attente Business ET demandes de démo cabinets (kind = "partner").
      const parsed = parseWaitlistBody(await request.json().catch(() => null));
      if (!parsed.ok) {
        return Response.json({ ok: false, error: parsed.error }, { status: 400, headers: CORS });
      }
      if ("bot" in parsed) return Response.json({ ok: true }, { headers: CORS });
      await env.WAITLIST.put(
        parsed.key,
        JSON.stringify({ ...parsed.entry, at: new Date().toISOString() }),
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
      return new Response("Kerdaxis MCP — Streamable HTTP sur POST /mcp · POST /waitlist");
    }
    if (url.pathname.startsWith("/mcp")) {
      // Anti-flood : 120 requêtes max par IP et par minute (généreux pour un
      // vrai client MCP, bloque les abus). L'endpoint reste sans auth.
      const mcpIp = request.headers.get("CF-Connecting-IP") || "";
      if (!(await rateLimit(env, "mcp", mcpIp, 120, 60))) {
        return new Response("Too Many Requests", { status: 429, headers: CORS });
      }
      if (request.method === "POST") {
        const guarded = await guardMcpPost(request);
        if (guarded instanceof Response) return guarded;
        request = guarded;
      }
      return ArgentierMCP.serve("/mcp", { binding: "ArgentierMCP" }).fetch(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  },
};
