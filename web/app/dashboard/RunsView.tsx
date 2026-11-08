"use client";

import React, { useEffect, useRef } from "react";
import type { Lever } from "@/lib/types";
import type { Dashboard, RunRef } from "./use-dashboard";
import { TERMINAL_STATUSES, useExecution, type ExecutionView } from "./use-execution";
import { RunLine } from "./RunLine";
import { Icon } from "./Icon";
import { StatusPill } from "./StatusPill";

export function RunsView({ d }: { d: Dashboard }): React.ReactElement {
  const { copy, runs, selectedRunId, selectRun } = d;
  const starter = d.levers.find((l) => l.action === "cancel" && d.isExecutable(l.id)) ?? d.levers.find((l) => d.agentState(l.id) === "offline");

  if (runs.length === 0) {
    return (
      <section className="kd-page">
        <header className="kd-page-head">
          <h1 className="kd-h1">{copy.runsTitle}</h1>
        </header>
        <div className="kd-empty">
          <p>{copy.runsEmpty}</p>
          {starter && <LaunchButton d={d} lever={starter} label={`${d.replayMode ? copy.replayWithH : copy.cancelWithH} · ${starter.label}`} />}
        </div>
      </section>
    );
  }

  return (
    <section className="kd-page kd-runs">
      <header className="kd-page-head">
        <h1 className="kd-h1">{copy.runsTitle}</h1>
      </header>
      <div className="kd-runs-grid">
        <nav className="kd-runlist" aria-label={copy.runsTitle}>
          {runs.map((run) => (
            <RunListRow key={run.id} run={run} d={d} selected={run.id === selectedRunId} onSelect={() => selectRun(run.id)} />
          ))}
        </nav>
        {selectedRunId ? <RunDetail key={selectedRunId} id={selectedRunId} d={d} /> : null}
      </div>
    </section>
  );
}

function RunListRow({ run, d, selected, onSelect }: { run: RunRef; d: Dashboard; selected: boolean; onSelect: () => void }): React.ReactElement {
  const view = d.runViews[run.id];
  return (
    <button className={`kd-runrow ${selected ? "is-selected" : ""}`} onClick={onSelect} aria-current={selected ? "true" : undefined}>
      <span className="kd-runrow-name">{run.vendor}</span>
      <span className="kd-runrow-time kd-mono">{new Date(run.startedAt).toLocaleTimeString(d.lang, { hour: "2-digit", minute: "2-digit" })}</span>
      {view ? <StatusPill status={view.status} copy={d.copy} /> : <span className="kd-muted">…</span>}
    </button>
  );
}

/** Keeps every stored run's status fresh in the background, for Today and the run list. */
export function RunWatcher({ id, d }: { id: string; d: Dashboard }): null {
  const { view } = useExecution(id, "background");
  const { reportRunView } = d;
  useEffect(() => {
    if (view) reportRunView(view);
  }, [view, reportRunView]);
  return null;
}

export function LaunchButton({ d, lever, label, tone = "primary" }: { d: Dashboard; lever: Lever; label?: string; tone?: "primary" | "quiet" }): React.ReactElement {
  const state = d.agentState(lever.id);
  const busy = d.launchingId === lever.id;
  const reason = state === "offline" ? d.copy.agentOffline : state === "unsupported" ? d.copy.agentSoon : undefined;
  return (
    <button
      className={`kd-btn ${tone === "primary" ? "kd-btn-accent" : "kd-btn-quiet"}`}
      onClick={() => void d.launch(lever)}
      disabled={busy || state !== "ready"}
      title={reason}
    >
      {busy ? d.copy.launching : (label ?? (d.replayMode ? d.copy.replayWithH : d.copy.cancelWithH))}
    </button>
  );
}

