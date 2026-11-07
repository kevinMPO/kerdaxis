// ---------------------------------------------------------------------------
// Fournisseurs que Kerdaxis sait résilier par le navigateur.
//
// Catalogue CÔTÉ SERVEUR : le navigateur du client n'envoie qu'un identifiant
// (`nuvio`). Montant, compte, domaine autorisé et lien de connexion viennent
// d'ici, jamais de la requête — un client ne peut pas élargir l'action.
//
// P0 (hackathon) : un seul fournisseur, « Nuvio CRM », portail FICTIF que nous
// contrôlons (dossier portal/). Il sert aussi de vérificateur : on lit son état
// réel au lieu de croire l'agent sur parole.
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  vendor: string;
  plan: string;
  /** Raison sociale attendue sur le portail : un autre compte = arrêt. */
  account: string;
  /** Identifiant du compte côté portail (API de vérification). */
  accountKey: string;
  monthlyCents: number;
  currency: "EUR";
  baseUrl: string;
  allowedHost: string;
  /**
   * Fiche de parcours (« playbook ») du fournisseur : chemin de la page de
   * confirmation FINALE (avant le clic irréversible) et de la page « c'est
   * fait ». Kerdaxis met l'agent en pause dès qu'il voit la première, et
   * coupe tout s'il voit la seconde sans feu vert humain.
   */
  finalStepPath: string;
  donePath: string;
  /** Libellé exact du bouton irréversible sur la page de confirmation finale. */
  finalButtonLabel: string;
}

/**
 * Langue du portail de démo : `PORTAL_LANG=en` pour l'anglais, vide = français.
 * Elle passe dans le lien de connexion (`&lang=en`), le portail la mémorise.
 */
function portalLang(): "fr" | "en" {
  return process.env.PORTAL_LANG?.trim().toLowerCase() === "en" ? "en" : "fr";
}

/** Fournisseur pris en charge, ou `null` si le portail n'est pas configuré. */
export function getSupplier(id: string): Supplier | null {
  if (id !== "nuvio") return null;
  const baseUrl = process.env.PORTAL_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl || !process.env.PORTAL_API_KEY || !process.env.PORTAL_LOGIN_TOKEN) return null;
  return {
    id: "nuvio",
    vendor: "Nuvio CRM",
    plan: "Nuvio Growth",
    account: "Acme Conseil SAS",
    accountKey: "acme",
    monthlyCents: 12900,
    currency: "EUR",
    baseUrl,
    allowedHost: new URL(baseUrl).host,
    finalStepPath: "/cancel/confirm",
    donePath: "/cancel/done",
    finalButtonLabel: portalLang() === "en" ? "Confirm cancellation" : "Confirmer la résiliation",
  };
}

/**
 * Le navigateur de l'agent H tourne dans le cloud de H : il ne voit pas la
 * machine locale. Un portail en http://localhost ne peut donc pas être piloté,
 * et lancer une session pour rien consommerait des crédits.
 */
export function reachableByAgent(s: Supplier): boolean {
  try {
    const u = new URL(s.baseUrl);
    const h = u.hostname.toLowerCase();
    const local = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".local");
    return u.protocol === "https:" && !local;
  } catch {
    return false;
  }
}

/** Lien de connexion du portail. Contient un jeton : ne jamais le renvoyer au client. */
export function supplierLoginUrl(s: Supplier): string {
  const token = process.env.PORTAL_LOGIN_TOKEN ?? "";
  const lang = portalLang() === "en" ? "&lang=en" : "";
  return `${s.baseUrl}/login?token=${encodeURIComponent(token)}${lang}`;
}

export interface SupplierState {
  status: "active" | "discounted" | "cancelled";
  confirmation_number: string | null;
  cancelled_at: string | null;
  access_until?: string;
  company?: string;
  plan?: string;
}

/** État réel de l'abonnement, lu sur le portail (la source de vérité). */
export async function readSupplierState(s: Supplier): Promise<SupplierState> {
  const res = await fetch(`${s.baseUrl}/api/state?account=${encodeURIComponent(s.accountKey)}`, {
    headers: { "x-portal-key": process.env.PORTAL_API_KEY ?? "" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`portail ${res.status}`);
  return (await res.json()) as SupplierState;
}

/** Remet le compte de démo à l'état « actif » (avant une nouvelle démo). */
export async function resetSupplier(s: Supplier): Promise<void> {
  const res = await fetch(`${s.baseUrl}/api/reset`, {
    method: "POST",
    headers: { "x-portal-key": process.env.PORTAL_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ account: s.accountKey }),
  });
  if (!res.ok) throw new Error(`portail ${res.status}`);
}
