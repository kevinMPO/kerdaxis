// Essai sans email (« See it live, no signup ») : constantes et garde de redirection.

/** Identité de la session invitée : aucune adresse réelle, jamais enregistrée comme lead. */
export const GUEST_EMAIL = "guest@kerdaxis.com";

/** Chemin de retour interne uniquement (pas de redirection ouverte). */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/demo";
}
