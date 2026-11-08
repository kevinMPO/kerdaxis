import type { Lang, Risk } from "@/lib/types";

export type ViewId = "today" | "subscriptions" | "runs" | "ledger";

export interface DashboardCopy {
  nav: Record<ViewId, string>;
  navClassic: string;
  navPitch: string;
  demoData: string;
  liveData: string;
  analyzing: string;
  connectQonto: string;
  disconnect: string;
  reconnect: string;
  unavailable: string;
  headline: (recoverable: string, confirmed: string | null) => string;
  headlineSub: (monthly: string, count: number) => string;
  ledgerSteps: [string, string, string, string, string];
  needsYou: string;
  needsYouEmpty: string;
  needGate: (vendor: string) => string;
  needGateWhy: string;
  needGateCta: string;
  needApprove: (vendor: string) => string;
  needApproveCta: string;
  needLetterCta: string;
  needClarify: string;
  needClarifyCta: string;
  needVat: (count: number, amount: string) => string;
  needVatWhy: string;
  needVatCta: string;
  perMonth: string;
  perYear: string;
  recentRuns: string;
  noRuns: string;
  subsTitle: string;
  subsLede: (active: number, total: number) => string;
  colSupplier: string;
  colPlan: string;
  colRisk: string;
  colMonthly: string;
  colYearly: string;
  colAction: string;
  filterAll: string;
  filterSafe: string;
  filterReview: string;
  horizon: (months: number) => string;
  horizonTotal: (amount: string, months: number) => string;
  exportCsv: string;
  printReport: string;
  inPlan: string;
  cancelWithH: string;
  replayWithH: string;
  prepareLetter: string;
  agentOffline: string;
  agentSoon: string;
  agentSubscribers: string;
  risk: Record<Risk, string>;
  runsTitle: string;
  runsEmpty: string;
  runsEmptyCta: string;
  runStatus: Record<RunStatus, string>;
  stations: [string, string, string, string, string, string];
  stationWaiting: string;
  agentScreen: string;
  live: string;
  replay: string;
  noShot: string;
  gateTitle: (button: string) => string;
  gateWarn: string;
  gateApprove: string;
  gateRefuse: string;
  voiceCannot: string;
  proofTitle: string;
  proofNumber: string;
  proofSource: string;
  journal: string;
  playbook: string;
  stop: string;
  cost: (usd: string, steps: number) => string;
  ledgerTitle: string;
  ledgerLede: string;
  runRate: string;
  byArea: string;
  anomalies: string;
  auditLog: string;
  auditNote: string;
  auditEmpty: string;
  auditFailed: string;
  auditRead: string;
  auditSent: string;
  drawerTitle: string;
  drawerLoading: string;
  copy: string;
  copied: string;
  benchmark: string;
  benchSearching: string;
  benchNone: string;
  close: string;
  launching: string;
  error: string;
}

export type RunStatus =
  | "prepared"
  | "running"
  | "awaiting_final_approval"
  | "submitted"
  | "supplier_confirmed"
  | "failed"
  | "needs_manual_action"
  | "stopped_by_user";

