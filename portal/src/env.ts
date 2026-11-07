import type { PortalState } from "./state";

export interface Env {
  PORTAL: DurableObjectNamespace<PortalState>;
  /** Jeton du lien magique : /login?token=… */
  DEMO_LOGIN_TOKEN?: string;
  /** Clé de l'API serveur-à-serveur (en-tête x-portal-key). */
  PORTAL_API_KEY?: string;
}
