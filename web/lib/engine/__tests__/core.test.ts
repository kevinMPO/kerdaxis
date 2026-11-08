// ---------------------------------------------------------------------------
// Tests du moteur (engine/core) — la règle #2 rendue exécutable.
//
// Ce que ces tests VERROUILLENT, et qui était la violation réparée :
//   • L'euro d'un levier vient du RELEVÉ (résiliation, doublon, hausse, fx) ou
//     d'un prix sourcé ; une action qui dépend du marché reste `pending` à 0 €.
//     Jamais d'un nombre du LLM, jamais d'un pourcentage forfaitaire.
//   • Le motif est la porte : un levier n'existe que pour un `pilotable` de motif
//     `abonnement`, `doublon` ou `fx`. Un one-off (`variable`) n'en produit pas.
//   • Déterminisme : mêmes transactions ⇒ mêmes euros, à la copie près.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import { build, ENGINE_VERSION } from "@/lib/engine";
import type { LeverAction, MerchantVerdict, Nature, Tx } from "@/lib/types";

let seq = 0;
function tx(merchant: string, amount: number, date: string, over: Partial<Tx> = {}): Tx {
  return {
    id: `tx-${seq++}`,
    merchant,
    amount,
    localCurrency: "EUR",
    isFx: false,
    side: "debit",
    operationType: "card",
    date,
    attachmentRequired: false,
    hasAttachment: false,
    ...over,
  };
}

/** Trois occurrences mensuelles → le moteur détecte un récurrent. */
function monthly(merchant: string, amount: number, over: Partial<Tx> = {}): Tx[] {
  return [
    tx(merchant, amount, "2026-06-15", over),
    tx(merchant, amount, "2026-07-15", over),
    tx(merchant, amount, "2026-08-15", over),
  ];
}

function verdict(name: string, action: LeverAction, over: Partial<MerchantVerdict> = {}): MerchantVerdict {
  return {
    name,
    nature: "pilotable" as Nature,
    pole: "IA & Dev",
    isSubscription: true,
    action,
    alternative: "",
    risk: "safe",
    ...over,
  };
}

function run(txs: Tx[], verdicts: MerchantVerdict[], windowDays = 90) {
  return build({
    account: { name: "Test", bank: "Qonto", balance: 10_000 },
    windowLabel: { fr: "test", en: "test" },
    txs,
    verdicts,
    windowDays,
    source: "mock",
    categorized: "rules",
  });
}

describe("l'euro d'un levier vient de la table du moteur, pas du LLM", () => {
  it("cancel ⇒ 100 % du mensuel récupérable", () => {
    const r = run(monthly("Loom", 20), [verdict("Loom", "cancel")]);
    const l = r.levers.find((x) => x.label === "Loom")!;
    expect(l.saving).toBe(20); // 20 × 1.0
    expect(l.motif).toBe("abonnement");
    expect(l.action).toBe("cancel");
    expect(l.basis).toBe("observed");
  });

  it("renegotiate ⇒ pending à 0 € tant qu'aucun prix sourcé n'existe", () => {
    const r = run(monthly("Free Mobile", 30), [verdict("Free Mobile", "renegotiate", { alternative: "Sosh" })]);
    const l = r.levers.find((x) => x.label === "Free Mobile")!;
    expect(l.saving).toBe(0);
    expect(l.basis).toBe("pending");
    expect(l.active).toBe(false);
    expect(l.monthly).toBe(30);
    expect(l.to).not.toContain("Sosh"); // l'alternative de mémoire du modèle n'est jamais affichée
  });

  it("switch et downgrade attendent aussi un prix du marché", () => {
    const r = run([...monthly("HubSpot", 60), ...monthly("HeyGen", 29)], [verdict("HubSpot", "switch"), verdict("HeyGen", "downgrade")]);
    for (const label of ["HubSpot", "HeyGen"]) {
      expect(r.levers.find((x) => x.label === label)).toMatchObject({ saving: 0, basis: "pending" });
    }
  });

  it("une hausse observée l'emporte sur une renégociation en attente de prix", () => {
    const txs = [tx("Figma", 42, "2026-06-15"), tx("Figma", 42, "2026-07-15"), tx("Figma", 48, "2026-08-15")];
    const r = run(txs, [verdict("Figma", "renegotiate")]);
    const l = r.levers.find((x) => x.label === "Figma")!;
    expect(l.basis).toBe("observed");
    expect(l.saving).toBe(6);
  });

  it("consolidate ⇒ motif doublon, 50 %", () => {
    const r = run(monthly("Apollo", 100), [verdict("Apollo", "consolidate")]);
    const l = r.levers.find((x) => x.label === "Apollo")!;
    expect(l.saving).toBe(50); // 100 × 0.5
    expect(l.motif).toBe("doublon");
  });

  it("AUCUN levier ne transporte de champ savingRatio (l'ancien nombre du LLM)", () => {
    const r = run(monthly("Notion", 15), [verdict("Notion", "downgrade")]);
    for (const l of r.levers) expect(l).not.toHaveProperty("savingRatio");
  });
});

