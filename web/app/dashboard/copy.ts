import type { CancelChannel, Lang, Risk, UnverifiedReason } from "@/lib/types";
import type { FinalLabelSource } from "@/lib/execution/research/compare";
import type { ImportErrorCode } from "./use-dashboard";

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
  connectClosed: string;
  connectClosedHint: string;
  connectTitle: string;
  connectLede: string;
  importPdf: string;
  importReading: string;
  importAnalyzing: string;
  importedData: string;
  importAlternative: string;
  importPrivacy: string;
  importSample: string;
  importErrors: Record<ImportErrorCode, string>;
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
  pathResearched: (sources: number, day: string) => string;
  pathSeen: string;
  pathNotSeen: string;
  pathFinal: (label: string) => string;
  pathFinalSource: Record<FinalLabelSource, string>;
  pathScore: (seen: number, total: number) => string;
  pathNotes: string;
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
  checkPrices: (pending: number) => string;
  checkingPrices: (done: number, total: number) => string;
  checkPricesNote: string;
  pricePending: string;
  priceUnverified: Record<UnverifiedReason, string>;
  priceSource: (checkedAt: string) => string;
  cancelChannel: Record<CancelChannel, string>;
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
  importPdf: "Importer un relevé PDF",
  importReading: "Lecture du relevé dans ton navigateur…",
  importAnalyzing: "Le moteur analyse le relevé…",
  importedData: "Relevé PDF importé",
  importAlternative: "Pas de compte Qonto ? Importe un relevé bancaire PDF, de n'importe quelle banque.",
  importPrivacy: "Le PDF est lu dans ton navigateur et n'est jamais envoyé : seules les lignes (date, libellé nettoyé, montant) partent au moteur, sans IBAN ni numéro de carte, et rien n'est conservé.",
  importSample: "Télécharger un relevé d'exemple",
  importErrors: {
    not_pdf: "Ce fichier n'est pas un PDF.",
    too_large: "PDF trop lourd (15 Mo maximum).",
    unreadable: "Impossible de lire ce PDF. S'il s'agit d'un scan (image), exporte plutôt le relevé en PDF texte depuis ta banque.",
    no_transactions: "Aucune opération reconnue dans ce PDF : il faut des lignes avec une date et un montant.",
    rate_limited: "Trop d'imports d'affilée, réessaie dans une minute.",
    failed: "L'analyse du relevé a échoué, réessaie.",
  },
  connectTitle: "Connecte ton compte Qonto",
  connectLede: "Kerdaxis lit ton compte en lecture seule : aucun virement, aucune carte, aucune écriture. Tant qu'il n'est pas connecté, ce tableau de bord reste vide, jamais rempli de chiffres de démonstration.",
  liveData: "Compte Qonto réel · lecture seule",
  analyzing: "Lecture du compte et calcul par le moteur…",
  connectQonto: "Connecter Qonto",
  disconnect: "Déconnecter Qonto",
  reconnect: "Ta session Qonto a expiré : les montants affichés sont ceux de la démonstration.",
  unavailable: "Analyse indisponible : les montants affichés sont ceux de la démonstration.",
  connectClosed: "La connexion d'un vrai compte Qonto n'est pas encore ouverte sur ce domaine : Qonto doit d'abord autoriser l'adresse de retour de Kerdaxis. En attendant, la démo tourne sur des données d'exemple.",
  connectClosedHint: "Bientôt : Qonto doit d'abord autoriser l'adresse de retour de Kerdaxis.",
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
  pathResearched: (n, day) => `Linkup · ${n} sources · recherche du ${day}`,
  pathSeen: "nommé par l'agent",
  pathNotSeen: "jamais nommé par l'agent",
  pathFinal: (label) => `Bouton final : « ${label} »`,
  pathFinalSource: { docs: "tiré de la doc", screenshots: "lu sur les captures de la doc", catalog: "catalogue Kerdaxis, absent de la doc" },
  pathScore: (seen, total) => `Linkup face à cette exécution : ${seen}/${total} libellés de la doc nommés par l'agent`,
  pathNotes: "Note de l'agent",
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
  checkPrices: (n) => `Vérifier sur le web (${n})`,
  checkingPrices: (d, t) => `Recherche sur le web… ${d}/${t}`,
  checkPricesNote: "Seuls le nom du fournisseur et sa catégorie partent vers Linkup. Chaque euro est ensuite calculé par le moteur à partir d'un prix sourcé et daté. Pour une résiliation, Linkup vérifie aussi si elle se fait en ligne : l'agent H Company s'en charge, sinon une lettre.",
  pricePending: "prix à vérifier",
  priceUnverified: {
    no_price: "non vérifié · aucun prix public trouvé",
    no_seats: "non vérifié · nombre de postes inconnu",
    not_cheaper: "non vérifié · aucune option moins chère trouvée",
    web_down: "non vérifié · recherche web indisponible",
  },
  priceSource: (c) => `source · relevé le ${c}`,
  cancelChannel: {
    online: "résiliable en ligne",
    offline: "pas de résiliation en ligne",
    unknown: "résiliation en ligne non vérifiée",
  },
  close: "Fermer",
  launching: "Lancement…",
  error: "Une erreur est survenue.",
};

