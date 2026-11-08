# Kerdaxis, Agent DAF

Instructions pour tout agent de code travaillant sur ce repo (Claude Code, Codex,
Cursor, etc.). `CLAUDE.md` se contente d'importer ce fichier.

Kerdaxis analyse **en lecture seule** un compte Qonto reel, benchmarke les depenses
via Linkup, puis, avec ton accord, confie une resiliation a un agent H Company qui
agit sur le portail du fournisseur et s'arrete avant le clic definitif. Le feu vert
final reste toujours a toi.

## Les 4 regles non negociables

1. **Read-only Qonto.** Seules les lectures sont autorisees. `web/lib/mcp/readonly-guard.ts`
   rejette toute ecriture, tout virement, toute carte. Les tools d'ecriture Qonto sont
   aussi DURS-BLOQUES pour les agents de code dans `.claude/settings.json` (`deny` > `allow`).
2. **Le moteur calcule, jamais le LLM.** Tout montant en euros vient de `web/lib/engine`.
   Le LLM ne rend que des ETIQUETTES ; aucune arithmetique financiere hors du moteur.
3. **Zero PII vers le web.** Vers Linkup : uniquement le nom du marchand et la categorie.
   Jamais d'IBAN, de numero de compte, d'identifiant de transaction ni de donnee perso.
4. **Chaque prix affiche = source + date.** Sinon, rejet et 1 seul retry, puis « non verifie ».

## Methode (une execution dans l'app)

OBSERVE (Qonto, lecture seule, ou releve PDF lu dans le navigateur) → ANALYSE (`web/lib/engine`) → BENCHMARK (sur accord, Linkup)
→ RECOMMANDER (carte sourcee + datee) → GATE HUMAIN (tu approuves) → EXECUTION (agent
H Company sur le portail, arret avant le clic final, ou lettre) → TRACE (D1).

## Regles metier du moteur (`web/lib/engine/core.ts`)

- **Recurrence** = marchand vu >= 2 fois sur la fenetre a montant similaire. Un one-off
  n'est JAMAIS annualise. **Annualisation = montant mensuel x 12.**
- Detecte : abonnements SaaS recurrents, **doublons** (meme marchand 2x le meme jour, ou
  2 abonnements paralleles chez le meme marchand), **frais de change** agreges en un seul levier,
  **hausses silencieuses**.
- **Compte EI** (perso + pro melanges) : classe chaque depense en **PRO / PERSO / A-CLARIFIER**
  (`classifyEI`, listes `PRO_KEYWORDS` / `PERSO_KEYWORDS` dans `web/lib/categorize.ts`).
  En cas de doute → A-CLARIFIER.

## Taxonomie des leviers

- **Nature** ∈ pilotable | structurel | ponctuel | perso.
- **Motif** ∈ abonnement | doublon | fx | variable (orthogonal a la nature).
- Un **levier** n'existe QUE si `nature = pilotable` ET `motif ∈ {abonnement, doublon, fx}`.
  Un one-off (`variable`) n'en produit jamais.
- L'euro d'un levier a DEUX origines possibles, jamais une estimation (`Lever.basis`) :
  - `observed` : lu sur le releve. cancel = 100 % du mensuel, consolidate (doublon) =
    50 % par cote de la paire, hausse silencieuse = delta observe, frais de change = somme.
  - `pending` puis `sourced` : switch / downgrade / renegotiate dependent d'un prix du
    marche. Le levier sort du moteur a 0 € (`pending`). Sur accord (bouton « verifier les
    prix »), Linkup cherche les tarifs publics du fournisseur et des concurrents, Holo les
    range en donnees (prix, par poste, comparable), et `web/lib/engine/pricing.ts` calcule :
    nombre de postes deduit du montant paye / tarif actuel, puis mensuel − cout de l'offre.
    Sans prix exploitable : `unverified`, avec la raison, et aucun euro affiche.
  - Aucun pourcentage forfaitaire par action. L'alternative citee de memoire par le
    modele n'est jamais affichee : seule une offre sourcee l'est.
- Le **risque** vient d'une table du moteur (`riskFor`) : renegotiate / consolidate = sans
  risque ; cancel / downgrade / switch = a revoir (le releve ne montre pas l'usage). Le
  modele ne garde qu'un drapeau `hard` (migration lourde).
- Les benchmarks verifies sont caches 30 jours dans D1 (`market_benchmarks`, db/0003),
  table partagee entre organisations car elle ne contient que du web public.
- **Agent ou lettre** : une resiliation (`cancel`) n'est confiee a l'agent H Company que
  si Linkup, sur accord (meme clic que « verifier les prix »), trouve dans la doc officielle
  qu'elle se fait en ligne (`Lever.cancelChannel`, source + date). Hors ligne ou non
  verifie : lettre. Nuvio et Lumen (portails de demo a nous) sont connus en ligne sans
  recherche. Cache 30 jours dans D1 (`cancel_channels`, db/0005).

## Fichiers

| Fichier | Role |
|---|---|
| `web/lib/engine/core.ts` | Le moteur deterministe : leviers, motif, risque, chaque euro. |
| `web/lib/engine/pricing.ts` | Prix sources → economie (postes deduits, switch / downgrade / renego). |
| `web/lib/categorize.ts` | Classifieur par mots-cles et classification EI. |
| `web/lib/statement/parse.ts` | Releve PDF → lignes (date, libelle nettoye, montant), par regles fixes, dans le navigateur. Sans IBAN ni numero de carte. |
| `web/lib/statement/import-analysis.ts` | Lignes importees → validation Zod → meme pipeline que Qonto (`source: "import"`). Rien n'est stocke. |
| `web/lib/benchmark.ts` | Linkup (tarifs publics) + extraction Holo, cache D1 (`lib/benchmark-cache.ts`). |
| `web/lib/mcp/readonly-guard.ts` | La frontiere read-only Qonto (regle #1). |
| `web/lib/execution/` | Gate humain, runner de l'agent H Company, replay. |
| `portal/` | Portail fournisseur de demo (Nuvio) pilote par l'agent. |
| `my-app/` | Worker des comptes (`/auth/*`) et de la liste d'attente (`/waitlist`). |
| `.claude/settings.json` | Le garde-fou des agents de code : read-only Qonto (deny > allow). |

## Documentation a tenir a jour

Tout changement d'architecture (nouveau service ou fournisseur externe, nouveau flux de
donnees, module deplace ou supprime, nouvelle table D1, etape ajoutee ou retiree dans la
methode) se reporte dans le meme commit :

- dans le `README.md` (section « Architecture » et tout passage devenu faux) ;
- dans le schema visuel du workflow (le diagramme mermaid de la section « Architecture »
  du README) si une boite, une fleche ou un flux change ;
- dans ce fichier (`AGENTS.md`) si la methode, une regle metier ou le tableau « Fichiers »
  est concerne.

## Comment relancer

```bash
cd web && npx tsc --noEmit && npx vitest run   # moteur et app
cd my-app && npx vitest run                    # Worker des comptes
bash scripts/check-secrets.sh                  # aucun secret ni donnee bancaire commite
```
