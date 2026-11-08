"use client";

// ---------------------------------------------------------------------------
// Panneau d'exécution Kerdaxis : suit en direct l'agent H Company qui résilie
// un abonnement sur le portail du fournisseur, et porte le FEU VERT FINAL.
//
// Honnêteté de l'affichage (PRD §4.5–4.6) :
//  - « Résilié » n'apparaît qu'au statut `supplier_confirmed`, c'est-à-dire
//    quand le portail lui-même confirme, avec le même numéro que l'agent.
//  - L'économie n'est jamais « vérifiée sur relevé » ici : cela n'arrive qu'au
//    prochain prélèvement (J+30). Les cinq valeurs restent distinctes.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from "react";
import type { FinalLabelSource, ResearchRunCheck, StepCheck } from "@/lib/execution/research/compare";
import type { Lang } from "@/lib/types";

type Status =
  | "prepared"
  | "running"
  | "awaiting_final_approval"
  | "submitted"
  | "supplier_confirmed"
  | "failed"
  | "needs_manual_action"
  | "stopped_by_user";

interface ExecView {
  id: string;
  status: Status;
  vendor: string;
  plan: string;
  account: string;
  monthlyCents: number;
  actionHash: string;
  agentViewUrl: string | null;
  liveViewUrl: string | null;
  pendingApproval: { page_summary?: string; account_shown?: string; button_label?: string } | null;
  finalDecision: { decision: "approve" | "refuse"; at: string } | null;
  confirmationNumber: string | null;
  supplierState: { status: string; confirmation_number: string | null; access_until?: string } | null;
  hasScreenshot: boolean;
  steps: number;
  costUsd: number | null;
  error: string | null;
  updatedAt: string;
  events: { at: string; kind: string; message: string; url?: string }[];
  /** Essai gratuit : rediffusion d'une session réelle enregistrée. */
  replay?: boolean;
  /** Le parcours remis à l'agent, et d'où il vient (catalogue ou doc officielle). */
  playbook?: PlaybookView | null;
  /** Le parcours Linkup confronté au journal de l'agent, calculé par le serveur. */
  researchCheck?: ResearchRunCheck | null;
}

interface PlaybookView {
  source: "catalog" | "research";
  merchant: string | null;
  officialDocUrl: string | null;
  steps: string[];
  finalButtonLabel: string;
  retentionTraps: string[];
  screenshots: { read: number; sent: number; steps: string[] } | null;
  video: { title: string; url: string; steps: string[] } | null;
  fallbackReason: string | null;
  researchedAt?: string | null;
  sourceUrls?: string[];
  finalLabelSource?: FinalLabelSource;
}

const TERMINAL: Status[] = ["supplier_confirmed", "failed", "needs_manual_action", "stopped_by_user"];

