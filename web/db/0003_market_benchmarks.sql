-- ---------------------------------------------------------------------------
-- Migration 0003: cache des benchmarks de prix publics (Linkup + extraction Holo).
-- Cible : Cloudflare D1 (SQLite). Idempotente (IF NOT EXISTS, aucun DROP).
--
-- Pourquoi : chaque levier switch / downgrade / renegotiate attend un prix du
-- marché. Sans cache, chaque audit relance une recherche web facturée par
-- marchand. Les prix publics bougent lentement : un relevé vaut 30 jours.
--
-- Aucune donnée de locataire : la clé est (marchand nettoyé, catégorie, langue),
-- le contenu est du web public. La table est donc partagée entre organisations
-- et ne porte volontairement pas d'org_id. Aucun montant du client n'y entre.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_benchmarks (
  cache_key   TEXT PRIMARY KEY,           -- "marchand|catégorie|langue", en minuscules
  merchant    TEXT NOT NULL,              -- nom nettoyé par sanitizeMerchantQuery
  category    TEXT NOT NULL,
  lang        TEXT NOT NULL,
  result_json TEXT NOT NULL,              -- BenchmarkResult sérialisé (sources + dates)
  checked_at  TEXT NOT NULL,              -- AAAA-MM-JJ du relevé (règle 4)
  created_at  INTEGER NOT NULL,           -- epoch ms UTC
  updated_at  INTEGER NOT NULL,           -- epoch ms UTC
  expires_at  INTEGER NOT NULL            -- epoch ms UTC
);

CREATE INDEX IF NOT EXISTS idx_market_benchmarks_expires ON market_benchmarks (expires_at);
