# Base de données — socle multi-locataire (Cloudflare D1)

Ce dossier contient le **schéma SQL** de Kerdaxis. La couche d'accès typée qui
l'exploite est dans [`../lib/db/tenant.ts`](../lib/db/tenant.ts) ; ses tests
sont dans [`../lib/db/__tests__/tenant.test.ts`](../lib/db/__tests__/tenant.test.ts).

| Fichier | Rôle |
|---|---|
| `0001_init.sql` | Migration initiale : `organizations`, `decisions`, `audit_log` + index. Idempotente. |
| `0002_accounts_executions.sql` | Comptes, inscriptions à l'essai, exécutions agent. Idempotente. |
| `0003_market_benchmarks.sql` | Cache 30 jours des prix publics (Linkup + Holo). Web public uniquement, sans `org_id`. Idempotente. |
| `0004_demo_results.sql` | Résultat du jour de la démo publique (relevé fictif), partagé entre isolats. Idempotente. |

## Ce que le schéma garantit

- **Une ligne = un locataire.** Chaque table métier porte un `org_id`. Toute
  fonction de `tenant.ts` prend `orgId` en premier paramètre métier et l'injecte
  dans sa clause `WHERE` : aucune requête ne peut traverser deux organisations.
- **La base ne calcule aucun euro.** Les montants arrivent déjà calculés par
  `lib/engine.ts` (règle 2 du projet). Pas de vue, pas de trigger, pas de
  colonne générée qui dériverait un montant.
- **La machine à états est contrainte par la base**, pas seulement par le code :
  `CHECK (statut IN ('approuve', 'refuse', 'prouve'))`. Le flux réel est
  `approuve | refuse` → `prouve` (état terminal, atteint quand la preuve J+30
  est constatée).
- **`audit_log` est immuable** : `tenant.ts` n'expose ni `UPDATE` ni `DELETE`
  dessus. C'est le journal « qui a lu quoi, quand, avec quelle issue » que
  réclame un DAF.
- **Horodatages** : entiers = epoch en **millisecondes UTC** (`Date.now()`).
  Seule `source_date` est une chaîne ISO `AAAA-MM-JJ` (date de publication de la
  source d'un prix, règle 4).

## 1. Créer la base

Toutes les commandes se lancent **depuis `web/`** (c'est là que vit
`wrangler.jsonc`). `--location weur` garde les données en Europe.

```bash
cd web
npx wrangler d1 create kerdaxis --location weur
```

Wrangler affiche l'`database_id`. Le bloc est **déjà** dans
`web/wrangler.jsonc`, avec un identifiant à remplacer :

```jsonc
"d1_databases": [
  {
    "binding": "ARGENTIER_DB",
    "database_name": "kerdaxis",
    "database_id": "<à provisionner>"   // ← le uuid renvoyé ci-dessus
  }
]
```

Le binding s'appelle `ARGENTIER_DB` : c'est le nom sous lequel le Worker reçoit
l'objet `D1Database`. `lib/runtime/bindings.ts` va le chercher et rend `null`
quand il n'existe pas (Vercel, `next dev`, tests) — dans ce cas l'analyse
fonctionne, mais rien n'est journalisé.

## 2. Appliquer la migration

En local (base SQLite de `wrangler dev`, dans `.wrangler/state`) :

```bash
cd web
npx wrangler d1 execute kerdaxis --local --file=./db/0001_init.sql
```

En production (base D1 distante) :

```bash
cd web
npx wrangler d1 execute kerdaxis --remote --file=./db/0001_init.sql
```

Même chose pour les migrations suivantes (base réelle : `argentier`, cf. `wrangler.jsonc`) :

```bash
cd web
npx wrangler d1 execute argentier --local  --file=./db/0003_market_benchmarks.sql
npx wrangler d1 execute argentier --remote --file=./db/0003_market_benchmarks.sql
npx wrangler d1 execute argentier --remote --file=./db/0004_demo_results.sql
npx wrangler d1 execute argentier --remote --file=./db/0005_cancel_channels.sql
```

Sans la table `market_benchmarks`, le benchmark marche quand même : le cache se tait
et chaque recherche repart sur le web.

La migration est **idempotente** (`CREATE TABLE / CREATE INDEX IF NOT EXISTS`,
aucun `DROP`) : la rejouer sur une base déjà à jour ne fait rien et ne détruit
aucune donnée.

> Variante applicative : `applyMigrations(db)` dans `lib/db/tenant.ts` exécute
> exactement le même SQL depuis le Worker (le fichier y est embarqué en
> constante, faute de système de fichiers à l'exécution ; un test interdit toute
> dérive entre la constante et `0001_init.sql`). Utile pour amorcer une base de
> test ou de preview sans passer par le CLI.

## 3. Vérifier

```bash
cd web
# Les trois tables sont-elles là ?
npx wrangler d1 execute kerdaxis --remote \
  --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"

# Les trois index ?
npx wrangler d1 execute kerdaxis --remote \
  --command "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'"

# Le CHECK de la machine à états est-il bien posé ?
npx wrangler d1 execute kerdaxis --remote \
  --command "SELECT sql FROM sqlite_master WHERE name = 'decisions'"
```

Remplacez `--remote` par `--local` pour interroger la base de développement.

## 4. Ajouter une migration plus tard

1. Créez `db/000N_<sujet>.sql`, en ne mettant que des instructions idempotentes
   et **non destructrices** (SQLite ne sait pas supprimer une colonne
   proprement : préférez ajouter une colonne nullable).
2. Ajoutez-la à la constante correspondante et au tableau `MIGRATIONS` de
   `lib/db/tenant.ts`, pour que `applyMigrations` la joue aussi.
3. Appliquez-la avec la commande de l'étape 2, en local **puis** en distant.

## En cas de fausse manœuvre

D1 conserve un historique (Time Travel) sur 30 jours :

```bash
cd web
npx wrangler d1 time-travel info kerdaxis
npx wrangler d1 time-travel restore kerdaxis --timestamp <ISO 8601>
```

## Tests

Les tests n'ouvrent **aucune** base réelle : ils branchent un faux `D1Database`
qui enregistre le SQL émis et évalue le sous-ensemble de SQL que `tenant.ts`
produit. Ils échouent bruyamment si l'isolation par `org_id` disparaît d'un
`WHERE`, si une valeur est concaténée dans une chaîne SQL, ou si le `CHECK` des
statuts quitte la migration.

```bash
cd web
npx vitest run lib/db/__tests__/tenant.test.ts
```