const en: DashboardCopy = {
  nav: { today: "Today", subscriptions: "Subscriptions", runs: "Cancellations", ledger: "Ledger" },
  navClassic: "Previous view",
  navPitch: "The pitch",
  demoData: "Demo data",
  importPdf: "Import a PDF statement",
  importReading: "Reading the statement in your browser…",
  importAnalyzing: "The engine is analysing the statement…",
  importedData: "Imported PDF statement",
  importAlternative: "No Qonto account? Import a PDF bank statement from any bank.",
  importPrivacy: "The PDF is read in your browser and never uploaded: only the rows (date, cleaned label, amount) go to the engine, with no IBAN or card number, and nothing is stored.",
  importSample: "Download a sample statement",
  importErrors: {
    not_pdf: "This file isn't a PDF.",
    too_large: "PDF too large (15 MB max).",
    unreadable: "This PDF can't be read. If it's a scan (an image), export the statement as a text PDF from your bank instead.",
    no_transactions: "No transactions recognised in this PDF: it needs rows with a date and an amount.",
    rate_limited: "Too many imports in a row, try again in a minute.",
    failed: "Analysing the statement failed, please try again.",
  },
  connectTitle: "Connect your Qonto account",
  connectLede: "Kerdaxis reads your account read-only: no transfers, no cards, no writes. Until it is connected, this dashboard stays empty, never filled with demo figures.",
  liveData: "Real Qonto account · read-only",
  analyzing: "Reading the account, the engine is computing…",
  connectQonto: "Connect Qonto",
  disconnect: "Disconnect Qonto",
  reconnect: "Your Qonto session expired: the amounts shown are demo data.",
  unavailable: "Analysis unavailable: the amounts shown are demo data.",
  connectClosed: "Connecting a real Qonto account isn't open on this domain yet: Qonto must first approve Kerdaxis's callback address. Meanwhile, the demo runs on sample data.",
  connectClosedHint: "Coming soon: Qonto must first approve Kerdaxis's callback address.",
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
  pathResearched: (n, day) => `Linkup · ${n} sources · researched ${day}`,
  pathSeen: "named by the agent",
  pathNotSeen: "never named by the agent",
  pathFinal: (label) => `Final button: “${label}”`,
  pathFinalSource: { docs: "from the docs", screenshots: "read on the doc screenshots", catalog: "Kerdaxis catalog, not in the docs" },
  pathScore: (seen, total) => `Linkup vs this run: ${seen}/${total} documented labels named by the agent`,
  pathNotes: "Agent's note",
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
  checkPrices: (n) => `Check on the web (${n})`,
  checkingPrices: (d, t) => `Searching the web… ${d}/${t}`,
  checkPricesNote: "Only the supplier name and its category go to Linkup. Every euro is then computed by the engine from a sourced, dated price. For a cancellation, Linkup also checks whether it can be done online: the H Company agent handles it, otherwise a letter.",
  pricePending: "price to check",
  priceUnverified: {
    no_price: "not verified · no public price found",
    no_seats: "not verified · seat count unknown",
    not_cheaper: "not verified · no cheaper option found",
    web_down: "not verified · web search unavailable",
  },
  priceSource: (c) => `source · checked ${c}`,
  cancelChannel: {
    online: "can be cancelled online",
    offline: "no online cancellation",
    unknown: "online cancellation not verified",
  },
  close: "Close",
  launching: "Starting…",
  error: "Something went wrong.",
};