const T = {
  fr: {
    title: "Exécution · agent H Company",
    live: "Voir l'agent en direct ↗",
    stop: "Arrêter l'agent",
    close: "Fermer",
    steps: ["Accord donné", "Agent sur le portail", "Ton feu vert final", "Confirmé par le fournisseur"],
    status: {
      prepared: "Préparation",
      running: "L'agent travaille sur le portail",
      awaiting_final_approval: "En attente de ton feu vert final",
      submitted: "Soumis — vérification chez le fournisseur",
      supplier_confirmed: "Résiliation confirmée par le fournisseur",
      failed: "Échec",
      needs_manual_action: "Intervention humaine nécessaire",
      stopped_by_user: "Arrêté à ta demande",
    } as Record<Status, string>,
    gateTitle: (b: string) => `L'agent attend devant « ${b} »`,
    gateWarn: "Action définitive chez le fournisseur. Rien ne part sans ton clic.",
    approve: "Confirmer la résiliation",
    refuse: "Refuser",
    noShot: "La capture de l'agent apparaîtra ici.",
    proofTitle: "Preuve",
    proofNum: "N° de confirmation",
    proofSrc: "Lu sur le portail du fournisseur (pas sur la parole de l'agent).",
    ledger: [
      "Économie potentielle",
      "Approuvée",
      "Exécutée",
      "Confirmée fournisseur",
      "Vérifiée sur relevé",
    ],
    pending: "à J+30",
    perMonth: "/mois",
    hash: "Empreinte de l'accord",
    cost: "Coût agent",
    journal: "Journal",
    powered: "computer-use agent",
    gateKicker: "Feu vert final · action définitive",
    onAir: "En direct",
    replay: "Rediffusion · session réelle enregistrée",
    agentScreen: "Écran de l'agent",
    pbTitle: "Parcours suivi par l'agent",
    pbCatalog: "Fiche du catalogue Kerdaxis",
    pbResearch: (m: string) => `Recherché dans la doc officielle · ${m} · Linkup`,
    pbFallback: "Recherche indisponible : consigne générique",
    pbShots: (r: number, n: number) => `Captures de la doc lues par un agent H Company (${r}/${n})`,
    pbVideo: "Tutoriel vidéo écouté par Gladia",
    pbFinal: "Bouton final",
    pbTraps: "Pièges annoncés",
    pbSource: "source ↗",
    pbDated: (n: number, day: string) => `${n} sources · recherche du ${day}`,
    pbSeen: "✓ nommé par l'agent",
    pbNotSeen: "jamais nommé par l'agent",
    pbFinalFrom: { docs: "tiré de la doc", screenshots: "lu sur les captures", catalog: "catalogue Kerdaxis, absent de la doc" } as Record<FinalLabelSource, string>,
    pbScore: (seen: number, total: number) => `Linkup face à cette exécution : ${seen}/${total} libellés de la doc nommés par l'agent`,
    pbNotes: "Note de l'agent",
  },
  en: {
    title: "Execution · H Company agent",
    live: "Watch the agent live ↗",
    stop: "Stop the agent",
    close: "Close",
    steps: ["Approval given", "Agent on the portal", "Your final go", "Confirmed by supplier"],
    status: {
      prepared: "Preparing",
      running: "The agent is working on the portal",
      awaiting_final_approval: "Waiting for your final go",
      submitted: "Submitted — checking with the supplier",
      supplier_confirmed: "Cancellation confirmed by the supplier",
      failed: "Failed",
      needs_manual_action: "Manual action needed",
      stopped_by_user: "Stopped at your request",
    } as Record<Status, string>,
    gateTitle: (b: string) => `The agent is waiting at “${b}”`,
    gateWarn: "Irreversible action at the supplier. Nothing happens without your click.",
    approve: "Confirm cancellation",
    refuse: "Refuse",
    noShot: "The agent's screen will appear here.",
    proofTitle: "Proof",
    proofNum: "Confirmation no.",
    proofSrc: "Read on the supplier portal (not taken from the agent's word).",
    ledger: ["Potential saving", "Approved", "Executed", "Supplier confirmed", "Verified on statement"],
    pending: "at D+30",
    perMonth: "/mo",
    hash: "Approval fingerprint",
    cost: "Agent cost",
    journal: "Log",
    powered: "computer-use agent",
    gateKicker: "Final go · irreversible action",
    onAir: "Live",
    replay: "Replay · recorded real session",
    agentScreen: "Agent screen",
    pbTitle: "Path the agent follows",
    pbCatalog: "Kerdaxis catalog entry",
    pbResearch: (m: string) => `Researched in the official docs · ${m} · Linkup`,
    pbFallback: "Research unavailable: generic instructions",
    pbShots: (r: number, n: number) => `Doc screenshots read by an H Company agent (${r}/${n})`,
    pbVideo: "Video tutorial heard by Gladia",
    pbFinal: "Final button",
    pbTraps: "Expected traps",
    pbSource: "source ↗",
    pbDated: (n: number, day: string) => `${n} sources · researched ${day}`,
    pbSeen: "✓ named by the agent",
    pbNotSeen: "never named by the agent",
    pbFinalFrom: { docs: "from the docs", screenshots: "read on the screenshots", catalog: "Kerdaxis catalog, not in the docs" } as Record<FinalLabelSource, string>,
    pbScore: (seen: number, total: number) => `Linkup vs this run: ${seen}/${total} documented labels named by the agent`,
    pbNotes: "Agent's note",
  },
};

const eur = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

/** Accord + lancement : renvoie l'id d'exécution. Les montants viennent du serveur. */
export async function launchCancellation(supplierId: string, lang: Lang): Promise<string> {
  const a = await fetch("/api/execution/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ supplierId, channel: "ui" }),
  });
  const approval = await a.json();
  if (!a.ok) throw new Error(approval.error ?? "accord refusé");
  const s = await fetch("/api/execution/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approvalId: approval.approvalId, lang }),
  });
  const exec = await s.json();
  if (!s.ok) throw new Error(exec.message ?? exec.error ?? "lancement refusé");
  return exec.id as string;
}

