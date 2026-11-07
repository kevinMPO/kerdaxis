// ---------------------------------------------------------------------------
// Comptes et inscriptions à l'essai.
//   - Cloudflare Workers : tables D1 `accounts` / `leads` (db/0002_*.sql) ;
//   - `next dev` sans binding : fichiers JSON locaux (data/), écriture atomique
//     (tmp + rename), une écriture à la fois.
// Même interface dans les deux cas : les routes ne savent pas où ça vit.
// Mots de passe : scrypt + sel aléatoire, jamais stockés en clair.
// Node uniquement (fs, crypto).
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { baseD1SiPresente } from "@/lib/runtime/bindings";
import type { D1Database } from "@/lib/db/tenant";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const DIR = path.join(process.cwd(), "data");
const ACCOUNTS = path.join(DIR, "accounts.json");
const LEADS = path.join(DIR, "leads.json");

export type SubscriptionStatus = "none" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | string;

export interface Account {
  id: string;
  email: string;
  passwordHash: string; // scrypt$<salt b64>$<hash b64>
  createdAt: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  updatedAt: string;
}

export interface Lead {
  email: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
}

let chain: Promise<unknown> = Promise.resolve();
/** Sérialise les écritures (lecture-modification-écriture) dans le processus. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, s, h] = stored.split("$");
  if (algo !== "scrypt" || !s || !h) return false;
  const expected = Buffer.from(h, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// --- D1 -------------------------------------------------------------------

const COLS = "id, email, password_hash, created_at, stripe_customer_id, stripe_subscription_id, subscription_status, updated_at";

function rowToAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.password_hash),
    createdAt: String(r.created_at),
    stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (r.stripe_subscription_id as string | null) ?? null,
    subscriptionStatus: String(r.subscription_status ?? "none"),
    updatedAt: String(r.updated_at),
  };
}

async function d1Find(d: D1Database, where: "email" | "id", v: string): Promise<Account | null> {
  const r = await d.prepare(`SELECT ${COLS} FROM accounts WHERE ${where} = ?`).bind(v).first();
  return r ? rowToAccount(r) : null;
}

const PATCH_COLS: Record<string, string> = {
  stripeCustomerId: "stripe_customer_id",
  stripeSubscriptionId: "stripe_subscription_id",
  subscriptionStatus: "subscription_status",
};

// --- Interface -------------------------------------------------------------

export async function findAccount(email: string): Promise<Account | null> {
  const d = baseD1SiPresente();
  if (d) return d1Find(d, "email", email);
  const all = await readJson<Account[]>(ACCOUNTS, []);
  return all.find((a) => a.email === email) ?? null;
}

export async function createAccount(email: string, password: string): Promise<Account> {
  const passwordHash = await hashPassword(password);
  const d = baseD1SiPresente();
  if (d) {
    const now = new Date().toISOString();
    const acc: Account = {
      id: randomUUID(), email, passwordHash, createdAt: now,
      stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: "none", updatedAt: now,
    };
    const res = await d
      .prepare(`INSERT OR IGNORE INTO accounts (${COLS}) VALUES (?, ?, ?, ?, NULL, NULL, 'none', ?)`)
      .bind(acc.id, email, passwordHash, now, now)
      .run();
    if (!res.meta?.changes) throw new Error("account_exists");
    return acc;
  }
  return serial(async () => {
    const all = await readJson<Account[]>(ACCOUNTS, []);
    if (all.some((a) => a.email === email)) throw new Error("account_exists");
    const now = new Date().toISOString();
    const acc: Account = {
      id: randomUUID(),
      email,
      passwordHash,
      createdAt: now,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: "none",
      updatedAt: now,
    };
    all.push(acc);
    await writeJson(ACCOUNTS, all);
    return acc;
  });
}

export async function updateAccount(id: string, patch: Partial<Omit<Account, "id" | "email" | "passwordHash" | "createdAt">>): Promise<Account | null> {
  const d = baseD1SiPresente();
  if (d) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const col = PATCH_COLS[k];
      if (col && v !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(v);
      }
    }
    sets.push("updated_at = ?");
    vals.push(new Date().toISOString());
    await d.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
    return d1Find(d, "id", id);
  }
  return serial(async () => {
    const all = await readJson<Account[]>(ACCOUNTS, []);
    const acc = all.find((a) => a.id === id);
    if (!acc) return null;
    Object.assign(acc, patch, { updatedAt: new Date().toISOString() });
    await writeJson(ACCOUNTS, all);
    return acc;
  });
}

export async function getAccountById(id: string): Promise<Account | null> {
  const d = baseD1SiPresente();
  if (d) return d1Find(d, "id", id);
  const all = await readJson<Account[]>(ACCOUNTS, []);
  return all.find((a) => a.id === id) ?? null;
}

export async function recordLead(email: string): Promise<void> {
  const d = baseD1SiPresente();
  if (d) {
    const now = new Date().toISOString();
    await d
      .prepare(
        "INSERT INTO leads (email, first_seen, last_seen, visits) VALUES (?, ?, ?, 1) " +
          "ON CONFLICT(email) DO UPDATE SET last_seen = excluded.last_seen, visits = visits + 1",
      )
      .bind(email, now, now)
      .run();
    return;
  }
  await serial(async () => {
    const all = await readJson<Lead[]>(LEADS, []);
    const now = new Date().toISOString();
    const l = all.find((x) => x.email === email);
    if (l) {
      l.lastSeen = now;
      l.visits += 1;
    } else {
      all.push({ email, firstSeen: now, lastSeen: now, visits: 1 });
    }
    await writeJson(LEADS, all);
  });
}

export function isActive(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}
