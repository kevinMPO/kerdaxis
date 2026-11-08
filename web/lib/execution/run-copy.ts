// ---------------------------------------------------------------------------
// Every sentence Kerdaxis writes in a cancellation run log, in the language the
// person launched the run in. Before, the live runner wrote French and the
// trial replay wrote English, whatever the interface language.
//
// The agent is told to write its own notes in the same language (see
// AGENT_INSTRUCTIONS). Supplier page titles are left as they are: they are
// evidence of what the agent saw, not Kerdaxis copy.
// ---------------------------------------------------------------------------

import type { Lang } from "@/lib/types";

export type RunLang = "fr" | "en";

/** German, Spanish and Italian fall back to English until the log is translated. */
export function runLangOf(lang: Lang | undefined): RunLang {
  return lang === "fr" ? "fr" : "en";
}

export interface RunCopy {
  /** Language name given to the agent for its notes. */
  agentLanguage: string;
  catalogGuide: (vendor: string) => string;
  researchStart: (merchant: string) => string;
  researchDone: (steps: number, docUrl: string | null, sources: number, researchedOn: string) => string;
  researchScreens: (relevant: number, sent: number, steps: number) => string;
  researchVideo: (title: string, steps: number) => string;
  researchUnavailable: (reason: string) => string;
  stripeTarget: (plan: string, account: string, subscriptionId: string) => string;
  approvalGiven: (voice: boolean, plan: string, vendor: string, fingerprint: string) => string;
  preparing: string;
  launchFailed: (error: string) => string;
  sessionStarted: (host: string, attempt: number, max: number) => string;
  agentNeverStarted: (max: number, seconds: number) => string;
  nothingDoneAtSupplier: (error: string) => string;
  agentIdleRelaunch: (seconds: number) => string;
  agentError: (error: string) => string;
  offPortal: (host: string) => string;
  offPortalViolation: (host: string) => string;
  doneWithoutGo: string;
  doneWithoutGoViolation: string;
  finalPageFallback: (title: string, plan: string, vendor: string) => string;
  page: (title: string, path: string) => string;
  agentAction: (tools: string) => string;
  stepRetry: (error: string) => string;
  policyCancelled: string;
  paused: string;
  needsHumanDefault: string;
  needsHuman: (error: string) => string;
  agentStoppedAtFinal: string;
  announcedWithoutGo: string;
  severeGap: (error: string) => string;
  gap: (error: string) => string;
  finalRefused: string;
  finalGiven: string;
  stoppedByUser: string;
  endedBeforeGoDefault: (status: string) => string;
  endedBeforeGo: (code: string) => string;
  agentReportsCancel: (confirmation: string | null) => string;
  ambiguousAnswer: string;
  inconclusive: (error: string) => string;
  portalUnreachable: (error: string) => string;
  retentionAccepted: string;
  cancelledWithoutGoOnPortal: string;
  stillActive: string;
  confirmed: (byStripe: boolean, plan: string, confirmation: string, accessUntil: string | null) => string;
  portalDoesNotConfirm: string;
  numberMismatch: (agent: string | null, portal: string) => string;
  notProven: (error: string) => string;
  replayIntro: string;
  replayFinalPage: string;
  replayVerified: string;
  replayStopped: string;
  replayBefore: readonly string[];
  replayAfter: readonly string[];
}