describe("le motif est la porte du levier", () => {
  it("un pilotable non récurrent (variable) ne produit AUCUN levier", () => {
    const oneOff = [tx("Sofitel Paris", 800, "2026-08-10")];
    const r = run(oneOff, [verdict("Sofitel Paris", "switch", { isSubscription: false })]);
    expect(r.levers.find((x) => x.label === "Sofitel Paris")).toBeUndefined();
  });

  it("action keep ⇒ pas de levier (ratio 0)", () => {
    const r = run(monthly("Slack", 12), [verdict("Slack", "keep")]);
    expect(r.levers.find((x) => x.label === "Slack")).toBeUndefined();
  });

  it("un motif fourni par l'appelant force la catégorie", () => {
    const r = run(monthly("Zoom", 40), [verdict("Zoom", "renegotiate", { motif: "abonnement" })]);
    const l = r.levers.find((x) => x.label === "Zoom")!;
    expect(l.motif).toBe("abonnement");
    expect(l.basis).toBe("pending");
  });
});

describe("le risque vient de la table du moteur", () => {
  it("résilier demande une revue : le relevé ne montre pas l'usage", () => {
    const r = run(monthly("Loom", 20), [verdict("Loom", "cancel", { risk: "safe" })]);
    expect(r.levers.find((x) => x.label === "Loom")).toMatchObject({ risk: "med", active: false });
  });

  it("fusionner un doublon est sans risque et retenu d'office", () => {
    const r = run(monthly("Apollo", 100), [verdict("Apollo", "consolidate", { risk: "med" })]);
    expect(r.levers.find((x) => x.label === "Apollo")).toMatchObject({ risk: "safe", active: true });
  });

  it("garde le drapeau « migration lourde » posé par le modèle", () => {
    const r = run(monthly("HubSpot", 60), [verdict("HubSpot", "switch", { risk: "hard" })]);
    expect(r.levers.find((x) => x.label === "HubSpot")!.risk).toBe("hard");
  });
});

describe("frais de change : un seul levier agrégé, déterministe", () => {
  it("agrège les transactions qonto_fee en un levier fx", () => {
    const txs = [
      tx("Qonto FX", 5, "2026-08-05", { operationType: "qonto_fee", isFx: true }),
      tx("Qonto FX", 7, "2026-08-20", { operationType: "qonto_fee", isFx: true }),
    ];
    const r = run(txs, [], 30); // months = 1 ⇒ 12 € / mois
    const fx = r.levers.find((x) => x.motif === "fx")!;
    expect(fx).toBeDefined();
    expect(fx.id).toBe("frais-de-change");
    expect(fx.saving).toBe(12);
  });

  it("sans frais de change, pas de levier fx", () => {
    const r = run(monthly("Github", 21), [verdict("Github", "cancel")]);
    expect(r.levers.find((x) => x.motif === "fx")).toBeUndefined();
  });

  it("un qonto_fee NON-fx (forfait, isFx=false) ne produit AUCUN levier fx", () => {
    const txs = [
      tx("Forfait Qonto", 29, "2026-08-05", { operationType: "qonto_fee", isFx: false }),
      tx("Frais carte", 8, "2026-08-06", { operationType: "qonto_fee", isFx: false }),
    ];
    const r = run(txs, [], 30);
    expect(r.levers.find((x) => x.motif === "fx")).toBeUndefined();
  });

  it("un marchand de frais fx classe pilotable n'est PAS compte deux fois", () => {
    // isFx qonto_fee, vu 3x mensuellement, classe pilotable+renegotiate par le LLM.
    const txs = monthly("Qonto Change", 10, { operationType: "qonto_fee", isFx: true });
    const r = run(txs, [verdict("Qonto Change", "renegotiate")], 30);
    // Un SEUL levier : le fx agrege. Pas de levier par-marchand en plus.
    expect(r.levers.length).toBe(1);
    expect(r.levers[0].motif).toBe("fx");
    // Le run-rate n'inclut pas les frais de change (isoles dans le levier fx).
    expect(r.totals.runRate).toBe(0);
  });
});

describe("economie annuelle : calculee par le moteur", () => {
  it("chaque levier porte savingYearly = saving × 12", () => {
    const r = run(monthly("Loom", 20), [verdict("Loom", "cancel")]);
    for (const l of r.levers) expect(l.savingYearly).toBe(l.saving * 12);
  });
});

describe("déterminisme du moteur", () => {
  it("mêmes transactions ⇒ mêmes euros (deux exécutions identiques)", () => {
    const txs = [...monthly("Loom", 20), ...monthly("Apollo", 100)];
    const verdicts = [verdict("Loom", "cancel"), verdict("Apollo", "consolidate")];
    expect(JSON.stringify(run(txs, verdicts))).toBe(JSON.stringify(run(txs, verdicts)));
  });

  it("expose une version de moteur non vide", () => {
    expect(typeof ENGINE_VERSION).toBe("string");
    expect(ENGINE_VERSION.length).toBeGreaterThan(0);
  });
});
