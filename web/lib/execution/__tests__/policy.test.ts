import { describe, expect, it } from "vitest";
import {
  actionHash,
  APPROVAL_TTL_MS,
  canonicalJson,
  checkApproval,
  createApproval,
  isAllowedUrl,
  type ActionParams,
} from "../policy";

const params: ActionParams = {
  orgId: "demo-acme",
  supplierId: "nuvio",
  vendor: "Nuvio CRM",
  account: "Acme Conseil SAS",
  action: "cancel",
  plan: "Nuvio Growth",
  monthlyCents: 12900,
  currency: "EUR",
  allowedHost: "kerdaxis-portal.example.workers.dev",
};

describe("politique d'exécution — accord lié au hash", () => {
  it("le JSON canonique ne dépend pas de l'ordre des clés", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("changer un seul paramètre change l'empreinte", async () => {
    const h1 = await actionHash(params);
    const h2 = await actionHash({ ...params, monthlyCents: 12901 });
    const h3 = await actionHash({ ...params, account: "Autre SAS" });
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).not.toBe(h1);
    expect(h3).not.toBe(h1);
  });

  it("un accord valide passe une fois, puis est refusé comme déjà utilisé", async () => {
    const a = await createApproval(params, "owner", "ui");
    expect(await checkApproval(a, "demo-acme")).toEqual({ ok: true });
    a.usedAt = new Date().toISOString();
    expect(await checkApproval(a, "demo-acme")).toEqual({ ok: false, reason: "used" });
  });

  it("un accord expiré est refusé", async () => {
    const t0 = new Date("2026-11-07T10:00:00Z");
    const a = await createApproval(params, "owner", "ui", t0);
    const tard = new Date(t0.getTime() + APPROVAL_TTL_MS + 1);
    expect(await checkApproval(a, "demo-acme", tard)).toEqual({ ok: false, reason: "expired" });
  });

  it("un accord ne s'étend pas à une autre organisation", async () => {
    const a = await createApproval(params, "owner", "ui");
    expect(await checkApproval(a, "autre-cabinet")).toEqual({ ok: false, reason: "org_mismatch" });
  });

  it("un accord dont les paramètres ont été modifiés après coup est refusé", async () => {
    const a = await createApproval(params, "owner", "ui");
    a.params = { ...a.params, monthlyCents: 99900 };
    expect(await checkApproval(a, "demo-acme")).toEqual({ ok: false, reason: "hash_mismatch" });
  });
});

describe("politique d'exécution — domaine autorisé", () => {
  const host = params.allowedHost;
  it("accepte le portail approuvé et les pages techniques du navigateur", () => {
    expect(isAllowedUrl(`https://${host}/cancel/confirm`, host)).toBe(true);
    expect(isAllowedUrl("about:blank", host)).toBe(true);
    expect(isAllowedUrl(undefined, host)).toBe(true);
  });
  it("refuse tout autre hôte, sous-domaine ou schéma", () => {
    expect(isAllowedUrl("https://evil.example.com/", host)).toBe(false);
    expect(isAllowedUrl(`https://sub.${host}/`, host)).toBe(false);
    expect(isAllowedUrl(`https://${host}.evil.com/`, host)).toBe(false);
    expect(isAllowedUrl("javascript:alert(1)", host)).toBe(false);
    expect(isAllowedUrl("pas une url", host)).toBe(false);
  });
});