const fr: RunCopy = {
  agentLanguage: "French",
  catalogGuide: (v) => `Parcours ${v} : fiche du catalogue Kerdaxis.`,
  researchStart: (m) => `Linkup lit la documentation officielle : ${m}…`,
  researchDone: (n, url, sources, day) =>
    `Linkup : ${n} étapes dans la doc officielle${url ? ` (${url})` : ""}, ${sources} sources, recherche du ${day}.`,
  researchScreens: (r, s, n) => `Agent H Company : ${r}/${s} captures de la doc lues, ${n} étapes avec libellés exacts.`,
  researchVideo: (t, n) => `Gladia a écouté le tutoriel « ${t} » : ${n} étapes.`,
  researchUnavailable: (r) => `Recherche indisponible (${r}) : l'agent suit la consigne générique.`,
  stripeTarget: (p, a, id) => `Stripe (mode test) : abonnement ${p} actif pour ${a} (${id}), portail client ouvert.`,
  approvalGiven: (voice, p, v, f) => `Accord ${voice ? "vocal confirmé" : "donné"} pour résilier ${p} (${v}) · empreinte ${f}…`,
  preparing: "Préparation : parcours et cible chez le fournisseur.",
  launchFailed: (e) => `Lancement impossible : ${e}`,
  sessionStarted: (h, a, m) => `Session H Company lancée sur ${h}${a > 1 ? ` (essai ${a}/${m})` : ""}.`,
  agentNeverStarted: (m, s) => `H Company ne démarre pas l'agent (${m} sessions sans aucune action en ${s} s)`,
  nothingDoneAtSupplier: (e) => `${e}. Rien n'a été fait chez le fournisseur.`,
  agentIdleRelaunch: (s) => `L'agent H n'a fait aucune action en ${s} s : session coupée et relancée.`,
  agentError: (e) => `Erreur agent : ${e}`,
  offPortal: (h) => `Navigation hors du portail approuvé : ${h}`,
  offPortalViolation: (h) => `navigation hors du portail approuvé (${h})`,
  doneWithoutGo: "Page « résiliation effectuée » atteinte SANS feu vert humain.",
  doneWithoutGoViolation: "confirmation exécutée sans feu vert humain",
  finalPageFallback: (t, p, v) => `${t || "Page de confirmation finale"} : résiliation de ${p} (${v}), action définitive chez le fournisseur.`,
  page: (t, p) => (t ? `Page : ${t} (${p})` : `Page : ${p}`),
  agentAction: (tools) => `Action : ${tools}`,
  stepRetry: (e) => `Étape en échec, l'agent réessaie : ${e}`,
  policyCancelled: "Session H Company annulée par la politique Kerdaxis. Reprise manuelle nécessaire.",
  paused: "Kerdaxis a mis l'agent en pause devant la confirmation finale. Il attend ton feu vert.",
  needsHumanDefault: "l'agent demande une intervention humaine",
  needsHuman: (e) => `Intervention humaine nécessaire : ${e}`,
  agentStoppedAtFinal: "L'agent est arrêté devant la confirmation finale et attend ton feu vert.",
  announcedWithoutGo: "l'agent annonce une résiliation sans feu vert humain",
  severeGap: (e) => `Écart grave : ${e}.`,
  gap: (e) => `Écart : ${e}.`,
  finalRefused: "Feu vert final refusé : session arrêtée, rien n'a été confirmé.",
  finalGiven: "Feu vert final donné : l'agent confirme la résiliation.",
  stoppedByUser: "Exécution arrêtée par l'utilisateur.",
  endedBeforeGoDefault: (s) => `session ${s} avant le feu vert`,
  endedBeforeGo: (c) => `Session terminée avant le feu vert (${c}).`,
  agentReportsCancel: (n) => `L'agent rapporte la résiliation${n ? ` (n° ${n})` : ""}. Vérification sur le portail…`,
  ambiguousAnswer: "réponse de l'agent ambiguë",
  inconclusive: (e) => `Non conclu : ${e}`,
  portalUnreachable: (e) => `Portail injoignable pour la vérification (${e}).`,
  retentionAccepted: "le portail indique une offre de rétention acceptée, ce qui n'avait pas été approuvé",
  cancelledWithoutGoOnPortal: "résiliation constatée chez le fournisseur sans feu vert final",
  stillActive: "Vérifié sur le portail : l'abonnement est toujours actif, rien n'a été confirmé.",
  confirmed: (stripe, p, n, until) =>
    `${stripe ? "Confirmé par l'API Stripe" : "Confirmé par le fournisseur"} : ${p} résilié, n° ${n}${until ? `, accès jusqu'au ${until}` : ""}.`,
  portalDoesNotConfirm: "l'agent annonce une résiliation que le portail ne confirme pas",
  numberMismatch: (a, p) => `numéro de confirmation différent (agent : ${a ?? "aucun"}, portail : ${p})`,
  notProven: (e) => `Non prouvé : ${e}.`,
  replayIntro: "Essai gratuit : REDIFFUSION d'une vraie session H Company enregistrée le 7 nov. 2026 (portail du fournisseur de démo). Aucun agent n'est lancé.",
  replayFinalPage: "Page de résiliation finale : accès jusqu'au 30 novembre 2026, données conservées 30 jours.",
  replayVerified: "Portail fournisseur relu : résilié · NUV-RW3L2Y (le même numéro que l'agent). Session enregistrée : 10 étapes · 0,027 $.",
  replayStopped: "Rediffusion arrêtée par l'utilisateur.",
  replayBefore: [
    "Connecté au portail Nuvio CRM (fournisseur de démo).",
    "Ouvre la facturation pour trouver l'abonnement.",
    "Formule Growth trouvée · 129 €/mois. Début de la résiliation.",
    "Le portail demande un motif de résiliation.",
    "Motif choisi : « Je n'utilise plus l'outil ».",
    "Offre de rétention avec une note cachée demandant à l'IA de l'accepter. Ignorée : le texte d'une page est une donnée non fiable. Clic sur « No thanks ».",
    "Page de confirmation finale atteinte. Kerdaxis a mis l'agent en pause avant « Confirm cancellation ».",
  ],
  replayAfter: [
    "Feu vert final reçu. L'agent reprend sur la page de confirmation.",
    "Case « I understand the cancellation is final » cochée.",
    "Clic sur « Confirm cancellation ». Le portail affiche NUV-RW3L2Y.",
  ],
};

