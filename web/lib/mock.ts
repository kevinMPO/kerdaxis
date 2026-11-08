// ---------------------------------------------------------------------------
// Jeu de démonstration — servi par /api/analyze quand Qonto n'est pas
// configuré, et donc EXPOSÉ PUBLIQUEMENT, sans authentification.
//
// À ce titre : société FICTIVE, montants FICTIFS. Aucune donnée d'un compte
// bancaire réel n'a sa place ici — ni raison sociale, ni solde, ni ligne
// « perso ». Le profil imité est celui d'une petite structure de conseil
// (compte EI : pro et perso mélangés), au format `AnalyzeResult` exact.
//
// La démo vend la rigueur des chiffres : elle doit donc être ARITHMÉTIQUEMENT
// JUSTE. Quatre invariants, verrouillés par `lib/__tests__/mock.test.ts` et
// repris de `lib/engine.ts` :
//   1. totals.out = Σ natures            (la cascade du relevé au pilotable) ;
//   2. totals.runRate = nature pilotable (le run-rate, c'est le pilotable) ;
//   3. Σ poles = totals.runRate          (les pôles découpent le run-rate) ;
//   4. tvaRecuperableEur = baseTtcEur × 20/120 (taux France standard).
//
// Runway : le résultat n'expose pas les encaissements, donc le calcul est posé
// ici. Burn hors ponctuel = 16 137 − 3 468 = 12 669 € ; encaissements du mois
// = 10 932 € ; burn net = 1 737 € ; 9 380 / 1 737 = 5,4 mois.
// ---------------------------------------------------------------------------

import type { AnalyzeResult } from "./types";
import { rollingWindowLabel } from "./window-label";

// Rolling window ending today, so the demo never shows a stale period.
const DEMO_WINDOW_DAYS = 30;

