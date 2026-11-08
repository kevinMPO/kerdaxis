// ---------------------------------------------------------------------------
// Journal d'accès aux tiers : ce qui a RÉELLEMENT été lu ou envoyé, appel par
// appel. C'est la preuve visible de la règle 3 (« zéro PII vers le web ») dans
// le grand livre du dashboard.
//
// Chaque entrée est écrite au point d'appel réseau, juste après le contrôle
// `assertNoPii`, avec un résumé de ce qui part. Le résumé lui-même repasse par
// `redactForLogs` : le journal ne peut pas devenir une fuite.
//
// Portée : un visiteur ne voit que ses propres appels. La portée est une
// empreinte SHA-256 du cookie de session (jamais le cookie lui-même), portée
// par AsyncLocalStorage depuis la route jusqu'au point d'appel. Sans cookie
// (localhost), la portée est « local ».
//
// Stockage : table D1 `access_log` quand la base est branchée (les isolats
// Workers ne partagent pas leur mémoire), sinon mémoire du processus.
// L'écriture est best-effort : un journal indisponible ne casse jamais l'appel.
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from "node:async_hooks";
import type { D1Database } from "@/lib/db/tenant";
import { baseD1SiPresente } from "@/lib/runtime/bindings";
import { texteVersOctets } from "@/lib/encodage";
import { redactForLogs } from "./egress";

export type AccessService = "qonto" | "anthropic" | "linkup" | "hcompany" | "gladia" | "elevenlabs";

/** `read` : on lit chez le tiers, rien d'autre que l'authentification ne sort. `sent` : une charge utile part. */
export type AccessDirection = "read" | "sent";

export interface AccessEntry {
  id: string;
  at: string;
  service: AccessService;
  operation: string;
  direction: AccessDirection;
  /** Résumé exact de ce qui est sorti, caviardé. `null` pour une lecture. */
  sent: string | null;
}

export interface AccessRecord {
  service: AccessService;
  operation: string;
  direction: AccessDirection;
  sent?: string | null;
}

const LOCAL_SCOPE = "local";
const SESSION_COOKIES = ["kx_session", "kx_test", "argentier_session"] as const;
const SCOPE_HEX_LENGTH = 16;
const MAX_SENT_LENGTH = 240;
const MAX_MEMORY_ENTRIES = 300;
export const ACCESS_LOG_PAGE_SIZE = 40;

const scopeStorage = new AsyncLocalStorage<string>();

interface MemoryLog {
  entries: (AccessEntry & { scope: string })[];
}

const memory: MemoryLog = ((globalThis as { __kxAccessLog?: MemoryLog }).__kxAccessLog ??= { entries: [] });

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/** Empreinte du cookie de session : identifie un visiteur sans jamais stocker son cookie. */
export async function accessScopeFor(req: Request): Promise<string> {
  const header = req.headers.get("cookie");
  const value = SESSION_COOKIES.map((name) => readCookie(header, name)).find((v) => v !== null);
  if (!value) return LOCAL_SCOPE;
  const digest = await crypto.subtle.digest("SHA-256", texteVersOctets(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, SCOPE_HEX_LENGTH);
}

/** Exécute `work` dans la portée du visiteur de `req` : tout appel tiers fait dedans lui est attribué. */
export async function withAccessScope<T>(req: Request, work: () => Promise<T>): Promise<T> {
  const scope = await accessScopeFor(req);
  return scopeStorage.run(scope, work);
}

function currentScope(): string {
  return scopeStorage.getStore() ?? LOCAL_SCOPE;
}

function summarize(sent: string | null | undefined): string | null {
  if (!sent) return null;
  const redacted = String(redactForLogs(sent));
  return redacted.length > MAX_SENT_LENGTH ? `${redacted.slice(0, MAX_SENT_LENGTH - 1)}…` : redacted;
}

let tableReady: Promise<void> | null = null;

function ensureTable(db: D1Database): Promise<void> {
  tableReady ??= db
    .prepare(
      `CREATE TABLE IF NOT EXISTS access_log (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        at TEXT NOT NULL,
        service TEXT NOT NULL,
        operation TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('read', 'sent')),
        sent TEXT
      )`,
    )
    .run()
    .then(() => db.prepare("CREATE INDEX IF NOT EXISTS access_log_scope_at ON access_log (scope, at)").run())
    .then(() => undefined)
    .catch((error: unknown) => {
      tableReady = null;
      throw error;
    });
  return tableReady;
}

/** Note un appel tiers. Ne lève jamais : le journal ne doit pas casser l'appel qu'il décrit. */
export async function recordAccess(record: AccessRecord): Promise<void> {
  const entry: AccessEntry & { scope: string } = {
    id: crypto.randomUUID(),
    scope: currentScope(),
    at: new Date().toISOString(),
    service: record.service,
    operation: record.operation,
    direction: record.direction,
    sent: record.direction === "sent" ? summarize(record.sent) : null,
  };

  memory.entries.push(entry);
  if (memory.entries.length > MAX_MEMORY_ENTRIES) memory.entries.splice(0, memory.entries.length - MAX_MEMORY_ENTRIES);

  const db = baseD1SiPresente();
  if (!db) return;
  try {
    await ensureTable(db);
    await db
      .prepare("INSERT INTO access_log (id, scope, at, service, operation, direction, sent) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(entry.id, entry.scope, entry.at, entry.service, entry.operation, entry.direction, entry.sent)
      .run();
  } catch (error) {
    console.error("[kerdaxis][access-log] write failed", { service: entry.service, operation: entry.operation, error });
  }
}

/** Les derniers appels du visiteur, du plus récent au plus ancien. */
export async function listAccess(scope: string, limit = ACCESS_LOG_PAGE_SIZE): Promise<AccessEntry[]> {
  const db = baseD1SiPresente();
  if (db) {
    try {
      await ensureTable(db);
      const result = await db
        .prepare("SELECT id, at, service, operation, direction, sent FROM access_log WHERE scope = ? ORDER BY at DESC LIMIT ?")
        .bind(scope, limit)
        .all<AccessEntry>();
      return result.results ?? [];
    } catch (error) {
      console.error("[kerdaxis][access-log] read failed", { error });
    }
  }
  return memory.entries
    .filter((e) => e.scope === scope)
    .slice(-limit)
    .reverse()
    .map(({ scope: _scope, ...entry }) => entry);
}
