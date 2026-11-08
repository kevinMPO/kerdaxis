"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyzeResult, Lang, Lever, LeverEvidence, Localized, UnverifiedReason } from "@/lib/types";
import { EMPTY_ANALYSIS } from "@/lib/analysis/empty";
import { detectLang, eur as eurFmt, LANGS } from "@/lib/i18n";
import { buildPlanCsv, planFilename } from "@/lib/export";
import { parseIntent } from "@/lib/voice/intents";
import { launchCancellation } from "../ExecutionPanel";
import { dashboardCopy, type DashboardCopy, type ViewId } from "./copy";
import type { ExecutionView } from "./use-execution";

const LANG_STORAGE_KEY = "argentier-lang";
const RUNS_STORAGE_KEY = "kerdaxis-runs";
const MAX_STORED_RUNS = 12;
/** Recherches web lancées en parallèle par « vérifier les prix » : assez pour aller vite, assez peu pour le plafond de débit. */
const PRICING_CONCURRENCY = 3;
const DEFAULT_BENCH_CATEGORY = "outil SaaS";

export type ApiRefusal = null | "reconnect" | "unavailable";

/** Suppliers the H Company agent has a cancellation path for (mirrors SUPPLIER_IDS on the server). */
const AGENT_CATALOG = ["nuvio", "lumen"] as const;

/**
 * ready: the agent can run now; offline: path exists but the portal is unreachable; unsupported: no path yet;
 * subscribers: a free trial only replays the recorded supplier, live runs need a subscription.
 */
export type AgentState = "ready" | "offline" | "unsupported" | "subscribers";

export interface RunRef {
  id: string;
  supplierId: string;
  vendor: string;
  startedAt: string;
}

interface ExecutionStatus {
  hcompany: boolean;
  suppliers: { id: string; vendor: string }[];
  replay?: boolean;
  /** Free trial: the only supplier replayed; every other one is reserved for subscribers. */
  replaySupplierId?: string | null;
}

export interface BenchAlternative {
  name: string;
  monthlyPrice: number | null;
  unit: string;
  sourceUrl: string;
  sourceDate: string;
}

export interface BenchResult {
  verified: boolean;
  note?: string;
  alternatives: BenchAlternative[];
  sources: { title: string; url: string; date: string }[];
  bestSaving: number;
  bestAlternative: string | null;
  provider?: "linkup";
}

/** Réponse de /api/benchmark : le moteur a déjà transformé les prix en euros. */
interface PricingResponse {
  verified: boolean;
  note?: string;
  pricing:
    | { status: "sourced"; saving: number; evidence: LeverEvidence; to?: string }
    | { status: "unverified"; reason: Exclude<UnverifiedReason, "web_down"> }
    | null;
}

export interface PricingRun {
  status: "idle" | "running" | "done";
  done: number;
  total: number;
}

const IDLE_PRICING: PricingRun = { status: "idle", done: 0, total: 0 };

/** Lever waiting for a market price: engine 2.0 marks it `pending`, its € is 0 until the web answers. */
export function needsMarketPrice(lever: Lever): boolean {
  return lever.basis === "pending" || lever.basis === "unverified";
}

function applyPricing(lever: Lever, response: PricingResponse | null): Lever {
  const pricing = response?.pricing;
  if (pricing?.status === "sourced") {
    return {
      ...lever,
      saving: pricing.saving,
      savingYearly: pricing.saving * 12,
      basis: "sourced",
      evidence: pricing.evidence,
      to: pricing.to ?? pricing.evidence.offer.name,
      active: lever.risk === "safe",
      unverifiedReason: undefined,
    };
  }
  const reason: UnverifiedReason = pricing?.status === "unverified" ? pricing.reason : "web_down";
  return { ...lever, saving: 0, basis: "unverified", evidence: undefined, active: false, unverifiedReason: reason };
}

async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  });
  await Promise.all(workers);
}

interface LetterSource {
  name: string;
  price: string;
  date: string;
  url: string;
}

function readStoredRuns(): RunRef[] {
  try {
    const raw = window.localStorage.getItem(RUNS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RunRef[]).slice(0, MAX_STORED_RUNS) : [];
  } catch {
    return [];
  }
}

function writeStoredRuns(runs: RunRef[]): void {
  try {
    window.localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_STORED_RUNS)));
  } catch {
    /* storage unavailable: the list simply lives for this tab */
  }
}

