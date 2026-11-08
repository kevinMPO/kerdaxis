// ---------------------------------------------------------------------------
// Validation de POST /waitlist — pure, sans KV, testable seule.
//
// Deux usages, une seule route (pas de nouvelle infrastructure) :
//   - liste d'attente « Business » : { email, lang?, source? } (format historique) ;
//   - demande de démo cabinet comptable : kind = "partner" + name, company, clients?.
// Le champ `website` est un pot de miel : invisible pour un humain, rempli par
// les robots. S'il est rempli, la route répond OK sans rien stocker.
// ---------------------------------------------------------------------------

export type WaitlistKind = "waitlist" | "partner";

export interface WaitlistEntry {
  kind: WaitlistKind;
  email: string;
  lang: string;
  source: string;
  name?: string;
  company?: string;
  clients?: string;
}

export type ParseResult =
  | { ok: true; entry: WaitlistEntry; key: string }
  | { ok: true; bot: true }
  | { ok: false; error: "invalid_email" | "missing_name" | "missing_company" };

/** Tranches proposées par le formulaire partenaires ; toute autre valeur est ignorée. */
export const CLIENT_RANGES = ["1-20", "21-100", "101-500", "500+"] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

export function parseWaitlistBody(body: unknown): ParseResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (text(b.website, 200)) return { ok: true, bot: true };

  const email = text(b.email, 200).toLowerCase();
  if (email.length < 5 || !EMAIL.test(email)) return { ok: false, error: "invalid_email" };

  const lang = text(b.lang, 5);
  const source = text(b.source, 40);
  if (b.kind !== "partner") {
    return { ok: true, key: `wl:${email}`, entry: { kind: "waitlist", email, lang, source } };
  }

  const name = text(b.name, 100);
  const company = text(b.company, 120);
  if (!name) return { ok: false, error: "missing_name" };
  if (!company) return { ok: false, error: "missing_company" };
  const raw = text(b.clients, 10);
  const clients = (CLIENT_RANGES as readonly string[]).includes(raw) ? raw : undefined;
  return {
    ok: true,
    // Préfixe distinct : une demande cabinet n'écrase jamais une inscription liste d'attente.
    key: `partner:${email}`,
    entry: { kind: "partner", email, lang, source, name, company, ...(clients ? { clients } : {}) },
  };
}
