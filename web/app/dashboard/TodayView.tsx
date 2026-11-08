"use client";

import React, { useMemo } from "react";
import type { Lever } from "@/lib/types";
import type { Dashboard } from "./use-dashboard";
import { ledgerValues } from "./ledger";
import { LaunchButton } from "./RunsView";
import { StatusPill } from "./StatusPill";
import { Icon } from "./Icon";
import { LedgerBar } from "./LedgerBar";

const MAX_APPROVAL_ITEMS = 2;

const keepTogether = (amount: string): string => amount.replace(/\s/g, "\u00a0");

export function TodayView({ d }: { d: Dashboard }): React.ReactElement {
  const { copy, eur, levers, runs, runViews, data, loc } = d;
  const values = useMemo(() => ledgerValues(levers, runs, runViews), [levers, runs, runViews]);

  const waiting = runs.filter((r) => runViews[r.id]?.status === "awaiting_final_approval");
  const startedSuppliers = new Set(runs.map((r) => r.supplierId));

  // Cancellations the agent can run come first, then the biggest risk-free savings.
  const toApprove: Lever[] = [...levers]
    .filter((l) => l.action === "cancel" && d.agentState(l.id) !== "unsupported" && !startedSuppliers.has(l.id))
    .sort((a, b) => Number(d.isExecutable(b.id)) - Number(d.isExecutable(a.id)) || b.saving - a.saving)
    .slice(0, MAX_APPROVAL_ITEMS);

  const toClarify = data.flux.filter((f) => f.kind === "check" || f.kind === "dup");
  const vat = data.tvaPerdue;

  const itemCount = waiting.length + toApprove.length + (toClarify.length > 0 ? 1 : 0) + (vat ? 1 : 0);
  const activeCount = levers.filter((l) => l.active).length;

  return (
    <section className="kd-page kd-today">
      <header className="kd-today-head">
        <h1 className="kd-headline">{copy.headline(keepTogether(eur(values.potential)), values.confirmed > 0 ? keepTogether(eur(values.confirmed)) : null)}</h1>
        <p className="kd-lede">{copy.headlineSub(eur(d.monthly), activeCount)}</p>
        <LedgerBar values={values} d={d} />
      </header>

      <section className="kd-section" aria-labelledby="needs-you">
        <div className="kd-section-head">
          <h2 id="needs-you" className="kd-h2">
            {copy.needsYou}
          </h2>
          <span className="kd-count">{itemCount}</span>
        </div>

        {itemCount === 0 ? (
          <p className="kd-muted">{copy.needsYouEmpty}</p>
        ) : (
          <ul className="kd-needs">
            {waiting.map((run) => (
              <li key={run.id} className="kd-need kd-need-gate">
                <span className="kd-need-mark" aria-hidden="true">
                  <Icon name="hand" />
                </span>
                <div className="kd-need-body">
                  <p className="kd-need-title">{copy.needGate(run.vendor)}</p>
                  <p className="kd-need-why">{copy.needGateWhy}</p>
                </div>
                <button className="kd-btn kd-btn-accent" onClick={() => d.selectRun(run.id)}>
                  {copy.needGateCta} <Icon name="arrow" size={14} />
                </button>
              </li>
            ))}

            {toApprove.map((lever) => (
              <li key={lever.id} className="kd-need">
                <span className="kd-need-mark" aria-hidden="true">
                  <Icon name="route" />
                </span>
                <div className="kd-need-body">
                  <p className="kd-need-title">{copy.needApprove(lever.label)}</p>
                  <p className="kd-need-why">
                    {d.agentState(lever.id) === "offline" ? `${copy.agentOffline} · ` : ""}
                    {lever.to} · <span className="kd-num">{eur(lever.saving)}</span>
                    {copy.perMonth} · <span className="kd-num kd-money">{eur(lever.saving * 12)}</span>
                    {copy.perYear}
                  </p>
                </div>
                <LaunchButton d={d} lever={lever} />
              </li>
            ))}

            {toClarify.length > 0 && (
              <li className="kd-need">
                <span className="kd-need-mark" aria-hidden="true">
                  <Icon name="book" />
                </span>
                <div className="kd-need-body">
                  <p className="kd-need-title">{copy.needClarify}</p>
                  <p className="kd-need-why">{toClarify.map((f) => `${loc(f.label)} · ${loc(f.value)}`).join("  ·  ")}</p>
                </div>
                <button className="kd-btn kd-btn-quiet" onClick={() => d.setView("ledger")}>
                  {copy.needClarifyCta}
                </button>
              </li>
            )}

            {vat && (
              <li className="kd-need">
                <span className="kd-need-mark" aria-hidden="true">
                  <Icon name="stack" />
                </span>
                <div className="kd-need-body">
                  <p className="kd-need-title">{copy.needVat(vat.transactions, eur(vat.tvaRecuperableEur))}</p>
                  <p className="kd-need-why">{copy.needVatWhy}</p>
                </div>
                <button className="kd-btn kd-btn-quiet" onClick={() => d.setView("ledger")}>
                  {copy.needVatCta}
                </button>
              </li>
            )}
          </ul>
        )}
        {d.launchError && <p className="kd-error">{d.launchError}</p>}
      </section>

      <section className="kd-section" aria-labelledby="recent-runs">
        <div className="kd-section-head">
          <h2 id="recent-runs" className="kd-h2">
            {copy.recentRuns}
          </h2>
        </div>
        {runs.length === 0 ? (
          <p className="kd-muted">{copy.noRuns}</p>
        ) : (
          <ul className="kd-rows">
            {runs.slice(0, 5).map((run) => {
              const view = runViews[run.id];
              const proof = view?.supplierState?.confirmation_number ?? view?.confirmationNumber;
              return (
                <li key={run.id}>
                  <button className="kd-row" onClick={() => d.selectRun(run.id)}>
                    <span className="kd-row-name">{run.vendor}</span>
                    <span className="kd-mono kd-muted">{proof ?? ""}</span>
                    <span className="kd-mono kd-muted">
                      {new Date(run.startedAt).toLocaleString(d.lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {view ? <StatusPill status={view.status} copy={copy} /> : <span className="kd-muted">…</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