const de: DashboardCopy = {
  ...en,
  checkPrices: (n) => `Im Web prüfen (${n})`,
  checkingPrices: (d, t) => `Websuche läuft… ${d}/${t}`,
  pricePending: "Preis zu prüfen",
  priceSource: (c) => `Quelle · geprüft am ${c}`,
  agentSubscribers: "Kostenloser Test: Nur die Nuvio-CRM-Sitzung wird abgespielt. Live-Kündigung ist für Abonnenten.",
  nav: { today: "Heute", subscriptions: "Abos", runs: "Kündigungen", ledger: "Hauptbuch" },
  navClassic: "Vorherige Ansicht",
  navPitch: "Der Pitch",
  demoData: "Demodaten",
  importPdf: "PDF-Kontoauszug importieren",
  importReading: "Auszug wird in deinem Browser gelesen…",
  importAnalyzing: "Die Engine analysiert den Auszug…",
  importedData: "Importierter PDF-Auszug",
  importAlternative: "Kein Qonto-Konto? Importiere einen PDF-Kontoauszug von einer beliebigen Bank.",
  importPrivacy: "Das PDF wird in deinem Browser gelesen und nie hochgeladen: Nur die Zeilen (Datum, bereinigter Text, Betrag) gehen an die Engine, ohne IBAN oder Kartennummer, und nichts wird gespeichert.",
  importSample: "Beispielauszug herunterladen",
  importErrors: {
    not_pdf: "Diese Datei ist kein PDF.",
    too_large: "PDF zu groß (max. 15 MB).",
    unreadable: "Dieses PDF kann nicht gelesen werden. Ist es ein Scan (Bild), exportiere den Auszug lieber als Text-PDF bei deiner Bank.",
    no_transactions: "Keine Buchungen in diesem PDF erkannt: Es braucht Zeilen mit Datum und Betrag.",
    rate_limited: "Zu viele Importe hintereinander, versuche es in einer Minute erneut.",
    failed: "Die Analyse des Auszugs ist fehlgeschlagen, bitte erneut versuchen.",
  },
  connectTitle: "Verbinde dein Qonto-Konto",
  connectLede: "Kerdaxis liest dein Konto nur lesend: keine Überweisungen, keine Karten, keine Schreibzugriffe. Solange es nicht verbunden ist, bleibt dieses Dashboard leer, nie mit Demozahlen gefüllt.",
  liveData: "Echtes Qonto-Konto · nur Lesen",
  analyzing: "Konto wird gelesen, die Engine rechnet…",
  connectQonto: "Qonto verbinden",
  disconnect: "Qonto trennen",
  connectClosed: "Die Verbindung eines echten Qonto-Kontos ist auf dieser Domain noch nicht freigeschaltet: Qonto muss zuerst die Rückruf-Adresse von Kerdaxis zulassen. Bis dahin läuft die Demo mit Beispieldaten.",
  connectClosedHint: "Demnächst: Qonto muss zuerst die Rückruf-Adresse von Kerdaxis zulassen.",
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
  checkPrices: (n) => `Verificar en la web (${n})`,
  checkingPrices: (d, t) => `Buscando en la web… ${d}/${t}`,
  pricePending: "precio por verificar",
  priceSource: (c) => `fuente · consultada el ${c}`,
  agentSubscribers: "Prueba gratuita: solo se reproduce la sesión de Nuvio CRM. La cancelación en directo es para suscriptores.",
  nav: { today: "Hoy", subscriptions: "Suscripciones", runs: "Cancelaciones", ledger: "Libro mayor" },
  navClassic: "Vista anterior",
  navPitch: "El pitch",
  demoData: "Datos de demostración",
  importPdf: "Importar un extracto PDF",
  importReading: "Leyendo el extracto en tu navegador…",
  importAnalyzing: "El motor está analizando el extracto…",
  importedData: "Extracto PDF importado",
  importAlternative: "¿Sin cuenta Qonto? Importa un extracto bancario PDF de cualquier banco.",
  importPrivacy: "El PDF se lee en tu navegador y nunca se sube: solo las líneas (fecha, concepto limpio, importe) van al motor, sin IBAN ni número de tarjeta, y no se guarda nada.",
  importSample: "Descargar un extracto de ejemplo",
  importErrors: {
    not_pdf: "Este archivo no es un PDF.",
    too_large: "PDF demasiado pesado (15 MB máximo).",
    unreadable: "No se puede leer este PDF. Si es un escaneo (imagen), exporta el extracto como PDF de texto desde tu banco.",
    no_transactions: "No se reconoció ninguna operación en este PDF: necesita líneas con fecha e importe.",
    rate_limited: "Demasiadas importaciones seguidas, inténtalo de nuevo en un minuto.",
    failed: "El análisis del extracto falló, inténtalo de nuevo.",
  },
  connectTitle: "Conecta tu cuenta Qonto",
  connectLede: "Kerdaxis lee tu cuenta en solo lectura: sin transferencias, sin tarjetas, sin escrituras. Mientras no esté conectada, este panel queda vacío, nunca con cifras de demostración.",
  liveData: "Cuenta Qonto real · solo lectura",
  analyzing: "Leyendo la cuenta, el motor está calculando…",
  connectQonto: "Conectar Qonto",
  disconnect: "Desconectar Qonto",
  connectClosed: "La conexión de una cuenta Qonto real aún no está abierta en este dominio: Qonto debe autorizar primero la dirección de retorno de Kerdaxis. Mientras tanto, la demo funciona con datos de ejemplo.",
  connectClosedHint: "Próximamente: Qonto debe autorizar primero la dirección de retorno de Kerdaxis.",
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
  checkPrices: (n) => `Verifica sul web (${n})`,
  checkingPrices: (d, t) => `Ricerca sul web… ${d}/${t}`,
  pricePending: "prezzo da verificare",
  priceSource: (c) => `fonte · rilevata il ${c}`,
  agentSubscribers: "Prova gratuita: viene riprodotta solo la sessione Nuvio CRM. La disdetta dal vivo è per gli abbonati.",
  nav: { today: "Oggi", subscriptions: "Abbonamenti", runs: "Disdette", ledger: "Libro mastro" },
  navClassic: "Vista precedente",
  navPitch: "Il pitch",
  demoData: "Dati dimostrativi",
  importPdf: "Importa un estratto conto PDF",
  importReading: "Lettura dell'estratto nel tuo browser…",
  importAnalyzing: "Il motore sta analizzando l'estratto…",
  importedData: "Estratto conto PDF importato",
  importAlternative: "Nessun conto Qonto? Importa un estratto conto PDF di qualsiasi banca.",
  importPrivacy: "Il PDF viene letto nel tuo browser e mai caricato: solo le righe (data, descrizione pulita, importo) vanno al motore, senza IBAN né numero di carta, e nulla viene conservato.",
  importSample: "Scarica un estratto di esempio",
  importErrors: {
    not_pdf: "Questo file non è un PDF.",
    too_large: "PDF troppo pesante (massimo 15 MB).",
    unreadable: "Impossibile leggere questo PDF. Se è una scansione (immagine), esporta l'estratto come PDF di testo dalla tua banca.",
    no_transactions: "Nessuna operazione riconosciuta in questo PDF: servono righe con data e importo.",
    rate_limited: "Troppe importazioni di fila, riprova tra un minuto.",
    failed: "L'analisi dell'estratto non è riuscita, riprova.",
  },
  connectTitle: "Collega il tuo conto Qonto",
  connectLede: "Kerdaxis legge il tuo conto in sola lettura: nessun bonifico, nessuna carta, nessuna scrittura. Finché non è collegato, questa dashboard resta vuota, mai riempita con cifre dimostrative.",
  liveData: "Conto Qonto reale · sola lettura",
  analyzing: "Lettura del conto, il motore sta calcolando…",
  connectQonto: "Collega Qonto",
  disconnect: "Scollega Qonto",
  connectClosed: "Il collegamento di un vero conto Qonto non è ancora aperto su questo dominio: Qonto deve prima autorizzare l'indirizzo di ritorno di Kerdaxis. Nel frattempo, la demo usa dati di esempio.",
  connectClosedHint: "Presto disponibile: Qonto deve prima autorizzare l'indirizzo di ritorno di Kerdaxis.",
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