const fr: DashboardCopy = {
  nav: { today: "Aujourd'hui", subscriptions: "Abonnements", runs: "Résiliations", ledger: "Grand livre" },
  navClassic: "Ancienne vue",
  navPitch: "Le pitch",
  demoData: "Données de démonstration",
  liveData: "Compte Qonto réel · lecture seule",
  analyzing: "Lecture du compte et calcul par le moteur…",
  connectQonto: "Connecter Qonto",
  disconnect: "Déconnecter Qonto",
  reconnect: "Ta session Qonto a expiré : les montants affichés sont ceux de la démonstration.",
  unavailable: "Analyse indisponible : les montants affichés sont ceux de la démonstration.",
  headline: (r, c) => `Tu peux récupérer ${r} par an. ${c ? `${c} déjà confirmés par les fournisseurs.` : "Rien n'est encore confirmé par un fournisseur."}`,
  headlineSub: (m, n) => `${m} par mois sur ${n} leviers retenus. Chaque euro vient du moteur, jamais du modèle.`,
  ledgerSteps: ["Potentiel", "Approuvé", "Exécuté", "Confirmé fournisseur", "Vérifié sur relevé"],
  needsYou: "À traiter",
  needsYouEmpty: "Rien n'attend ton intervention.",
  needGate: (v) => `${v} : l'agent attend ton feu vert final`,
  needGateWhy: "Il est arrêté devant le bouton définitif, sur le portail du fournisseur.",
  needGateCta: "Voir et décider",
  needApprove: (v) => `Résilier ${v}`,
  needApproveCta: "Résilier avec H Company",
  needLetterCta: "Préparer la lettre",
  needClarify: "Mouvements à clarifier",
  needClarifyCta: "Voir le grand livre",
  needVat: (n, a) => `${n} justificatifs manquants : ${a} de TVA récupérable`,
  needVatWhy: "À confirmer avec ton expert-comptable.",
  needVatCta: "Voir",
  perMonth: "/mois",
  perYear: "/an",
  recentRuns: "Dernières résiliations",
  noRuns: "Aucune résiliation lancée pour l'instant.",
  subsTitle: "Abonnements et leviers",
  subsLede: (a, t) => `${a} leviers retenus sur ${t}. Coche ou décoche pour simuler.`,
  colSupplier: "Fournisseur",
  colPlan: "Action proposée",
  colRisk: "Risque",
  colMonthly: "€/mois",
  colYearly: "€/an",
  colAction: "",
  filterAll: "Tous",
  filterSafe: "Sans risque",
  filterReview: "À revoir",
  horizon: (m) => `Horizon : ${m} mois`,
  horizonTotal: (a, m) => `${a} récupérés sur ${m} mois`,
  exportCsv: "Exporter (CSV)",
  printReport: "Rapport imprimable",
  inPlan: "Retenu dans le plan",
  cancelWithH: "Résilier avec H Company",
  replayWithH: "Rejouer la session réelle",
  prepareLetter: "Lettre",
  agentOffline: "Portail du fournisseur injoignable pour l'agent en ce moment.",
  agentSoon: "Parcours de résiliation pas encore disponible pour ce fournisseur.",
  agentSubscribers: "Essai gratuit : seule la session Nuvio CRM est rejouée. La résiliation en direct est réservée aux abonnés.",
  risk: { safe: "Sans risque", med: "À revoir", hard: "Projet" },
  runsTitle: "Résiliations",
  runsEmpty: "Lance une résiliation depuis À traiter ou Abonnements : l'agent H Company travaille sur le portail du fournisseur et s'arrête avant le clic définitif.",
  runsEmptyCta: "Résilier Nuvio CRM",
  runStatus: {
    prepared: "Préparation",
    running: "L'agent travaille",
    awaiting_final_approval: "Attend ton feu vert",
    submitted: "Vérification chez le fournisseur",
    supplier_confirmed: "Confirmé par le fournisseur",
    failed: "Échec",
    needs_manual_action: "Action manuelle nécessaire",
    stopped_by_user: "Arrêté",
  },
  stations: ["Accord", "Parcours", "Sur le portail", "Ton feu vert", "Preuve fournisseur", "Relevé J+30"],
  stationWaiting: "en attente",
  agentScreen: "Écran de l'agent",
  live: "En direct",
  replay: "Rediffusion · session réelle enregistrée",
  noShot: "La capture de l'agent apparaîtra ici.",
  gateTitle: (b) => `L'agent attend devant « ${b} »`,
  gateWarn: "Action définitive chez le fournisseur. Rien ne part sans ton clic.",
  gateApprove: "Donner le feu vert",
  gateRefuse: "Refuser",
  voiceCannot: "La voix ne peut pas donner ce feu vert.",
  proofTitle: "Résiliation confirmée par le fournisseur",
  proofNumber: "N° de confirmation",
  proofSource: "Lu sur le portail du fournisseur, pas sur la parole de l'agent.",
  journal: "Journal de l'agent",
  playbook: "Parcours suivi",
  stop: "Arrêter l'agent",
  cost: (u, s) => `${s} étapes · ${u} $ d'agent`,
  ledgerTitle: "Grand livre",
  ledgerLede: "Ton vrai run-rate, pas ton relevé : ce qui est structurel, ponctuel, perso, et ce que tu pilotes.",
  runRate: "Run-rate du mois",
  byArea: "Pilotable par domaine",
  anomalies: "Nouveaux flux et anomalies",
  auditLog: "Journal d'accès",
  auditNote: "Chaque appel à un tiers fait pour toi, avec exactement ce qui est sorti. Aucun IBAN, numéro de transaction ni donnée perso : tout passe par le filtre anti-PII avant le réseau.",
  auditEmpty: "Aucun appel à un tiers pour l'instant dans cette session. Lectures Qonto, recherches Linkup et sessions H Company apparaîtront ici dès qu'elles ont lieu.",
  auditFailed: "Journal indisponible pour le moment.",
  auditRead: "lecture, rien n'est envoyé",
  auditSent: "envoyé :",
  drawerTitle: "Lettre prête à envoyer",
  drawerLoading: "Rédaction de la lettre…",
  copy: "Copier",
  copied: "Copié",
  benchmark: "Comparer les prix (Linkup)",
  benchSearching: "Recherche des prix publics…",
  benchNone: "Aucun prix public vérifiable trouvé.",
  close: "Fermer",
  launching: "Lancement…",
  error: "Une erreur est survenue.",
};