function RunDetail({ id, d }: { id: string; d: Dashboard }): React.ReactElement {
  const { copy, reportRunView } = d;
  const { view, busy, error, decide, stop } = useExecution(id, "active");

  useEffect(() => {
    if (view) reportRunView(view);
  }, [view, reportRunView]);

  if (!view) {
    return <div className="kd-rundetail kd-muted">…</div>;
  }

  const done = TERMINAL_STATUSES.includes(view.status);
  const lastUrl = [...view.events].reverse().find((e) => e.url)?.url;
  const shownUrl = lastUrl ? lastUrl.replace(/^https?:\/\//, "") : view.vendor;

  return (
    <article className="kd-rundetail">
      <header className="kd-run-head">
        <div>
          <h2 className="kd-h2">{view.vendor}</h2>
          <p className="kd-muted">
            {view.plan} · {view.account} · <span className="kd-num">{d.eur(view.monthlyCents / 100)}</span>
            {copy.perMonth}
          </p>
        </div>
        <div className="kd-run-head-r">
          <StatusPill status={view.status} copy={copy} />
          {!done && (
            <button className="kd-btn kd-btn-quiet" onClick={() => void stop()} disabled={busy}>
              {copy.stop}
            </button>
          )}
        </div>
      </header>

      <RunLine view={view} copy={copy} />

      <div className="kd-run-body">
        <div className="kd-screen-col">
          {view.status === "awaiting_final_approval" && view.pendingApproval && (
            <Gate view={view} d={d} busy={busy} error={error} onDecide={decide} />
          )}
          {view.status === "supplier_confirmed" && view.supplierState && <Proof view={view} d={d} />}
          <figure className="kd-screen">
            <figcaption className="kd-screen-bar">
              <span className="kd-mono kd-screen-url">{shownUrl}</span>
              <span className={`kd-screen-tag ${done ? "" : "is-live"}`}>
                {done ? copy.agentScreen : view.replay ? copy.replay : copy.live}
              </span>
            </figcaption>
            <div className="kd-screen-img">
              {view.hasScreenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/execution/${id}/screenshot?t=${encodeURIComponent(view.updatedAt)}`} alt={copy.agentScreen} />
              ) : (
                <p className="kd-muted">{copy.noShot}</p>
              )}
            </div>
          </figure>
        </div>
        <aside className="kd-run-side">
          <Journal view={view} title={copy.journal} />
          {view.playbook && view.playbook.steps.length > 0 && (
            <details className="kd-playbook" open={view.playbook.source === "research"}>
              <summary>{copy.playbook}</summary>
              <ol>
                {view.playbook.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              {view.playbook.officialDocUrl && (
                <a className="kd-link" href={view.playbook.officialDocUrl} target="_blank" rel="noreferrer">
                  {view.playbook.merchant ?? "source"} <Icon name="external" size={13} />
                </a>
              )}
            </details>
          )}
          <p className="kd-run-meta kd-mono">
            #{view.actionHash.slice(0, 16)}
            {view.costUsd != null && (
              <>
                <br />
                {copy.cost(view.costUsd.toFixed(3), view.steps)}
              </>
            )}
          </p>
        </aside>
      </div>
    </article>
  );
}

function Gate({
  view,
  d,
  busy,
  error,
  onDecide,
}: {
  view: ExecutionView;
  d: Dashboard;
  busy: boolean;
  error: string | null;
  onDecide: (decision: "approve" | "refuse") => Promise<void>;
}): React.ReactElement {
  const { copy } = d;
  const approval = view.pendingApproval;
  return (
    <section className="kd-gate" aria-live="assertive">
      <div className="kd-gate-text">
        <p className="kd-gate-title">
          <Icon name="hand" size={18} /> {copy.gateTitle(approval?.button_label ?? copy.gateApprove)}
        </p>
        {approval?.page_summary && <p className="kd-gate-sub">{approval.page_summary}</p>}
        <p className="kd-gate-sub">
          {copy.gateWarn} {copy.voiceCannot}
        </p>
      </div>
      <div className="kd-gate-actions">
        <button className="kd-btn kd-btn-accent kd-btn-lg" onClick={() => void onDecide("approve")} disabled={busy} autoFocus>
          <Icon name="check" /> {copy.gateApprove}
        </button>
        <button className="kd-btn kd-btn-ghost-on-accent" onClick={() => void onDecide("refuse")} disabled={busy}>
          {copy.gateRefuse}
        </button>
      </div>
      {error && <p className="kd-error">{error}</p>}
    </section>
  );
}

function Proof({ view, d }: { view: ExecutionView; d: Dashboard }): React.ReactElement {
  const { copy } = d;
  return (
    <section className="kd-proof">
      <p className="kd-proof-title">
        <Icon name="check" size={18} /> {copy.proofTitle}
      </p>
      <p className="kd-proof-number">
        <span className="kd-muted">{copy.proofNumber}</span>
        <b className="kd-mono">{view.supplierState?.confirmation_number ?? view.confirmationNumber}</b>
      </p>
      <p className="kd-proof-sub">{copy.proofSource}</p>
    </section>
  );
}

function Journal({ view, title }: { view: ExecutionView; title: string }): React.ReactElement {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [view.events.length]);
  return (
    <section className="kd-journal">
      <h3 className="kd-h3">{title}</h3>
      <ol ref={listRef}>
        {view.events.map((event, index) => (
          <li key={index} className={`kd-ev kd-ev-${event.kind}`}>
            <span className="kd-mono kd-ev-time">{event.at.slice(11, 19)}</span>
            <span>{event.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
