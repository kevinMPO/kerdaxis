-- ---------------------------------------------------------------------------
-- Migration 0005: cache « résiliable en ligne ? » par fournisseur (Linkup).
-- Cible : Cloudflare D1 (SQLite). Idempotente (IF NOT EXISTS, aucun DROP).
--
-- Pourquoi : la réponse choisit le livrable d'une résiliation (agent H Company
-- si en ligne, lettre sinon). Elle bouge lentement : un relevé vaut 30 jours.
--
-- Aucune donnée de locataire : la clé est le nom nettoyé du fournisseur, le
-- contenu est du web public (canal, URL source, date). Table partagée entre
-- organisations, sans org_id. Les réponses `unknown` ne sont jamais stockées.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cancel_channels (
  merchant_key TEXT PRIMARY KEY,          -- nom nettoyé par sanitizeMerchantQuery, en minuscules
  result_json  TEXT NOT NULL,             -- CancelChannelCheck sérialisé (canal, source, date)
  checked_at   TEXT NOT NULL,             -- AAAA-MM-JJ du relevé (règle 4)
  created_at   INTEGER NOT NULL,          -- epoch ms UTC
  updated_at   INTEGER NOT NULL,          -- epoch ms UTC
  expires_at   INTEGER NOT NULL           -- epoch ms UTC
);

CREATE INDEX IF NOT EXISTS idx_cancel_channels_expires ON cancel_channels (expires_at);