const en: DashboardCopy = {
  nav: { today: "Today", subscriptions: "Subscriptions", runs: "Cancellations", ledger: "Ledger" },
  navClassic: "Previous view",
  navPitch: "The pitch",
  demoData: "Demo data",
  liveData: "Real Qonto account · read-only",
  analyzing: "Reading the account, the engine is computing…",
  connectQonto: "Connect Qonto",
  disconnect: "Disconnect Qonto",
  reconnect: "Your Qonto session expired: the amounts shown are demo data.",
  unavailable: "Analysis unavailable: the amounts shown are demo data.",
  headline: (r, c) => `You can recover ${r} a year. ${c ? `${c} already confirmed by suppliers.` : "Nothing confirmed by a supplier yet."}`,
  headlineSub: (m, n) => `${m} a month across ${n} selected levers. Every euro comes from the engine, never the model.`,
  ledgerSteps: ["Potential", "Approved", "Executed", "Supplier confirmed", "Verified on statement"],
  needsYou: "Needs you",
  needsYouEmpty: "Nothing is waiting for you.",
  needGate: (v) => `${v}: the agent is waiting for your green light`,
  needGateWhy: "It stopped in front of the irreversible button, on the supplier's portal.",
  needGateCta: "Review and decide",
  needApprove: (v) => `Cancel ${v}`,
  needApproveCta: "Cancel with H Company",
  needLetterCta: "Prepare the letter",
  needClarify: "Payments to clarify",
  needClarifyCta: "Open the ledger",
  needVat: (n, a) => `${n} missing receipts: ${a} of recoverable VAT`,
  needVatWhy: "To confirm with your accountant.",
  needVatCta: "View",
  perMonth: "/mo",
  perYear: "/yr",
  recentRuns: "Recent cancellations",
  noRuns: "No cancellation started yet.",
  subsTitle: "Subscriptions and levers",
  subsLede: (a, t) => `${a} of ${t} levers selected. Tick or untick to simulate.`,
  colSupplier: "Supplier",
  colPlan: "Proposed action",
  colRisk: "Risk",
  colMonthly: "€/mo",
  colYearly: "€/yr",
  colAction: "",
  filterAll: "All",
  filterSafe: "Risk-free",
  filterReview: "To review",
  horizon: (m) => `Horizon: ${m} months`,
  horizonTotal: (a, m) => `${a} recovered over ${m} months`,
  exportCsv: "Export (CSV)",
  printReport: "Printable report",
  inPlan: "Selected in the plan",
  cancelWithH: "Cancel with H Company",
  replayWithH: "Replay the real session",
  prepareLetter: "Letter",
  agentOffline: "The supplier's portal is unreachable for the agent right now.",
  agentSoon: "No cancellation path for this supplier yet.",
  agentSubscribers: "Free trial: only the Nuvio CRM session is replayed. Live cancellation is for subscribers.",
  risk: { safe: "Risk-free", med: "To review", hard: "Project" },
  runsTitle: "Cancellations",
  runsEmpty: "Start a cancellation from Needs you or Subscriptions: the H Company agent works on the supplier's portal and stops before the irreversible click.",
  runsEmptyCta: "Cancel Nuvio CRM",
  runStatus: {
    prepared: "Preparing",
    running: "Agent at work",
    awaiting_final_approval: "Waiting for you",
    submitted: "Checking with the supplier",
    supplier_confirmed: "Confirmed by supplier",
    failed: "Failed",
    needs_manual_action: "Manual action needed",
    stopped_by_user: "Stopped",
  },
  stations: ["Approval", "Path", "On the portal", "Your green light", "Supplier proof", "Statement D+30"],
  stationWaiting: "pending",
  agentScreen: "Agent screen",
  live: "Live",
  replay: "Replay · real recorded session",
  noShot: "The agent's screen will appear here.",
  gateTitle: (b) => `The agent is waiting at “${b}”`,
  gateWarn: "Irreversible at the supplier. Nothing happens without your click.",
  gateApprove: "Give the green light",
  gateRefuse: "Refuse",
  voiceCannot: "In the app, voice can't do this.",
  proofTitle: "Cancellation confirmed by the supplier",
  proofNumber: "Confirmation no.",
  proofSource: "Read on the supplier's portal, not taken from the agent's word.",
  journal: "Agent log",
  playbook: "Path followed",
  stop: "Stop the agent",
  cost: (u, s) => `${s} steps · $${u} of agent`,
  ledgerTitle: "Ledger",
  ledgerLede: "Your real run-rate, not your statement: what is structural, one-off, personal, and what you control.",
  runRate: "This month's run-rate",
  byArea: "Controllable by area",
  anomalies: "New flows and anomalies",
  auditLog: "Access log",
  auditNote: "Every call made to a third party on your behalf, with exactly what left. No IBAN, transaction id or personal data: everything goes through the anti-PII filter before the network.",
  auditEmpty: "No third-party call in this session yet. Qonto reads, Linkup searches and H Company sessions will show up here as they happen.",
  auditFailed: "Log unavailable right now.",
  auditRead: "read, nothing sent",
  auditSent: "sent:",
  drawerTitle: "Ready-to-send letter",
  drawerLoading: "Writing the letter…",
  copy: "Copy",
  copied: "Copied",
  benchmark: "Compare prices (Linkup)",
  benchSearching: "Looking up public prices…",
  benchNone: "No verifiable public price found.",
  close: "Close",
  launching: "Starting…",
  error: "Something went wrong.",
};

