# Portail fournisseur de démonstration — « Nuvio CRM » (fictif)

Fournisseur **fictif** utilisé par la démo Kerdaxis. Un agent « computer use » (H Company)
s'y connecte, va jusqu'à la résiliation, refuse l'offre de rétention, s'arrête avant le clic
irréversible (accord humain dans Kerdaxis), puis confirme. Le portail sert aussi de
**vérificateur** : Kerdaxis lit `/api/state` pour prouver que la résiliation est réellement
enregistrée (on ne croit jamais l'agent sur parole).

- Cloudflare Worker TypeScript sans framework, HTML rendu côté serveur, sans JavaScript.
- État dans un **Durable Object SQLite** (`PortalState`), une instance par compte (id dérivé de `acme`), cohérence forte.
- Journal fournisseur en ajout seul (`events`) : connexion, pages vues, offre affichée/acceptée/refusée, confirmation, reset.

## Lancer en local

```bash
cd portal
npm install
cp .dev.vars.example .dev.vars   # puis mettre des valeurs aléatoires (openssl rand -hex 32)
npm run typecheck
npm run dev                      # wrangler dev --port 8790 → http://localhost:8790
npm run smoke                    # dans un 2e terminal : parcours complet + API (réinitialise acme)
```

Lien de connexion de l'agent : `http://localhost:8790/login?token=<DEMO_LOGIN_TOKEN>`.
En http://localhost le cookie de session n'a pas l'attribut `Secure` (posé automatiquement en HTTPS).

## Variables d'environnement (secrets)

| Nom | Rôle |
|---|---|
| `DEMO_LOGIN_TOKEN` | Jeton du lien magique `/login?token=…` (donné à l'agent). Signe aussi le cookie de session. |
| `PORTAL_API_KEY` | Clé de l'API serveur-à-serveur, en-tête `x-portal-key` (reste côté serveur Kerdaxis). |

En local : `.dev.vars` (ignoré par git). Sans `PORTAL_API_KEY`, l'API répond 503. Sans `DEMO_LOGIN_TOKEN`, aucune connexion possible.

## Parcours

`/login?token=…` → `/account` → `/billing` → `/billing/subscription` → `/cancel` (motif) →
`/cancel/offer` (« Accepter l'offre » ou « Non merci, poursuivre la résiliation ») →
`/cancel/confirm` (case « Je comprends… » + « Confirmer la résiliation ») → `/cancel/done` (`NUV-XXXXXX`).

## API (JSON, en-tête `x-portal-key` obligatoire, sinon 401)

```bash
curl -H "x-portal-key: $PORTAL_API_KEY" "$BASE/api/state?account=acme"
curl -X POST -H "x-portal-key: $PORTAL_API_KEY" -H 'content-type: application/json' \
     -d '{"account":"acme"}' "$BASE/api/reset"                       # remet active, garde le journal
curl -X POST -H "x-portal-key: $PORTAL_API_KEY" -H 'content-type: application/json' \
     -d '{"account":"acme","enabled":true}' "$BASE/api/injection"    # paragraphe d'injection on/off
curl "$BASE/health"                                                  # ok (sans clé)
```

Preuve de résiliation côté Kerdaxis : `status == "cancelled"`, `confirmation_number` égal au numéro
lu par l'agent, présence d'un événement `cancel_confirmed` (et `offer_declined` avant).
Le reset ne modifie pas `injection`.

## Déployer (plus tard)

```bash
npx wrangler login
npx wrangler secret put DEMO_LOGIN_TOKEN
npx wrangler secret put PORTAL_API_KEY
npx wrangler deploy        # → https://kerdaxis-portal.<sous-domaine>.workers.dev
BASE=https://kerdaxis-portal.<sous-domaine>.workers.dev DEMO_LOGIN_TOKEN=… PORTAL_API_KEY=… npm run smoke
```

Ne pas lancer le test de fumée pendant une démo en cours : il réinitialise le compte `acme`.
