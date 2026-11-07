// Petits utilitaires sans dépendance : gabarits HTML échappés, formats FR, crypto.

// ---------- HTML ----------

/** Fragment HTML déjà sûr (non ré-échappé quand il est interpolé). */
export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export const raw = (s: string): Html => new Html(s);

/** Échappe texte et attributs. Tous les attributs sont entre guillemets doubles : l'apostrophe
 *  est laissée telle quelle pour que le DOM reste lisible (« l'abonnement »). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderValue(v: unknown): string {
  if (v instanceof Html) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(String(v));
}

/** Gabarit HTML : toute valeur interpolée est échappée, sauf un `Html`. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += renderValue(v) + (strings[i + 1] ?? "");
  });
  return new Html(out);
}

// ---------- Formats (fr-FR par défaut, en-GB si lang = "en") ----------

export type Lang = "fr" | "en";
const LOCALE: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };

export function formatEuros(cents: number, lang: Lang = "fr"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(LOCALE[lang], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** Montant toujours à 2 décimales ("129,00 €" / "€129.00"). */
export function formatEuros2(cents: number, lang: Lang = "fr"): string {
  return new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "2026-11-30" -> "30 novembre 2026" / "30 November 2026" */
export function formatDay(isoDay: string, lang: Lang = "fr"): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDay}T00:00:00Z`));
}

/** ISO complet -> "7 novembre 2026 à 17:42" / "7 November 2026 at 17:42" (heure de Paris) */
export function formatDateTime(iso: string, lang: Lang = "fr"): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// ---------- Crypto ----------

const enc = new TextEncoder();

/** Comparaison en temps constant (hachage SHA-256 puis timingSafeEqual : longueur masquée). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

export function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const byte of new Uint8Array(buf)) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function hmacKey(secret: string, purpose: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(`${purpose}:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export const utf8 = (s: string): Uint8Array => enc.encode(s);