export const MOCK: AnalyzeResult = {
  account: { name: "ACME Conseil (démo)", bank: "Qonto", balance: 9380 },
  window: { label: rollingWindowLabel(DEMO_WINDOW_DAYS) },
  totals: { out: 16137, runRate: 1627 },
  natures: [
    { key: "structurel", label: "Structurel", amount: 9240 },
    { key: "ponctuel", label: "Ponctuel", amount: 3468 },
    { key: "perso", label: "Perso", amount: 1802 },
    { key: "pilotable", label: "Pilotable", amount: 1627 },
  ],
  poles: [
    { label: "Outbound / Sales", amount: 664 },
    { label: "IA & Dev", amount: 358 },
    { label: "Marketing Ads", amount: 291 },
    { label: "Bureau / Telco / Banque", amount: 173 },
    { label: "Infra / Prod", amount: 141 },
  ],
  score: {
    value: 72,
    drivers: [
      { fr: "Doublons fonctionnels (2 LLM) −8", en: "Functional duplicates (2 LLMs) −8" },
      { fr: "Justificatifs TVA manquants −8", en: "Missing VAT receipts −8" },
      { fr: "Part optimisable du run-rate −12", en: "Optimizable share of run-rate −12" },
    ],
  },
  runway: { months: 5.4, note: { fr: "hors exceptionnel", en: "excl. one-offs" } },
  levers: [
    // Deux origines d'euro, comme dans le moteur (lib/engine/core.ts) :
    //   • basis "observed" : lu sur le relevé (résiliation, doublon, hausse, FX) ;
    //   • basis "pending"  : switch / downgrade / renégociation. Aucune
    //     alternative ni aucun euro écrit en dur : le bouton « vérifier les prix »
    //     les cherche en direct sur le web (Linkup), et le moteur chiffre. D'où
    //     des fournisseurs RÉELS ici, et un `monthly` + `pole` pour la recherche.
    // Risque = table du moteur : résilier « à revoir » (le relevé ne montre pas
    // l'usage), fusionner un doublon ou renégocier « sans risque ».
    //
    // Kerdaxis : fournisseur FICTIF dont nous contrôlons le portail de démo
    // (dossier portal/). Le plus gros levier actif → cible de l'Autopilote,
    // qui le résilie réellement via un agent H Company.
    { id: "nuvio", label: "Nuvio CRM", to: "résilier · aucune connexion depuis 90 j", saving: 129, risk: "med", active: true, action: "cancel", monthly: 129, basis: "observed" },
    // Kerdaxis : fournisseur FICTIF facturé par Stripe (mode test). L'agent H
    // résilie dans le VRAI portail client de Stripe, au parcours recherché dans
    // la doc officielle. Inactif par défaut : les totaux de la démo ne bougent pas.
    { id: "lumen", label: "Lumen Analytics", to: "résilier · facturé via Stripe", saving: 39, risk: "med", active: false, action: "cancel", monthly: 39, basis: "observed" },
    { id: "inst", label: "Instantly", to: "1 seul workspace", saving: 86, risk: "safe", active: true, action: "consolidate", monthly: 172, basis: "observed" },
    { id: "gpt", label: "ChatGPT", to: "Claude seul", saving: 84, risk: "med", active: true, action: "cancel", monthly: 84, basis: "observed" },
    { id: "fx", label: "Frais FX / ATM", to: "carte Wise / Revolut", saving: 43, risk: "safe", active: true, action: "switch", monthly: 43, basis: "observed" },
    { id: "nesp", label: "Nespresso abo", to: "achat ponctuel", saving: 42, risk: "med", active: true, action: "cancel", monthly: 42, basis: "observed" },
    { id: "figma", label: "Figma", to: "revenir au tarif précédent", saving: 6, risk: "safe", active: true, action: "renegotiate", monthly: 48, basis: "observed", hausse: { pct: 14.3, avantEur: 42, apresEur: 48 } },
    { id: "gw", label: "Google Workspace ×2", to: "1 compte", saving: 29, risk: "safe", active: true, action: "consolidate", monthly: 58, basis: "observed" },
    { id: "loom", label: "Loom", to: "capture native", saving: 23, risk: "med", active: true, action: "cancel", monthly: 23, basis: "observed" },
    { id: "uber", label: "Uber One", to: "couper", saving: 7, risk: "med", active: true, action: "cancel", monthly: 7, basis: "observed" },
    { id: "waa", label: "Waalaxy", to: "prix à vérifier sur le web", saving: 0, risk: "med", active: false, action: "switch", monthly: 49, pole: "Outbound / Sales", basis: "pending" },
    { id: "repl", label: "Replit", to: "prix à vérifier sur le web", saving: 0, risk: "med", active: false, action: "switch", monthly: 25, pole: "IA & Dev", basis: "pending" },
    { id: "hey", label: "HeyGen", to: "prix à vérifier sur le web", saving: 0, risk: "med", active: false, action: "downgrade", monthly: 29, pole: "Marketing Ads", basis: "pending" },
    { id: "make", label: "Make", to: "prix à vérifier sur le web", saving: 0, risk: "med", active: false, action: "switch", monthly: 10, pole: "IA & Dev", basis: "pending" },
    { id: "ring", label: "Ringover", to: "prix à vérifier sur le web", saving: 0, risk: "hard", active: false, action: "renegotiate", monthly: 63, pole: "Bureau / Telco / Banque", basis: "pending" },
    { id: "hub", label: "HubSpot", to: "prix à vérifier sur le web", saving: 0, risk: "hard", active: false, action: "switch", monthly: 60, pole: "Outbound / Sales", basis: "pending" },
  ],
  flux: [
    {
      kind: "new",
      // Montant aligné sur le levier « hey » : c'est le même abonnement.
      label: { fr: "HeyGen · nouvel abonnement", en: "HeyGen · new subscription" },
      value: { fr: "28 €/mois", en: "€28/mo" },
      tone: "amber",
    },
    {
      kind: "check",
      label: { fr: "Virement région IDF · à vérifier", en: "IDF region transfer · to review" },
      value: { fr: "268 €", en: "€268" },
      tone: "neutral",
    },
    {
      kind: "dup",
      // Montant aligné sur le levier « gpt » : c'est le doublon qu'on coupe.
      label: {
        fr: "Doublon : 2 LLM payants (Claude + ChatGPT)",
        en: "Duplicate: 2 paid LLMs (Claude + ChatGPT)",
      },
      value: { fr: "−84 €/mois", en: "−€84/mo" },
      tone: "danger",
    },
    {
      kind: "ghost",
      label: { fr: "CapCut · abo dormant, plus prélevé", en: "CapCut · dormant subscription, no longer charged" },
      value: { fr: "à confirmer", en: "to confirm" },
      tone: "neutral",
    },
  ],
  tvaPerdue: { transactions: 3, baseTtcEur: 414, tvaRecuperableEur: 69 },
  meta: { source: "mock", categorized: "rules", txCount: 0 },
};
