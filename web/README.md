# Kerdaxis app (`web/`)

The Next.js app behind `app.kerdaxis.com`. It reads a company's Qonto account **read-only**,
splits spending into four natures (controllable / structural / one-off / personal), computes
what can be recovered, and turns it into actions: a cancellation run by an H Company agent that
stops before the final click, or a letter the human sends.

The project overview, the final-click gate and the architecture diagram are in the
[root README](../README.md). This file covers the app itself.

## The non-negotiable principle

> **The LLM labels, the engine counts.** H Company Holo labels each merchant (nature, pole,
> action). Every euro amount is computed by the deterministic engine. The LLM never multiplies.

```
Qonto (read-only) ─┐
                   ├─▶ lib/analysis/pipeline.ts ─▶ categorize.ts (Holo: labels) ─▶ lib/engine (€) ─▶ /api/analyze ─▶ dashboard
Demo (fictional) ──┘     same path for both          rules as fallback              core.ts            app/api/analyze    app/dashboard/
  lib/demo/transactions.ts

"Verify prices" (on consent):
pending lever (0 €) ─▶ D1 cache 30 d ─▶ Linkup (2 questions) ─▶ Holo (sourced prices) ─▶ [fallback] H web-scraper-flash ─▶ engine/pricing.ts (€)
                        benchmark-cache.ts  lib/benchmark.ts                          lib/benchmark-scraper.ts         seats from the amount paid
```

The public demo goes through the same pipeline on a fictional statement: no figure is written
by hand.

A `switch` / `downgrade` / `renegotiate` lever leaves the engine at **0 €** (`pending`). Its saving
only exists with a public price that has a source and a date (rule 4): `sourced`, otherwise
`unverified` with the reason. The `h/web-scraper-flash` fallback (an H Company pre-built agent, text
browser) only runs when extraction found no priced plan for the current supplier: it reads the
official pricing page, keeps a price only if the page is on the merchant's domain and in euros, and
dividing a yearly total by 12 is done by the code.