const de: DashboardCopy = {
  ...en,
  agentSubscribers: "Kostenloser Test: Nur die Nuvio-CRM-Sitzung wird abgespielt. Live-Kündigung ist für Abonnenten.",
  nav: { today: "Heute", subscriptions: "Abos", runs: "Kündigungen", ledger: "Hauptbuch" },
  navClassic: "Vorherige Ansicht",
  navPitch: "Der Pitch",
  demoData: "Demodaten",
  liveData: "Echtes Qonto-Konto · nur Lesen",
  analyzing: "Konto wird gelesen, die Engine rechnet…",
  connectQonto: "Qonto verbinden",
  disconnect: "Qonto trennen",
  headline: (r, c) => `Du kannst ${r} pro Jahr zurückholen. ${c ? `${c} bereits vom Anbieter bestätigt.` : "Noch nichts vom Anbieter bestätigt."}`,
  headlineSub: (m, n) => `${m} pro Monat über ${n} gewählte Hebel. Jeder Euro kommt aus der Engine, nie vom Modell.`,
  ledgerSteps: ["Potenzial", "Freigegeben", "Ausgeführt", "Vom Anbieter bestätigt", "Auf Auszug geprüft"],
  needsYou: "Braucht dich",
  needsYouEmpty: "Nichts wartet auf dich.",
  needGate: (v) => `${v}: der Agent wartet auf dein finales Go`,
  needGateCta: "Prüfen und entscheiden",
  needApprove: (v) => `${v} kündigen`,
  needApproveCta: "Mit H Company kündigen",
  needLetterCta: "Brief vorbereiten",
  needClarify: "Zahlungen zu klären",
  needClarifyCta: "Hauptbuch öffnen",
  recentRuns: "Letzte Kündigungen",
  subsTitle: "Abos und Hebel",
  cancelWithH: "Mit H Company kündigen",
  replayWithH: "Echte Sitzung abspielen",
  prepareLetter: "Brief",
  risk: { safe: "Ohne Risiko", med: "Prüfen", hard: "Projekt" },
  runsTitle: "Kündigungen",
  stations: ["Freigabe", "Pfad", "Im Portal", "Dein finales Go", "Anbieter-Nachweis", "Auszug T+30"],
  gateApprove: "Finales Go geben",
  gateRefuse: "Ablehnen",
  ledgerTitle: "Hauptbuch",
  close: "Schließen",
};

