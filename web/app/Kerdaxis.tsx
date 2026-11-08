"use client";

/**
 * Kerdaxis — front d'entrée, bilingue FR / EN.
 * Au montage, il fetch /api/analyze (Qonto → Holo → engine.ts). Tant que la
 * réponse n'arrive pas — ou si l'API échoue — il affiche les données mock.
 * La langue est persistée (localStorage) et transmise à Holo (lettres, benchmark).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResult, Lang, Lever, Localized, Nature, NatureSlice, Risk } from "@/lib/types";
import { buildPlanCsv, planFilename } from "@/lib/export";
import { MOCK } from "@/lib/mock";
import { WAITLIST_URL } from "@/lib/site";
import { categorizerName, detectLang, eur as eurFmt, LANGS, LOCALE, natureLabel, PITCH, riskLabel, tr } from "@/lib/i18n";
import { EUROPE_PATHS, EUROPE_VIEWBOX, EU_CITY_XY } from "@/lib/europeMap";
import ExecutionPanel, { launchCancellation } from "./ExecutionPanel";
import VoiceCommand from "./VoiceCommand";
import { parseIntent } from "@/lib/voice/intents";
import { dashboardCopy } from "./dashboard/copy";
import { useAccessLog, type AccessEntryView } from "./dashboard/use-access-log";

// Agent conversationnel ElevenLabs (Q&A vocal). Vide = widget Q&A désactivé.
const CONVAI_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

const MAX_AUDIT_ROWS = 8;

const ACCESS_SERVICE_LABEL: Record<AccessEntryView["service"], string> = {
  qonto: "Qonto",
  anthropic: "Anthropic",
  linkup: "Linkup",
  hcompany: "H Company",
  gladia: "Gladia",
  elevenlabs: "ElevenLabs",
};

// Rend un texte avec emphase **...** → <strong>.
function emph(text: string, keyBase: string): React.ReactNode[] {
  return text.split("**").map((seg, i) =>
    i % 2 === 1 ? <strong key={`${keyBase}-${i}`}>{seg}</strong> : <React.Fragment key={`${keyBase}-${i}`}>{seg}</React.Fragment>,
  );
}

// Résout un dictionnaire 5-langues, avec repli propre sur l'anglais.
function pick<T>(lang: Lang, m: Record<Lang, T>): T {
  return m[lang] ?? m.en;
}

// Sélecteur de langue : drapeau + code (persisté dans localStorage).
const LANG_CHOICES: { code: Lang; flag: string; label: string }[] = [
  { code: "fr", flag: "🇫🇷", label: "FR" },
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "es", flag: "🇪🇸", label: "ES" },
  { code: "it", flag: "🇮🇹", label: "IT" },
];

const RISK_COLOR: Record<Risk, string> = {
  safe: "var(--c-vert)",
  med: "var(--c-amber)",
  hard: "var(--c-clay)",
};

const NATURE_COLOR: Record<Nature, string> = {
  structurel: "var(--c-ink2)",
  ponctuel: "var(--c-amber)",
  perso: "var(--c-line-strong)",
  pilotable: "var(--c-vert)",
};

// Entreprises flottant sur la carte d'Europe (hero du pitch).
// La position (x/y en % du viewBox) vient de EU_CITY_XY, reprojetée avec la
// carte. t = taille (1 petit … 3 grand) ; cfo = la rare entreprise (les 10%)
// qui a un DAF → bulle verte.
type EuCo = { city: string; t: 1 | 2 | 3; cfo?: boolean };
const EU_COMPANIES: EuCo[] = [
  { city: "London", t: 3 },
  { city: "Dublin", t: 1 },
  { city: "Paris", t: 3, cfo: true },
  { city: "Amsterdam", t: 2 },
  { city: "Bruxelles", t: 1 },
  { city: "Berlin", t: 3 },
  { city: "Warszawa", t: 2 },
  { city: "Praha", t: 1 },
  { city: "München", t: 2 },
  { city: "Wien", t: 2 },
  { city: "Zürich", t: 1 },
  { city: "Milano", t: 2 },
  { city: "Roma", t: 2 },
  { city: "Madrid", t: 2 },
  { city: "Barcelona", t: 1, cfo: true },
  { city: "Lisboa", t: 1 },
  { city: "Stockholm", t: 1 },
  { city: "København", t: 1 },
];

// Compteur animé, respecte prefers-reduced-motion. Se relance quand `trigger` change.
function useCountUp(target: number, trigger: unknown, ms = 900) {
  const [val, setVal] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVal(target);
      setReady(true);
      return;
    }
    setReady(false);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setReady(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return { val, ready };
}

export default function Kerdaxis() {
  const [lang, setLang] = useState<Lang>("fr");
  const [data, setData] = useState<AnalyzeResult>(MOCK);
  const [levers, setLevers] = useState(MOCK.levers);
  const [horizon, setHorizon] = useState(12);
  const [loaded, setLoaded] = useState(false);
  // Refus de /api/analyze. `null` = pas de refus. Voir l'effet de chargement :
  // un 401 ne doit JAMAIS être confondu avec une analyse.
  const [refusApi, setRefusApi] = useState<null | "reconnexion" | "indisponible">(null);
  // Compte Qonto branché ou non. Sert à n'afficher « Déconnecter » qu'à qui a
  // quelque chose à déconnecter.
  const [connecte, setConnecte] = useState(false);
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);

  const T = tr(lang);
  const modelName = categorizerName(data.meta?.categorized);
  const eur = (n: number) => eurFmt(n, lang);
  // Résout un texte 5-langues (repli anglais) ; loc() résout un Localized (fr/en only).
  const L = (m: Record<Lang, string>) => pick(lang, m);
  const loc = (x: Localized) => x[lang as "fr" | "en"] ?? x.en;
  const auditCopy = dashboardCopy(lang);
  const access = useAccessLog();

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? window.localStorage.getItem("argentier-lang") : null;
    setLang(saved && (LANGS as string[]).includes(saved) ? (saved as Lang) : detectLang(navigator.language));
  }, []);

  const changeLang = (l: Lang) => {
    setLang(l);
    try {
      window.localStorage.setItem("argentier-lang", l);
    } catch {
      /* stockage indisponible — pas grave */
    }
  };

  // --- Présentation / elevator pitch ---------------------------------------
  const [pitchOpen, setPitchOpen] = useState(false);
  useEffect(() => {
    if (!pitchOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPitchOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pitchOpen]);

  // --- Autopilote — démo done-for-you : audit → gate 1-tap → preuve --------
  const [apOpen, setApOpen] = useState(false);
  const [apStep, setApStep] = useState(0); // 0 observe … 3 gate … 6 preuve
  const [apDecision, setApDecision] = useState<"pending" | "approved" | "refused">("pending");
  // Board Trello + liste d'attente (fake-it)
  const [board, setBoard] = useState<Record<string, "todo" | "doing" | "done">>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [wl, setWl] = useState<string | null>(null);
  const [wlEmail, setWlEmail] = useState("");
  const [wlJoined, setWlJoined] = useState<Record<string, boolean>>({});
  // Liste d'attente « connecter Qonto » (bas de page) → Cloudflare KV.
  const [qEmail, setQEmail] = useState("");
  const [qJoined, setQJoined] = useState(false);
  const submitQonto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qEmail.includes("@")) return;
    try {
      await fetch(WAITLIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: qEmail.trim().toLowerCase(), lang, source: "connect-qonto-demo" }),
      });
    } catch {
      /* réseau — on ne bloque pas */
    }
    setQJoined(true);
  };
  // Voix ElevenLabs (TTS « explique-moi » + widget Q&A conditionnel)
  const [voiceState, setVoiceState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const convaiRef = React.useRef<HTMLDivElement | null>(null);
  const startAutopilot = () => {
    setApDecision("pending");
    setApStep(0);
    setApOpen(true);
  };

  // Kerdaxis — exécution réelle par un agent H Company sur le portail du
  // fournisseur. Disponible seulement si le serveur annonce l'agent ET le
  // portail configurés : sinon l'Autopilote reste en simulation, sans le cacher.
  const [execId, setExecId] = useState<string | null>(null);
  const [execSuppliers, setExecSuppliers] = useState<string[]>([]);
  const [execBusy, setExecBusy] = useState(false);
  const [execErr, setExecErr] = useState<string | null>(null);
  const [execPortalLocal, setExecPortalLocal] = useState(false);
  useEffect(() => {
    fetch("/api/execution/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { hcompany: boolean; suppliers: { id: string }[]; portal?: { configured: boolean; online: boolean } } | null) => {
        if (s?.hcompany) setExecSuppliers(s.suppliers.map((x) => x.id));
        setExecPortalLocal(Boolean(s?.portal?.configured && !s.portal.online));
      })
      .catch(() => undefined);
  }, []);
  const executable = (id: string) => execSuppliers.includes(id);

  // Commande vocale (transcription Gladia) → intention déterministe → action.
  // Les montants dits à voix haute sont ceux du moteur, affichés à l'écran.
  const onVoiceCommand = (text: string): string => {
    const fr = lang === "fr";
    const intent = parseIntent(text, levers.map((l) => ({ id: l.id, label: l.label })));
    switch (intent.kind) {
      case "explain":
        return voiceScript();
      case "audit":
        startAutopilot();
        return fr
          ? "Je lance l'audit : lecture du compte en lecture seule, calcul par le moteur, puis une décision à valider."
          : "Starting the audit: read-only account access, the engine does the math, then one decision for you to approve.";
      case "savings":
        return fr
          ? `Tu peux récupérer ${eur(annual)} par an, soit ${eur(monthly)} par mois, sans perdre une seule capacité.`
          : `You can recover ${eur(annual)} a year, that's ${eur(monthly)} a month, without losing a single capability.`;
      case "cancel": {
        const lever = levers.find((l) => l.id === intent.leverId);
        if (!lever) {
          return fr
            ? "Quel abonnement veux-tu résilier ? Dis par exemple « résilie Nuvio »."
            : "Which subscription should I cancel? Say for example “cancel Nuvio”.";
        }
        void openLetter(lever);
        return executable(lever.id)
          ? fr
            ? `J'ai préparé la résiliation de ${lever.label}. Clique sur « Résilier avec H Company » : l'agent s'arrêtera avant le clic définitif, et le feu vert final se donne à l'écran.`
            : `I prepared the cancellation of ${lever.label}. Click “Cancel with H Company”: the agent will stop before the final click, and the final go is given on screen.`
          : fr
            ? `J'ai ouvert la lettre de résiliation de ${lever.label}, prête à envoyer. L'exécution par l'agent n'est pas encore disponible pour ce fournisseur.`
            : `I opened the ready-to-send cancellation letter for ${lever.label}. Agent execution isn't available for this supplier yet.`;
      }
      case "final_approval_by_voice":
        return fr
          ? "Par sécurité, le feu vert final d'une résiliation ne se donne jamais à la voix : clique sur le bouton à l'écran."
          : "For safety, the final go for a cancellation is never given by voice: click the button on screen.";
      default:
        return fr
          ? "Je n'ai pas compris. Essaie : « explique-moi », « trouve mes abonnements inutilisés », « combien je peux économiser », ou « résilie Nuvio »."
          : "I didn't get that. Try: “explain this”, “find my unused subscriptions”, “how much can I save”, or “cancel Nuvio”.";
    }
  };
  const runExecution = async (supplierId: string) => {
    setExecBusy(true);
    setExecErr(null);
    try {
      const id = await launchCancellation(supplierId);
      setApOpen(false);
      setExecId(id);
    } catch (e) {
      setExecErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExecBusy(false);
    }
  };
  useEffect(() => {
    // le gate (3) et la fin (6) ne s'auto-avancent pas
    if (!apOpen || apStep === 3 || apStep >= 6) return;
    const id = setTimeout(() => setApStep((s) => s + 1), apStep === 0 ? 1000 : 1200);
    return () => clearTimeout(id);
  }, [apOpen, apStep]);

  useEffect(() => {
    // Le départ OAuth renvoie ici avec un code de situation. Sans cette
    // lecture, un refus côté serveur arrivait sur une page muette.
    const situation = new URLSearchParams(window.location.search).get("qonto");
    if (situation === "indisponible" || situation === "erreur") setRefusApi("indisponible");

    let vivant = true;
    fetch("/api/auth/qonto/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((etat: { connected?: boolean } | null) => {
        if (vivant && etat) setConnecte(Boolean(etat.connected));
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  const deconnecter = async () => {
    setDeconnexionEnCours(true);
    try {
      await fetch("/api/auth/qonto/revoke", { method: "POST" });
    } finally {
      // Rechargement plutôt que remise à zéro locale : la déconnexion change la
      // source des données côté serveur, tout l'écran doit être reconstruit.
      window.location.href = "/demo";
    }
  };

  useEffect(() => {
    let alive = true;
    // `r.ok` est VÉRIFIÉ, et ce n'est pas un détail : sans ce contrôle, un 401
    // « reconnecte ton compte » était parsé comme une analyse, l'écran retombait
    // sur MOCK, et l'utilisateur lisait des montants FICTIFS en croyant qu'ils
    // étaient les siens. Sur un produit qui vend la justesse des chiffres, c'est
    // le pire défaut possible. Un refus doit se voir.
    fetch("/api/analyze")
      .then(async (r) => {
        if (r.ok) return { ok: true as const, data: (await r.json()) as AnalyzeResult };
        return { ok: false as const, statut: r.status };
      })
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setData(res.data);
          setLevers(res.data.levers);
          setRefusApi(null);
        } else {
          // 401 = session valide mais jeton indisponible. Les données affichées
          // restent celles de la démonstration : on le DIT, on ne le masque pas.
          setRefusApi(res.statut === 401 ? "reconnexion" : "indisponible");
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setRefusApi("indisponible");
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const monthly = useMemo(
    () => levers.filter((l) => l.active).reduce((s, l) => s + l.saving, 0),
    [levers],
  );
  const annual = monthly * 12;
  const optimized = data.totals.runRate - monthly;
  const pct = data.totals.runRate > 0 ? Math.round((monthly / data.totals.runRate) * 100) : 0;

  const { val: heroVal, ready } = useCountUp(annual, loaded);
  const shownAnnual = ready ? annual : heroVal;

  // Levier vedette de l'autopilote : le plus gros gain actif.
  const apLever = useMemo(
    () => [...levers].filter((l) => l.active).sort((a, b) => b.saving - a.saving)[0] ?? levers[0],
    [levers],
  );


  // Texte que la voix lit — dans la langue courante, avec le chiffre du hero.
  const voiceScript = () => {
    const a = eur(annual);
    const s: Record<Lang, string> = {
      fr: `Bienvenue sur Kerdaxis, ton directeur financier autonome. Ton relevé Qonto cache ton vrai run-rate : il mélange abonnements récurrents, charges structurelles et dépenses ponctuelles. Kerdaxis a séparé tes flux et repéré environ ${a} par an récupérables, sans perdre une seule capacité. Plus bas, le simulateur montre chaque levier : tu actives, tu désactives, et tu prépares la lettre de résiliation en un clic. Le bouton Autopilote lance l'audit tout seul, te propose chaque action à approuver, et prouve l'économie trente jours après. Tu approuves, tu envoies : Kerdaxis ne bouge jamais ton argent.`,
      en: `Welcome to Kerdaxis, your autonomous CFO. Your Qonto statement hides your true run-rate: it blends recurring tools, structural costs and one-off spend. Kerdaxis separated your flows and found about ${a} a year you can recover, without losing a single capability. Below, the simulator shows every lever: toggle them, and prepare the cancellation letter in one click. The Autopilot button runs the audit on its own, proposes each action for you to approve, and proves the saving thirty days later. You approve, you send: Kerdaxis never moves your money.`,
      de: `Willkommen bei Kerdaxis, deinem autonomen CFO. Dein Qonto-Auszug verbirgt deine echte Run-Rate: Er wirft laufende Tools, Strukturkosten und Einmalausgaben zusammen. Kerdaxis hat deine Flüsse getrennt und rund ${a} pro Jahr gefunden, die du zurückholen kannst, ohne eine einzige Funktion zu verlieren. Weiter unten zeigt der Simulator jeden Hebel: ein- und ausschalten und das Kündigungsschreiben mit einem Klick vorbereiten. Der Autopilot-Knopf führt die Prüfung selbst durch, schlägt jede Aktion zur Freigabe vor und beweist die Einsparung dreißig Tage später. Du gibst frei, du sendest: Kerdaxis bewegt dein Geld nie.`,
      es: `Bienvenido a Kerdaxis, tu director financiero autónomo. Tu extracto de Qonto oculta tu verdadero run-rate: mezcla herramientas recurrentes, costes estructurales y gastos puntuales. Kerdaxis ha separado tus flujos y ha encontrado unos ${a} al año que puedes recuperar, sin perder ni una sola capacidad. Más abajo, el simulador muestra cada palanca: actívalas y prepara la carta de baja en un clic. El botón Autopiloto ejecuta la auditoría solo, te propone cada acción para aprobar y demuestra el ahorro treinta días después. Tú apruebas, tú envías: Kerdaxis nunca mueve tu dinero.`,
      it: `Benvenuto su Kerdaxis, il tuo CFO autonomo. Il tuo estratto conto Qonto nasconde il vero run-rate: mescola strumenti ricorrenti, costi strutturali e spese una tantum. Kerdaxis ha separato i tuoi flussi e ha trovato circa ${a} all'anno che puoi recuperare, senza perdere una sola funzionalità. Più in basso, il simulatore mostra ogni leva: attivale e prepara la lettera di disdetta con un clic. Il pulsante Autopilota esegue l'audit da solo, ti propone ogni azione da approvare e dimostra il risparmio trenta giorni dopo. Tu approvi, tu invii: Kerdaxis non muove mai i tuoi soldi.`,
    };
    return s[lang] ?? s.en;
  };

  const playVoice = async () => {
    if (voiceState === "playing") {
      audioRef.current?.pause();
      setVoiceState("idle");
      return;
    }
    setVoiceState("loading");
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: voiceScript(), lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setVoiceState("idle");
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setVoiceState("idle");
      await audio.play();
      setVoiceState("playing");
    } catch {
      setVoiceState("idle");
    }
  };

  // Widget conversationnel ElevenLabs (Q&A vocal) — seulement si un agent public
  // est configuré (NEXT_PUBLIC_ELEVENLABS_AGENT_ID). Suit la langue courante.
  useEffect(() => {
    if (!CONVAI_AGENT_ID || !convaiRef.current) return;
    if (!document.querySelector("script[data-elevenlabs-convai]")) {
      const sc = document.createElement("script");
      sc.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
      sc.async = true;
      sc.setAttribute("data-elevenlabs-convai", "");
      document.body.appendChild(sc);
    }
    const el = document.createElement("elevenlabs-convai");
    el.setAttribute("agent-id", CONVAI_AGENT_ID);
    el.setAttribute("override-language", lang);
    convaiRef.current.innerHTML = "";
    convaiRef.current.appendChild(el);
  }, [lang]);

  const toggle = (id: string) =>
    setLevers((ls) => ls.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));
  const setAll = (fn: (l: (typeof levers)[number]) => boolean) =>
    setLevers((ls) => ls.map((l) => ({ ...l, active: fn(l) })));

  // --- Export du plan (CSV / Excel) ----------------------------------------
  const exportCsv = () => {
    const csv = buildPlanCsv({ ...data, levers }, levers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = planFilename(data);
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Tiroir « lettre prête à envoyer » + benchmark web -------------------
  type LetterSource = { name: string; price: string; date: string; url: string };
  type BenchAlt = { name: string; monthlyPrice: number | null; unit: string; sourceUrl: string; sourceDate: string };
  type BenchResult = {
    verified: boolean;
    note?: string;
    alternatives: BenchAlt[];
    sources: { title: string; url: string; date: string }[];
    bestSaving: number;
    bestAlternative: string | null;
    provider?: "linkup";
  };

  const [letterFor, setLetterFor] = useState<Lever | null>(null);
  const [letterText, setLetterText] = useState("");
  const [letterLoading, setLetterLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [benchLoading, setBenchLoading] = useState(false);

  // Fermeture du tiroir : il repart par le bord droit avant d'être retiré.
  const [letterClosing, setLetterClosing] = useState(false);
  const letterCloseTimer = useRef<number | null>(null);
  const DRAWER_EXIT_MS = 200;
  const closeLetter = () => {
    if (letterCloseTimer.current) window.clearTimeout(letterCloseTimer.current);
    setLetterClosing(true);
    letterCloseTimer.current = window.setTimeout(() => {
      letterCloseTimer.current = null;
      setLetterFor(null);
      setLetterClosing(false);
    }, DRAWER_EXIT_MS);
  };

  const openLetter = async (l: Lever, sources?: LetterSource[]) => {
    // Une réouverture pendant la sortie annule la fermeture en cours.
    if (letterCloseTimer.current) {
      window.clearTimeout(letterCloseTimer.current);
      letterCloseTimer.current = null;
    }
    setLetterClosing(false);
    setLetterFor(l);
    setLetterText("");
    setCopied(false);
    if (!sources) setBench(null);
    setLetterLoading(true);
    try {
      const res = await fetch("/api/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: l.label,
          action: l.action ?? "renegotiate",
          alternative: l.to,
          savingMonthly: l.saving,
          savingAnnual: l.saving * 12,
          lang,
          sources,
        }),
      });
      const json = await res.json();
      setLetterText(json.letter ?? "…");
    } catch {
      setLetterText(
        L({
          fr: "Erreur réseau — réessaie.",
          en: "Network error — try again.",
          de: "Netzwerkfehler — versuch es erneut.",
          es: "Error de red — inténtalo de nuevo.",
          it: "Errore di rete — riprova.",
        }),
      );
    } finally {
      setLetterLoading(false);
    }
  };

  const runBenchmark = async (l: Lever) => {
    setBenchLoading(true);
    setBench(null);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: l.label, category: l.pole ?? "outil SaaS", monthly: l.monthly ?? 0, action: l.action, lang }),
      });
      setBench(await res.json());
    } catch {
      setBench({ verified: false, note: T.benchNone, alternatives: [], sources: [], bestSaving: 0, bestAlternative: null });
    } finally {
      setBenchLoading(false);
    }
  };

  const regenerateWithPrices = () => {
    if (!letterFor || !bench) return;
    const sources: LetterSource[] = bench.alternatives
      .filter((a) => a.monthlyPrice != null)
      .map((a) => ({
        name: a.name,
        price: `${a.monthlyPrice} €${a.unit || "/mois"}`,
        date: a.sourceDate,
        url: a.sourceUrl,
      }));
    openLetter(letterFor, sources);
  };

  const copyLetter = async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard indisponible */
    }
  };

  const natureTotal = data.natures.reduce((s, n) => s + n.amount, 0) || 1;
  const maxPole = Math.max(1, ...data.poles.map((p) => p.amount));
  const scoreDash = `${data.score.value} ${100 - data.score.value}`;

  return (
    <div className="arg-root">
      <style>{CSS}</style>

      {refusApi && (
        <div className="arg-alerte" role="alert">
          <strong>
            {refusApi === "reconnexion"
              ? L({
                  fr: "Impossible de lire ton compte Qonto.",
                  en: "Cannot read your Qonto account.",
                  de: "Ihr Qonto-Konto kann nicht gelesen werden.",
                  es: "No se puede leer tu cuenta Qonto.",
                  it: "Impossibile leggere il tuo conto Qonto.",
                })
              : L({
                  fr: "L'analyse est momentanément indisponible.",
                  en: "The analysis is temporarily unavailable.",
                  de: "Die Analyse ist derzeit nicht verfügbar.",
                  es: "El análisis no está disponible temporalmente.",
                  it: "L'analisi è momentaneamente non disponibile.",
                })}
          </strong>{" "}
          {L({
            fr: "Les montants ci-dessous sont ceux de la démonstration, pas les tiens.",
            en: "The figures below are demonstration data, not yours.",
            de: "Die Zahlen unten sind Demodaten, nicht Ihre.",
            es: "Las cifras siguientes son de demostración, no las tuyas.",
            it: "Gli importi sotto sono di dimostrazione, non i tuoi.",
          })}
          {refusApi === "reconnexion" && (
            <a className="arg-alerte-lien" href="/api/auth/qonto/start">
              {L({
                fr: "Reconnecter mon compte",
                en: "Reconnect my account",
                de: "Konto neu verbinden",
                es: "Reconectar mi cuenta",
                it: "Ricollega il mio conto",
              })}
            </a>
          )}
        </div>
      )}

      {/* Barre */}
      <header className="arg-top">
        <div className="arg-brand">
          <span className="arg-mark"><ArgLogo /></span>
          <span className="arg-word">Kerdaxis</span>
          <span className="arg-chip">
            {data.account.name} · {data.account.bank}
          </span>
          <span className={"arg-src " + (data.meta?.source === "qonto" ? "live" : "demo")}>
            ● {data.meta?.source === "qonto" ? T.srcLive : T.srcDemo}
            {modelName ? ` · ${T.byModel(modelName)}` : ""}
          </span>
        </div>
        <div className="arg-top-right">
          {connecte ? (
            <button
              className="arg-deco"
              onClick={deconnecter}
              disabled={deconnexionEnCours}
              title={L({
                fr: "Supprime les jetons d'accès et met fin à la session",
                en: "Deletes access tokens and ends the session",
                de: "Löscht Zugriffstoken und beendet die Sitzung",
                es: "Elimina los tokens de acceso y cierra la sesión",
                it: "Elimina i token di accesso e chiude la sessione",
              })}
            >
              {deconnexionEnCours
                ? L({ fr: "Déconnexion…", en: "Signing out…", de: "Abmelden…", es: "Cerrando…", it: "Disconnessione…" })
                : L({ fr: "Déconnecter", en: "Sign out", de: "Abmelden", es: "Desconectar", it: "Disconnetti" })}
            </button>
          ) : (
            <a className="arg-deco" href="/api/auth/qonto/start">
              {L({
                fr: "Connecter Qonto",
                en: "Connect Qonto",
                de: "Qonto verbinden",
                es: "Conectar Qonto",
                it: "Collega Qonto",
              })}
            </a>
          )}
          <button className="arg-ap-open" onClick={startAutopilot}>
            ⚡ {L({ fr: "Autopilote", en: "Autopilot", de: "Autopilot", es: "Autopiloto", it: "Autopilota" })}
          </button>
          <button className="arg-pitch-open" onClick={() => setPitchOpen(true)}>
            ▶ {T.pitch}
          </button>
          <div className="arg-lang" role="group" aria-label="Language">
            {LANG_CHOICES.map((c) => (
              <button
                key={c.code}
                className={"arg-lang-btn" + (lang === c.code ? " on" : "")}
                onClick={() => changeLang(c.code)}
                aria-pressed={lang === c.code}
              >
                <span className="arg-lang-flag" aria-hidden="true">{c.flag}</span> {c.label}
              </button>
            ))}
          </div>
          <span className="arg-window">{loc(data.window.label)}</span>
        </div>
      </header>

      {/* Hero */}
      <section className="arg-hero">
        <div>
          <p className="arg-eyebrow">{loaded ? T.heroEyebrow : T.analyzing}</p>
          <p className={"arg-figure" + (loaded ? "" : " loading")} aria-live="polite">
            {eur(shownAnnual)}
          </p>
          <p className="arg-sub">{T.heroSub(eur(monthly))}</p>
          <button
            className="arg-cta"
            onClick={() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {T.cta}
          </button>
        </div>

        <div className="arg-hero-side">
          <div className="arg-score">
            <svg viewBox="0 0 36 36" width="84" height="84" aria-hidden="true">
              <circle className="arg-score-bg" cx="18" cy="18" r="15.9155" />
              <circle
                className="arg-score-fg"
                cx="18"
                cy="18"
                r="15.9155"
                strokeDasharray={scoreDash}
                strokeDashoffset="25"
              />
            </svg>
            <div className="arg-score-num">
              <strong>{data.score.value}</strong>
              <span>/100</span>
            </div>
            <p className="arg-score-cap">{T.scoreCap}</p>
          </div>
          <div className="arg-runway">
            <span className="arg-runway-num">
              {T.months(data.runway.months.toLocaleString(LOCALE[lang]))}
            </span>
            <span className="arg-runway-cap">{T.treso(loc(data.runway.note))}</span>
          </div>
        </div>
      </section>

      {/* Barre ledger — natures */}
      <section className="arg-card">
        <div className="arg-card-head">
          <span className="arg-card-title">{T.ledgerTitle}</span>
          <span className="arg-muted arg-mono">{T.thisMonth(eur(data.totals.out))}</span>
        </div>
        <div className="arg-ledger" role="img" aria-label={T.natureAria}>
          {data.natures.map((n) => (
            <div
              key={n.key}
              className="arg-ledger-seg"
              style={{ width: `${(n.amount / natureTotal) * 100}%`, background: NATURE_COLOR[n.key] }}
              title={`${natureLabel(n.key, lang)} ${eur(n.amount)}`}
            />
          ))}
        </div>
        <div className="arg-legend">
          {data.natures.map((n) => (
            <span key={n.key} className="arg-legend-item">
              <i style={{ background: NATURE_COLOR[n.key] }} /> {natureLabel(n.key, lang)}{" "}
              <b className="arg-mono">{eur(n.amount)}</b>
            </span>
          ))}
        </div>
      </section>

      {/* Waterfall — du relevé au vrai run-rate pilotable */}
      <section className="arg-card arg-area-wf">
        <div className="arg-card-head">
          <span className="arg-card-title">{L({ fr: "Du relevé au vrai run-rate", en: "From statement to true run-rate", de: "Vom Auszug zur echten Run-Rate", es: "Del extracto al run-rate real", it: "Dall'estratto al vero run-rate" })}</span>
        </div>
        <NatureWaterfall natures={data.natures} out={data.totals.out} lang={lang} fmt={eur} />
      </section>

      {/* Metric cards */}
      <section className="arg-metrics">
        <Metric label={T.mRunrate} value={eur(data.totals.runRate) + "/m"} note={T.mRunrateNote(eur(data.totals.runRate * 12))} />
        <Metric label={T.mActive} value={eur(monthly) + "/m"} accent note={T.mActiveNote(eur(annual))} />
        <Metric label={T.mOptimized} value={eur(optimized) + "/m"} note={T.mOptimizedNote(pct)} />
      </section>

      {/* Levier fiscal — TVA récupérable (justificatifs manquants) */}
      {data.tvaPerdue && (
        <section className="arg-card arg-tva">
          <div className="arg-tva-body">
            <div>
              <p className="arg-tva-kicker">{L({ fr: "Levier fiscal", en: "Tax lever", de: "Steuerhebel", es: "Palanca fiscal", it: "Leva fiscale" })}</p>
              <p className="arg-tva-title">
                {L({
                  fr: `${data.tvaPerdue.transactions} justificatifs manquants → TVA récupérable`,
                  en: `${data.tvaPerdue.transactions} missing receipts → recoverable VAT`,
                  de: `${data.tvaPerdue.transactions} fehlende Belege → erstattungsfähige MwSt.`,
                  es: `${data.tvaPerdue.transactions} justificantes faltantes → IVA recuperable`,
                  it: `${data.tvaPerdue.transactions} giustificativi mancanti → IVA recuperabile`,
                })}
              </p>
              <p className="arg-tva-sub">
                {L({
                  fr: `Sur ${eur(data.tvaPerdue.baseTtcEur)} de dépenses PRO sans pièce jointe. À confirmer avec ton comptable.`,
                  en: `On ${eur(data.tvaPerdue.baseTtcEur)} of PRO spend with no receipt. To confirm with your accountant.`,
                  de: `Auf ${eur(data.tvaPerdue.baseTtcEur)} PRO-Ausgaben ohne Beleg. Mit deinem Steuerberater zu bestätigen.`,
                  es: `Sobre ${eur(data.tvaPerdue.baseTtcEur)} de gasto PRO sin justificante. A confirmar con tu asesor.`,
                  it: `Su ${eur(data.tvaPerdue.baseTtcEur)} di spese PRO senza giustificativo. Da confermare con il tuo commercialista.`,
                })}
              </p>
            </div>
            <p className="arg-tva-num arg-mono">{eur(data.tvaPerdue.tvaRecuperableEur)}</p>
          </div>
        </section>
      )}

      {/* Détail pilotable par pôle */}
      <section className="arg-card arg-area-poles">
        <div className="arg-card-head">
          <span className="arg-card-title">{T.polesTitle}</span>
        </div>
        <div className="arg-bars">
          {data.poles.map((p) => (
            <div key={p.label} className="arg-bar-row">
              <span className="arg-bar-label">{p.label}</span>
              <div className="arg-bar-track">
                <div className="arg-bar-fill" style={{ width: `${(p.amount / maxPole) * 100}%` }} />
              </div>
              <span className="arg-bar-val arg-mono">{eur(p.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Simulateur */}
      <section className="arg-card" id="plan">
        <div className="arg-card-head">
          <span className="arg-card-title">{T.simTitle}</span>
          <span className="arg-muted">{T.simRecovered(pct)}</span>
        </div>

        <div className="arg-sim-read">
          <SimStat label={T.perMonth} value={eur(monthly)} accent />
          <SimStat label={T.perYear} value={eur(annual)} />
          <SimStat label={T.cumul(horizon)} value={eur(monthly * horizon)} />
          <SimStat label={T.optimizedRunrate} value={eur(optimized)} />
        </div>

        <div className="arg-horizon">
          <label htmlFor="hz">{T.horizon}</label>
          <input
            id="hz"
            type="range"
            min={1}
            max={36}
            value={horizon}
            onChange={(e) => setHorizon(parseInt(e.target.value, 10))}
          />
          <span className="arg-mono">{T.hMonths(horizon)}</span>
        </div>

        <div className="arg-progress">
          <div style={{ width: `${pct}%` }} />
        </div>

        <div className="arg-levers">
          {levers.map((l) => (
            <div key={l.id} className={"arg-lever" + (l.active ? " on" : "")}>
              <button className="arg-lever-toggle" onClick={() => toggle(l.id)} aria-pressed={l.active}>
                <span className="arg-check" aria-hidden="true">
                  {l.active ? "✓" : ""}
                </span>
                <span className="arg-lever-txt">
                  {l.label} <span className="arg-muted">→ {l.to}</span>
                  {l.hausse && (
                    <span
                      className="arg-hausse"
                      title={L({
                        fr: `Hausse silencieuse : ${eur(l.hausse.avantEur)} → ${eur(l.hausse.apresEur)}`,
                        en: `Silent hike: ${eur(l.hausse.avantEur)} → ${eur(l.hausse.apresEur)}`,
                        de: `Stille Erhöhung: ${eur(l.hausse.avantEur)} → ${eur(l.hausse.apresEur)}`,
                        es: `Subida silenciosa: ${eur(l.hausse.avantEur)} → ${eur(l.hausse.apresEur)}`,
                        it: `Aumento silenzioso: ${eur(l.hausse.avantEur)} → ${eur(l.hausse.apresEur)}`,
                      })}
                    >
                      ▲ +{l.hausse.pct}%
                    </span>
                  )}
                </span>
                <span className="arg-risk" style={{ color: RISK_COLOR[l.risk] }}>
                  {riskLabel(l.risk, lang)}
                </span>
                <span className="arg-lever-save arg-mono">{l.saving} €</span>
              </button>
              <select
                className="arg-lever-status"
                value={board[l.id] ?? "todo"}
                onChange={(e) =>
                  setBoard((b) => ({ ...b, [l.id]: e.target.value as "todo" | "doing" | "done" }))
                }
                aria-label={L({ fr: "Statut du suivi", en: "Tracking status", de: "Status", es: "Estado", it: "Stato" })}
                title={L({ fr: "Statut du suivi", en: "Tracking status", de: "Status", es: "Estado", it: "Stato" })}
              >
                <option value="todo">{L({ fr: "À traiter", en: "To do", de: "Zu erledigen", es: "Por hacer", it: "Da fare" })}</option>
                <option value="doing">{L({ fr: "En cours", en: "In progress", de: "In Arbeit", es: "En curso", it: "In corso" })}</option>
                <option value="done">{L({ fr: "Résilié / réduit", en: "Cancelled / reduced", de: "Gekündigt / reduziert", es: "Cancelado / reducido", it: "Disdetto / ridotto" })}</option>
              </select>
              <button
                className="arg-lever-letter"
                onClick={() => openLetter(l)}
                title={T.letterFor(l.label)}
                aria-label={T.letterFor(l.label)}
              >
                ✎
              </button>
            </div>
          ))}
        </div>

        <div className="arg-actions">
          <button className="arg-btn" onClick={() => setAll((l) => l.risk === "safe")}>
            {T.quickWins}
          </button>
          <button className="arg-btn" onClick={() => setAll(() => true)}>
            {T.enableAll}
          </button>
          <button className="arg-btn" onClick={() => setAll(() => false)}>
            {T.disableAll}
          </button>
          <a className="arg-btn" href={`/rapport?lang=${lang}`} target="_blank" rel="noopener">
            {T.printable}
          </a>
          <button className="arg-btn arg-btn-ghost" onClick={exportCsv}>
            {T.exportCsv}
          </button>
        </div>
        <p className="arg-hint">{T.leverHint}</p>
      </section>

      {/* Anomalies */}
      <section className="arg-card arg-area-anom">
        <div className="arg-card-head">
          <span className="arg-card-title">{T.anomTitle}</span>
        </div>
        <ul className="arg-flux">
          {data.flux.map((f, i) => (
            <li key={i} className="arg-flux-row">
              <span className={"arg-dot " + f.tone} aria-hidden="true" />
              <span className="arg-flux-label">{loc(f.label)}</span>
              <span className={"arg-flux-val arg-mono " + f.tone}>{loc(f.value)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Suivi — board drag-and-drop des forfaits à traiter */}
      <section className="arg-card">
        <div className="arg-card-head">
          <span className="arg-card-title">{L({ fr: "Suivi des résiliations", en: "Cancellation tracker", de: "Kündigungs-Tracker", es: "Seguimiento de cancelaciones", it: "Monitoraggio disdette" })}</span>
          <span className="arg-muted">{L({ fr: "glisse-dépose les forfaits", en: "drag & drop the plans", de: "Tarife per Drag & Drop verschieben", es: "arrastra y suelta los planes", it: "trascina e rilascia i piani" })}</span>
        </div>
        <div className="arg-board">
          {(
            [
              ["todo", L({ fr: "À traiter", en: "To do", de: "Zu erledigen", es: "Por hacer", it: "Da fare" })],
              ["doing", L({ fr: "En cours", en: "In progress", de: "In Arbeit", es: "En curso", it: "In corso" })],
              ["done", L({ fr: "Résilié / réduit", en: "Cancelled / reduced", de: "Gekündigt / reduziert", es: "Cancelado / reducido", it: "Disdetto / ridotto" })],
            ] as const
          ).map(([col, title]) => (
            <div
              key={col}
              className={"arg-col" + (dragId ? " drop" : "")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) {
                  setBoard((b) => ({ ...b, [dragId]: col }));
                  setDragId(null);
                }
              }}
            >
              <div className="arg-col-head">
                {title} <b>{levers.filter((l) => (board[l.id] ?? "todo") === col).length}</b>
              </div>
              {levers
                .filter((l) => (board[l.id] ?? "todo") === col)
                .map((l) => (
                  <div
                    key={l.id}
                    className="arg-tile"
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <span className="arg-tile-name">{l.label}</span>
                    <span className="arg-tile-right">
                      <span className="arg-tile-save arg-mono">−{l.saving} €</span>
                      <button
                        className="arg-tile-letter"
                        draggable={false}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openLetter(l);
                        }}
                        title={T.letterFor(l.label)}
                        aria-label={T.letterFor(l.label)}
                      >
                        ✎
                      </button>
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      {/* Journal d'accès réel : chaque appel à un tiers de cette session, écrit au point d'appel réseau. */}
      <section className="arg-card arg-area-audit">
        <div className="arg-card-head">
          <span className="arg-card-title">{auditCopy.auditLog}</span>
          <span className="arg-src live">● {L({ fr: "En direct", en: "Live", de: "Live", es: "En directo", it: "In diretta" })}</span>
        </div>
        {access.failed && access.entries.length === 0 ? (
          <p className="arg-hint">{auditCopy.auditFailed}</p>
        ) : access.loaded && access.entries.length === 0 ? (
          <p className="arg-hint">{auditCopy.auditEmpty}</p>
        ) : (
          <ul className="arg-audit">
            {access.entries.slice(0, MAX_AUDIT_ROWS).map((entry) => (
              <li key={entry.id} className="arg-audit-row">
                <code className="arg-audit-tool">
                  {ACCESS_SERVICE_LABEL[entry.service]} · {entry.operation}
                </code>
                <span className={"arg-audit-out " + (entry.direction === "sent" ? "out" : "in")}>
                  {entry.direction === "sent" ? `↗ ${auditCopy.auditSent} ${entry.sent ?? ""}` : `• ${auditCopy.auditRead}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="arg-hint">{auditCopy.auditNote}</p>
      </section>

      {/* Bientôt — fake-it grisé + liste d'attente */}
      <section className="arg-card">
        <div className="arg-card-head">
          <span className="arg-card-title">{L({ fr: "Bientôt", en: "Coming soon", de: "Demnächst", es: "Próximamente", it: "Prossimamente" })}</span>
          <span className="arg-muted">{L({ fr: "rejoins la liste d'attente", en: "join the waitlist", de: "trag dich in die Warteliste ein", es: "únete a la lista de espera", it: "iscriviti alla lista d'attesa" })}</span>
        </div>
        <div className="arg-soon">
          {(
            [
              [
                "affacturage",
                L({ fr: "Simulation affacturage", en: "Factoring simulation", de: "Factoring-Simulation", es: "Simulación de factoring", it: "Simulazione factoring" }),
                L({ fr: "Combien débloquer en cédant tes factures clients.", en: "How much to unlock by selling your client invoices.", de: "Wie viel du durch den Verkauf deiner Kundenrechnungen freisetzt.", es: "Cuánto liberar cediendo tus facturas de clientes.", it: "Quanto liberare cedendo le tue fatture clienti." }),
              ],
              [
                "balance",
                L({ fr: "Balance âgée", en: "Aged balance", de: "Altersstruktur der Forderungen", es: "Balance por antigüedad", it: "Scadenzario crediti" }),
                L({ fr: "Tes créances clients par ancienneté (30 / 60 / 90 j).", en: "Your receivables by age (30 / 60 / 90 days).", de: "Deine Forderungen nach Alter (30 / 60 / 90 Tage).", es: "Tus cuentas por cobrar por antigüedad (30 / 60 / 90 días).", it: "I tuoi crediti per anzianità (30 / 60 / 90 giorni)." }),
              ],
            ] as const
          ).map(([key, title, desc]) => (
            <div key={key} className="arg-soon-tile">
              <span className="arg-soon-lock" aria-hidden="true">🔒</span>
              <p className="arg-soon-title">{title}</p>
              <p className="arg-soon-desc">{desc}</p>
              <button className="arg-soon-btn" onClick={() => { setWl(key); setWlEmail(""); }}>
                {wlJoined[key]
                  ? L({ fr: "✓ Inscrit", en: "✓ Joined", de: "✓ Eingetragen", es: "✓ Inscrito", it: "✓ Iscritto" })
                  : L({ fr: "Rejoindre la liste d'attente", en: "Join the waitlist", de: "Zur Warteliste", es: "Unirse a la lista de espera", it: "Iscriviti alla lista d'attesa" })}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Connecter son vrai compte Qonto — liste d'attente (email → Cloudflare KV) */}
      <section className="arg-card arg-qwl">
        <h3 className="arg-qwl-title">
          {L({
            fr: "Branche ton vrai compte Qonto",
            en: "Connect your real Qonto account",
            de: "Verbinde dein echtes Qonto-Konto",
            es: "Conecta tu cuenta Qonto real",
            it: "Collega il tuo vero conto Qonto",
          })}
        </h3>
        {qJoined ? (
          <p className="arg-qwl-done">
            <span className="arg-tick" aria-hidden="true">✓</span> {L({ fr: "Tu es sur la liste", en: "You're on the list", de: "Du bist auf der Liste", es: "Estás en la lista", it: "Sei nella lista" })}
          </p>
        ) : (
          <>
            <form className="arg-qwl-form" onSubmit={submitQonto}>
              <input
                className="arg-qwl-input"
                type="email"
                required
                placeholder={L({ fr: "ton@email.com", en: "you@email.com", de: "du@email.com", es: "tu@email.com", it: "tua@email.com" })}
                value={qEmail}
                onChange={(e) => setQEmail(e.target.value)}
                aria-label="email"
              />
              <button className="arg-qwl-btn" type="submit">
                {L({
                  fr: "Rejoindre : connecter Qonto",
                  en: "Join: connect Qonto",
                  de: "Beitreten: Qonto verbinden",
                  es: "Unirse: conectar Qonto",
                  it: "Iscriviti: collega Qonto",
                })}
              </button>
            </form>
            <p className="arg-qwl-hint">
              {L({
                fr: "Pour rejoindre la liste d'attente, connecte ton email.",
                en: "To join the waitlist, connect your email.",
                de: "Um der Warteliste beizutreten, gib deine E-Mail an.",
                es: "Para unirte a la lista de espera, conecta tu email.",
                it: "Per iscriverti alla lista d'attesa, collega la tua email.",
              })}
            </p>
          </>
        )}
      </section>

      <footer className="arg-foot">
        {data.meta?.source === "mock"
          ? T.footMock
          : T.footReal(data.meta?.txCount ?? 0, modelName)}
        {T.footPrivacy}
        <br />
        <b>
          {L({
            fr: "Prototype pour Hackathon Qonto",
            en: "Prototype for Qonto Hackathon",
            de: "Prototyp für den Qonto-Hackathon",
            es: "Prototipo para el Hackathon de Qonto",
            it: "Prototipo per l'Hackathon Qonto",
          })}
        </b>
      </footer>

      {/* Tiroir : lettre prête à envoyer (gate humain) */}
      {letterFor && (
        <div
          className={"arg-drawer-wrap" + (letterClosing ? " closing" : "")}
          role="dialog"
          aria-modal="true"
          aria-label={letterFor.label}
        >
          <div className="arg-drawer-backdrop" onClick={closeLetter} />
          <aside className="arg-drawer">
            <div className="arg-drawer-head">
              <div>
                <p className="arg-drawer-eyebrow">{T.drawerEyebrow}</p>
                <h3 className="arg-drawer-title">{letterFor.label}</h3>
              </div>
              <button className="arg-drawer-close" onClick={closeLetter} aria-label={T.close}>
                ✕
              </button>
            </div>

            {letterLoading ? (
              <div className="arg-drawer-loading">{T.drawerLoading}</div>
            ) : (
              <textarea
                className="arg-drawer-text arg-mono"
                value={letterText}
                onChange={(e) => setLetterText(e.target.value)}
                spellCheck={false}
              />
            )}

            <div className="arg-drawer-actions">
              <button className="arg-btn" onClick={() => openLetter(letterFor)} disabled={letterLoading}>
                {T.regenerate}
              </button>
              <button className="arg-btn arg-btn-ghost" onClick={copyLetter} disabled={letterLoading || !letterText}>
                {copied ? T.copied : T.copy}
              </button>
            </div>

            {/* Kerdaxis — résiliation exécutée par un agent H Company sur le portail du fournisseur */}
            <button
              className="arg-hco"
              disabled={!executable(letterFor.id) || execBusy}
              onClick={() => {
                closeLetter();
                setBoard((b) => ({ ...b, [letterFor.id]: "doing" }));
                void runExecution(letterFor.id);
              }}
              title={
                executable(letterFor.id)
                  ? L({
                      fr: "Un agent H Company résilie sur le portail du fournisseur et s'arrête avant le clic définitif.",
                      en: "An H Company agent cancels on the supplier portal and stops before the final click.",
                      de: "Ein H-Company-Agent kündigt im Lieferantenportal und stoppt vor dem letzten Klick.",
                      es: "Un agente de H Company cancela en el portal del proveedor y se detiene antes del clic final.",
                      it: "Un agente H Company disdice sul portale del fornitore e si ferma prima del clic finale.",
                    })
                  : undefined
              }
            >
              ⚡{" "}
              {execBusy
                ? L({ fr: "Lancement de l'agent…", en: "Starting the agent…", de: "Agent startet…", es: "Iniciando el agente…", it: "Avvio dell'agente…" })
                : L({ fr: "Résilier avec H Company", en: "Cancel with H Company", de: "Mit H Company kündigen", es: "Cancelar con H Company", it: "Disdire con H Company" })}
              <span className="arg-hco-tag">computer-use agent</span>
            </button>
            <p className="arg-hco-note">
              {executable(letterFor.id)
                ? L({
                    fr: "Tu valides chaque étape : l'agent attend ton feu vert avant de confirmer.",
                    en: "You stay in control: the agent waits for your go before confirming.",
                    de: "Du behältst die Kontrolle: Der Agent wartet vor der Bestätigung auf dein Go.",
                    es: "Tú decides: el agente espera tu visto bueno antes de confirmar.",
                    it: "Decidi tu: l'agente attende il tuo via prima di confermare.",
                  })
                : execSuppliers.length && !(letterFor.id === "nuvio" && execPortalLocal)
                  ? L({
                      fr: "Pas encore pris en charge pour ce fournisseur (démo : Nuvio CRM, Lumen Analytics).",
                      en: "Not yet supported for this supplier (demo: Nuvio CRM, Lumen Analytics).",
                      de: "Für diesen Anbieter noch nicht verfügbar (Demo: Nuvio CRM, Lumen Analytics).",
                      es: "Aún no disponible para este proveedor (demo: Nuvio CRM, Lumen Analytics).",
                      it: "Non ancora disponibile per questo fornitore (demo: Nuvio CRM, Lumen Analytics).",
                    })
                  : execPortalLocal
                    ? L({
                        fr: "Portail de démo en local : il doit être en ligne pour que l'agent H (navigateur cloud) le joigne.",
                        en: "Demo portal runs locally: it must be online for the H agent (cloud browser) to reach it.",
                        de: "Demo-Portal läuft lokal: Es muss online sein, damit der H-Agent (Cloud-Browser) es erreicht.",
                        es: "Portal de demo en local: debe estar en línea para que el agente H (navegador en la nube) lo alcance.",
                        it: "Portale demo in locale: deve essere online perché l'agente H (browser cloud) lo raggiunga.",
                      })
                    : L({
                      fr: "Portail fournisseur non configuré : exécution indisponible.",
                      en: "Supplier portal not configured: execution unavailable.",
                      de: "Lieferantenportal nicht konfiguriert: Ausführung nicht verfügbar.",
                      es: "Portal del proveedor no configurado: ejecución no disponible.",
                      it: "Portale del fornitore non configurato: esecuzione non disponibile.",
                    })}
            </p>
            {execErr && <p className="arg-hco-note" style={{ color: "var(--c-clay)" }}>{execErr}</p>}

            <button
              className="arg-send-reco"
              disabled
              aria-disabled="true"
              title={L({
                fr: "Bientôt : envoi en lettre recommandée en 1 clic",
                en: "Soon: send by registered mail in 1 click",
                de: "Bald: Einschreiben mit einem Klick senden",
                es: "Pronto: enviar por correo certificado en 1 clic",
                it: "Presto: invio con raccomandata in 1 clic",
              })}
            >
              ✉{" "}
              {L({
                fr: "Envoyer en recommandé",
                en: "Send by registered mail",
                de: "Per Einschreiben senden",
                es: "Enviar por correo certificado",
                it: "Invia con raccomandata",
              })}
              <span className="arg-soon-pill">
                {L({ fr: "à venir", en: "soon", de: "bald", es: "pronto", it: "presto" })}
              </span>
            </button>

            {/* Benchmark web — sur accord (règle 3) */}
            <div className="arg-bench">
              <div className="arg-bench-head">
                <span className="arg-bench-title">{T.benchTitle}</span>
                <button className="arg-btn arg-bench-btn" onClick={() => runBenchmark(letterFor)} disabled={benchLoading}>
                  {benchLoading ? "…" : bench ? T.benchRerun : T.benchSource}
                </button>
              </div>

              {benchLoading && <p className="arg-bench-hint">{T.benchSearching}</p>}

              {bench && !benchLoading && (
                <>
                  {bench.bestSaving > 0 && bench.bestAlternative && (
                    <p className="arg-bench-best mono">{T.benchBest(bench.bestSaving, bench.bestAlternative)}</p>
                  )}
                  {bench.alternatives.length > 0 ? (
                    <ul className="arg-bench-list">
                      {bench.alternatives.map((a, i) => (
                        <li key={i}>
                          <span className="arg-bench-alt">{a.name}</span>
                          {a.monthlyPrice != null && (
                            <span className="mono arg-bench-price">
                              {a.monthlyPrice} €{a.unit}
                            </span>
                          )}
                          {a.sourceUrl && (
                            <a href={a.sourceUrl} target="_blank" rel="noopener" className="arg-bench-src">
                              {T.benchSourceLink(a.sourceDate)}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : bench.sources.length > 0 ? (
                    <>
                      <p className="arg-bench-hint">{T.benchNoAlt}</p>
                      <ul className="arg-bench-list">
                        {bench.sources.slice(0, 4).map((s, i) => (
                          <li key={i}>
                            <span className="arg-bench-alt">{s.title}</span>
                            <a href={s.url} target="_blank" rel="noopener" className="arg-bench-src">
                              {T.benchSourceLink(s.date)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="arg-bench-hint">{bench.note ?? T.benchNone}</p>
                  )}
                  {bench.alternatives.some((a) => a.monthlyPrice != null) && (
                    <button className="arg-btn arg-bench-inject" onClick={regenerateWithPrices}>
                      {T.benchInject}
                    </button>
                  )}
                  {bench.provider && <p className="arg-bench-via">{T.benchVia(bench.provider)}</p>}
                </>
              )}
            </div>

            <p className="arg-drawer-note">{T.drawerNote}</p>
          </aside>
        </div>
      )}

      {/* Présentation — elevator pitch bilingue */}
      {pitchOpen && (
        <div className="arg-pitch" role="dialog" aria-modal="true" aria-label={T.pitchKicker}>
          <div className="arg-pitch-bar">
            <span className="arg-pitch-brand">
              <span className="arg-mark"><ArgLogo /></span> Kerdaxis
            </span>
            <div className="arg-pitch-controls">
              <div className="arg-lang" role="group" aria-label="Language">
                {LANG_CHOICES.map((c) => (
                  <button
                    key={c.code}
                    className={"arg-lang-btn" + (lang === c.code ? " on" : "")}
                    onClick={() => changeLang(c.code)}
                    aria-pressed={lang === c.code}
                  >
                    <span className="arg-lang-flag" aria-hidden="true">{c.flag}</span> {c.label}
                  </button>
                ))}
              </div>
              <button className="arg-drawer-close" onClick={() => setPitchOpen(false)} aria-label={T.close}>
                ✕
              </button>
            </div>
          </div>

          <div className="arg-pitch-scroll">
            <div className="arg-pitch-inner">
              <p className="arg-pitch-kicker">{T.pitchKicker}</p>

              <div className="arg-eu" aria-hidden="true">
                <svg
                  className="arg-eu-map"
                  viewBox={EUROPE_VIEWBOX}
                  preserveAspectRatio="xMidYMid meet"
                  dangerouslySetInnerHTML={{ __html: EUROPE_PATHS }}
                />

                {EU_COMPANIES.map((c, i) => (
                  <span
                    key={c.city}
                    className={"arg-eu-co t" + c.t + (c.cfo ? " cfo" : "")}
                    style={{
                      left: EU_CITY_XY[c.city][0] + "%",
                      top: EU_CITY_XY[c.city][1] + "%",
                      animationDelay: (i % 6) * -0.9 + "s",
                      animationDuration: 3.6 + (i % 5) * 0.45 + "s",
                    }}
                  >
                    <b className="arg-eu-dot">{c.cfo ? "★" : "▪"}</b>
                    <em className="arg-eu-city">{c.city}</em>
                  </span>
                ))}

                <div className="arg-eu-title">
                  <span className="arg-pitch-num">{PITCH[lang].hookNum}</span>
                  <span className="arg-pitch-hookcap">{PITCH[lang].hookCap}</span>
                </div>
              </div>
              {PITCH[lang].paras.map((p, i) => (
                <p key={i} className="arg-pitch-para">
                  {emph(p, `p${i}`)}
                </p>
              ))}
              <p className="arg-pitch-tagline">{PITCH[lang].tagline}</p>

              {/* Architecture — bilingue FR/EN (suit le sélecteur du pitch) */}
              <section className="arg-arch">
                <p className="arg-arch-kicker">Architecture</p>
                <h3 className="arg-arch-title">
                  {L({
                    fr: "Un cerveau, coupé en deux — volontairement.",
                    en: "One brain, split in two — on purpose.",
                    de: "Ein Gehirn, bewusst zweigeteilt.",
                    es: "Un cerebro, dividido en dos — a propósito.",
                    it: "Un cervello, diviso in due — di proposito.",
                  })}
                </h3>
                <p className="arg-arch-lede">
                  {emph(
                    L({
                      fr: "Kerdaxis est un **Skill Claude Code** branché sur des **serveurs MCP** en direct. Le LLM orchestre et met en mots ; un moteur déterministe fait chaque euro. Le modèle ne touche jamais au calcul — c'est ce qui rend chaque chiffre auditable.",
                      en: "Kerdaxis is a **Claude Code Skill** wired to live **MCP servers**. The LLM orchestrates and explains; a deterministic engine does every euro. The model never touches the math — that's what makes every figure auditable.",
                      de: "Kerdaxis ist ein **Claude Code Skill**, der live an **MCP-Server** angebunden ist. Das LLM orchestriert und formuliert; eine deterministische Engine macht jeden Euro. Das Modell rührt die Berechnung nie an — das macht jede Zahl prüfbar.",
                      es: "Kerdaxis es un **Skill de Claude Code** conectado en directo a **servidores MCP**. El LLM orquesta y pone en palabras; un motor determinista hace cada euro. El modelo nunca toca el cálculo — eso es lo que hace auditable cada cifra.",
                      it: "Kerdaxis è uno **Skill di Claude Code** collegato in diretta a **server MCP**. L'LLM orchestra e mette in parole; un motore deterministico fa ogni euro. Il modello non tocca mai il calcolo — è ciò che rende verificabile ogni cifra.",
                    }),
                    "arch-lede",
                  )}
                </p>

                <div className="arg-arch-flow" aria-label="pipeline">
                  {pick(lang, {
                    fr: ["Observe", "Analyse", "Benchmark", "Recommande", "Gate", "Ledger", "Vérifie"],
                    en: ["Observe", "Analyse", "Benchmark", "Recommend", "Gate", "Ledger", "Verify"],
                    de: ["Beobachten", "Analysieren", "Benchmark", "Empfehlen", "Gate", "Ledger", "Prüfen"],
                    es: ["Observar", "Analizar", "Benchmark", "Recomendar", "Gate", "Ledger", "Verificar"],
                    it: ["Osservare", "Analizzare", "Benchmark", "Raccomandare", "Gate", "Ledger", "Verificare"],
                  }).map((s, i) => (
                    <span key={i} className="arg-arch-step">
                      <b>{String(i + 1).padStart(2, "0")}</b>
                      {s}
                    </span>
                  ))}
                </div>

                <div className="arg-arch-grid">
                  <div className="arg-arch-card">
                    <div className="arg-arch-head">
                      <i className="lock" /> Qonto MCP{" "}
                      <span className="arg-arch-tag green">{L({ fr: "lecture seule", en: "read-only", de: "schreibgeschützt", es: "solo lectura", it: "sola lettura" })}</span>
                    </div>
                    <p className="arg-arch-desc">{L({ fr: "Lit le compte réel, en direct.", en: "Reads the real account, live.", de: "Liest das echte Konto, live.", es: "Lee la cuenta real, en directo.", it: "Legge il conto reale, in diretta." })}</p>
                    <code className="arg-arch-tools">get_organization · list_transactions · list_labels · list_transaction_attachments</code>
                    <p className="arg-arch-foot">
                      {emph(
                        L({
                          fr: "Tout tool d'écriture / virement / carte est **dur-bloqué** (deny > allow). Il ne peut pas bouger d'argent.",
                          en: "Every write / transfer / card tool is **hard-denied** (deny > allow). It cannot move money.",
                          de: "Jedes Schreib-/Überweisungs-/Kartentool ist **hart gesperrt** (deny > allow). Es kann kein Geld bewegen.",
                          es: "Toda herramienta de escritura / transferencia / tarjeta está **bloqueada en duro** (deny > allow). No puede mover dinero.",
                          it: "Ogni tool di scrittura / bonifico / carta è **bloccato in modo rigido** (deny > allow). Non può muovere denaro.",
                        }),
                        "arch-foot-1",
                      )}
                    </p>
                  </div>

                  <div className="arg-arch-card">
                    <div className="arg-arch-head">
                      <i className="calc" /> Kerdaxis{" "}
                      <span className="arg-arch-tag ink">{L({ fr: "déterministe", en: "deterministic", de: "deterministisch", es: "determinista", it: "deterministico" })}</span>
                    </div>
                    <p className="arg-arch-desc">{L({ fr: "Fait chaque euro. Jamais le modèle.", en: "Does every euro. Never the model.", de: "Macht jeden Euro. Nie das Modell.", es: "Hace cada euro. Nunca el modelo.", it: "Fa ogni euro. Mai il modello." })}</p>
                    <code className="arg-arch-tools">recurrence · ×12 annualization · duplicates · FX fees · PRO / PERSO / TO&#8209;CLARIFY</code>
                    <p className="arg-arch-foot">
                      {emph(
                        L({
                          fr: "Mêmes règles portées dans **engine.ts** pour le dashboard web.",
                          en: "Same rules ported to **engine.ts** for the web dashboard.",
                          de: "Dieselben Regeln in **engine.ts** für das Web-Dashboard portiert.",
                          es: "Las mismas reglas portadas a **engine.ts** para el panel web.",
                          it: "Le stesse regole portate in **engine.ts** per la dashboard web.",
                        }),
                        "arch-foot-2",
                      )}
                    </p>
                  </div>

                  <div className="arg-arch-card">
                    <div className="arg-arch-head">
                      <i className="src" /> Linkup MCP{" "}
                      <span className="arg-arch-tag amber">{L({ fr: "sourcé + daté", en: "sourced + dated", de: "belegt + datiert", es: "con fuente y fecha", it: "con fonte e data" })}</span>
                    </div>
                    <p className="arg-arch-desc">{L({ fr: "Benchmarke les prix sur le web vivant.", en: "Benchmarks prices on the live web.", de: "Vergleicht Preise im lebendigen Web.", es: "Compara precios en la web viva.", it: "Confronta i prezzi sul web vivo." })}</p>
                    <code className="arg-arch-tools">linkup-search</code>
                    <p className="arg-arch-foot">
                      {emph(
                        L({
                          fr: "Seuls le marchand + la catégorie sortent. Chaque prix porte une **source (URL + date)**, sinon il est écarté.",
                          en: "Only merchant + category leave the machine. Every price carries a **source URL + date**, or it's dropped.",
                          de: "Nur Händler + Kategorie verlassen das System. Jeder Preis trägt eine **Quelle (URL + Datum)**, sonst wird er verworfen.",
                          es: "Solo salen el comercio + la categoría. Cada precio lleva una **fuente (URL + fecha)**, o se descarta.",
                          it: "Escono solo esercente + categoria. Ogni prezzo porta una **fonte (URL + data)**, altrimenti viene scartato.",
                        }),
                        "arch-foot-3",
                      )}
                    </p>
                  </div>
                </div>

                <div className="arg-arch-rails">
                  {pick(lang, {
                    fr: ["Qonto read-only", "Le moteur calcule, pas le LLM", "Zéro PII vers le web", "Prix = source + date"],
                    en: ["Read-only Qonto", "Engine computes, not the LLM", "Zero PII to the web", "Price = source + date"],
                    de: ["Qonto schreibgeschützt", "Die Engine rechnet, nicht das LLM", "Null PII ins Web", "Preis = Quelle + Datum"],
                    es: ["Qonto solo lectura", "El motor calcula, no el LLM", "Cero PII hacia la web", "Precio = fuente + fecha"],
                    it: ["Qonto sola lettura", "Il motore calcola, non l'LLM", "Zero PII verso il web", "Prezzo = fonte + data"],
                  }).map((r, i) => (
                    <span key={i} className="arg-arch-rail">
                      <b>{i + 1}</b>
                      {r}
                    </span>
                  ))}
                </div>

                <p className="arg-arch-close">
                  {L({
                    fr: "Nativement MCP. Read-only par construction. Humain dans la boucle par design.",
                    en: "MCP-native. Read-only by construction. Human-in-the-loop by design.",
                    de: "MCP-nativ. Schreibgeschützt per Konstruktion. Mensch in der Schleife per Design.",
                    es: "Nativo MCP. Solo lectura por construcción. Humano en el bucle por diseño.",
                    it: "Nativo MCP. Sola lettura per costruzione. Umano nel ciclo per design.",
                  })}
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Kerdaxis — exécution réelle par l'agent H Company, suivie en direct */}
      {execId && <ExecutionPanel id={execId} lang={lang} onClose={() => setExecId(null)} />}

      {/* Autopilote — démo done-for-you : audit → gate 1-tap → preuve */}
      {apOpen && apLever && (
        <div className="arg-ap" role="dialog" aria-modal="true" aria-label="Autopilote">
          <div className="arg-ap-bar">
            <span className="arg-ap-brand">
              <span className="arg-mark"><ArgLogo /></span>
              {L({ fr: "Autopilote", en: "Autopilot", de: "Autopilot", es: "Autopiloto", it: "Autopilota" })}
              <span className="arg-ap-badge">{L({ fr: "audit rejoué", en: "audit replay", de: "Audit-Wiedergabe", es: "auditoría reproducida", it: "audit riprodotto" })}</span>
            </span>
            <button className="arg-drawer-close" onClick={() => setApOpen(false)} aria-label={T.close}>✕</button>
          </div>

          <div className="arg-ap-body">
            <ol className="arg-ap-steps">
              {pick(lang, {
                fr: ["Observe (Qonto 90 j)", "Analyse (engine.py)", "Benchmark (Linkup)", "Décision — ton accord", "Prépare le livrable", "Ledger", "Preuve J+30"],
                en: ["Observe (Qonto 90d)", "Analyse (engine.py)", "Benchmark (Linkup)", "Decision — your call", "Prepare deliverable", "Ledger", "Proof D+30"],
                de: ["Beobachten (Qonto 90 T)", "Analyse (engine.py)", "Benchmark (Linkup)", "Entscheidung — deine Freigabe", "Unterlage vorbereiten", "Ledger", "Nachweis T+30"],
                es: ["Observar (Qonto 90 d)", "Análisis (engine.py)", "Benchmark (Linkup)", "Decisión — tu aprobación", "Preparar el documento", "Ledger", "Prueba D+30"],
                it: ["Osservare (Qonto 90 g)", "Analisi (engine.py)", "Benchmark (Linkup)", "Decisione — il tuo ok", "Prepara il documento", "Ledger", "Prova G+30"],
              }).map((label, i) => {
                const state = i < apStep ? "done" : i === apStep ? "cur" : "todo";
                return (
                  <li key={i} className={"arg-ap-step " + state}>
                    <span className="arg-ap-num">{i < apStep ? "✓" : i + 1}</span>
                    {label}
                  </li>
                );
              })}
            </ol>

            <div className="arg-ap-panel">
              {apStep <= 2 && (
                <div className="arg-ap-run">
                  <div className="arg-ap-spin" />
                  <p className="arg-ap-runlabel" key={apStep}>
                    {apStep === 0 && L({ fr: "Lecture du compte, en lecture seule…", en: "Reading the account, read-only…", de: "Konto wird gelesen, schreibgeschützt…", es: "Leyendo la cuenta, en solo lectura…", it: "Lettura del conto, in sola lettura…" })}
                    {apStep === 1 && L({ fr: "Le moteur calcule chaque euro…", en: "The engine computes every euro…", de: "Die Engine berechnet jeden Euro…", es: "El motor calcula cada euro…", it: "Il motore calcola ogni euro…" })}
                    {apStep === 2 && L({ fr: "Benchmark web, sourcé + daté…", en: "Web benchmark, sourced + dated…", de: "Web-Benchmark, belegt + datiert…", es: "Benchmark web, con fuente y fecha…", it: "Benchmark web, con fonte e data…" })}
                  </p>
                  <code className="arg-ap-tool" key={apStep}>
                    {apStep === 0 && "mcp__qonto__list_transactions · settled_at_from=−90d"}
                    {apStep === 1 && "python3 engine.py data/flows-*.json --json"}
                    {apStep === 2 && `mcp__linkup__linkup-search · "${apLever.label}"`}
                  </code>
                </div>
              )}

              {apStep === 3 && (
                <div className="arg-ap-gate">
                  <p className="arg-ap-gate-kicker">{L({ fr: "1 décision · 1 tap", en: "1 decision · 1 tap", de: "1 Entscheidung · 1 Tipp", es: "1 decisión · 1 toque", it: "1 decisione · 1 tap" })}</p>
                  <div className="arg-ap-card">
                    <div className="arg-ap-card-head">
                      <b>{apLever.label}</b>
                      <span className="arg-ap-card-tag">{apLever.action ?? "renegotiate"}</span>
                    </div>
                    <p className="arg-ap-card-line">
                      {L({ fr: "Économie", en: "Saving", de: "Einsparung", es: "Ahorro", it: "Risparmio" })} · <b className="arg-mono">{eur(apLever.saving)}{L({ fr: "/mois", en: "/mo", de: "/Monat", es: "/mes", it: "/mese" })}</b> →{" "}
                      <b className="arg-mono">{eur(apLever.saving * 12)}/{L({ fr: "an", en: "yr", de: "Jahr", es: "año", it: "anno" })}</b>
                    </p>
                    <p className="arg-ap-card-line">{L({ fr: "Action", en: "Action", de: "Aktion", es: "Acción", it: "Azione" })} · {apLever.to}</p>
                    {executable(apLever.id) && (
                      <p className="arg-ap-card-line arg-ap-agent">
                        <span className="arg-ap-agent-tag">H Company · computer-use agent</span>
                        <b>⚡ {L({ fr: "Exécution réelle", en: "Real execution", de: "Echte Ausführung", es: "Ejecución real", it: "Esecuzione reale" })}</b> ·{" "}
                        {L({
                          fr: "un agent H Company résilie sur le portail du fournisseur et s'arrête avant le clic définitif : le feu vert final reste à toi.",
                          en: "an H Company agent cancels on the supplier portal and stops before the final click: the last go stays yours.",
                          de: "ein H-Company-Agent kündigt im Lieferantenportal und stoppt vor dem letzten Klick: das finale Go bleibt bei dir.",
                          es: "un agente de H Company cancela en el portal del proveedor y se detiene antes del clic final: la última palabra es tuya.",
                          it: "un agente H Company disdice sul portale del fornitore e si ferma prima del clic finale: l'ultimo via resta tuo.",
                        })}
                      </p>
                    )}
                    {execErr && <p className="arg-ap-card-line" style={{ color: "var(--c-clay)" }}>{execErr}</p>}
                    <p className="arg-ap-card-src">
                      {L({ fr: "Économie calculée par engine.py · prix sourcé + daté (Linkup)", en: "Saving computed by engine.py · price sourced + dated (Linkup)", de: "Einsparung von engine.py berechnet · Preis belegt + datiert (Linkup)", es: "Ahorro calculado por engine.py · precio con fuente y fecha (Linkup)", it: "Risparmio calcolato da engine.py · prezzo con fonte e data (Linkup)" })}
                    </p>
                  </div>
                  <div className="arg-ap-actions">
                    <button
                      className="arg-ap-approve"
                      disabled={execBusy}
                      onClick={() => {
                        setBoard((b) => ({ ...b, [apLever.id]: "doing" }));
                        if (executable(apLever.id)) {
                          void runExecution(apLever.id);
                          return;
                        }
                        setApDecision("approved");
                        setApStep(4);
                      }}
                    >
                      ✓ {execBusy
                        ? L({ fr: "Lancement de l'agent…", en: "Starting the agent…", de: "Agent startet…", es: "Iniciando el agente…", it: "Avvio dell'agente…" })
                        : executable(apLever.id)
                          ? L({ fr: "Approuver et lancer l'agent", en: "Approve and launch the agent", de: "Freigeben und Agent starten", es: "Aprobar y lanzar el agente", it: "Approva e avvia l'agente" })
                          : L({ fr: "Approuver", en: "Approve", de: "Freigeben", es: "Aprobar", it: "Approva" })}
                    </button>
                    <button className="arg-ap-refuse" onClick={() => { setApDecision("refused"); setApStep(6); }}>
                      ✕ {L({ fr: "Refuser", en: "Refuse", de: "Ablehnen", es: "Rechazar", it: "Rifiuta" })}
                    </button>
                  </div>
                  <p className="arg-ap-gate-foot">
                    {L({ fr: "Kerdaxis prépare — c'est toi qui envoies. Il ne bouge jamais d'argent.", en: "Kerdaxis prepares — you send. It never moves money.", de: "Kerdaxis bereitet vor — du sendest. Es bewegt nie Geld.", es: "Kerdaxis prepara — tú envías. Nunca mueve dinero.", it: "Kerdaxis prepara — sei tu a inviare. Non muove mai denaro." })}
                  </p>
                </div>
              )}

              {(apStep === 4 || apStep === 5) && (
                <div className="arg-ap-run">
                  <div className="arg-ap-spin" />
                  <p className="arg-ap-runlabel" key={apStep}>
                    {apStep === 4
                      ? L({ fr: "Lettre écrite dans drafts/ — « PRÊT — À ENVOYER PAR TOI »", en: "Letter written to drafts/ — “READY — TO BE SENT BY YOU”", de: "Schreiben in drafts/ erstellt — „BEREIT — VON DIR ZU SENDEN“", es: "Carta escrita en drafts/ — «LISTO — PARA QUE LO ENVÍES TÚ»", it: "Lettera scritta in drafts/ — «PRONTO — DA INVIARE TU»" })
                      : L({ fr: "Décision tracée au ledger (statut : en attente)…", en: "Decision written to the ledger (status: pending)…", de: "Entscheidung im Ledger erfasst (Status: ausstehend)…", es: "Decisión registrada en el ledger (estado: pendiente)…", it: "Decisione registrata nel ledger (stato: in attesa)…" })}
                  </p>
                </div>
              )}

              {apStep === 6 && apDecision === "approved" && (
                // Nothing is proven on the day of approval: the statement only shows the drop at the next billing date.
                <div className="arg-ap-proof">
                  <p className="arg-ap-proof-badge">{L({ fr: "Approuvé · preuve à J+30", en: "Approved · proof at D+30", de: "Freigegeben · Nachweis an T+30", es: "Aprobado · prueba en D+30", it: "Approvato · prova a G+30" })}</p>
                  <p className="arg-ap-proof-num arg-mono">−{eur(apLever.saving * 12)}<span>/{L({ fr: "an", en: "yr", de: "Jahr", es: "año", it: "anno" })}</span></p>
                  <p className="arg-ap-proof-sub">
                    {L({
                      fr: "Ledger : en attente. Kerdaxis relit le relevé à la prochaine échéance et ne marque « prouvé » que si la charge a vraiment disparu.",
                      en: "Ledger: pending. Kerdaxis rereads the statement at the next billing date and only marks it proven if the charge is really gone.",
                      de: "Ledger: ausstehend. Kerdaxis prüft den Auszug zum nächsten Abrechnungstermin und markiert erst dann als bewiesen, wenn die Belastung wirklich weg ist.",
                      es: "Ledger: pendiente. Kerdaxis relee el extracto en la próxima fecha de cobro y solo lo marca como probado si el cargo ha desaparecido de verdad.",
                      it: "Ledger: in attesa. Kerdaxis rilegge l'estratto alla prossima scadenza e lo segna come dimostrato solo se l'addebito è davvero sparito.",
                    })}
                  </p>
                  <p className="arg-ap-proof-model">{L({ fr: "Pas d'économie, pas de coût.", en: "No savings, no cost.", de: "Keine Einsparung, keine Kosten.", es: "Sin ahorro, sin coste.", it: "Nessun risparmio, nessun costo." })}</p>
                  <button className="arg-ap-again" onClick={startAutopilot}>↻ {L({ fr: "Rejouer", en: "Replay", de: "Erneut abspielen", es: "Repetir", it: "Rigioca" })}</button>
                </div>
              )}

              {apStep === 6 && apDecision === "refused" && (
                <div className="arg-ap-proof refused">
                  <p className="arg-ap-proof-badge">{L({ fr: "Noté", en: "Noted", de: "Notiert", es: "Anotado", it: "Annotato" })}</p>
                  <p className="arg-ap-proof-sub">
                    {L({
                      fr: `« ${apLever.label} » ajouté à profile.json (refus_passes). Jamais re-proposé.`,
                      en: `“${apLever.label}” added to profile.json (past refusals). Never proposed again.`,
                      de: `„${apLever.label}“ zu profile.json hinzugefügt (frühere Ablehnungen). Wird nie wieder vorgeschlagen.`,
                      es: `«${apLever.label}» añadido a profile.json (rechazos anteriores). Nunca se vuelve a proponer.`,
                      it: `«${apLever.label}» aggiunto a profile.json (rifiuti precedenti). Mai più proposto.`,
                    })}
                  </p>
                  <button className="arg-ap-again" onClick={startAutopilot}>↻ {L({ fr: "Rejouer", en: "Replay", de: "Erneut abspielen", es: "Repetir", it: "Rigioca" })}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Liste d'attente (fake-it) */}
      {wl && (
        <div className="arg-wl" role="dialog" aria-modal="true" onClick={() => setWl(null)}>
          <div className="arg-wl-box" onClick={(e) => e.stopPropagation()}>
            <p className="arg-wl-title">{L({ fr: "Liste d'attente", en: "Waitlist", de: "Warteliste", es: "Lista de espera", it: "Lista d'attesa" })}</p>
            <p className="arg-wl-sub">{L({ fr: "On te prévient dès l'ouverture.", en: "We'll ping you at launch.", de: "Wir melden uns zum Start.", es: "Te avisamos en el lanzamiento.", it: "Ti avvisiamo al lancio." })}</p>
            {wlJoined[wl] ? (
              <p className="arg-wl-done"><span className="arg-tick" aria-hidden="true">✓</span> {L({ fr: "Tu es sur la liste.", en: "You're on the list.", de: "Du bist auf der Liste.", es: "Estás en la lista.", it: "Sei nella lista." })}</p>
            ) : (
              <form
                className="arg-wl-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (wlEmail.includes("@")) setWlJoined((j) => ({ ...j, [wl]: true }));
                }}
              >
                <input
                  className="arg-wl-input"
                  type="email"
                  required
                  placeholder="email@exemple.com"
                  value={wlEmail}
                  onChange={(e) => setWlEmail(e.target.value)}
                />
                <button className="arg-wl-submit" type="submit">
                  {L({ fr: "Rejoindre", en: "Join", de: "Beitreten", es: "Unirse", it: "Iscriviti" })}
                </button>
              </form>
            )}
            <button className="arg-wl-close" onClick={() => setWl(null)}>
              {L({ fr: "Fermer", en: "Close", de: "Schließen", es: "Cerrar", it: "Chiudi" })}
            </button>
          </div>
        </div>
      )}

      {/* « Explain this » à la voix : Gladia transcrit, Kerdaxis comprend et agit
          (sans jamais donner le feu vert final d'une action irréversible). */}
      <div className="arg-voice">
        {CONVAI_AGENT_ID && <div ref={convaiRef} className="arg-voice-convai" />}
        <VoiceCommand lang={lang} onCommand={onVoiceCommand} />
      </div>
    </div>
  );
}

// Marque Kerdaxis : chevron « A » + barres ascendantes (le run-rate qui monte).
function ArgLogo() {
  return (
    <svg className="arg-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <text x="16" y="23" textAnchor="middle" fontSize="20" fontWeight="900" fill="#B4F768" fontFamily="Inter, system-ui, sans-serif">
        K
      </text>
    </svg>
  );
}

// Waterfall : du total des sorties au vrai run-rate pilotable (le relevé « ment »).
function NatureWaterfall({
  natures,
  out,
  lang,
  fmt,
}: {
  natures: NatureSlice[];
  out: number;
  lang: Lang;
  fmt: (n: number) => string;
}) {
  const by = (k: Nature) => natures.find((n) => n.key === k)?.amount ?? 0;
  const perso = by("perso");
  const ponctuel = by("ponctuel");
  const structurel = by("structurel");
  const pilotable = by("pilotable");
  const max = Math.max(out, 1);
  const W = 560;
  const top = 24;
  const bottom = 196;
  const colW = 78;
  const gap = (W - 5 * colW) / 6;
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const xAt = (i: number) => gap + i * (colW + gap);
  const bars = [
    { fill: "var(--c-wf-total)", label: pick(lang, { fr: "Total", en: "Total", de: "Gesamt", es: "Total", it: "Totale" }), hi: out, lo: 0, val: out },
    { fill: "var(--c-line-strong)", label: pick(lang, { fr: "− Perso", en: "− Personal", de: "− Privat", es: "− Personal", it: "− Personale" }), hi: out, lo: out - perso, val: perso },
    { fill: "var(--c-amber)", label: pick(lang, { fr: "− Ponctuel", en: "− One-off", de: "− Einmalig", es: "− Puntual", it: "− Una tantum" }), hi: out - perso, lo: out - perso - ponctuel, val: ponctuel },
    { fill: "var(--c-ink2)", label: pick(lang, { fr: "− Structurel", en: "− Structural", de: "− Strukturell", es: "− Estructural", it: "− Strutturale" }), hi: out - perso - ponctuel, lo: pilotable, val: structurel },
    { fill: "var(--c-vert)", label: pick(lang, { fr: "Pilotable", en: "Controllable", de: "Steuerbar", es: "Controlable", it: "Gestibile" }), hi: pilotable, lo: 0, val: pilotable },
  ];
  const running = [out, out - perso, out - perso - ponctuel, pilotable];
  return (
    <svg
      className="arg-wf"
      viewBox={`0 0 ${W} 236`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={pick(lang, { fr: "Cascade : du total au run-rate pilotable", en: "Waterfall: from total to controllable run-rate", de: "Wasserfall: vom Gesamtbetrag zur steuerbaren Run-Rate", es: "Cascada: del total al run-rate controlable", it: "Cascata: dal totale al run-rate gestibile" })}
    >
      {running.map((lvl, i) => (
        <line key={"l" + i} className="arg-wf-link" x1={xAt(i) + colW} y1={y(lvl)} x2={xAt(i + 1)} y2={y(lvl)} />
      ))}
      {bars.map((b, i) => {
        const x = xAt(i);
        const yt = y(b.hi);
        const h = Math.max(2, y(b.lo) - y(b.hi));
        return (
          <g key={i}>
            <rect x={x} y={yt} width={colW} height={h} rx="3" fill={b.fill} />
            <text className="arg-wf-val" x={x + colW / 2} y={yt - 7} textAnchor="middle">
              {fmt(b.val)}
            </text>
            <text className="arg-wf-cat" x={x + colW / 2} y={218} textAnchor="middle">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Metric({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className="arg-metric">
      <p className="arg-metric-label">{label}</p>
      <p className={"arg-metric-val arg-mono" + (accent ? " accent" : "")}>{value}</p>
      {note && <p className="arg-metric-note">{note}</p>}
    </div>
  );
}

function SimStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="arg-simstat">
      <p className={"arg-simstat-val arg-mono" + (accent ? " accent" : "")}>{value}</p>
      <p className="arg-simstat-label">{label}</p>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* --- Thème Kerdaxis (sombre) ----------------------------------------------
   Fond #080d13 · panneau #111a22 · filet #26343d · texte #eef8f5 · doux #a3b4b9.
   Accents : lime #b4f768 (rare : CTA principal, chiffre héros, « confirmé »),
   mint #66e6be (= --c-vert : économie / validé), or #eedc9d (ponctuel, démo),
   corail (risque, erreur). Contrastes vérifiés AA sur le panneau. */
html:has(.arg-root),body:has(.arg-root){background:#080d13;color-scheme:dark;}
body:has(.arg-root){overflow-x:clip;}
.arg-root{
  --c-paper:#080d13; --c-panel:#111a22; --c-panel-2:#16212a; --c-inset:#0b1218;
  --c-ink:#eef8f5; --c-ink2:#a3b4b9; --c-ink3:#7c8f96;
  --c-line:#26343d; --c-line-strong:#3b4d58;
  --c-vert:#66e6be; --c-vert-soft:rgba(102,230,190,.10); --c-on-vert:#04170f;
  --c-lime:#b4f768; --c-on-lime:#0e1b05;
  --c-amber:#eedc9d; --c-clay:#ff8f7e;
  --c-wf-total:#2f404b;
  --f-display:'Inter Tight','Inter',system-ui,sans-serif;
  --f-text:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --f-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  --r:16px;
  max-width:1120px; margin:0 auto; padding:0 20px 64px;
  color:var(--c-ink);
  font-family:var(--f-text); font-size:14px; line-height:1.5;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
}
.arg-root *{box-sizing:border-box;}
.arg-root ::selection{background:rgba(180,247,104,.28);color:var(--c-ink);}
.arg-root *{scrollbar-color:#2b3a44 transparent;}
.arg-mono{font-family:var(--f-text);font-variant-numeric:tabular-nums;letter-spacing:-.005em;}
.arg-root .mono{font-variant-numeric:tabular-nums;}

/* Grille : une colonne en mobile, 12 colonnes au-delà de 980 px. Les cartes
   « cascade | pôles » et « anomalies | audit » se rangent côte à côte. */
@media(min-width:980px){
  .arg-root{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:14px;grid-auto-flow:row dense;align-items:stretch;}
  .arg-root>*{grid-column:1/-1;min-width:0;}
  .arg-root>.arg-area-wf{grid-column:span 7;}
  .arg-root>.arg-area-poles{grid-column:span 5;display:flex;flex-direction:column;}
  .arg-area-poles .arg-bars{flex:1;justify-content:center;}
  .arg-root>.arg-area-anom{grid-column:span 5;}
  .arg-root>.arg-area-audit{grid-column:span 7;}
}

.arg-alerte{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:16px 0 0;padding:13px 16px;
  border:1px solid rgba(238,220,157,.32);border-left:3px solid var(--c-amber);border-radius:12px;background:rgba(238,220,157,.06);
  color:#e7dcb6;font-size:14px;line-height:1.45;}
.arg-alerte strong{color:#f7edcd;}
.arg-alerte-lien{margin-left:auto;white-space:nowrap;font-weight:600;color:var(--c-amber);text-decoration:underline;text-underline-offset:3px;}

/* Barre du haut : pleine largeur, collante, verre sombre */
.arg-top{position:sticky;top:0;z-index:40;display:flex;justify-content:space-between;align-items:center;gap:10px 16px;flex-wrap:wrap;
  margin:0 calc(50% - 50vw) 28px;padding:12px max(20px,calc(50vw - 540px));
  background:rgba(8,13,19,.78);-webkit-backdrop-filter:saturate(150%) blur(14px);backdrop-filter:saturate(150%) blur(14px);
  border-bottom:1px solid rgba(38,52,61,.85);}
@media(max-width:720px){.arg-top{position:relative;margin-bottom:20px;}}
.arg-brand{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}
.arg-mark{width:30px;height:30px;border-radius:9px;background:#0f1a10;border:1px solid rgba(180,247,104,.45);
  display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 18px rgba(180,247,104,.10);}
.arg-logo{width:72%;height:72%;display:block;}
.arg-logo-bar{fill:var(--c-amber);}
.arg-word{font-family:var(--f-display);font-weight:700;font-size:18px;letter-spacing:-.02em;}
.arg-chip{font-size:11.5px;color:var(--c-ink2);border:1px solid var(--c-line);background:rgba(238,248,245,.02);border-radius:99px;padding:3px 10px;white-space:nowrap;}
.arg-src{font-family:var(--f-mono);font-size:10.5px;font-weight:500;padding:3px 9px;border-radius:99px;white-space:nowrap;letter-spacing:.02em;}
.arg-src.live{background:var(--c-vert-soft);color:var(--c-vert);border:1px solid rgba(102,230,190,.3);}
.arg-src.demo{background:rgba(238,220,157,.08);color:var(--c-amber);border:1px solid rgba(238,220,157,.28);}
.arg-top-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
.arg-window{font-family:var(--f-mono);font-size:11px;color:var(--c-ink3);white-space:nowrap;}
.arg-deco,.arg-pitch-open,.arg-ap-open{display:inline-flex;align-items:center;gap:6px;height:32px;border-radius:10px;font-family:inherit;
  font-size:12.5px;font-weight:500;padding:0 12px;cursor:pointer;text-decoration:none;white-space:nowrap;
  transition:background-color .15s,border-color .15s,color .15s;}
.arg-deco,.arg-pitch-open{border:1px solid var(--c-line-strong);background:transparent;color:var(--c-ink);}
.arg-deco:hover:not(:disabled),.arg-pitch-open:hover{background:rgba(238,248,245,.05);border-color:#506572;}
.arg-deco:disabled{opacity:.55;cursor:progress;}
.arg-ap-open{border:1px solid rgba(102,230,190,.4);background:rgba(102,230,190,.10);color:var(--c-vert);font-weight:600;}
.arg-ap-open:hover{background:rgba(102,230,190,.16);border-color:rgba(102,230,190,.6);}
.arg-figure.loading{opacity:.5;animation:argPulse 1s ease-in-out infinite;}
@keyframes argPulse{0%,100%{opacity:.4}50%{opacity:.72}}
@media(prefers-reduced-motion:reduce){.arg-figure.loading{animation:none;opacity:1;}}
.arg-lang{display:inline-flex;flex-wrap:wrap;border:1px solid var(--c-line);border-radius:10px;padding:2px;gap:2px;background:rgba(238,248,245,.015);}
.arg-lang-btn{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:7px;background:transparent;color:var(--c-ink3);
  font-family:var(--f-mono);font-size:10.5px;font-weight:500;padding:5px 7px;cursor:pointer;transition:background-color .12s,color .12s;}
.arg-lang-flag{display:none;}
.arg-lang-btn.on{background:rgba(238,248,245,.10);color:var(--c-ink);}
.arg-lang-btn:not(.on):hover{color:var(--c-ink);}

/* Présentation plein écran */
.arg-pitch{position:fixed;inset:0;z-index:60;background:var(--c-paper);display:flex;flex-direction:column;
  animation:argFade .25s ease;}
@keyframes argFade{from{opacity:0}to{opacity:1}}
.arg-pitch-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 24px;border-bottom:1px solid var(--c-line);flex:none;}
.arg-pitch-brand{display:flex;align-items:center;gap:10px;font-family:var(--f-display);font-weight:700;font-size:17px;letter-spacing:-.02em;}
.arg-pitch-controls{display:flex;align-items:center;gap:12px;}
.arg-pitch-scroll{flex:1;overflow:auto;}
.arg-pitch-inner{max-width:780px;margin:0 auto;padding:min(9vh,72px) 24px 96px;}
.arg-pitch-kicker{font-family:var(--f-mono);font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:var(--c-vert);
  font-weight:500;margin:0 0 22px;}
/* Hero : carte d'Europe + entreprises flottantes */
.arg-eu{position:relative;width:100%;aspect-ratio:1000/626;max-height:60vh;margin:0 0 34px;
  padding-bottom:22px;border-bottom:1px solid var(--c-line);isolation:isolate;}
.arg-eu-map{position:absolute;inset:0;width:100%;height:100%;z-index:0;}
.arg-eu-map path{fill:rgba(102,230,190,.07);
  stroke:rgba(102,230,190,.28);stroke-width:1;
  stroke-linejoin:round;vector-effect:non-scaling-stroke;}
.arg-eu-co{position:absolute;z-index:1;transform:translate(-50%,-50%);
  display:flex;flex-direction:column;align-items:center;gap:2px;
  animation:argFloat 4s ease-in-out infinite;will-change:transform;pointer-events:none;}
.arg-eu-dot{display:flex;align-items:center;justify-content:center;border-radius:50%;
  background:var(--c-panel-2);color:var(--c-ink2);border:1px solid var(--c-line-strong);
  box-shadow:0 3px 10px rgba(0,0,0,.4);line-height:1;font-style:normal;}
.arg-eu-co.t1 .arg-eu-dot{width:16px;height:16px;font-size:7px;}
.arg-eu-co.t2 .arg-eu-dot{width:22px;height:22px;font-size:9px;}
.arg-eu-co.t3 .arg-eu-dot{width:30px;height:30px;font-size:12px;}
.arg-eu-co.cfo .arg-eu-dot{background:var(--c-lime);color:var(--c-on-lime);border-color:var(--c-lime);
  box-shadow:0 0 18px rgba(180,247,104,.45);}
.arg-eu-city{font-style:normal;font-size:9.5px;font-weight:600;color:var(--c-ink2);
  letter-spacing:.01em;white-space:nowrap;opacity:.75;
  text-shadow:0 1px 3px var(--c-paper),0 0 3px var(--c-paper);}
.arg-eu-co.cfo .arg-eu-city{color:var(--c-lime);opacity:1;}
.arg-eu-co.t1 .arg-eu-city{font-size:8px;opacity:.55;}
@keyframes argFloat{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,calc(-50% - 8px))}}

.arg-eu-title{position:absolute;left:2px;top:6px;z-index:2;max-width:min(64%,420px);
  display:flex;flex-direction:column;gap:4px;}
.arg-pitch-num{font-family:var(--f-display);font-weight:700;font-variant-numeric:tabular-nums;
  font-size:clamp(64px,13vw,124px);line-height:.86;color:var(--c-lime);letter-spacing:-.055em;
  text-shadow:0 2px 24px var(--c-paper),0 0 10px var(--c-paper);}
.arg-pitch-hookcap{font-family:var(--f-display);font-weight:600;font-size:clamp(18px,3vw,28px);
  color:var(--c-ink);max-width:340px;letter-spacing:-.015em;line-height:1.12;
  text-shadow:0 1px 10px var(--c-paper),0 0 6px var(--c-paper);}
@media(prefers-reduced-motion:reduce){.arg-eu-co{animation:none;}}
@media(max-width:560px){.arg-eu-city{display:none;}
  .arg-eu-co.cfo .arg-eu-city{display:block;}
  .arg-eu-co.t1 .arg-eu-dot{width:12px;height:12px;}}
.arg-pitch-para{font-size:clamp(17px,2.1vw,20px);line-height:1.65;color:var(--c-ink2);margin:0 0 22px;text-wrap:pretty;}
.arg-pitch-para strong{color:var(--c-ink);font-weight:600;}
.arg-pitch-tagline{font-family:var(--f-display);font-weight:600;font-size:clamp(24px,4.2vw,40px);
  line-height:1.12;color:var(--c-ink);letter-spacing:-.04em;margin:14px 0 0;text-wrap:balance;
  padding-top:26px;border-top:1px solid var(--c-line-strong);}
@media(prefers-reduced-motion:reduce){.arg-pitch{animation:none;}}

/* Architecture (bas du pitch deck) */
.arg-arch{margin-top:64px;padding-top:34px;border-top:1px solid var(--c-line);}
.arg-arch-kicker{font-family:var(--f-mono);font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:var(--c-vert);
  font-weight:500;margin:0 0 12px;}
.arg-arch-title{font-family:var(--f-display);font-weight:600;font-size:clamp(24px,3.6vw,36px);
  letter-spacing:-.035em;line-height:1.1;color:var(--c-ink);margin:0 0 14px;}
.arg-arch-lede{font-size:clamp(15px,1.7vw,18px);line-height:1.6;color:var(--c-ink2);margin:0 0 26px;
  max-width:620px;text-wrap:pretty;}
.arg-arch-lede strong{color:var(--c-ink);font-weight:600;}

.arg-arch-flow{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 28px;}
.arg-arch-step{display:inline-flex;align-items:center;gap:7px;padding:7px 13px 7px 9px;
  border:1px solid var(--c-line);border-radius:99px;background:var(--c-panel);
  font-size:11.5px;font-weight:500;letter-spacing:.05em;color:var(--c-ink);text-transform:uppercase;}
.arg-arch-step b{font-family:var(--f-mono);font-size:10px;font-weight:500;
  color:var(--c-vert);background:var(--c-vert-soft);border-radius:6px;padding:2px 5px;letter-spacing:0;}
.arg-arch-step:last-child{border-color:rgba(102,230,190,.4);background:var(--c-vert-soft);color:var(--c-vert);}

.arg-arch-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:0 0 26px;}
.arg-arch-card{border:1px solid var(--c-line);border-radius:var(--r);background:var(--c-panel);
  padding:18px;display:flex;flex-direction:column;}
.arg-arch-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  font-family:var(--f-mono);font-weight:600;font-size:13.5px;color:var(--c-ink);}
.arg-arch-head i{width:10px;height:10px;flex:none;border-radius:3px;}
.arg-arch-head i.lock{background:var(--c-vert);}
.arg-arch-head i.calc{background:var(--c-ink);}
.arg-arch-head i.src{background:var(--c-amber);}
.arg-arch-tag{font-family:var(--f-text);font-size:10px;font-weight:600;text-transform:uppercase;
  letter-spacing:.05em;padding:2px 7px;border-radius:99px;white-space:nowrap;}
.arg-arch-tag.green{background:var(--c-vert-soft);color:var(--c-vert);}
.arg-arch-tag.ink{background:rgba(238,248,245,.08);color:var(--c-ink);}
.arg-arch-tag.amber{background:rgba(238,220,157,.10);color:var(--c-amber);}
.arg-arch-desc{font-size:14px;font-weight:500;color:var(--c-ink);margin:12px 0 10px;line-height:1.4;}
.arg-arch-tools{font-family:var(--f-mono);font-size:11px;line-height:1.6;
  color:var(--c-ink2);background:var(--c-inset);border:1px solid var(--c-line);border-radius:8px;
  padding:9px 11px;display:block;word-break:break-word;}
.arg-arch-foot{font-size:12px;line-height:1.5;color:var(--c-ink2);margin:11px 0 0;}
.arg-arch-foot b,.arg-arch-foot strong{color:var(--c-ink);font-weight:600;}

.arg-arch-rails{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;
  padding:16px;border:1px solid rgba(102,230,190,.2);border-radius:var(--r);
  background:var(--c-vert-soft);margin:0 0 22px;}
.arg-arch-rail{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600;color:var(--c-ink);}
.arg-arch-rail b{font-family:var(--f-mono);font-size:11px;color:var(--c-on-vert);
  background:var(--c-vert);width:19px;height:19px;flex:none;border-radius:50%;
  display:flex;align-items:center;justify-content:center;}
.arg-arch-close{font-family:var(--f-display);font-weight:600;font-size:clamp(15px,1.9vw,19px);
  color:var(--c-vert);letter-spacing:-.02em;margin:0;text-wrap:balance;}
@media(max-width:720px){.arg-arch-grid{grid-template-columns:1fr;}
  .arg-arch-rails{grid-template-columns:repeat(2,1fr);}}

/* Autopilote — bouton + modale done-for-you */
.arg-ap{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;animation:argFade .25s ease;
  background:radial-gradient(80% 60% at 75% 0%,rgba(102,230,190,.06),transparent 60%),var(--c-paper);}
.arg-ap-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 24px;border-bottom:1px solid var(--c-line);flex:none;}
.arg-ap-brand{display:flex;align-items:center;gap:10px;font-family:var(--f-display);font-weight:600;font-size:17px;letter-spacing:-.02em;}
.arg-ap-badge{font-family:var(--f-mono);font-size:10.5px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;
  background:var(--c-vert-soft);color:var(--c-vert);border:1px solid rgba(102,230,190,.25);padding:3px 8px;border-radius:99px;}
.arg-ap-body{flex:1;overflow:auto;display:grid;grid-template-columns:minmax(230px,300px) 1fr;}
@media(max-width:760px){.arg-ap-body{grid-template-columns:1fr;align-content:start;}}
.arg-ap-steps{list-style:none;margin:0;padding:30px 24px;border-right:1px solid var(--c-line);display:flex;flex-direction:column;gap:4px;}
@media(max-width:760px){.arg-ap-steps{border-right:0;border-bottom:1px solid var(--c-line);flex-direction:row;flex-wrap:wrap;gap:6px 14px;padding:16px;}}
.arg-ap-step{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--c-ink3);padding:6px 0;transition:color .2s;}
.arg-ap-num{width:22px;height:22px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-family:var(--f-mono);font-size:10.5px;font-weight:500;border:1px solid var(--c-line-strong);color:var(--c-ink3);background:var(--c-panel);}
.arg-ap-step.done{color:var(--c-ink2);}
.arg-ap-step.done .arg-ap-num{background:var(--c-vert);border-color:var(--c-vert);color:var(--c-on-vert);}
.arg-ap-step.cur{color:var(--c-ink);font-weight:600;}
.arg-ap-step.cur .arg-ap-num{border-color:var(--c-vert);color:var(--c-vert);box-shadow:0 0 0 4px rgba(102,230,190,.12);}
.arg-ap-panel{display:flex;align-items:center;justify-content:center;padding:min(6vh,56px) 24px;}
.arg-ap-run{display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;}
.arg-ap-spin{width:34px;height:34px;border-radius:50%;border:2px solid var(--c-line);border-top-color:var(--c-vert);animation:argSpin .8s linear infinite;}
@keyframes argSpin{to{transform:rotate(360deg);}}
.arg-ap-runlabel{font-family:var(--f-display);font-weight:600;font-size:clamp(17px,2.2vw,22px);letter-spacing:-.02em;color:var(--c-ink);margin:0;max-width:480px;text-wrap:balance;}
.arg-ap-tool{font-family:var(--f-mono);font-size:11.5px;color:var(--c-ink2);background:var(--c-inset);border:1px solid var(--c-line);border-radius:9px;padding:8px 12px;}
.arg-ap-gate{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;max-width:460px;}
.arg-ap-gate-kicker{font-family:var(--f-mono);font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--c-vert);font-weight:500;margin:0;}
.arg-ap-card{width:100%;background:var(--c-panel);border:1px solid var(--c-line-strong);border-radius:18px;padding:20px;
  box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.03);}
.arg-ap-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
.arg-ap-card-head b{font-family:var(--f-display);font-size:19px;font-weight:600;letter-spacing:-.025em;}
.arg-ap-card-tag{font-family:var(--f-mono);font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;
  background:rgba(238,220,157,.08);color:var(--c-amber);border:1px solid rgba(238,220,157,.25);padding:3px 8px;border-radius:99px;white-space:nowrap;}
.arg-ap-card-line{font-size:14px;color:var(--c-ink2);margin:5px 0;}
.arg-ap-card-line b{color:var(--c-ink);}
/* Rappel discret : l'exécution réelle passe par l'agent computer-use de H Company */
.arg-ap-agent{margin:12px 0 4px;padding:11px 12px;border:1px solid rgba(180,247,104,.22);border-radius:12px;
  background:rgba(180,247,104,.045);font-size:13px;line-height:1.5;color:var(--c-ink2);}
.arg-ap-agent b{color:var(--c-ink);}
.arg-ap-agent-tag{display:flex;align-items:center;gap:7px;margin:0 0 5px;font-family:var(--f-mono);font-size:10.5px;
  letter-spacing:.06em;text-transform:uppercase;color:var(--c-lime);}
.arg-ap-agent-tag::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--c-lime);box-shadow:0 0 10px var(--c-lime);}
.arg-ap-card-src{font-size:11.5px;color:var(--c-ink3);margin:12px 0 0;padding-top:12px;border-top:1px solid var(--c-line);}
.arg-ap-actions{display:flex;gap:10px;width:100%;}
.arg-ap-approve,.arg-ap-refuse{flex:1;border-radius:12px;font-family:inherit;font-size:15px;font-weight:600;padding:13px;cursor:pointer;transition:transform .08s ease,opacity .1s;}
.arg-ap-approve{border:1px solid var(--c-lime);background:var(--c-lime);color:var(--c-on-lime);
  box-shadow:0 12px 34px rgba(180,247,104,.18),inset 0 1px 0 rgba(255,255,255,.35);}
.arg-ap-approve:disabled{opacity:.6;cursor:progress;}
.arg-ap-refuse{border:1px solid var(--c-line-strong);background:transparent;color:var(--c-ink2);}
.arg-ap-refuse:hover{color:var(--c-ink);border-color:#506572;}
.arg-ap-approve:hover,.arg-ap-refuse:hover{transform:translateY(-1px);}
.arg-ap-gate-foot{font-size:12px;color:var(--c-ink3);margin:0;text-align:center;}
.arg-ap-proof{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;max-width:500px;}
.arg-ap-proof-badge{font-family:var(--f-mono);font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.1em;color:var(--c-vert);
  background:var(--c-vert-soft);border:1px solid rgba(102,230,190,.3);padding:5px 12px;border-radius:99px;margin:0;}
.arg-ap-proof.refused .arg-ap-proof-badge{color:var(--c-ink2);background:rgba(238,248,245,.05);border-color:var(--c-line-strong);}
.arg-ap-proof-num{font-weight:700;font-size:clamp(48px,9vw,84px);line-height:1;color:var(--c-lime);letter-spacing:-.05em;
  text-shadow:0 0 50px rgba(180,247,104,.18);}
.arg-ap-proof-num span{font-size:.36em;color:var(--c-ink2);letter-spacing:-.01em;}
.arg-ap-proof-sub{font-size:15px;color:var(--c-ink2);margin:0;text-wrap:pretty;}
.arg-ap-roi{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;background:var(--c-panel);border:1px solid var(--c-line);border-radius:12px;padding:12px 16px;font-size:14px;color:var(--c-ink2);margin-top:6px;}
.arg-ap-roi b{color:var(--c-ink);}
.arg-ap-roi-arrow{color:var(--c-vert);font-weight:700;}
.arg-ap-proof-model{font-family:var(--f-display);font-weight:600;font-size:17px;letter-spacing:-.02em;color:var(--c-vert);margin:4px 0 0;}
.arg-ap-again{margin-top:8px;border:1px solid var(--c-line-strong);background:transparent;color:var(--c-ink);border-radius:10px;font-family:inherit;font-size:13px;font-weight:500;padding:8px 16px;cursor:pointer;}
.arg-ap-again:hover{background:rgba(238,248,245,.05);}
@media(prefers-reduced-motion:reduce){.arg-ap-spin{animation:none;}.arg-ap{animation:none;}}

/* Levier — badge hausse silencieuse */
.arg-hausse{display:inline-flex;align-items:center;gap:2px;font-size:10.5px;font-weight:600;
  color:var(--c-clay);background:rgba(255,143,126,.10);border:1px solid rgba(255,143,126,.22);
  border-radius:99px;padding:0 7px;margin-left:8px;letter-spacing:.01em;vertical-align:middle;white-space:nowrap;}

/* Carte TVA récupérable (levier fiscal) */
.arg-tva{border-left:2px solid var(--c-amber);
  background:linear-gradient(90deg,rgba(238,220,157,.07),transparent 45%),var(--c-panel);}
.arg-tva-body{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.arg-tva-kicker{font-family:var(--f-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--c-amber);font-weight:500;margin:0 0 6px;}
.arg-tva-title{font-family:var(--f-text);font-weight:600;font-size:clamp(16px,2vw,18px);letter-spacing:-.012em;color:var(--c-ink);margin:0 0 5px;}
.arg-tva-sub{font-size:12.5px;color:var(--c-ink2);margin:0;max-width:540px;}
.arg-tva-num{font-weight:700;font-size:clamp(28px,4vw,40px);color:var(--c-amber);letter-spacing:-.04em;flex:none;margin:0;}

/* Waterfall des natures */
.arg-wf{width:100%;height:auto;display:block;margin-top:4px;overflow:visible;}
.arg-wf-link{stroke:var(--c-line-strong);stroke-width:1;stroke-dasharray:3 3;}
.arg-wf-val{font-family:var(--f-text);font-variant-numeric:tabular-nums;font-size:12px;font-weight:600;fill:var(--c-ink);}
.arg-wf-cat{font-family:var(--f-text);font-size:11px;fill:var(--c-ink2);}

/* Suivi — board drag-and-drop */
.arg-board{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
@media(max-width:640px){.arg-board{grid-template-columns:1fr;}}
.arg-col{background:var(--c-inset);border:1px solid var(--c-line);border-radius:12px;padding:10px;min-height:92px;transition:border-color .15s,background-color .15s;}
.arg-col.drop{border-color:rgba(102,230,190,.45);border-style:dashed;background:rgba(102,230,190,.05);}
.arg-col-head{font-family:var(--f-mono);font-size:10.5px;font-weight:500;color:var(--c-ink3);text-transform:uppercase;letter-spacing:.08em;margin:2px 4px 10px;display:flex;justify-content:space-between;}
.arg-col-head b{color:var(--c-ink);font-weight:500;}
.arg-tile{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--c-panel-2);border:1px solid var(--c-line);border-radius:9px;padding:9px 11px;margin-bottom:8px;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,.25);font-size:13.5px;transition:border-color .12s;}
.arg-tile:hover{border-color:var(--c-line-strong);}
.arg-tile:active{cursor:grabbing;}
.arg-tile-name{font-weight:500;color:var(--c-ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.arg-tile-save{color:var(--c-vert);font-weight:600;font-size:12px;}
.arg-tile-right{display:flex;align-items:center;gap:6px;flex:none;}
.arg-tile-letter{flex:none;width:26px;height:26px;border:1px solid var(--c-line);background:transparent;border-radius:7px;
  color:var(--c-ink2);font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:background-color .12s,color .12s,border-color .12s;}
.arg-tile-letter:hover{background:var(--c-vert-soft);color:var(--c-vert);border-color:rgba(102,230,190,.35);}

/* Journal d'audit MCP */
.arg-audit{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0;}
.arg-audit-row{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--c-line);}
.arg-audit-row:last-child{border-bottom:0;}
.arg-audit-tool{font-family:var(--f-mono);font-size:11.5px;color:var(--c-ink);background:var(--c-inset);border:1px solid var(--c-line);border-radius:7px;padding:3px 8px;word-break:break-all;}
.arg-audit-out{font-size:12.5px;color:var(--c-ink2);}
.arg-audit-out.out{color:var(--c-amber);font-weight:500;}

/* Bientôt — fake-it grisé */
.arg-soon{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
@media(max-width:640px){.arg-soon{grid-template-columns:1fr;}}
.arg-soon-tile{position:relative;border:1px dashed var(--c-line-strong);border-radius:12px;padding:16px;background:rgba(238,248,245,.015);}
.arg-soon-lock{position:absolute;top:12px;right:12px;opacity:.45;font-size:13px;filter:grayscale(1);}
.arg-soon-title{font-family:var(--f-text);font-weight:600;font-size:14.5px;letter-spacing:-.01em;color:var(--c-ink);margin:0 0 5px;opacity:.85;}
.arg-soon-desc{font-size:12.5px;color:var(--c-ink2);margin:0 0 14px;}
.arg-soon-btn{border:1px solid rgba(102,230,190,.4);background:transparent;color:var(--c-vert);border-radius:9px;font-family:inherit;font-size:12px;font-weight:600;padding:7px 12px;cursor:pointer;transition:background-color .12s;}
.arg-soon-btn:hover{background:var(--c-vert-soft);}

/* Liste d'attente */
.arg-wl{position:fixed;inset:0;z-index:80;background:rgba(3,6,10,.72);display:flex;align-items:center;justify-content:center;padding:20px;animation:argFade .2s ease;}
.arg-wl-box{background:var(--c-panel);border:1px solid var(--c-line-strong);border-radius:18px;padding:26px;width:100%;max-width:390px;box-shadow:0 30px 80px rgba(0,0,0,.55);text-align:center;}
.arg-wl-title{font-family:var(--f-display);font-weight:600;font-size:21px;letter-spacing:-.025em;color:var(--c-ink);margin:0 0 4px;}
.arg-wl-sub{font-size:13.5px;color:var(--c-ink2);margin:0 0 18px;}
.arg-wl-form{display:flex;gap:8px;}
.arg-wl-input{flex:1;min-width:0;border:1px solid var(--c-line-strong);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;background:var(--c-inset);color:var(--c-ink);}
.arg-wl-input:focus{outline:none;border-color:var(--c-vert);box-shadow:0 0 0 3px rgba(102,230,190,.15);}
.arg-wl-submit{border:0;background:var(--c-ink);color:#0b1117;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;padding:10px 16px;cursor:pointer;white-space:nowrap;}
.arg-wl-done{font-family:var(--f-display);font-weight:600;font-size:16px;color:var(--c-vert);margin:8px 0;}
.arg-wl-close{margin-top:14px;border:0;background:none;color:var(--c-ink2);font-family:inherit;font-size:13px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}

/* Voix — bouton flottant (verre sombre) + widget Q&A */
.arg-voice{position:fixed;right:20px;bottom:20px;z-index:75;display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
.arg-voice-btn{position:relative;display:inline-flex;align-items:center;gap:9px;height:44px;border:1px solid rgba(102,230,190,.35);
  background:rgba(17,26,34,.86);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--c-ink);border-radius:99px;
  font-family:inherit;font-size:13px;font-weight:600;padding:0 18px 0 14px;cursor:pointer;
  box-shadow:0 14px 36px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04);transition:transform .08s ease,opacity .1s;}
.arg-voice-btn:hover{transform:translateY(-1px);border-color:rgba(102,230,190,.6);}
.arg-voice-btn:disabled{opacity:.7;cursor:progress;}
.arg-voice-btn.on{border-color:rgba(255,143,126,.6);background:rgba(52,22,22,.88);}
.arg-voice-btn.on::after{content:"";position:absolute;inset:-5px;border-radius:inherit;border:1px solid rgba(255,143,126,.5);
  animation:argRing 1.6s cubic-bezier(0.23,1,0.32,1) infinite;pointer-events:none;}
@keyframes argRing{from{transform:scale(.96);opacity:1}to{transform:scale(1.14);opacity:0}}
.arg-voice-ico{font-size:15px;line-height:1;}
@media(max-width:560px){.arg-voice{right:12px;bottom:12px;}.arg-voice-txt{display:none;}.arg-voice-btn{padding:0 14px;}}
@media(prefers-reduced-motion:reduce){.arg-voice-btn.on::after{animation:none;opacity:.6;}}

/* Héros : le chiffre à récupérer */
.arg-hero{position:relative;isolation:isolate;overflow:hidden;display:flex;justify-content:space-between;align-items:flex-start;gap:28px;
  padding:34px 36px 32px;border:1px solid var(--c-line);border-radius:22px;margin-bottom:14px;
  background:radial-gradient(90% 120% at 0% 0%,rgba(180,247,104,.075),transparent 55%),
    radial-gradient(70% 90% at 100% 100%,rgba(102,230,190,.05),transparent 60%),
    linear-gradient(180deg,#111b23,#0c141a);}
.arg-hero::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.6;
  background-image:radial-gradient(rgba(238,248,245,.16) 1px,transparent 1.3px);background-size:12px 12px;
  -webkit-mask-image:radial-gradient(50% 80% at 94% 6%,#000 0%,transparent 72%);mask-image:radial-gradient(50% 80% at 94% 6%,#000 0%,transparent 72%);}
.arg-eyebrow{font-family:var(--f-mono);font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.14em;color:var(--c-ink2);margin:0 0 16px;}
.arg-figure{font-family:var(--f-display);font-variant-numeric:tabular-nums;font-weight:700;
  font-size:clamp(46px,8vw,88px);line-height:.95;color:var(--c-lime);margin:0;letter-spacing:-.035em;word-spacing:.08em;
  text-shadow:0 0 44px rgba(180,247,104,.16);}
.arg-sub{font-size:15px;color:var(--c-ink2);margin:16px 0 0;}
.arg-cta{margin-top:24px;display:inline-flex;align-items:center;gap:8px;background:var(--c-lime);color:var(--c-on-lime);border:0;border-radius:12px;
  padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:transform .08s ease;
  box-shadow:0 10px 34px rgba(180,247,104,.20),inset 0 1px 0 rgba(255,255,255,.35);}
.arg-cta:hover{transform:translateY(-1px);filter:brightness(1.04);}
.arg-hero-side{display:flex;flex-direction:column;align-items:center;gap:14px;flex:none;}
.arg-score{position:relative;text-align:center;}
.arg-score-bg{fill:none;stroke:rgba(238,248,245,.08);stroke-width:2.6;}
.arg-score-fg{fill:none;stroke:var(--c-vert);stroke-width:2.6;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center;}
.arg-score-num{position:absolute;inset:0;top:28px;display:flex;flex-direction:column;align-items:center;line-height:1;}
.arg-score-num strong{font-family:var(--f-display);font-weight:700;font-size:24px;color:var(--c-ink);letter-spacing:-.03em;}
.arg-score-num span{font-family:var(--f-mono);font-size:9.5px;color:var(--c-ink3);margin-top:2px;}
.arg-score-cap{font-size:11px;color:var(--c-ink2);margin:8px 0 0;}
.arg-runway{text-align:center;border:1px solid var(--c-line);background:rgba(8,13,19,.55);border-radius:12px;padding:10px 14px;}
.arg-runway-num{display:block;font-family:var(--f-text);font-weight:600;font-size:17px;letter-spacing:-.01em;font-variant-numeric:tabular-nums;}
.arg-runway-cap{font-size:10.5px;color:var(--c-ink2);}

.arg-card{border:1px solid var(--c-line);border-radius:var(--r);background:var(--c-panel);padding:20px 22px;margin-bottom:14px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);transition:border-color .2s;}
.arg-card:hover{border-color:#2e3e48;}
.arg-card-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;margin-bottom:16px;gap:6px 10px;}
.arg-card-title{font-family:var(--f-text);font-weight:600;font-size:15.5px;letter-spacing:-.012em;color:var(--c-ink);}
.arg-muted{color:var(--c-ink2);font-size:12px;}

.arg-ledger{display:flex;gap:3px;height:12px;margin-bottom:14px;}
.arg-ledger-seg{height:100%;border-radius:4px;min-width:3px;}
.arg-legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12.5px;color:var(--c-ink2);}
.arg-legend-item{display:flex;align-items:center;gap:7px;}
.arg-legend-item i{width:8px;height:8px;border-radius:2px;display:inline-block;}
.arg-legend-item b{color:var(--c-ink);font-weight:600;}

.arg-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;}
.arg-metric{border:1px solid var(--c-line);border-radius:var(--r);background:var(--c-panel);padding:18px 20px;}
.arg-metric:has(.accent){border-color:rgba(102,230,190,.3);background:linear-gradient(180deg,rgba(102,230,190,.07),transparent 75%),var(--c-panel);}
.arg-metric-label{font-size:12px;color:var(--c-ink2);margin:0 0 8px;}
.arg-metric-val{font-size:26px;font-weight:600;margin:0;letter-spacing:-.025em;}
.arg-metric-val.accent{color:var(--c-vert);}
.arg-metric-note{font-size:11.5px;color:var(--c-ink3);margin:6px 0 0;}

.arg-bars{display:flex;flex-direction:column;gap:11px;}
.arg-bar-row{display:grid;grid-template-columns:minmax(96px,150px) 1fr 70px;align-items:center;gap:12px;}
.arg-bar-label{font-size:12.5px;color:var(--c-ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.arg-bar-track{height:8px;background:rgba(238,248,245,.05);border-radius:99px;overflow:hidden;}
.arg-bar-fill{height:100%;background:linear-gradient(90deg,rgba(102,230,190,.5),var(--c-vert));border-radius:99px;}
.arg-bar-val{font-size:12.5px;text-align:right;color:var(--c-ink);}

.arg-sim-read{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-bottom:18px;background:var(--c-line);
  border:1px solid var(--c-line);border-radius:12px;overflow:hidden;}
.arg-simstat{background:var(--c-inset);padding:14px 16px;}
.arg-simstat-val{font-size:22px;font-weight:600;margin:0;letter-spacing:-.03em;}
.arg-simstat-val.accent{color:var(--c-vert);}
.arg-simstat-label{font-size:11.5px;color:var(--c-ink2);margin:4px 0 0;}

.arg-horizon{display:flex;align-items:center;gap:14px;margin-bottom:12px;font-size:13px;color:var(--c-ink2);}
.arg-horizon input{flex:1;accent-color:var(--c-vert);}
.arg-progress{height:6px;background:rgba(238,248,245,.06);border-radius:99px;overflow:hidden;margin-bottom:18px;}
.arg-progress>div{height:100%;background:var(--c-vert);border-radius:99px;transition:width .2s ease;}

.arg-levers{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:10px;}
.arg-lever{display:flex;align-items:stretch;border:1px solid var(--c-line);border-radius:12px;
  background:var(--c-panel-2);overflow:hidden;transition:border-color .1s,background .1s;}
.arg-lever:hover{border-color:var(--c-line-strong);}
.arg-lever.on{border-color:rgba(102,230,190,.5);background:linear-gradient(180deg,rgba(102,230,190,.09),rgba(102,230,190,.035));}
.arg-lever-toggle{flex:1;display:flex;align-items:center;gap:10px;padding:11px 12px;border:0;
  background:transparent;cursor:pointer;text-align:left;font-family:inherit;color:inherit;}
.arg-lever-letter{flex:none;width:42px;border:0;border-left:1px solid var(--c-line);background:transparent;
  cursor:pointer;font-size:15px;color:var(--c-ink2);transition:background .1s,color .1s;}
.arg-lever-letter:hover{background:var(--c-vert-soft);color:var(--c-vert);}
.arg-lever.on .arg-lever-letter{border-left-color:rgba(102,230,190,.25);}
.arg-lever-status{flex:none;align-self:center;border:1px solid var(--c-line);border-radius:8px;background:var(--c-inset);color-scheme:dark;
  color:var(--c-ink2);font-family:inherit;font-size:11.5px;font-weight:500;padding:5px 6px;margin:0 4px;cursor:pointer;max-width:130px;}
.arg-lever-status:hover{border-color:var(--c-line-strong);}
.arg-lever-status:focus-visible{outline:2px solid var(--c-vert);outline-offset:1px;}
.arg-check{width:18px;height:18px;border-radius:6px;border:1.5px solid var(--c-line-strong);
  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--c-on-vert);flex:none;}
.arg-lever.on .arg-check{background:var(--c-vert);border-color:var(--c-vert);}
.arg-lever-txt{flex:1;font-size:13px;color:var(--c-ink);}
.arg-risk{font-size:11px;white-space:nowrap;}
.arg-lever-save{font-size:13.5px;font-weight:600;min-width:50px;text-align:right;}
.arg-lever.on .arg-lever-save{color:var(--c-vert);}

.arg-hint{font-size:11.5px;color:var(--c-ink3);margin:14px 0 0;}

/* Tiroir lettre */
.arg-drawer-wrap{position:fixed;inset:0;z-index:50;display:flex;justify-content:flex-end;}
.arg-drawer-backdrop{position:absolute;inset:0;background:rgba(3,6,10,.62);}
.arg-drawer{position:relative;width:min(540px,100%);height:100%;background:#0c141a;
  border-left:1px solid var(--c-line);box-shadow:-24px 0 70px rgba(0,0,0,.5);
  display:flex;flex-direction:column;padding:24px 24px 20px;overflow:auto;}
.arg-drawer-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;}
.arg-drawer-eyebrow{font-family:var(--f-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;font-weight:500;
  color:var(--c-vert);margin:0 0 6px;}
.arg-drawer-title{font-family:var(--f-display);font-weight:600;font-size:22px;margin:0;letter-spacing:-.025em;}
.arg-drawer-close{border:1px solid var(--c-line);background:transparent;border-radius:10px;width:34px;height:34px;
  cursor:pointer;font-size:13px;color:var(--c-ink2);flex:none;transition:border-color .12s,color .12s;}
.arg-drawer-close:hover{border-color:var(--c-line-strong);color:var(--c-ink);}
.arg-drawer-loading{flex:1;display:flex;align-items:center;justify-content:center;color:var(--c-ink2);
  font-size:14px;border:1px dashed var(--c-line-strong);border-radius:12px;margin-bottom:12px;min-height:220px;background:var(--c-inset);}
.arg-drawer-text{flex:1;min-height:340px;width:100%;resize:vertical;border:1px solid var(--c-line);
  border-radius:12px;padding:16px;font-family:var(--f-text);font-size:13px;line-height:1.65;letter-spacing:0;color:var(--c-ink);background:var(--c-inset);
  margin-bottom:12px;white-space:pre-wrap;}
.arg-drawer-text:focus{outline:2px solid rgba(102,230,190,.5);outline-offset:0;}
.arg-drawer-actions{display:flex;gap:8px;}
.arg-drawer-actions .arg-btn{flex:1;text-align:center;}
.arg-drawer-note{font-size:11px;color:var(--c-ink3);margin:12px 0 0;text-align:center;}
/* « Résilier avec H Company » : le CTA principal du tiroir */
.arg-hco{position:relative;width:100%;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
  border:1px solid var(--c-lime);background:var(--c-lime);color:var(--c-on-lime);border-radius:12px;font-family:inherit;
  font-size:15px;font-weight:650;padding:13px 14px;cursor:pointer;
  box-shadow:0 12px 36px rgba(180,247,104,.18),inset 0 1px 0 rgba(255,255,255,.35);
  transition:transform .16s cubic-bezier(.23,1,.32,1),filter .15s,opacity .1s;}
.arg-hco:hover:not(:disabled){filter:brightness(1.05);}
.arg-hco:active:not(:disabled){transform:scale(.97);}
.arg-hco:disabled{background:var(--c-panel-2);border-color:var(--c-line);color:var(--c-ink3);box-shadow:none;cursor:not-allowed;}
.arg-hco-tag{font-family:var(--f-mono);font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 7px;border-radius:99px;background:rgba(14,27,5,.12);color:rgba(14,27,5,.78);}
.arg-hco:disabled .arg-hco-tag{background:rgba(238,248,245,.05);color:var(--c-ink3);}
.arg-hco-note{font-size:11.5px;color:var(--c-ink2);margin:8px 0 0;text-align:center;}
.arg-send-reco{width:100%;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;
  border:1px dashed var(--c-line-strong);background:transparent;color:var(--c-ink3);
  border-radius:12px;font-family:inherit;font-size:13.5px;font-weight:500;padding:11px;cursor:not-allowed;}
.arg-soon-pill{font-family:var(--f-mono);font-size:9.5px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;
  background:rgba(238,220,157,.08);color:var(--c-amber);border:1px solid rgba(238,220,157,.22);padding:2px 7px;border-radius:99px;}

.arg-bench{margin-top:18px;padding-top:16px;border-top:1px solid var(--c-line);}
.arg-bench-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.arg-bench-title{font-family:var(--f-text);font-weight:600;font-size:13.5px;letter-spacing:-.01em;}
.arg-bench-btn{font-size:12px;padding:6px 11px;}
.arg-bench-hint{font-size:12px;color:var(--c-ink2);margin:10px 0 0;}
.arg-bench-best{font-size:12.5px;font-weight:600;color:var(--c-vert);margin:10px 0 0;}
.arg-bench-via{font-size:10.5px;color:var(--c-ink3);margin:10px 0 0;text-align:right;font-style:italic;}
.arg-bench-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:7px;}
.arg-bench-list li{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12.5px;
  padding-bottom:7px;border-bottom:1px solid var(--c-line);}
.arg-bench-alt{font-weight:600;}
.arg-bench-price{color:var(--c-vert);}
.arg-bench-src{font-size:11px;color:var(--c-ink2);text-decoration:underline;text-underline-offset:2px;margin-left:auto;}
.arg-bench-src:hover{color:var(--c-vert);}
.arg-bench-inject{width:100%;margin-top:12px;font-size:12.5px;}
@media(max-width:680px){.arg-drawer{width:100%;}}

.arg-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;}
.arg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--c-line-strong);background:transparent;
  border-radius:10px;padding:8px 14px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;color:var(--c-ink);
  transition:border-color .15s,background-color .15s;text-decoration:none;}
.arg-btn:hover{border-color:#506572;background:rgba(238,248,245,.04);}
.arg-btn:disabled{opacity:.5;cursor:not-allowed;}
.arg-btn-ghost{margin-left:auto;background:rgba(238,248,245,.92);color:#0b1117;border-color:transparent;}
.arg-btn-ghost:hover{background:#fff;border-color:transparent;}

.arg-flux{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}
.arg-flux-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--c-line);}
.arg-flux-row:first-child{border-top:0;padding-top:2px;}
.arg-dot{width:7px;height:7px;border-radius:99px;flex:none;background:var(--c-ink2);}
.arg-dot.amber{background:var(--c-amber);box-shadow:0 0 8px rgba(238,220,157,.45);}
.arg-dot.danger{background:var(--c-clay);box-shadow:0 0 8px rgba(255,143,126,.45);}
.arg-dot.neutral{background:var(--c-line-strong);}
.arg-flux-label{flex:1;font-size:13px;color:var(--c-ink);}
.arg-flux-val{font-size:13px;font-weight:600;}
.arg-flux-val.danger{color:var(--c-clay);} .arg-flux-val.amber{color:var(--c-amber);}

.arg-foot{font-size:11.5px;color:var(--c-ink3);text-align:center;margin-top:28px;line-height:1.7;}
.arg-foot b{color:var(--c-ink2);font-weight:500;}
.arg-qwl{text-align:center;padding:36px 22px;
  background:radial-gradient(60% 110% at 50% 0%,rgba(102,230,190,.08),transparent 70%),var(--c-panel);}
.arg-qwl-title{font-family:var(--f-display);font-weight:600;font-size:clamp(22px,3vw,30px);color:var(--c-ink);margin:0 0 20px;letter-spacing:-.035em;}
.arg-qwl-form{display:flex;gap:10px;max-width:520px;margin:0 auto;flex-wrap:wrap;justify-content:center;}
.arg-qwl-input{flex:1;min-width:220px;border:1px solid var(--c-line-strong);background:var(--c-inset);color:var(--c-ink);border-radius:12px;font-family:inherit;font-size:15px;padding:13px 16px;outline:none;transition:border-color .12s,box-shadow .12s;}
.arg-qwl-input::placeholder{color:var(--c-ink3);}
.arg-qwl-input:focus{border-color:var(--c-vert);box-shadow:0 0 0 3px rgba(102,230,190,.15);}
.arg-qwl-btn{border:0;background:var(--c-ink);color:#0b1117;border-radius:12px;font-family:inherit;font-size:15px;font-weight:600;padding:13px 20px;cursor:pointer;white-space:nowrap;transition:transform .08s ease;}
.arg-qwl-btn:hover{transform:translateY(-1px);background:#fff;}
.arg-qwl-hint{font-size:12.5px;color:var(--c-ink3);margin:12px 0 0;}
.arg-qwl-done{font-family:var(--f-display);font-weight:600;font-size:18px;color:var(--c-vert);margin:0;}

.arg-lever-toggle:focus-visible,.arg-lever-letter:focus-visible,.arg-btn:focus-visible,.arg-cta:focus-visible,.arg-lang-btn:focus-visible,.arg-horizon input:focus-visible,
.arg-root button:focus-visible,.arg-root a:focus-visible{
  outline:2px solid var(--c-lime);outline-offset:2px;}

@media(max-width:680px){
  .arg-hero{flex-direction:column;padding:26px 22px 24px;border-radius:18px;} .arg-hero-side{flex-direction:row;align-self:stretch;justify-content:space-between;}
  .arg-metrics{grid-template-columns:1fr;} .arg-sim-read{grid-template-columns:repeat(2,1fr);}
  .arg-bar-row{grid-template-columns:108px 1fr 62px;}
  .arg-card{padding:18px 16px;}
  .arg-chip{max-width:100%;overflow:hidden;text-overflow:ellipsis;}
  .arg-top-right{justify-content:flex-start;}
}
@media(max-width:560px){
  .arg-lever{flex-wrap:wrap;}
  .arg-lever-toggle{flex:1 1 100%;}
  .arg-lever-status{flex:1;max-width:none;margin:0 6px 10px 40px;padding:7px 8px;}
  .arg-lever-letter{width:38px;height:34px;align-self:center;margin:0 10px 10px 0;border:1px solid var(--c-line);border-radius:8px;}
  .arg-lever.on .arg-lever-letter{border-color:rgba(102,230,190,.25);}
}

/* --- Mouvement ----------------------------------------------------------
   Courbes partagées : --ease-out (entrées franches), --ease-drawer (tiroir),
   --ease-pop (léger rebond, réservé aux moments rares). Seuls transform et
   opacity sont animés. */
.arg-root{--ease-out:cubic-bezier(0.23,1,0.32,1);--ease-drawer:cubic-bezier(0.32,0.72,0,1);--ease-pop:cubic-bezier(0.34,1.56,0.64,1);}
@keyframes argRise{from{opacity:0;transform:translateY(8px)}}
@keyframes argStep{from{opacity:0;transform:translateY(6px)}}
@keyframes argPop{from{opacity:0;transform:scale(.92)}}
@keyframes argTick{from{opacity:0;transform:scale(.5)}}
@keyframes argFadeOut{to{opacity:0}}
@keyframes argSlideIn{from{transform:translateX(100%)}}
@keyframes argSlideOut{to{transform:translateX(100%)}}

/* Autopilote : chaque étape arrive au lieu de remplacer la précédente d'un coup. */
.arg-ap-runlabel,.arg-ap-tool,.arg-ap-gate{animation:argStep .25s var(--ease-out) both;}
.arg-ap-num{transition:background-color .2s var(--ease-out),border-color .2s var(--ease-out),color .2s var(--ease-out),box-shadow .2s var(--ease-out);}
/* Écran « Prouvé » : le moment récompense — entrée en cascade, badge qui rebondit. */
.arg-ap-proof>*{animation:argRise .35s var(--ease-out) both;}
.arg-ap-proof>:nth-child(2){animation-delay:60ms;}
.arg-ap-proof>:nth-child(3){animation-delay:120ms;}
.arg-ap-proof>:nth-child(4){animation-delay:180ms;}
.arg-ap-proof>:nth-child(5){animation-delay:240ms;}
.arg-ap-proof>:nth-child(6){animation-delay:300ms;}
.arg-ap-proof>.arg-ap-proof-badge{animation:argPop .4s var(--ease-pop) both;}

/* Tiroir « lettre » : il glisse depuis le bord droit et repart par le même bord. */
.arg-drawer-backdrop{animation:argFade .2s ease-out both;}
.arg-drawer{animation:argSlideIn .32s var(--ease-drawer) both;}
.arg-drawer-wrap.closing{pointer-events:none;}
.arg-drawer-wrap.closing .arg-drawer-backdrop{animation:argFadeOut .2s ease-out both;}
.arg-drawer-wrap.closing .arg-drawer{animation:argSlideOut .2s var(--ease-drawer) both;}

/* Succès « ✓ Tu es sur la liste » : le message monte, la coche rebondit juste après. */
.arg-qwl-done,.arg-wl-done{animation:argRise .3s var(--ease-out) both;}
.arg-tick{display:inline-block;animation:argTick .4s var(--ease-pop) .08s both;}

/* Retour au clic : boutons qui s'enfoncent, carte de levier à peine (elle est grande). */
.arg-cta,.arg-qwl-btn,.arg-ap-open,.arg-pitch-open,.arg-ap-approve,.arg-ap-refuse,.arg-voice-btn{transition:transform .16s var(--ease-out),opacity .1s,background-color .15s,border-color .15s,filter .15s;}
.arg-cta:active,.arg-qwl-btn:active,.arg-ap-open:active,.arg-pitch-open:active,
.arg-ap-approve:active,.arg-ap-refuse:active,.arg-voice-btn:active{transform:scale(.97);}
.arg-lever{transition:border-color .1s,background .1s,transform .16s var(--ease-out);}
.arg-lever:has(.arg-lever-toggle:active){transform:scale(.985);}
.arg-check{transition:background-color .12s ease-out,border-color .12s ease-out;}

/* Entrée de la page : le héros puis les cartes montent à peine, une fois. */
.arg-hero,.arg-root>.arg-card,.arg-metrics{animation:argRise .45s var(--ease-out) both;}
.arg-root>.arg-card{animation-delay:60ms;}
.arg-metrics{animation-delay:90ms;}

@media(prefers-reduced-motion:reduce){
  .arg-cta,.arg-progress>div{transition:none;}
  /* Fondu conservé, déplacements et changements d'échelle retirés. */
  .arg-ap-runlabel,.arg-ap-tool,.arg-ap-gate,.arg-ap-proof>*,.arg-ap-proof>.arg-ap-proof-badge,
  .arg-qwl-done,.arg-wl-done,.arg-tick,.arg-hero,.arg-root>.arg-card,.arg-metrics{animation-name:argFade;}
  .arg-drawer{animation:argFade .15s ease-out both;}
  .arg-drawer-wrap.closing .arg-drawer{animation:argFadeOut .15s ease-out both;}
}
`;