export interface Dashboard {
  lang: Lang;
  setLang: (lang: Lang) => void;
  copy: DashboardCopy;
  eur: (amount: number) => string;
  loc: (text: Localized) => string;
  view: ViewId;
  setView: (view: ViewId) => void;
  data: AnalyzeResult;
  levers: Lever[];
  loaded: boolean;
  refusal: ApiRefusal;
  qontoConnected: boolean;
  disconnectQonto: () => Promise<void>;
  monthly: number;
  annual: number;
  toggleLever: (id: string) => void;
  setAllLevers: (predicate: (lever: Lever) => boolean) => void;
  exportCsv: () => void;
  isExecutable: (supplierId: string) => boolean;
  agentState: (supplierId: string) => AgentState;
  replayMode: boolean;
  runs: RunRef[];
  selectedRunId: string | null;
  selectRun: (id: string) => void;
  launch: (lever: Lever) => Promise<void>;
  launchingId: string | null;
  launchError: string | null;
  runViews: Record<string, ExecutionView>;
  reportRunView: (view: ExecutionView) => void;
  letter: LetterState;
  openLetter: (lever: Lever, sources?: LetterSource[]) => Promise<void>;
  closeLetter: () => void;
  runBenchmark: (lever: Lever) => Promise<void>;
  pricing: PricingRun;
  pendingPriceCount: number;
  priceAllLevers: () => Promise<void>;
  regenerateWithPrices: () => void;
  onVoiceCommand: (text: string) => string;
}

export interface LetterState {
  lever: Lever | null;
  text: string;
  loading: boolean;
  bench: BenchResult | null;
  benchLoading: boolean;
}

const EMPTY_LETTER: LetterState = { lever: null, text: "", loading: false, bench: null, benchLoading: false };