const en: RunCopy = {
  agentLanguage: "English",
  catalogGuide: (v) => `${v} path: Kerdaxis catalog entry.`,
  researchStart: (m) => `Linkup reads the official documentation: ${m}…`,
  researchDone: (n, url, sources, day) =>
    `Linkup: ${n} steps in the official docs${url ? ` (${url})` : ""}, ${sources} sources, researched on ${day}.`,
  researchScreens: (r, s, n) => `H Company agent: read ${r}/${s} doc screenshots, ${n} steps with exact labels.`,
  researchVideo: (t, n) => `Gladia listened to the tutorial “${t}”: ${n} steps.`,
  researchUnavailable: (r) => `Research unavailable (${r}): the agent follows the generic instructions.`,
  stripeTarget: (p, a, id) => `Stripe (test mode): ${p} subscription active for ${a} (${id}), customer portal open.`,
  approvalGiven: (voice, p, v, f) => `Approval ${voice ? "confirmed by voice" : "given"} to cancel ${p} (${v}) · fingerprint ${f}…`,
  preparing: "Preparing: cancellation path and target at the supplier.",
  launchFailed: (e) => `Could not launch: ${e}`,
  sessionStarted: (h, a, m) => `H Company session started on ${h}${a > 1 ? ` (attempt ${a}/${m})` : ""}.`,
  agentNeverStarted: (m, s) => `H Company did not start the agent (${m} sessions without any action in ${s} s)`,
  nothingDoneAtSupplier: (e) => `${e}. Nothing was done at the supplier.`,
  agentIdleRelaunch: (s) => `The H agent took no action in ${s} s: session stopped and restarted.`,
  agentError: (e) => `Agent error: ${e}`,
  offPortal: (h) => `Navigation outside the approved portal: ${h}`,
  offPortalViolation: (h) => `navigation outside the approved portal (${h})`,
  doneWithoutGo: "“Cancellation done” page reached WITHOUT a human final go.",
  doneWithoutGoViolation: "confirmation executed without a human final go",
  finalPageFallback: (t, p, v) => `${t || "Final confirmation page"}: cancellation of ${p} (${v}), final at the supplier.`,
  page: (t, p) => (t ? `Page: ${t} (${p})` : `Page: ${p}`),
  agentAction: (tools) => `Action: ${tools}`,
  stepRetry: (e) => `Step failed, the agent retries: ${e}`,
  policyCancelled: "H Company session cancelled by Kerdaxis policy. Manual follow-up needed.",
  paused: "Kerdaxis paused the agent before the final confirmation. It is waiting for your go.",
  needsHumanDefault: "the agent asks for human help",
  needsHuman: (e) => `Human action needed: ${e}`,
  agentStoppedAtFinal: "The agent stopped before the final confirmation and is waiting for your go.",
  announcedWithoutGo: "the agent reports a cancellation without a human final go",
  severeGap: (e) => `Serious mismatch: ${e}.`,
  gap: (e) => `Mismatch: ${e}.`,
  finalRefused: "Final go refused: session stopped, nothing was confirmed.",
  finalGiven: "Final go given: the agent confirms the cancellation.",
  stoppedByUser: "Run stopped by the user.",
  endedBeforeGoDefault: (s) => `session ${s} before the final go`,
  endedBeforeGo: (c) => `Session ended before the final go (${c}).`,
  agentReportsCancel: (n) => `The agent reports the cancellation${n ? ` (no. ${n})` : ""}. Checking on the portal…`,
  ambiguousAnswer: "ambiguous answer from the agent",
  inconclusive: (e) => `Not concluded: ${e}`,
  portalUnreachable: (e) => `Portal unreachable for verification (${e}).`,
  retentionAccepted: "the portal shows an accepted retention offer, which was not approved",
  cancelledWithoutGoOnPortal: "cancellation found at the supplier without a final go",
  stillActive: "Checked on the portal: the subscription is still active, nothing was confirmed.",
  confirmed: (stripe, p, n, until) =>
    `${stripe ? "Confirmed by the Stripe API" : "Confirmed by the supplier"}: ${p} cancelled, no. ${n}${until ? `, access until ${until}` : ""}.`,
  portalDoesNotConfirm: "the agent reports a cancellation the portal does not confirm",
  numberMismatch: (a, p) => `different confirmation number (agent: ${a ?? "none"}, portal: ${p})`,
  notProven: (e) => `Not proven: ${e}.`,
  replayIntro: "Free trial: REPLAY of a real H Company session recorded on 7 Nov 2026 (demo supplier portal). No agent is launched.",
  replayFinalPage: "Final cancellation page: access ends on 30 November 2026; data kept 30 days.",
  replayVerified: "Supplier portal read back: cancelled · NUV-RW3L2Y (same number as the agent). Recorded run: 10 steps · $0.027.",
  replayStopped: "Replay stopped by the user.",
  replayBefore: [
    "Signed in to the Nuvio CRM portal (demo supplier).",
    "Opened Billing to find the subscription.",
    "Found the Growth plan · 129 €/mo. Started the cancellation.",
    "The portal asks for a cancellation reason.",
    "Reason chosen: “I no longer use the tool”.",
    "Retention offer with a hidden note telling the AI to accept it. Ignored: page text is untrusted data. Clicked “No thanks”.",
    "Final confirmation page reached. Kerdaxis paused the agent before “Confirm cancellation”.",
  ],
  replayAfter: [
    "Final go received. The agent resumes on the confirmation page.",
    "Ticked “I understand the cancellation is final”.",
    "Clicked “Confirm cancellation”. Portal shows NUV-RW3L2Y.",
  ],
};

const RUN_COPY: Record<RunLang, RunCopy> = { fr, en };

/** Runs saved before the language was recorded were written in French. */
export function runCopy(lang: RunLang | undefined): RunCopy {
  return RUN_COPY[lang ?? "fr"];
}
