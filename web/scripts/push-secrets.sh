#!/bin/bash
# Copie les clés de web/.env.local dans les secrets chiffrés du Worker « argentier ».
# À lancer UNE fois (et après chaque changement de clé) avant d'activer le déploiement automatique :
#   cd web && ./scripts/push-secrets.sh
# Rien n'est affiché ni écrit dans le dépôt ; le fichier temporaire est supprimé.
set -euo pipefail
cd "$(dirname "$0")/.."
KEYS="GLADIA_API_KEY HAI_API_KEY KERDAXIS_SESSION_SECRET KERDAXIS_TEST_PASSWORD PORTAL_API_KEY PORTAL_LOGIN_TOKEN STRIPE_SECRET_KEY"
TMP=$(mktemp); chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT
KEYS="$KEYS" node -e '
const fs = require("fs"); const want = process.env.KEYS.split(" "); const o = {};
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && want.includes(m[1]) && m[2].trim()) o[m[1]] = m[2].trim().replace(/^["\x27]|["\x27]$/g, "");
}
const missing = want.filter((k) => !o[k]);
if (missing.length) console.error("absentes de .env.local (ignorées) : " + missing.join(" "));
fs.writeFileSync(process.argv[1], JSON.stringify(o));
console.log("secrets envoyés : " + Object.keys(o).join(" "));
' "$TMP"
npx wrangler secret bulk "$TMP"
