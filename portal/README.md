# Demo supplier portal: "Nuvio CRM" (fictional)

A **fictional** supplier used by the Kerdaxis demo. An H Company computer-use agent signs in, goes
all the way to the cancellation, declines the retention offer, stops before the irreversible click
(human approval in Kerdaxis), then confirms. The portal is also the **verifier**: Kerdaxis reads
`/api/state` to prove the cancellation is really recorded (the agent's word is never enough).

- TypeScript Cloudflare Worker with no framework, server-rendered HTML, no JavaScript.
- State in a **SQLite Durable Object** (`PortalState`), one instance per account (id derived from
  `acme`), strongly consistent.
- Append-only supplier log (`events`): sign-in, page views, offer shown / accepted / declined,
  confirmation, reset.

## Run locally

```bash
cd portal
npm install
cp .dev.vars.example .dev.vars   # then set random values (openssl rand -hex 32)
npm run typecheck
npm run dev                      # wrangler dev --port 8790 → http://localhost:8790
npm run smoke                    # in a second terminal: full path + API (resets acme)
```

Agent sign-in link: `http://localhost:8790/login?token=<DEMO_LOGIN_TOKEN>`.
On http://localhost the session cookie has no `Secure` attribute (set automatically over HTTPS).

## Environment variables (secrets)

| Name | Role |
|---|---|
| `DEMO_LOGIN_TOKEN` | Token of the magic link `/login?token=…` (given to the agent). Also signs the session cookie. |
| `PORTAL_API_KEY` | Key of the server-to-server API, `x-portal-key` header (stays on the Kerdaxis server). |

Locally: `.dev.vars` (ignored by git). Without `PORTAL_API_KEY`, the API answers 503. Without
`DEMO_LOGIN_TOKEN`, nobody can sign in.

## Path

`/login?token=…` → `/account` → `/billing` → `/billing/subscription` → `/cancel` (reason) →
`/cancel/offer` ("Accept the offer" or "No thanks, continue cancelling") →
`/cancel/confirm` ("I understand…" checkbox + "Confirm cancellation") → `/cancel/done` (`NUV-XXXXXX`).

The portal is served in English or French (`PORTAL_LANG` on the Kerdaxis side picks the language
given to the agent).

## API (JSON, `x-portal-key` header required, otherwise 401)

```bash
curl -H "x-portal-key: $PORTAL_API_KEY" "$BASE/api/state?account=acme"
curl -X POST -H "x-portal-key: $PORTAL_API_KEY" -H 'content-type: application/json' \
     -d '{"account":"acme"}' "$BASE/api/reset"                       # back to active, keeps the log
curl -X POST -H "x-portal-key: $PORTAL_API_KEY" -H 'content-type: application/json' \
     -d '{"account":"acme","enabled":true}' "$BASE/api/injection"    # prompt-injection paragraph on/off
curl "$BASE/health"                                                  # ok (no key)
```

Cancellation proof on the Kerdaxis side: `status == "cancelled"`, a `confirmation_number` equal to
the one the agent read, and a `cancel_confirmed` event (with `offer_declined` before it).
Reset does not change `injection`.

## Deploy

Production runs at `portal.kerdaxis.com`.

```bash
npx wrangler login
npx wrangler secret put DEMO_LOGIN_TOKEN
npx wrangler secret put PORTAL_API_KEY
npx wrangler deploy
BASE=https://portal.kerdaxis.com DEMO_LOGIN_TOKEN=… PORTAL_API_KEY=… npm run smoke
```

Do not run the smoke test during a live demo: it resets the `acme` account.
