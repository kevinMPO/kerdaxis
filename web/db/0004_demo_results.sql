-- ---------------------------------------------------------------------------
-- Migration 0004: résultat du jour de la démo publique, partagé entre isolats.
-- Cible : Cloudflare D1 (SQLite). Idempotente (IF NOT EXISTS, aucun DROP).
--
-- Pourquoi : la démo passe dans le vrai pipeline (catégorisation Holo, 30 à
-- 40 s). Gardé seulement en mémoire, chaque nouvel isolat Cloudflare refaisait
-- attendre un visiteur. Une ligne par jour : le relevé fictif glisse chaque jour.
--
-- Aucune donnée réelle : la démo est un relevé fictif, sans compte ni visiteur.
-- Seul un résultat catégorisé par Holo est stocké ; un repli sur les règles
-- reste en mémoire pour retenter Holo vite.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS demo_results (
  day         TEXT PRIMARY KEY,           -- AAAA-MM-JJ (UTC) du relevé fictif
  result_json TEXT NOT NULL,              -- AnalyzeResult sérialisé
  created_at  INTEGER NOT NULL,           -- epoch ms UTC
  updated_at  INTEGER NOT NULL            -- epoch ms UTC
);
