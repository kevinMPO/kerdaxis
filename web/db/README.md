# Database: multi-tenant base (Cloudflare D1)

This folder holds Kerdaxis's **SQL schema**. The typed access layer that uses it is
[`../lib/db/tenant.ts`](../lib/db/tenant.ts); its tests are in
[`../lib/db/__tests__/tenant.test.ts`](../lib/db/__tests__/tenant.test.ts).

| File | Role |
|---|---|
| `0001_init.sql` | Initial migration: `organizations`, `decisions`, `audit_log` and their indexes. |
| `0002_accounts_executions.sql` | Kerdaxis accounts (`accounts`), trial sign-ups (`leads`), agent approvals and executions (`exec_records`). |
| `0003_market_benchmarks.sql` | 30-day cache of public prices (Linkup + Holo). Public web only, no `org_id`. |
| `0004_demo_results.sql` | Today's result of the public demo (fictional statement), shared between isolates. |
| `0005_cancel_channels.sql` | 30-day cache of "can this supplier be cancelled online?" (Linkup). Public web only, no `org_id`. |

Every migration is idempotent (`CREATE TABLE / CREATE INDEX IF NOT EXISTS`, no `DROP`).

## What the schema guarantees

- **Tenant data is isolated by `org_id`.** Every table that holds a tenant's data carries an
  `org_id`. Every function in `tenant.ts` takes `orgId` as its first business parameter and puts it
  in its `WHERE` clause: no query can cross two organizations. The caches (`market_benchmarks`,
  `cancel_channels`, `demo_results`) hold only public web or fictional data, so they are shared.
- **The database computes no euro.** Amounts arrive already computed by `lib/engine/` (project
  rule 2). No view, no trigger, no generated column that would derive an amount.
- **The state machine is enforced by the database**, not only by the code:
  `CHECK (statut IN ('approuve', 'refuse', 'prouve'))`. The real flow is
  `approuve | refuse` → `prouve` (terminal state, reached when the D+30 proof is observed).
- **`audit_log` is immutable**: `tenant.ts` exposes neither `UPDATE` nor `DELETE` on it. It is the
  "who read what, when, with what outcome" log a CFO asks for.
- **Timestamps**: integers are epoch **milliseconds UTC** (`Date.now()`). Only `source_date` is an
  ISO `YYYY-MM-DD` string (publication date of a price's source, rule 4).

## 1. Create the database

Run every command **from `web/`** (that is where `wrangler.jsonc` lives). `--location weur` keeps
the data in Europe. The production database is named `argentier`.

```bash
cd web
npx wrangler d1 create argentier --location weur
```

Wrangler prints the `database_id`. The block is **already** in `web/wrangler.jsonc`; replace the id
with the one printed above:

```jsonc
"d1_databases": [
  {
    "binding": "ARGENTIER_DB",
    "database_name": "argentier",
    "database_id": "<uuid printed above>"
  }
]
```

The binding is named `ARGENTIER_DB`: it is the name under which the Worker receives the
`D1Database` object. `lib/runtime/bindings.ts` looks it up and returns `null` when it does not
exist (`next dev`, tests). In that case the analysis works, but nothing is logged.

## 2. Apply the migrations

Locally (the `wrangler dev` SQLite database, in `.wrangler/state`), then in production (remote D1),
in order:

```bash
cd web
for f in db/000*.sql; do npx wrangler d1 execute argentier --local  --file="./$f"; done
for f in db/000*.sql; do npx wrangler d1 execute argentier --remote --file="./$f"; done
```

Replaying a migration on an up-to-date database does nothing and destroys no data.

Without `market_benchmarks` or `cancel_channels`, benchmarks and cancel-channel checks still work:
the cache stays silent and every lookup goes back to the web.

> In-app variant: `applyMigrations(db)` in `lib/db/tenant.ts` runs `0001_init.sql` from the Worker
> (the file is embedded as a constant, since a Worker has no file system at runtime; a test forbids
> any drift between the constant and the file). Useful to bootstrap a test or preview database
> without the CLI. Later migrations are applied with the CLI.

## 3. Check

```bash
cd web
# Are the tables there?
npx wrangler d1 execute argentier --remote \
  --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"

# The indexes?
npx wrangler d1 execute argentier --remote \
  --command "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'"

# Is the state machine CHECK in place?
npx wrangler d1 execute argentier --remote \
  --command "SELECT sql FROM sqlite_master WHERE name = 'decisions'"
```

Replace `--remote` with `--local` to query the development database.

## 4. Add a migration later

1. Create `db/000N_<topic>.sql` with idempotent, **non-destructive** statements only (SQLite cannot
   drop a column cleanly: prefer adding a nullable column).
2. Add it to the table at the top of this file.
3. Apply it with the commands of step 2, locally **then** remotely.

## If something goes wrong

D1 keeps a 30-day history (Time Travel):

```bash
cd web
npx wrangler d1 time-travel info argentier
npx wrangler d1 time-travel restore argentier --timestamp <ISO 8601>
```

## Tests

The tests open **no** real database: they plug in a fake `D1Database` that records the emitted SQL
and evaluates the subset of SQL that `tenant.ts` produces. They fail loudly if `org_id` isolation
disappears from a `WHERE`, if a value is concatenated into an SQL string, or if the status `CHECK`
leaves the migration.

```bash
cd web
npx vitest run lib/db/__tests__/tenant.test.ts
```
