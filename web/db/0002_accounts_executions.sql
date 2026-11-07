-- ---------------------------------------------------------------------------
-- Migration 0002 — comptes Kerdaxis, inscriptions à l'essai, exécutions agent.
-- Cible : Cloudflare D1 (SQLite). Idempotente (IF NOT EXISTS, aucun DROP).
--
-- Pourquoi : l'app tournait sur le portable derrière un tunnel, avec les
-- comptes dans data/accounts.json et les exécutions H Company en mémoire du
-- processus. Sur Workers il n'y a ni disque inscriptible ni mémoire partagée
-- entre isolats : ces trois tables les remplacent, même interface côté code.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  subscription_status    TEXT NOT NULL DEFAULT 'none',
  updated_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  email      TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  visits     INTEGER NOT NULL DEFAULT 1
);

-- Accords et exécutions de l'agent navigateur, stockés en JSON (la forme
-- évolue avec le PRD ; le code reste la seule source du schéma).
-- kind ∈ 'approval' | 'execution'. lock_until : verrou d'avance (epoch ms).
CREATE TABLE IF NOT EXISTS exec_records (
  kind       TEXT    NOT NULL CHECK (kind IN ('approval', 'execution')),
  id         TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  lock_until INTEGER,
  PRIMARY KEY (kind, id)
);
