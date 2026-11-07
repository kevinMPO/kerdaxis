import { describe, expect, it } from "vitest";
import { normalize, parseIntent } from "../intents";

const LEVERS = [
  { id: "nuvio", label: "Nuvio CRM" },
  { id: "inst", label: "Instantly" },
  { id: "gpt", label: "ChatGPT" },
  { id: "gw", label: "Google Workspace ×2" },
];

describe("commandes vocales — intentions déterministes", () => {
  it("normalise accents et casse", () => {
    expect(normalize("  Résilie  NUVIO ")).toBe("resilie nuvio");
  });

  it("explique la page (FR/EN)", () => {
    expect(parseIntent("Explique-moi ce que je vois", LEVERS)).toEqual({ kind: "explain" });
    expect(parseIntent("Explain this page", LEVERS)).toEqual({ kind: "explain" });
  });

  it("lance l'audit des abonnements inutilisés", () => {
    expect(parseIntent("Trouve mes abonnements inutilisés", LEVERS)).toEqual({ kind: "audit" });
    expect(parseIntent("Find my unused subscriptions", LEVERS)).toEqual({ kind: "audit" });
  });

  it("annonce les économies", () => {
    expect(parseIntent("Combien je peux économiser ?", LEVERS)).toEqual({ kind: "savings" });
    expect(parseIntent("How much can I save?", LEVERS)).toEqual({ kind: "savings" });
  });

  it("prépare la résiliation du levier nommé", () => {
    expect(parseIntent("Résilie Nuvio", LEVERS)).toEqual({ kind: "cancel", leverId: "nuvio" });
    expect(parseIntent("Cancel my ChatGPT subscription", LEVERS)).toEqual({ kind: "cancel", leverId: "gpt" });
    expect(parseIntent("Annule l'abonnement Google Workspace", LEVERS)).toEqual({ kind: "cancel", leverId: "gw" });
    expect(parseIntent("Résilie mon abonnement", LEVERS)).toEqual({ kind: "cancel", leverId: null });
  });

  it("ne transforme JAMAIS une phrase en feu vert final", () => {
    expect(parseIntent("Je confirme la résiliation", LEVERS)).toEqual({ kind: "final_approval_by_voice" });
    expect(parseIntent("Approve the cancellation", LEVERS)).toEqual({ kind: "final_approval_by_voice" });
    expect(parseIntent("Vas-y, valide", LEVERS)).toEqual({ kind: "final_approval_by_voice" });
  });

  it("reste sur « inconnu » quand rien ne correspond", () => {
    expect(parseIntent("Quel temps fait-il ?", LEVERS)).toEqual({ kind: "unknown" });
    expect(parseIntent("", LEVERS)).toEqual({ kind: "unknown" });
  });
});