The same consent click also checks whether a cancellation can be done online
(`/api/cancel-channel`, Linkup on the supplier's official docs, cached 30 days). Online: the H
Company agent can run it. Offline or unverified: a letter.

### Qonto connection: OAuth per visitor

Each visitor connects **their own** account (`/api/auth/qonto/start` → Qonto consent →
`/api/auth/qonto/callback`). Tokens are encrypted (AES-GCM) in KV, the session is a signed cookie
that only holds an opaque tenant id, and `/api/auth/qonto/revoke` disconnects everything.

> ⚠️ Qonto's authorization server **ignores** the `scope` parameter and issues a token with
> **write** rights that cannot be refused (checked by hand, see `lib/auth/providers.ts`). Kerdaxis's
> read-only guarantee therefore does NOT come from the token: it comes from the **application
> allowlist** (`lib/mcp/readonly-guard.ts`), checked before every network call. It is a first-class
> security boundary, covered by tests including a repository-wide invariant (see below). The day
> Qonto issues a dedicated `.read` OAuth client, switching is an environment variable
> (`QONTO_OAUTH_PROVIDER=direct-readonly`), not a rewrite.

## Files

| File | Role |
|---|---|
| `lib/types.ts` | The API contract between front and back. |
| `lib/auth/providers.ts` | Authorization server descriptions (the only provider-specific place). |
| `lib/auth/pkce.ts` · `oauth-client.ts` | PKCE S256 and a generic OAuth 2.1 public client. |
| `lib/auth/crypto.ts` · `token-store.ts` | AES-GCM token encryption and KV storage. In-memory fallback in dev **only**: in production, a missing binding is refused. |
| `lib/auth/session.ts` · `access.ts` | Signed (HMAC) session cookie and transparent token refresh. |
| `lib/mcp/readonly-guard.ts` | **Read-only allowlist**: method + path, deny by default. |
| `lib/mcp/qonto-read-client.ts` | Token-authenticated Qonto client: one filtered network exit. |
| `lib/privacy/egress.ts` | Anti-PII filter: `assertNoPii` before every outgoing `fetch` (rule 3). |
| `lib/privacy/access-log.ts` | Log of every third-party call (who, what, when, outcome). |
| `lib/db/tenant.ts` · `db/` | Multi-tenant D1 layer and migrations (see [`db/README.md`](db/README.md)). |
| `lib/llm/holo.ts` | H Company Models API client: the only LLM the app calls. |
| `lib/categorize.ts` | Holo categorization with keyword rules as fallback, EI classification (PRO / PERSO / A-CLARIFIER). |
| `lib/engine/core.ts` | Deterministic engine: natures, run-rate, poles, score, runway, levers, anomalies, risk. |
| `lib/engine/pricing.ts` | Sourced prices → saving (seats deduced, switch / downgrade / renegotiate). |
| `lib/analysis/pipeline.ts` | One pipeline for the real account and the demo: categorize, then engine. |
| `lib/demo/` | The FICTIONAL statement of the public demo (transactions only), labelled by keyword rules, never by Holo. |
| `lib/benchmark.ts` · `benchmark-cache.ts` | Linkup public prices + Holo extraction, 30-day D1 cache. |
| `lib/benchmark-scraper.ts` | Fallback: the H `web-scraper-flash` agent reads the official pricing page. |
| `lib/execution/` | Human gate (`policy.ts`), H Company runner (`runner.ts`), trial replay, suppliers, Stripe portal. |
| `lib/execution/research/` | Path research before a run (Linkup, H screenshot reading, Gladia), the check of the documented path against the agent's log (`compare.ts`), and the cancel channel check. |
| `lib/execution/run-copy.ts` | Every sentence of a run log, in the language the run was launched in. |
| `lib/lever-text.ts` | A lever's name and text on screen, in the interface language. |
| `lib/risk/` | Supplier risk agent: identity, finances, BODACC, Linkup signals; the engine scores, Holo explains. |
| `lib/letters.ts` | Cancellation / renegotiation letters by Holo, with a template fallback. |
| `lib/export.ts` | Plan export as CSV (Excel FR). |
| `app/api/analyze/route.ts` | OBSERVE → CATEGORIZE → COMPUTE (OAuth session, otherwise demo, never someone else's account). |
| `app/api/auth/qonto/*` | OAuth flow: `start`, `callback`, `revoke`, `status`. |
| `app/api/benchmark/route.ts` · `cancel-channel/route.ts` | On consent: verify prices, and whether a cancellation can be done online. |
| `app/api/letter/route.ts` | Prepares a ready-to-send letter for a lever. |
| `app/api/execution/*` | Approve, start, status, final go, stop, screenshot, reset of an agent run. |
| `app/dashboard/` | The dashboard served at `/demo`. |
| `app/Kerdaxis.tsx` | The classic dashboard, served at `/classic`. |
| `app/rapport/page.tsx` | Printable report (→ PDF through printing). |
| `middleware.ts` | Access levels (trial, subscriber, test) and internal headers. |

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: fill in the keys
npm run dev                  # http://localhost:3000
```

**Without keys**, the app runs the demo on a fictional statement, categorized by keyword rules.
**With keys** (`.env.local`, every variable is documented in `.env.example`), it analyses a real account:

```env
HAI_API_KEY=...                       # H Company: agent + Holo (labels, letters, prices, risk)
LINKUP_API_KEY=...                    # public prices, cancel channels, path research

# Visitor OAuth connection: the ONLY way to a real account
QONTO_OAUTH_PROVIDER=mcp-proxy        # or direct-readonly, once a dedicated client exists
ARGENTIER_BASE_URL=http://localhost:3000
ARGENTIER_TOKEN_KEY=...               # 32 bytes base64: encrypts tokens at rest
ARGENTIER_SESSION_SECRET=...          # 32 characters min: signs the session cookie
```

Generate both secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Production: Cloudflare Workers, and two required bindings

Production runs on **Cloudflare Workers** (OpenNext + `wrangler.jsonc`). Two bindings are
provisioned there, and they are not optional:

| Binding | Type | Role | Without it, in production |
|---|---|---|---|
| `ARGENTIER_TOKENS` | KV | OAuth tokens encrypted with AES-GCM, TTL set on the refresh token | **refused** (`BindingManquantError`) |
| `ARGENTIER_DB` | D1 (`weur`) | Multi-tenant base: organizations, decisions, `audit_log`, accounts, executions, and two caches (prices and cancel channels, 30 days each) (see [`db/README.md`](db/README.md)) | **refused** (`BindingManquantError`); the caches stay silent without their table |

Outside production (`next dev`, tests), their absence is tolerated: tokens in process memory, no
log. In production it **throws**, and `/api/analyze` answers `503 configuration_incomplete`. This
is not rigidity for its own sake: a bank token carrying `request_transfers.write`, kept in clear in
a function's heap, with no expiry and no revocation across instances, is not a "degraded mode". A
bank read with no trace is exactly what a CFO pays us to prevent. The
`ARGENTIER_ALLOW_DEGRADED_BINDINGS=1` escape hatch exists for a local build, never to serve traffic.

Deploys start from `main`: every push with green CI is deployed by
`.github/workflows/deploy-web.yml` (Worker secrets check, OpenNext build, `wrangler deploy`, smoke
test). D1 migrations are not part of the deploy: they are applied by hand (see
[`db/README.md`](db/README.md)). The manual equivalent of the deploy is:

```bash
npm run cf:deploy             # OpenNext build, then wrangler deploy
```

### What was REMOVED, and must not come back

The Qonto client using a **static API key** (`lib/qonto.ts`, and the `QONTO_LOGIN` /
`QONTO_SECRET_KEY` / `QONTO_IBAN` variables) is **deleted**. One key, the founder's, was shared by
every visitor and carried full **write** rights. It caused two separate defects:

1. **Cross-tenant leak.** `/api/analyze` chained the sources without telling "no visitor" apart
   from "known visitor whose token is gone". An OAuth client whose token vanished (cookie still
   valid, refresh refused, KV emptied) fell back on that key unconditionally and received the
   founder's **real** bank account, badged "live". Now a session with no usable token gets a
   **401 `qonto_reconnexion_requise`**, never someone else's data. The **anonymous** visitor keeps
   the demo (`/demo` works without any key), badged `source: "mock"`.
2. **Network exit outside the guard.** That client called `fetch` without going through
   `assertReadOnly`, that is, around the only boundary that stops Kerdaxis from moving money. The
   invariant is now **checked repository-wide** by `lib/mcp/__tests__/invariant-fetch-qonto.test.ts`:
   any module in `lib/` or `app/` that calls `fetch` on a Qonto host must import *and* call the
   guard, or the test fails. The same test fails if `QONTO_LOGIN` reappears in the code.

If these variables are still set in a deployment environment, **remove them** on the host side:
they are no longer read, but a write-capable key left in a secret store can still be exfiltrated.

Checks:

```bash
npm run typecheck
npm test
npm run build
```

## What Kerdaxis does NOT do

- No banking action: no payment, no transfer, no card operation. Qonto is read-only.
- No irreversible click by the agent alone: every cancellation stops before the final button and
  waits for a human go in the interface. Letters are prepared, never sent automatically.
- No data used to train a model. Processing in Europe.
- Tax hints are leads to check with an accountant.

## Language model

Every LLM call in the app goes to an H Company Holo model (`holo4-27b` by default, `HAI_LLM_MODEL`)
through H's Models API, with the same `HAI_API_KEY` as the agent (`lib/llm/holo.ts`). Four uses:

| Use | Output | Without a key or on failure |
|---|---|---|
| Categorization (`/api/analyze`) | labels, JSON schema + Zod | keyword rules |
| Letters (`/api/letter`) | text | FR/EN template |
| Benchmark, pass 2 (`/api/benchmark`) | prices extracted from the Linkup text, each tied to a source, JSON schema + Zod | sourced summary, no structured prices |
| Supplier risk (`/api/risk`) | sourced signals (JSON schema + Zod) and a text analysis | score on identity + finances + BODACC, deterministic text |

The LLM never returns a euro or a score. Web search is done by Linkup: without `LINKUP_API_KEY`,
benchmarks stay "not verified" and every cancellation goes to a letter, except on the demo
portals (Nuvio, Lumen), which are known to be online.

Outside the Models API, the same `HAI_API_KEY` also drives three agents of H's Agents API: the
cancellation agent (visual browser, `lib/execution/runner.ts`), the reader of help-article
screenshots (`lib/execution/research/screenshots.ts`) and the pre-built `h/web-scraper-flash`
agent, pass 3 of the benchmark (`lib/benchmark-scraper.ts`).