export default function ExecutionPanel({ id, lang, onClose }: { id: string; lang: string; onClose: () => void }) {
  const t = lang === "fr" ? T.fr : T.en;
  const [view, setView] = useState<ExecView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);
  const logRef = useRef<HTMLOListElement>(null);

  // Long-poll : chaque GET fait avancer la machine d'états côté serveur.
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await fetch(`/api/execution/${id}`, { cache: "no-store" });
        const v = (await r.json()) as ExecView;
        if (!alive.current) return;
        if (r.ok) setView(v);
        if (r.ok && TERMINAL.includes(v.status)) return;
      } catch {
        /* réseau : on réessaie */
      }
      if (alive.current) timer = setTimeout(tick, 600);
    };
    tick();
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [view?.events.length]);

  const decide = async (decision: "approve" | "refuse") => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/execution/${id}/final`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, channel: "ui" }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "erreur");
      setView(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    const r = await fetch(`/api/execution/${id}/stop`, { method: "POST" });
    if (r.ok) setView(await r.json());
    setBusy(false);
  };

  const s = view?.status ?? "prepared";
  const done = TERMINAL.includes(s);
  const stepIdx =
    s === "supplier_confirmed" ? 4 : s === "submitted" || (view?.finalDecision?.decision === "approve") ? 3 : s === "awaiting_final_approval" ? 2 : view ? 1 : 0;
  const tone = s === "supplier_confirmed" ? "ok" : s === "failed" || s === "needs_manual_action" ? "bad" : s === "stopped_by_user" ? "mute" : "run";
  const viewUrl = view?.liveViewUrl ?? view?.agentViewUrl;
  // Affichage seulement : dernière adresse vue par l'agent, pour la barre du cadre.
  const pageUrl = [...(view?.events ?? [])].reverse().find((e) => e.url)?.url;
  const shownUrl = pageUrl ? pageUrl.replace(/^https?:\/\//, "") : view ? view.vendor : "…";

  // Les cinq valeurs du ledger, jamais fusionnées (PRD §4.6).
  const m = view?.monthlyCents ?? 0;
  const ledger = [
    { v: m, on: true },
    { v: m, on: true },
    { v: m, on: Boolean(view?.finalDecision?.decision === "approve") },
    { v: m, on: s === "supplier_confirmed" },
    { v: 0, on: false, pending: true },
  ];

  return (
    <div className="kx-ov" role="dialog" aria-modal="true" aria-label={t.title}>
      <style>{CSS}</style>
      <div className="kx-bar">
        <span className="kx-brand">
          <span className={`kx-dot ${tone}`} aria-hidden="true" />
          {t.title}
          <span className="kx-target">{view ? `${view.vendor} · ${view.plan} · ${view.account}` : "…"}</span>
        </span>
        <span className="kx-bar-r">
          <span className="kx-powered" title="H Company computer-use agent">
            <i aria-hidden="true" />
            Powered by <b>H Company</b> {t.powered}
          </span>
          {viewUrl && (
            <a className="kx-link" href={viewUrl} target="_blank" rel="noreferrer">
              {t.live}
            </a>
          )}
          {!done && (
            <button className="kx-stop" onClick={stop} disabled={busy}>
              {t.stop}
            </button>
          )}
          {done && (
            <button className="kx-close" onClick={onClose} aria-label={t.close}>
              ✕
            </button>
          )}
        </span>
      </div>

      <div className="kx-body">
        <aside className="kx-side">
          <ol className="kx-steps">
            {t.steps.map((label, i) => (
              <li key={i} className={i < stepIdx ? "done" : i === stepIdx && !done ? "cur" : ""}>
                <span className="kx-num">{i < stepIdx ? "✓" : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <p className={`kx-status ${tone}`}>{t.status[s]}</p>
          {view?.error && <p className="kx-err">{view.error}</p>}

          <div className="kx-ledger">
            {t.ledger.map((label, i) => (
              <div key={i} className={`kx-led ${ledger[i].on ? "on" : ""}`}>
                <span>{label}</span>
                <b className="kx-mono">
                  {ledger[i].pending ? t.pending : ledger[i].on ? `${eur(ledger[i].v)}${t.perMonth}` : "—"}
                </b>
              </div>
            ))}
          </div>
          {view && (
            <p className="kx-meta">
              {t.hash} · <span className="kx-mono">{view.actionHash.slice(0, 16)}…</span>
              {view.costUsd != null && (
                <>
                  <br />
                  {t.cost} · <span className="kx-mono">${view.costUsd.toFixed(3)}</span> · {view.steps} steps
                </>
              )}
            </p>
          )}
        </aside>

        <section className="kx-main">
          <div className="kx-frame">
            <div className="kx-chrome">
              <span className="kx-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="kx-url kx-mono">{shownUrl}</span>
              {!done ? (
                <span className="kx-onair">
                  <i aria-hidden="true" />
                  {view?.replay ? t.replay : t.onAir}
                </span>
              ) : (
                <span className="kx-frame-tag">{t.agentScreen}</span>
              )}
            </div>
            <div className={`kx-screen ${done ? "" : "live"}`}>
              {view?.hasScreenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/execution/${id}/screenshot?t=${encodeURIComponent(view.updatedAt)}`} alt="Écran de l'agent H Company" />
              ) : (
                <p className="kx-noshot">{t.noShot}</p>
              )}
            </div>
          </div>

          {s === "awaiting_final_approval" && view?.pendingApproval && (
            <div className="kx-gate">
              <p className="kx-gate-k">
                <i aria-hidden="true" />
                {t.gateKicker}
              </p>
              <p className="kx-gate-t">{t.gateTitle(view.pendingApproval.button_label ?? t.approve)}</p>
              {view.pendingApproval.page_summary && <p className="kx-gate-s">{view.pendingApproval.page_summary}</p>}
              {view.pendingApproval.account_shown && (
                <p className="kx-gate-s">
                  Compte affiché : <b>{view.pendingApproval.account_shown}</b>
                </p>
              )}
              <p className="kx-gate-w">{t.gateWarn}</p>
              <div className="kx-gate-a">
                <button className="kx-ok" onClick={() => decide("approve")} disabled={busy}>
                  ✓ {t.approve}
                </button>
                <button className="kx-no" onClick={() => decide("refuse")} disabled={busy}>
                  ✕ {t.refuse}
                </button>
              </div>
              {err && <p className="kx-err">{err}</p>}
            </div>
          )}

          {s === "supplier_confirmed" && view?.supplierState && (
            <div className="kx-proof">
              <p className="kx-proof-k">✓ {t.proofTitle}</p>
              <p className="kx-proof-n">
                {t.proofNum} <b className="kx-mono">{view.supplierState.confirmation_number}</b>
              </p>
              <p className="kx-proof-s">{t.proofSrc}</p>
            </div>
          )}

          {view?.playbook && <PlaybookBox playbook={view.playbook} check={view.researchCheck ?? null} lang={lang} t={t} />}

          <div className="kx-jbox">
            <p className="kx-journal">{t.journal}</p>
            <ol className="kx-log" ref={logRef}>
              {(view?.events ?? []).map((e, i) => (
                <li key={i} className={`k-${e.kind}`}>
                  <span className="kx-time kx-mono">{e.at.slice(11, 19)}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}

function StepMark({ check, t }: { check: StepCheck | undefined; t: (typeof T)["en"] }) {
  if (check === "seen") return <span className="kx-pb-mark seen">{t.pbSeen}</span>;
  if (check === "not_seen") return <span className="kx-pb-mark missed">{t.pbNotSeen}</span>;
  return null;
}

function PlaybookBox({
  playbook,
  check,
  lang,
  t,
}: {
  playbook: PlaybookView;
  check: ResearchRunCheck | null;
  lang: string;
  t: (typeof T)["en"];
}) {
  const researched = playbook.source === "research" && !playbook.fallbackReason;
  const day = playbook.researchedAt
    ? new Date(playbook.researchedAt).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })
    : null;
  const origin =
    playbook.fallbackReason
      ? t.pbFallback
      : playbook.source === "catalog"
        ? t.pbCatalog
        : t.pbResearch(playbook.merchant ?? "");
  return (
    <details className="kx-pb" open={playbook.source === "research"}>
      <summary>
        <span className="kx-journal">{t.pbTitle}</span>
        <span className={`kx-pb-src ${playbook.fallbackReason ? "warn" : ""}`}>{origin}</span>
        {playbook.officialDocUrl && (
          <a className="kx-pb-link" href={playbook.officialDocUrl} target="_blank" rel="noreferrer">
            {t.pbSource}
          </a>
        )}
      </summary>
      {researched && day && <p className="kx-pb-dated">{t.pbDated(playbook.sourceUrls?.length ?? 0, day)}</p>}
      <ol className="kx-pb-steps">
        {playbook.steps.map((step, i) => (
          <li key={i}>
            {step}
            <StepMark check={check?.steps[i]?.check} t={t} />
          </li>
        ))}
      </ol>
      {playbook.screenshots && (
        <div className="kx-pb-sub">
          <p>🖼️ {t.pbShots(playbook.screenshots.read, playbook.screenshots.sent)}</p>
          <ol className="kx-pb-steps">
            {playbook.screenshots.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {playbook.video && (
        <div className="kx-pb-sub">
          <p>
            🎧 {t.pbVideo} ·{" "}
            <a className="kx-pb-link" href={playbook.video.url} target="_blank" rel="noreferrer">
              {playbook.video.title} ↗
            </a>
          </p>
          <ol className="kx-pb-steps">
            {playbook.video.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="kx-pb-meta">
        {t.pbFinal} · <b>« {playbook.finalButtonLabel} »</b>
        {researched && <> · {t.pbFinalFrom[playbook.finalLabelSource ?? "catalog"]}</>}
        <StepMark check={check?.finalLabel.check} t={t} />
        {playbook.retentionTraps.length > 0 && (
          <>
            <br />
            {t.pbTraps} · {playbook.retentionTraps.join(" · ")}
          </>
        )}
      </p>
      {check && check.labelledSteps > 0 && (
        <p className={`kx-pb-score ${check.seenSteps === check.labelledSteps ? "ok" : ""}`}>{t.pbScore(check.seenSteps, check.labelledSteps)}</p>
      )}
      {check?.agentNotes && (
        <p className="kx-pb-meta">
          <b>{t.pbNotes}</b> · {check.agentNotes}
        </p>
      )}
    </details>
  );
}

const CSS = `
/* Panneau d'exécution — thème sombre Kerdaxis. Les variables viennent de
   .arg-root (Kerdaxis) ; les valeurs de repli gardent le panneau lisible seul. */
.kx-ov{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;color:var(--c-ink,#eef8f5);
  font-family:var(--f-text,'Inter',system-ui,sans-serif);animation:argFade .25s ease;
  background:radial-gradient(70% 50% at 50% 0%,rgba(180,247,104,.05),transparent 65%),var(--c-paper,#080d13);}
.kx-bar{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;padding:12px 24px;
  border-bottom:1px solid var(--c-line,#26343d);flex:none;background:rgba(8,13,19,.8);}
.kx-brand{display:flex;align-items:center;gap:10px;font-family:var(--f-display,'Inter Tight',sans-serif);font-weight:600;font-size:17px;letter-spacing:-.01em;flex-wrap:wrap;min-width:0;}
.kx-target{font-family:var(--f-text,'Inter',sans-serif);font-size:12.5px;font-weight:500;letter-spacing:0;color:var(--c-ink2,#a3b4b9);}
.kx-dot{width:9px;height:9px;border-radius:50%;background:var(--c-amber,#eedc9d);box-shadow:0 0 10px currentColor;color:var(--c-amber,#eedc9d);}
.kx-dot.run{animation:argPulse 1.2s ease-in-out infinite;}
.kx-dot.ok{background:var(--c-lime,#b4f768);color:var(--c-lime,#b4f768);} .kx-dot.bad{background:var(--c-clay,#ff8f7e);color:var(--c-clay,#ff8f7e);} .kx-dot.mute{background:#5b6d77;color:transparent;}
.kx-bar-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.kx-powered{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px 0 9px;border:1px solid rgba(180,247,104,.32);border-radius:99px;
  background:rgba(180,247,104,.06);font-family:var(--f-mono,'JetBrains Mono',monospace);font-size:11px;color:var(--c-ink2,#a3b4b9);white-space:nowrap;}
.kx-powered b{color:var(--c-ink,#eef8f5);font-weight:600;}
.kx-powered i{width:6px;height:6px;border-radius:50%;background:var(--c-lime,#b4f768);box-shadow:0 0 10px var(--c-lime,#b4f768);}
.kx-link{display:inline-flex;align-items:center;height:30px;font-size:12.5px;font-weight:600;color:var(--c-vert,#66e6be);text-decoration:none;
  border:1px solid rgba(102,230,190,.4);border-radius:9px;padding:0 12px;transition:background-color .15s;}
.kx-link:hover{background:rgba(102,230,190,.1);}
.kx-stop{height:30px;border:1px solid rgba(255,143,126,.5);background:transparent;color:var(--c-clay,#ff8f7e);border-radius:9px;font:inherit;font-size:12.5px;font-weight:600;padding:0 12px;cursor:pointer;}
.kx-stop:hover{background:rgba(255,143,126,.08);}
.kx-close{border:1px solid var(--c-line,#26343d);background:transparent;color:var(--c-ink2,#a3b4b9);border-radius:9px;width:32px;height:32px;cursor:pointer;}
.kx-close:hover{color:var(--c-ink,#eef8f5);border-color:var(--c-line-strong,#3b4d58);}

.kx-body{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(240px,300px) minmax(0,1fr);gap:20px 24px;padding:22px 24px;align-items:start;}
.kx-side{display:flex;flex-direction:column;gap:16px;min-width:0;}
.kx-main{display:flex;flex-direction:column;gap:16px;min-width:0;}

/* Étapes : stepper vertical relié */
.kx-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;}
.kx-steps li{position:relative;display:flex;align-items:center;gap:11px;font-size:13.5px;color:var(--c-ink3,#7c8f96);}
.kx-steps li:not(:last-child)::after{content:"";position:absolute;left:11px;top:24px;height:12px;width:1px;background:var(--c-line,#26343d);}
.kx-steps li.done{color:var(--c-ink2,#a3b4b9);} .kx-steps li.done::after{background:rgba(102,230,190,.5);}
.kx-steps li.cur{color:var(--c-ink,#eef8f5);font-weight:600;}
.kx-num{width:23px;height:23px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--f-mono,'JetBrains Mono',monospace);
  font-size:10.5px;border:1px solid var(--c-line-strong,#3b4d58);background:var(--c-panel,#111a22);flex:none;transition:background-color .2s,border-color .2s,box-shadow .2s;}
.kx-steps li.done .kx-num{background:var(--c-vert,#66e6be);border-color:var(--c-vert,#66e6be);color:var(--c-on-vert,#04170f);}
.kx-steps li.cur .kx-num{border-color:var(--c-lime,#b4f768);color:var(--c-lime,#b4f768);box-shadow:0 0 0 4px rgba(180,247,104,.12);}
.kx-status{margin:0;padding-top:14px;border-top:1px solid var(--c-line,#26343d);font-family:var(--f-display,'Inter Tight',sans-serif);font-weight:600;font-size:17px;letter-spacing:-.01em;line-height:1.3;}
.kx-status.ok{color:var(--c-lime,#b4f768);} .kx-status.bad{color:var(--c-clay,#ff8f7e);} .kx-status.mute{color:var(--c-ink2,#a3b4b9);}
.kx-err{margin:0;font-size:12.5px;color:var(--c-clay,#ff8f7e);}

/* Les cinq valeurs, jamais fusionnées */
.kx-ledger{border:1px solid var(--c-line,#26343d);border-radius:14px;background:var(--c-panel,#111a22);padding:4px 14px;}
.kx-led{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:9px 0;color:var(--c-ink3,#7c8f96);border-bottom:1px solid var(--c-line,#26343d);}
.kx-led:last-child{border-bottom:0;}
.kx-led b{font-weight:500;color:var(--c-ink3,#7c8f96);}
.kx-led.on{color:var(--c-ink2,#a3b4b9);} .kx-led.on b{color:var(--c-vert,#66e6be);font-weight:600;}
.kx-led:nth-child(4).on{color:var(--c-ink,#eef8f5);} .kx-led:nth-child(4).on b{color:var(--c-lime,#b4f768);}
.kx-meta{margin:0;font-size:11.5px;color:var(--c-ink3,#7c8f96);line-height:1.7;}
.kx-mono{font-family:var(--f-mono,'JetBrains Mono',ui-monospace,monospace);font-variant-numeric:tabular-nums;}
.kx-led b.kx-mono{font-family:var(--f-text,'Inter',sans-serif);}

/* Cadre navigateur autour de la capture de l'agent H */
.kx-frame{border:1px solid var(--c-line-strong,#3b4d58);border-radius:14px;overflow:hidden;background:#0a0f14;
  box-shadow:0 30px 80px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.03);}
.kx-chrome{display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;border-bottom:1px solid var(--c-line,#26343d);background:#121c24;}
.kx-dots{display:flex;gap:6px;flex:none;} .kx-dots i{width:10px;height:10px;border-radius:50%;background:#2b3a44;}
.kx-url{flex:1;min-width:0;height:25px;display:flex;align-items:center;padding:0 10px;border-radius:7px;background:#0a1016;border:1px solid var(--c-line,#26343d);
  font-size:11.5px;color:var(--c-ink2,#a3b4b9);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.kx-onair,.kx-frame-tag{flex:none;display:inline-flex;align-items:center;gap:6px;font-family:var(--f-mono,'JetBrains Mono',monospace);font-size:10.5px;
  letter-spacing:.08em;text-transform:uppercase;}
.kx-onair{color:var(--c-lime,#b4f768);}
.kx-onair i{width:6px;height:6px;border-radius:50%;background:var(--c-lime,#b4f768);box-shadow:0 0 8px var(--c-lime,#b4f768);animation:argPulse 1.2s ease-in-out infinite;}
.kx-frame-tag{color:var(--c-ink3,#7c8f96);}
.kx-screen{position:relative;aspect-ratio:16/9;max-height:56vh;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#0a0f14;}
.kx-screen img{width:100%;height:100%;object-fit:contain;display:block;}
/* Barre indéterminée : l'agent travaille (transform seul) */
.kx-screen.live::before{content:"";position:absolute;top:0;left:0;width:35%;height:2px;z-index:1;
  background:linear-gradient(90deg,transparent,var(--c-lime,#b4f768),transparent);animation:kxScan 1.8s cubic-bezier(.45,0,.55,1) infinite;}
@keyframes kxScan{from{transform:translateX(-100%)}to{transform:translateX(290%)}}
.kx-noshot{color:var(--c-ink3,#7c8f96);font-size:13px;}

/* Porte d'accord final : le moment clé */
.kx-gate{position:relative;border:1px solid rgba(180,247,104,.55);border-radius:16px;padding:20px 22px;
  background:linear-gradient(180deg,rgba(180,247,104,.10),rgba(180,247,104,.025)),#0d1610;
  box-shadow:0 0 0 4px rgba(180,247,104,.06),0 24px 60px rgba(0,0,0,.45);animation:argRise .3s cubic-bezier(.23,1,.32,1) both;}
.kx-gate-k{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-family:var(--f-mono,'JetBrains Mono',monospace);font-size:11px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--c-lime,#b4f768);}
.kx-gate-k i{width:7px;height:7px;border-radius:50%;background:var(--c-lime,#b4f768);box-shadow:0 0 10px var(--c-lime,#b4f768);animation:argPulse 1.2s ease-in-out infinite;}
.kx-gate-t{margin:0 0 8px;font-family:var(--f-display,'Inter Tight',sans-serif);font-weight:600;font-size:clamp(19px,2vw,23px);letter-spacing:-.015em;line-height:1.2;color:var(--c-ink,#eef8f5);}
.kx-gate-s{margin:0 0 4px;font-size:14px;color:var(--c-ink2,#a3b4b9);}
.kx-gate-s b{color:var(--c-ink,#eef8f5);}
.kx-gate-w{margin:12px 0 16px;padding:8px 12px;border-left:2px solid var(--c-amber,#eedc9d);background:rgba(238,220,157,.06);border-radius:0 8px 8px 0;font-size:13px;color:#e9dfbd;}
.kx-gate-a{display:flex;gap:10px;flex-wrap:wrap;}
.kx-ok,.kx-no{border-radius:12px;font:inherit;font-size:15.5px;font-weight:600;padding:13px 22px;cursor:pointer;transition:transform .16s cubic-bezier(.23,1,.32,1),filter .15s;}
.kx-ok{flex:1 1 240px;border:1px solid var(--c-lime,#b4f768);background:var(--c-lime,#b4f768);color:var(--c-on-lime,#0e1b05);
  box-shadow:0 12px 36px rgba(180,247,104,.22),inset 0 1px 0 rgba(255,255,255,.35);}
.kx-ok:hover:not(:disabled){filter:brightness(1.05);}
.kx-no{flex:0 1 auto;border:1px solid var(--c-line-strong,#3b4d58);background:transparent;color:var(--c-ink2,#a3b4b9);}
.kx-no:hover:not(:disabled){color:var(--c-ink,#eef8f5);border-color:#506572;}
.kx-ok:active,.kx-no:active{transform:scale(.97);}
.kx-ok:disabled,.kx-no:disabled{opacity:.6;cursor:progress;}
.kx-ok:focus-visible,.kx-no:focus-visible,.kx-stop:focus-visible,.kx-close:focus-visible,.kx-link:focus-visible{outline:2px solid var(--c-lime,#b4f768);outline-offset:2px;}

/* Preuve fournisseur */
.kx-proof{border:1px solid rgba(180,247,104,.5);border-radius:16px;padding:18px 22px;
  background:linear-gradient(180deg,rgba(180,247,104,.09),rgba(180,247,104,.02)),#0d1610;animation:argRise .35s cubic-bezier(.23,1,.32,1) both;}
.kx-proof-k{margin:0;font-family:var(--f-mono,'JetBrains Mono',monospace);font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--c-lime,#b4f768);}
.kx-proof-n{margin:10px 0 6px;font-size:13px;color:var(--c-ink2,#a3b4b9);}
.kx-proof-n b{display:block;margin-top:4px;font-size:clamp(24px,3vw,32px);font-weight:600;letter-spacing:.01em;color:var(--c-ink,#eef8f5);}
.kx-proof-s{margin:0;font-size:12.5px;color:var(--c-ink2,#a3b4b9);}

/* Journal */
.kx-jbox{border:1px solid var(--c-line,#26343d);border-radius:14px;background:var(--c-inset,#0b1218);display:flex;flex-direction:column;min-height:0;}
.kx-journal{margin:0;padding:11px 14px;border-bottom:1px solid var(--c-line,#26343d);font-family:var(--f-mono,'JetBrains Mono',monospace);font-size:10.5px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--c-ink3,#7c8f96);}
.kx-log{list-style:none;margin:0;padding:10px 14px 12px;display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto;}
.kx-log li{font-size:12.5px;line-height:1.45;color:var(--c-ink2,#a3b4b9);display:flex;gap:10px;}
.kx-time{color:var(--c-ink3,#7c8f96);flex:none;font-size:10.5px;padding-top:2px;}
.kx-log li.k-agent{color:var(--c-ink,#eef8f5);}
.kx-log li.k-warning{color:var(--c-amber,#eedc9d);} .kx-log li.k-error{color:var(--c-clay,#ff8f7e);}
.kx-log li.k-verification{color:var(--c-lime,#b4f768);font-weight:600;} .kx-log li.k-approval{color:var(--c-ink,#eef8f5);font-weight:600;}

/* Grand écran : étapes | cadre + accord | journal — tout tient sans défiler */
@media(min-width:1180px){
  .kx-body{grid-template-columns:270px minmax(0,1fr) 320px;grid-template-rows:auto auto 1fr;
    grid-template-areas:"side frame journal" "side gate journal" "side . journal";}
  .kx-main{display:contents;}
  .kx-side{grid-area:side;}
  .kx-frame{grid-area:frame;}
  .kx-gate,.kx-proof{grid-area:gate;}
  .kx-jbox{grid-area:journal;align-self:stretch;max-height:calc(100dvh - 110px);position:sticky;top:0;}
  .kx-log{max-height:none;flex:1 1 auto;min-height:0;}
  .kx-screen{max-height:none;}
}
@media(max-width:820px){
  .kx-body{grid-template-columns:1fr;padding:16px;}
  .kx-main{order:-1;}
  .kx-bar{padding:12px 16px;}
  .kx-steps{flex-direction:row;flex-wrap:wrap;gap:8px 14px;}
  .kx-steps li::after{display:none;}
}
@media(prefers-reduced-motion:reduce){.kx-gate,.kx-proof,.kx-ov{animation:none;}.kx-dot.run,.kx-onair i,.kx-gate-k i{animation:none;}.kx-screen.live::before{animation:none;opacity:0;}}
/* Parcours suivi par l'agent (catalogue ou doc officielle) */
.kx-pb{border:1px solid var(--c-line,#26343d);border-radius:12px;padding:12px 14px;background:rgba(255,255,255,.015);}
.kx-pb summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;list-style:none;}
.kx-pb summary::-webkit-details-marker{display:none;}
.kx-pb summary .kx-journal{margin:0;}
.kx-pb-src{font-size:12px;color:var(--c-vert,#66e6be);}
.kx-pb-src.warn{color:var(--c-amber,#eedc9d);}
.kx-pb-link{font-size:12px;color:var(--c-ink2,#a3b4b9);text-decoration:underline;text-underline-offset:2px;}
.kx-pb-steps{margin:10px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--c-ink2,#a3b4b9);}
.kx-pb-sub{margin-top:10px;padding-top:8px;border-top:1px dashed var(--c-line,#26343d);}
.kx-pb-sub p{margin:0;font-size:12.5px;font-weight:600;color:var(--c-ink,#eef8f5);}
.kx-pb-meta{margin:10px 0 0;font-size:12px;color:var(--c-ink3,#7c8f96);}
.kx-pb-meta b{color:var(--c-ink,#eef8f5);font-weight:600;}
.kx-pb-dated{margin:6px 0 0;font-size:12px;color:var(--c-ink3,#7c8f96);}
.kx-pb-mark{display:inline-block;margin-left:8px;padding:0 7px;border-radius:99px;font-size:11px;font-weight:600;white-space:nowrap;}
.kx-pb-mark.seen{color:var(--c-lime,#b4f768);background:rgba(180,247,104,.1);}
.kx-pb-mark.missed{color:var(--c-amber,#eedc9d);background:rgba(238,220,157,.1);}
.kx-pb-score{margin:10px 0 0;padding:7px 10px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--c-amber,#eedc9d);background:rgba(238,220,157,.07);}
.kx-pb-score.ok{color:var(--c-lime,#b4f768);background:rgba(180,247,104,.08);}
`;