export function useDashboard(): Dashboard {
  const [lang, setLangState] = useState<Lang>("fr");
  const [view, setView] = useState<ViewId>("today");
  const [data, setData] = useState<AnalyzeResult>(EMPTY_ANALYSIS);
  const [levers, setLevers] = useState<Lever[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal>(null);
  const [qontoConnected, setQontoConnected] = useState(false);
  const [execStatus, setExecStatus] = useState<ExecutionStatus | null>(null);
  const [runs, setRuns] = useState<RunRef[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [runViews, setRunViews] = useState<Record<string, ExecutionView>>({});
  const [letter, setLetter] = useState<LetterState>(EMPTY_LETTER);
  const [pricing, setPricing] = useState<PricingRun>(IDLE_PRICING);

  const copy = dashboardCopy(lang);
  const eur = useCallback((amount: number) => eurFmt(amount, lang), [lang]);
  const loc = useCallback((text: Localized) => text[lang as "fr" | "en"] ?? text.en, [lang]);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      saved = null;
    }
    setLangState(saved && (LANGS as string[]).includes(saved) ? (saved as Lang) : detectLang(navigator.language));
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "today" || requested === "subscriptions" || requested === "runs" || requested === "ledger") setView(requested);
    const stored = readStoredRuns();
    setRuns(stored);
    setSelectedRunId(stored[0]?.id ?? null);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // A refused /api/analyze must never be shown as an analysis: the screen stays empty and the refusal is said.
  useEffect(() => {
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/analyze", { signal: controller.signal });
        if (response.ok) {
          const result = (await response.json()) as AnalyzeResult;
          setData(result);
          setLevers(result.levers);
          setRefusal(null);
        } else {
          setRefusal(response.status === 401 ? "reconnect" : "unavailable");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setRefusal("unavailable");
      }
      setLoaded(true);
    };
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      try {
        const situation = new URLSearchParams(window.location.search).get("qonto");
        if (situation === "indisponible" || situation === "erreur") setRefusal("unavailable");
        const [qonto, execution] = await Promise.all([
          fetch("/api/auth/qonto/status", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/execution/status", { cache: "no-store", signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (qonto) setQontoConnected(Boolean((qonto as { connected?: boolean }).connected));
        if (execution) setExecStatus(execution as ExecutionStatus);
      } catch {
        /* status probes are best-effort: the UI falls back to letters */
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const disconnectQonto = useCallback(async () => {
    try {
      await fetch("/api/auth/qonto/revoke", { method: "POST" });
    } finally {
      window.location.href = "/demo";
    }
  }, []);

  const monthly = useMemo(() => levers.filter((l) => l.active).reduce((sum, l) => sum + l.saving, 0), [levers]);
  const annual = monthly * 12;

  const toggleLever = useCallback(
    (id: string) => setLevers((all) => all.map((l) => (l.id === id ? { ...l, active: !l.active } : l))),
    [],
  );
  const setAllLevers = useCallback(
    (predicate: (lever: Lever) => boolean) => setLevers((all) => all.map((l) => ({ ...l, active: predicate(l) }))),
    [],
  );

  const exportCsv = useCallback(() => {
    const csv = buildPlanCsv({ ...data, levers }, levers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = planFilename(data);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [data, levers]);

  const replayMode = Boolean(execStatus?.replay);
  const isExecutable = useCallback(
    (supplierId: string) => Boolean(execStatus?.suppliers.some((s) => s.id === supplierId)),
    [execStatus],
  );

  const agentState = useCallback(
    (supplierId: string): AgentState => {
      const trialLocked = replayMode && execStatus?.replaySupplierId != null && supplierId !== execStatus.replaySupplierId;
      if (trialLocked) return "subscribers";
      if (isExecutable(supplierId)) return "ready";
      return (AGENT_CATALOG as readonly string[]).includes(supplierId) ? "offline" : "unsupported";
    },
    [isExecutable, replayMode, execStatus],
  );

  const selectRun = useCallback((id: string) => {
    setSelectedRunId(id);
    setView("runs");
  }, []);

  const launch = useCallback(
    async (lever: Lever) => {
      setLaunchingId(lever.id);
      setLaunchError(null);
      try {
        const id = await launchCancellation(lever.id);
        const ref: RunRef = { id, supplierId: lever.id, vendor: lever.label, startedAt: new Date().toISOString() };
        setRuns((current) => {
          const next = [ref, ...current.filter((r) => r.id !== id)];
          writeStoredRuns(next);
          return next;
        });
        setSelectedRunId(id);
        setView("runs");
      } catch (error) {
        setLaunchError(error instanceof Error ? error.message : String(error));
      } finally {
        setLaunchingId(null);
      }
    },
    [],
  );

  const reportRunView = useCallback((next: ExecutionView) => {
    setRunViews((current) => (current[next.id]?.updatedAt === next.updatedAt && current[next.id]?.status === next.status ? current : { ...current, [next.id]: next }));
  }, []);

  const openLetter = useCallback(
    async (lever: Lever, sources?: LetterSource[]) => {
      setLetter((current) => ({
        lever,
        text: "",
        loading: true,
        bench: sources ? current.bench : null,
        benchLoading: false,
      }));
      try {
        const response = await fetch("/api/letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchant: lever.label,
            action: lever.action ?? "renegotiate",
            alternative: lever.to,
            savingMonthly: lever.saving,
            savingAnnual: lever.saving * 12,
            lang,
            sources,
          }),
        });
        const json = (await response.json()) as { letter?: string };
        setLetter((current) => ({ ...current, text: json.letter ?? copy.error, loading: false }));
      } catch {
        setLetter((current) => ({ ...current, text: copy.error, loading: false }));
      }
    },
    [lang, copy.error],
  );

  const closeLetter = useCallback(() => setLetter(EMPTY_LETTER), []);

  const runBenchmark = useCallback(
    async (lever: Lever) => {
      setLetter((current) => ({ ...current, bench: null, benchLoading: true }));
      try {
        const response = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchant: lever.label, category: lever.pole ?? DEFAULT_BENCH_CATEGORY, monthly: lever.monthly ?? 0, action: lever.action, lang }),
        });
        const bench = (await response.json()) as BenchResult;
        setLetter((current) => ({ ...current, bench, benchLoading: false }));
      } catch {
        const bench: BenchResult = { verified: false, note: copy.benchNone, alternatives: [], sources: [], bestSaving: 0, bestAlternative: null };
        setLetter((current) => ({ ...current, bench, benchLoading: false }));
      }
    },
    [lang, copy.benchNone],
  );

  const pendingPriceCount = useMemo(() => levers.filter(needsMarketPrice).length, [levers]);

  // One consent click (rule 3): only each merchant's name and business pole leave, the engine turns prices into €.
  const priceAllLevers = useCallback(async () => {
    const targets = levers.filter(needsMarketPrice);
    if (targets.length === 0 || pricing.status === "running") return;
    setPricing({ status: "running", done: 0, total: targets.length });
    await runPool(targets, PRICING_CONCURRENCY, async (lever) => {
      let response: PricingResponse | null = null;
      try {
        const reply = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchant: lever.label,
            category: lever.pole ?? DEFAULT_BENCH_CATEGORY,
            monthly: lever.monthly ?? 0,
            action: lever.action,
            lang,
          }),
        });
        response = reply.ok ? ((await reply.json()) as PricingResponse) : null;
      } catch {
        response = null;
      }
      setLevers((all) => all.map((l) => (l.id === lever.id ? applyPricing(l, response) : l)));
      setPricing((run) => ({ ...run, done: run.done + 1 }));
    });
    setPricing((run) => ({ ...run, status: "done" }));
  }, [levers, lang, pricing.status]);

  const regenerateWithPrices = useCallback(() => {
    if (!letter.lever || !letter.bench) return;
    const sources: LetterSource[] = letter.bench.alternatives
      .filter((a) => a.monthlyPrice != null)
      .map((a) => ({ name: a.name, price: `${a.monthlyPrice} €${a.unit || "/mois"}`, date: a.sourceDate, url: a.sourceUrl }));
    void openLetter(letter.lever, sources);
  }, [letter.lever, letter.bench, openLetter]);

  // Spoken amounts are the engine's, already on screen. Voice can prepare an action, never give the final go.
  const onVoiceCommand = useCallback(
    (text: string): string => {
      const isFr = lang === "fr";
      const intent = parseIntent(text, levers.map((l) => ({ id: l.id, label: l.label })));
      switch (intent.kind) {
        case "explain":
        case "savings":
          return isFr
            ? `Tu peux récupérer ${eur(annual)} par an, soit ${eur(monthly)} par mois, sans perdre une seule capacité.`
            : `You can recover ${eur(annual)} a year, that's ${eur(monthly)} a month, without losing a single capability.`;
        case "audit":
          setView("today");
          return isFr
            ? "Voici ce qui t'attend : chaque ligne porte sa preuve et un seul bouton."
            : "Here is what needs you: each line carries its evidence and one button.";
        case "cancel": {
          const lever = levers.find((l) => l.id === intent.leverId);
          if (!lever) {
            return isFr ? "Quel abonnement veux-tu résilier ? Dis par exemple « résilie Nuvio »." : "Which subscription should I cancel? Say for example “cancel Nuvio”.";
          }
          if (isExecutable(lever.id)) {
            setView("subscriptions");
            return isFr
              ? `${lever.label} est prêt. Clique sur « Résilier avec H Company » : l'agent s'arrêtera avant le clic définitif.`
              : `${lever.label} is ready. Click “Cancel with H Company”: the agent will stop before the irreversible click.`;
          }
          void openLetter(lever);
          return isFr ? `J'ai ouvert la lettre de résiliation de ${lever.label}.` : `I opened the cancellation letter for ${lever.label}.`;
        }
        case "final_approval_by_voice":
          return isFr
            ? "Par sécurité, le feu vert final ne se donne jamais à la voix : clique sur le bouton à l'écran."
            : "For safety, the final go is never given by voice: click the button on screen.";
        default:
          return isFr
            ? "Essaie : « combien je peux économiser », « qu'est-ce qui m'attend » ou « résilie Nuvio »."
            : "Try: “how much can I save”, “what needs me” or “cancel Nuvio”.";
      }
    },
    [lang, levers, eur, annual, monthly, isExecutable, openLetter],
  );

  return {
    lang,
    setLang,
    copy,
    eur,
    loc,
    view,
    setView,
    data,
    levers,
    loaded,
    refusal,
    qontoConnected,
    disconnectQonto,
    monthly,
    annual,
    toggleLever,
    setAllLevers,
    exportCsv,
    isExecutable,
    agentState,
    replayMode,
    runs,
    selectedRunId,
    selectRun,
    launch,
    launchingId,
    launchError,
    runViews,
    reportRunView,
    letter,
    openLetter,
    closeLetter,
    runBenchmark,
    pricing,
    pendingPriceCount,
    priceAllLevers,
    regenerateWithPrices,
    onVoiceCommand,
  };
}
