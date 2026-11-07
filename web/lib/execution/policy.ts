// ---------------------------------------------------------------------------
// Politique d'exécution Kerdaxis — ce que l'agent navigateur a le droit de faire.
//
// Séparée, par construction, de la lecture seule des sources financières
// (lib/mcp/readonly-guard.ts) : on n'assouplit JAMAIS Qonto pour faire marcher
// le navigateur. Ici on encadre une autre capacité : agir sur le portail d'un
// FOURNISSEUR, et seulement après un accord humain explicite.
//
// Trois verrous, testés dans __tests__/policy.test.ts :
//   1. L'accord est lié au hash des paramètres exacts de l'action (fournisseur,
//      compte, action, montant…) : on ne peut pas l'étendre à une autre action.
//   2. L'accord est à usage unique et expire : il ne se rejoue pas.
//   3. L'agent ne navigue que sur les domaines du fournisseur approuvé.
// ---------------------------------------------------------------------------

import { texteVersOctets } from "@/lib/encodage";

/** L'action que l'humain approuve. Rien d'autre n'est exécuté. */
export interface ActionParams {
  orgId: string;
  supplierId: string;
  vendor: string;
  /** Nom du compte client tel qu'il doit apparaître sur le portail. */
  account: string;
  action: "cancel";
  plan: string;
  /** Montant mensuel en centimes (jamais de flottant pour l'argent). */
  monthlyCents: number;
  currency: "EUR";
  /** Seul hôte sur lequel l'agent a le droit de naviguer. */
  allowedHost: string;
}

export interface Approval {
  id: string;
  actionHash: string;
  params: ActionParams;
  approvedBy: string;
  channel: "ui" | "voice";
  approvedAt: string;
  expiresAt: string;
  usedAt: string | null;
}

/** Durée de validité d'un accord avant lancement de l'exécution. */
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

/** JSON canonique : clés triées récursivement, pour un hash stable. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** SHA-256 hexadécimal des paramètres canoniques de l'action. */
export async function actionHash(params: ActionParams): Promise<string> {
  const data = texteVersOctets(canonicalJson(params));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createApproval(
  params: ActionParams,
  approvedBy: string,
  channel: Approval["channel"],
  now: Date = new Date(),
): Promise<Approval> {
  return {
    id: crypto.randomUUID(),
    actionHash: await actionHash(params),
    params,
    approvedBy,
    channel,
    approvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
    usedAt: null,
  };
}

export type ApprovalCheck =
  | { ok: true }
  | { ok: false; reason: "used" | "expired" | "hash_mismatch" | "org_mismatch" };

/**
 * Vérifie qu'un accord peut lancer CETTE exécution. Le hash est recalculé à
 * partir des paramètres stockés : un accord modifié après coup ne passe pas.
 */
export async function checkApproval(
  approval: Approval,
  orgId: string,
  now: Date = new Date(),
): Promise<ApprovalCheck> {
  if (approval.usedAt) return { ok: false, reason: "used" };
  if (now.getTime() > Date.parse(approval.expiresAt)) return { ok: false, reason: "expired" };
  if (approval.params.orgId !== orgId) return { ok: false, reason: "org_mismatch" };
  if ((await actionHash(approval.params)) !== approval.actionHash) {
    return { ok: false, reason: "hash_mismatch" };
  }
  return { ok: true };
}

/**
 * L'agent est-il resté sur le portail approuvé ? Les pages techniques du
 * navigateur (about:blank, nouvel onglet) sont tolérées ; tout autre hôte,
 * y compris un sous-domaine, est refusé.
 */
export function isAllowedUrl(url: string | null | undefined, allowedHost: string): boolean {
  if (!url) return true;
  if (url === "about:blank" || url.startsWith("chrome://newtab")) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return u.host.toLowerCase() === allowedHost.toLowerCase();
  } catch {
    return false;
  }
}
