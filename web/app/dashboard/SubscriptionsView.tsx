"use client";

import React, { useState } from "react";
import type { Lever, Risk } from "@/lib/types";
import { cancelsOnline, type Dashboard } from "./use-dashboard";
import { LaunchButton } from "./RunsView";
import { Icon } from "./Icon";

type Filter = "all" | "safe" | "review";

const MIN_HORIZON_MONTHS = 1;
const MAX_HORIZON_MONTHS = 36;
const DEFAULT_HORIZON_MONTHS = 12;

const matches = (filter: Filter, risk: Risk): boolean => filter === "all" || (filter === "safe" ? risk === "safe" : risk !== "safe");

export function SubscriptionsView({ d }: { d: Dashboard }): React.ReactElement {
  const { copy, eur, levers, lang } = d;
  const [filter, setFilter] = useState<Filter>("all");
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON_MONTHS);
  const shown = levers.filter((l) => matches(filter, l.risk));
  const activeCount = levers.filter((l) => l.active).length;

  return (
    <section className="kd-page kd-subs">
      <header className="kd-page-head">
        <div>
          <h1 className="kd-h1">{copy.subsTitle}</h1>
          <p className="kd-lede">{copy.subsLede(activeCount, levers.length)}</p>
        </div>
        <div className="kd-page-actions">
          <button className="kd-btn kd-btn-quiet" onClick={d.exportCsv}>
            <Icon name="download" size={15} /> {copy.exportCsv}
          </button>
          <a className="kd-btn kd-btn-quiet" href={`/rapport?lang=${lang}`} target="_blank" rel="noopener">
            <Icon name="printer" size={15} /> {copy.printReport}
          </a>
        </div>
      </header>

      <div className="kd-simulator">
        <label className="kd-horizon">
          <span>{copy.horizon(horizon)}</span>
          <input
            type="range"
            min={MIN_HORIZON_MONTHS}
            max={MAX_HORIZON_MONTHS}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
        </label>
        <p className="kd-sim-total">
          <span className="kd-num kd-money">{eur(d.monthly * horizon)}</span>
          <span className="kd-muted">{copy.horizonTotal("", horizon).trim()}</span>
        </p>
      </div>

      {(d.pendingPriceCount > 0 || d.pricing.status === "running") && (
        <div className="kd-price-check">
          <button className="kd-btn" onClick={() => void d.priceAllLevers()} disabled={d.pricing.status === "running"}>
            <Icon name="route" size={15} />{" "}
            {d.pricing.status === "running" ? copy.checkingPrices(d.pricing.done, d.pricing.total) : copy.checkPrices(d.pendingPriceCount)}
          </button>
          <p className="kd-muted kd-small">{copy.checkPricesNote}</p>
        </div>
      )}

      <div className="kd-toolbar" role="toolbar">
        <div className="kd-segment" role="radiogroup">
          {(["all", "safe", "review"] as Filter[]).map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? copy.filterAll : f === "safe" ? copy.filterSafe : copy.filterReview}
            </button>
          ))}
        </div>
      </div>

      <table className="kd-table">
        <thead>
          <tr>
            <th scope="col" className="kd-col-check">
              <span className="kd-sr">{copy.inPlan}</span>
            </th>
            <th scope="col">{copy.colSupplier}</th>
            <th scope="col">{copy.colPlan}</th>
            <th scope="col">{copy.colRisk}</th>
            <th scope="col" className="kd-col-num">
              {copy.colMonthly}
            </th>
            <th scope="col" className="kd-col-num">
              {copy.colYearly}
            </th>
            <th scope="col" className="kd-col-act">
              <span className="kd-sr">{copy.colAction}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((lever) => (
            <LeverRow key={lever.id} lever={lever} d={d} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LeverRow({ lever, d }: { lever: Lever; d: Dashboard }): React.ReactElement {
  const { copy, eur } = d;
  const agent = d.agentState(lever.id);
  const showAgent = cancelsOnline(lever);
  const canRun = showAgent && agent === "ready";
  const hasEuro = lever.basis !== "pending" && lever.basis !== "unverified";
  return (
    <tr className={lever.active ? "" : "is-off"}>
      <td className="kd-col-check">
        <input type="checkbox" checked={lever.active} onChange={() => d.toggleLever(lever.id)} aria-label={`${copy.inPlan}: ${lever.label}`} />
      </td>
      <td>
        <button className="kd-cell-link" onClick={() => void d.openLetter(lever)}>
          {lever.label}
        </button>
        {lever.hausse && <span className="kd-tag kd-tag-warn">+{lever.hausse.pct.toFixed(1)}%</span>}
        {canRun && <span className="kd-tag kd-tag-accent">H Company</span>}
      </td>
      <td className="kd-muted">
        <ProposalCell lever={lever} d={d} />
      </td>
      <td>
        <span className={`kd-risk kd-risk-${lever.risk}`}>{copy.risk[lever.risk]}</span>
      </td>
      <td className="kd-col-num kd-num">{hasEuro ? eur(lever.saving) : "—"}</td>
      <td className="kd-col-num kd-num kd-money">{hasEuro ? eur(lever.saving * 12) : "—"}</td>
      <td className="kd-col-act">
        {showAgent ? (
          <LaunchButton d={d} lever={lever} tone="quiet" />
        ) : (
          <button className="kd-btn kd-btn-quiet" onClick={() => void d.openLetter(lever)}>
            {copy.prepareLetter}
          </button>
        )}
      </td>
    </tr>
  );
}

function ProposalCell({ lever, d }: { lever: Lever; d: Dashboard }): React.ReactElement {
  const { copy } = d;
  if (lever.basis === "pending") return <span>{copy.pricePending}</span>;
  if (lever.basis === "unverified") return <span>{copy.priceUnverified[lever.unverifiedReason ?? "no_price"]}</span>;
  if (lever.basis === "sourced" && lever.evidence) {
    const { offer } = lever.evidence;
    return (
      <span>
        {lever.to}{" "}
        <a className="kd-link" href={offer.sourceUrl} target="_blank" rel="noopener">
          {copy.priceSource(offer.checkedAt)} <Icon name="external" size={12} />
        </a>
      </span>
    );
  }
  return (
    <span>
      {lever.to}
      <ChannelNote lever={lever} d={d} />
    </span>
  );
}

function ChannelNote({ lever, d }: { lever: Lever; d: Dashboard }): React.ReactElement | null {
  const check = lever.cancelChannel;
  if (lever.action !== "cancel" || !check) return null;
  return (
    <span className="kd-small">
      {" · "}
      {d.copy.cancelChannel[check.channel]}
      {check.sourceUrl && (
        <>
          {" "}
          <a className="kd-link" href={check.sourceUrl} target="_blank" rel="noopener">
            {d.copy.priceSource(check.checkedAt)} <Icon name="external" size={12} />
          </a>
        </>
      )}
    </span>
  );
}