const es: DashboardCopy = {
  ...en,
  agentSubscribers: "Prueba gratuita: solo se reproduce la sesión de Nuvio CRM. La cancelación en directo es para suscriptores.",
  nav: { today: "Hoy", subscriptions: "Suscripciones", runs: "Cancelaciones", ledger: "Libro mayor" },
  navClassic: "Vista anterior",
  navPitch: "El pitch",
  demoData: "Datos de demostración",
  liveData: "Cuenta Qonto real · solo lectura",
  analyzing: "Leyendo la cuenta, el motor está calculando…",
  connectQonto: "Conectar Qonto",
  disconnect: "Desconectar Qonto",
  headline: (r, c) => `Puedes recuperar ${r} al año. ${c ? `${c} ya confirmados por los proveedores.` : "Nada confirmado aún por un proveedor."}`,
  headlineSub: (m, n) => `${m} al mes en ${n} palancas elegidas. Cada euro viene del motor, nunca del modelo.`,
  ledgerSteps: ["Potencial", "Aprobado", "Ejecutado", "Confirmado por proveedor", "Verificado en extracto"],
  needsYou: "Te necesita",
  needsYouEmpty: "Nada espera por ti.",
  needGate: (v) => `${v}: el agente espera tu luz verde final`,
  needGateCta: "Revisar y decidir",
  needApprove: (v) => `Cancelar ${v}`,
  needApproveCta: "Cancelar con H Company",
  needLetterCta: "Preparar la carta",
  needClarify: "Pagos por aclarar",
  needClarifyCta: "Abrir el libro mayor",
  recentRuns: "Últimas cancelaciones",
  subsTitle: "Suscripciones y palancas",
  cancelWithH: "Cancelar con H Company",
  replayWithH: "Reproducir la sesión real",
  prepareLetter: "Carta",
  risk: { safe: "Sin riesgo", med: "Revisar", hard: "Proyecto" },
  runsTitle: "Cancelaciones",
  stations: ["Aprobación", "Ruta", "En el portal", "Tu luz verde", "Prueba del proveedor", "Extracto D+30"],
  gateApprove: "Dar la luz verde",
  gateRefuse: "Rechazar",
  ledgerTitle: "Libro mayor",
  close: "Cerrar",
};

const it: DashboardCopy = {
  ...en,
  agentSubscribers: "Prova gratuita: viene riprodotta solo la sessione Nuvio CRM. La disdetta dal vivo è per gli abbonati.",
  nav: { today: "Oggi", subscriptions: "Abbonamenti", runs: "Disdette", ledger: "Libro mastro" },
  navClassic: "Vista precedente",
  navPitch: "Il pitch",
  demoData: "Dati dimostrativi",
  liveData: "Conto Qonto reale · sola lettura",
  analyzing: "Lettura del conto, il motore sta calcolando…",
  connectQonto: "Collega Qonto",
  disconnect: "Scollega Qonto",
  headline: (r, c) => `Puoi recuperare ${r} all'anno. ${c ? `${c} già confermati dai fornitori.` : "Ancora nulla confermato da un fornitore."}`,
  headlineSub: (m, n) => `${m} al mese su ${n} leve scelte. Ogni euro viene dal motore, mai dal modello.`,
  ledgerSteps: ["Potenziale", "Approvato", "Eseguito", "Confermato dal fornitore", "Verificato sull'estratto"],
  needsYou: "Serve a te",
  needsYouEmpty: "Niente ti aspetta.",
  needGate: (v) => `${v}: l'agente aspetta il tuo via libera finale`,
  needGateCta: "Rivedi e decidi",
  needApprove: (v) => `Disdire ${v}`,
  needApproveCta: "Disdire con H Company",
  needLetterCta: "Prepara la lettera",
  needClarify: "Pagamenti da chiarire",
  needClarifyCta: "Apri il libro mastro",
  recentRuns: "Ultime disdette",
  subsTitle: "Abbonamenti e leve",
  cancelWithH: "Disdire con H Company",
  replayWithH: "Riproduci la sessione reale",
  prepareLetter: "Lettera",
  risk: { safe: "Senza rischio", med: "Da rivedere", hard: "Progetto" },
  runsTitle: "Disdette",
  stations: ["Approvazione", "Percorso", "Sul portale", "Il tuo via libera", "Prova del fornitore", "Estratto G+30"],
  gateApprove: "Dai il via libera",
  gateRefuse: "Rifiuta",
  ledgerTitle: "Libro mastro",
  close: "Chiudi",
};

const COPY: Record<Lang, DashboardCopy> = { fr, en, de, es, it };

export function dashboardCopy(lang: Lang): DashboardCopy {
  return COPY[lang] ?? en;
}
