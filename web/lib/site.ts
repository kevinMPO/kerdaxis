// ---------------------------------------------------------------------------
// site.ts — adresses publiques de Kerdaxis, source unique.
//
// Chaque valeur est surchargeable par variable d'environnement ; le défaut est
// la production. Les variables NEXT_PUBLIC_* sont figées au build (elles servent
// aussi côté navigateur) ; KERDAXIS_APP_ORIGIN est lue à l'exécution, côté serveur.
// ---------------------------------------------------------------------------

const DEFAULT_SITE_URL = "https://kerdaxis.com";
const DEFAULT_APP_ORIGIN = "https://app.kerdaxis.com";
/** Worker Cloudflare des comptes et de la liste d'attente (`my-app/`). */
const DEFAULT_ACCOUNTS_WORKER_URL = "https://argentier-mcp.bonjour-e83.workers.dev";

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Site vitrine (liens « retour au site », URL de retour des démos Stripe). */
export const SITE_URL = withoutTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL);

/** Worker des comptes utilisateurs (`/auth/*`) et de la liste d'attente. */
export const ACCOUNTS_WORKER_URL = withoutTrailingSlash(
  process.env.NEXT_PUBLIC_ACCOUNTS_WORKER_URL || DEFAULT_ACCOUNTS_WORKER_URL,
);

export const WAITLIST_URL = `${ACCOUNTS_WORKER_URL}/waitlist`;

/** Origine publique de l'application, pour les URL de retour construites côté serveur. */
export function appOrigin(): string {
  return withoutTrailingSlash(process.env.KERDAXIS_APP_ORIGIN || DEFAULT_APP_ORIGIN);
}

/** App on the anonymised demo company: the trial and guest landing page. */
export const DEMO_PATH = "/demo";

/** The signed-in user's own dashboard: live Qonto data only, never demo figures. */
export const LIVE_DASHBOARD_PATH = "/dashboard";
