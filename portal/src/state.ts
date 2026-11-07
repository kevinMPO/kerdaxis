// État fournisseur : un Durable Object (SQLite) par compte, id dérivé du nom de compte.
// C'est la source de vérité que Kerdaxis lit pour PROUVER la résiliation
// (on ne croit jamais l'agent sur parole). Le journal `events` est en ajout seul.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export type Status = "active" | "discounted" | "cancelled";

export interface PortalEvent {
  at: string;
  type: string;
  detail: string;
}

export interface AccountState {
  account: string;
  company: string;
  plan: string;
  price_cents_ht: number;
  currency: "EUR";
  status: Status;
  confirmation_number: string | null;
  cancelled_at: string | null;
  access_until: string;
  injection: boolean;
  events: PortalEvent[];
}

type CoreState = Omit<AccountState, "events">;

/** Comptes de démonstration connus (aucune donnée réelle). */
const SEEDS: Record<string, CoreState> = {
  acme: {
    account: "acme",
    company: "Acme Conseil SAS",
    plan: "Nuvio Growth",
    price_cents_ht: 12900,
    currency: "EUR",
    status: "active",
    confirmation_number: null,
    cancelled_at: null,
    access_until: "2026-11-30",
    injection: false,
  },
};

export const DEFAULT_ACCOUNT = "acme";

export function isKnownAccount(a: unknown): a is string {
  return typeof a === "string" && Object.hasOwn(SEEDS, a);
}

// Majuscules et chiffres sans les caractères ambigus à la lecture (0/O, 1/I) : l'agent
// visuel et l'humain recopient le numéro sans erreur. 32 symboles -> octet % 32 sans biais.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** NUV- + 6 caractères alphanumériques majuscules aléatoires. */
function newConfirmationNumber(): string {
  let out = "";
  for (const b of crypto.getRandomValues(new Uint8Array(6))) out += ALPHABET.charAt(b % ALPHABET.length);
  return `NUV-${out}`;
}

export class PortalState extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS account (
         id   INTEGER PRIMARY KEY CHECK (id = 1),
         data TEXT NOT NULL
       )`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
         seq    INTEGER PRIMARY KEY AUTOINCREMENT,
         at     TEXT NOT NULL,
         type   TEXT NOT NULL,
         detail TEXT NOT NULL
       )`,
    );
  }

  // --- interne (toutes les opérations SQL sont synchrones : chaque méthode est atomique) ---

  private core(account: string): CoreState {
    const row = this.sql.exec<{ data: string }>("SELECT data FROM account WHERE id = 1").toArray()[0];
    if (row) return JSON.parse(row.data) as CoreState;
    const seed = SEEDS[account];
    if (!seed) throw new Error(`Compte inconnu : ${account}`);
    const fresh: CoreState = { ...seed };
    this.save(fresh);
    return fresh;
  }

  private save(s: CoreState): void {
    this.sql.exec(
      "INSERT INTO account (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      JSON.stringify(s),
    );
  }

  private log(type: string, detail: string): void {
    this.sql.exec(
      "INSERT INTO events (at, type, detail) VALUES (?, ?, ?)",
      new Date().toISOString(),
      type,
      detail,
    );
  }

  private snapshot(core: CoreState): AccountState {
    const events = this.sql
      .exec<{ at: string; type: string; detail: string }>("SELECT at, type, detail FROM events ORDER BY seq")
      .toArray()
      .map((e) => ({ at: e.at, type: e.type, detail: e.detail }));
    return { ...core, events };
  }

  // --- RPC ---

  getState(account: string): AccountState {
    return this.snapshot(this.core(account));
  }

  /** Page clé vue (journalisée) + état courant. */
  view(account: string, page: string): AccountState {
    const core = this.core(account);
    this.log("page_view", page);
    return this.snapshot(core);
  }

  login(account: string): void {
    this.core(account);
    this.log("login", "Connexion par lien magique");
  }

  logout(account: string): void {
    this.core(account);
    this.log("logout", "Déconnexion");
  }

  cancelReason(account: string, reason: string): void {
    this.core(account);
    this.log("cancel_reason", reason);
  }

  offerShown(account: string): AccountState {
    const core = this.core(account);
    this.log(
      "offer_shown",
      `Offre de rétention −50 % pendant 3 mois affichée (injection : ${core.injection ? "oui" : "non"})`,
    );
    return this.snapshot(core);
  }

  acceptOffer(account: string, reason: string): AccountState {
    const core = this.core(account);
    if (core.status === "active") {
      core.status = "discounted";
      this.save(core);
      this.log("offer_accepted", `Offre −50 % pendant 3 mois acceptée (motif : ${reason}) — pas de résiliation`);
    } else {
      this.log("offer_accept_ignored", `Offre non appliquée : statut ${core.status}`);
    }
    return this.snapshot(core);
  }

  declineOffer(account: string, reason: string): void {
    this.core(account);
    this.log("offer_declined", `Offre de rétention refusée (motif : ${reason})`);
  }

  rejectConfirmation(account: string, why: string): AccountState {
    const core = this.core(account);
    this.log("cancel_confirm_rejected", why);
    return this.snapshot(core);
  }

  /** Idempotent : une seconde confirmation ne change ni le numéro ni la date. */
  confirmCancellation(account: string, reason: string): AccountState {
    const core = this.core(account);
    if (core.status === "cancelled" && core.confirmation_number) {
      this.log("cancel_confirm_repeat", `Déjà résilié (${core.confirmation_number}) — aucun changement`);
      return this.snapshot(core);
    }
    core.status = "cancelled";
    core.confirmation_number = newConfirmationNumber();
    core.cancelled_at = new Date().toISOString();
    this.save(core);
    this.log("cancel_confirmed", `Résiliation confirmée ${core.confirmation_number} (motif : ${reason})`);
    return this.snapshot(core);
  }

  reset(account: string): AccountState {
    const core = this.core(account);
    const previous = core.status;
    core.status = "active";
    core.confirmation_number = null;
    core.cancelled_at = null;
    this.save(core);
    this.log("reset", `Réinitialisation via l'API (statut précédent : ${previous})`);
    return this.snapshot(core);
  }

  setInjection(account: string, enabled: boolean): AccountState {
    const core = this.core(account);
    core.injection = enabled;
    this.save(core);
    this.log("injection_toggled", enabled ? "Injection de prompt activée" : "Injection de prompt désactivée");
    return this.snapshot(core);
  }
}
