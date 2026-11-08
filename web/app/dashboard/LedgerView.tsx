"use client";

import React, { useMemo } from "react";
import { natureLabel } from "@/lib/i18n";
import type { Dashboard } from "./use-dashboard";
import { ledgerValues } from "./ledger";
import { LedgerBar } from "./LedgerBar";

const AUDIT_ROWS = [
  { tool: "mcp__qonto__get_organization", out: false },
  { tool: "mcp__qonto__list_transactions", out: false },
  { tool: "mcp__linkup__linkup-search", out: true },
] as const;

export function LedgerView({ d }: { d: Dashboard }): React.ReactElement {
  const { copy, eur, data, lang, loc, levers, runs, runViews } = d;
  const values = useMemo(() => ledgerValues(levers, runs, runViews), [levers, runs, runViews]);
  const natureTotal = data.natures.reduce((sum, n) => sum + n.amount, 0) || 1;
  const maxPole = Math.max(1, ...data.poles.map((p) => p.amount));
  const isFr = lang === "fr";

  return (
    <section className="kd-page kd-ledger">
      <header className="kd-page-head">
        <div>
          <h1 className="kd-h1">{copy.ledgerTitle}</h1>
          <p className="kd-lede">{copy.ledgerLede}</p>
        </div>
      </header>

      <section className="kd-section">
        <LedgerBar values={values} d={d} />
      </section>

      <section className="kd-section" aria-labelledby="run-rate">
        <div className="kd-section-head">
          <h2 id="run-rate" className="kd-h2">
            {copy.runRate}
          </h2>
          <span className="kd-num kd-muted">{eur(data.totals.runRate)}</span>
        </div>
        <div className="kd-natures" role="img" aria-label={data.natures.map((n) => `${natureLabel(n.key, lang)} ${eur(n.amount)}`).join(", ")}>
          {data.natures.map((n) => (
            <span key={n.key} className={`kd-nature kd-nature-${n.key}`} style={{ flexGrow: n.amount / natureTotal }} />
          ))}
        </div>
        <ul className="kd-legend">
          {data.natures.map((n) => (
            <li key={n.key}>
              <span className={`kd-swatch kd-nature-${n.key}`} aria-hidden="true" />
              {natureLabel(n.key, lang)} <b className="kd-num">{eur(n.amount)}</b>
            </li>
          ))}
        </ul>
      </section>

      <div className="kd-two">
        <section className="kd-section" aria-labelledby="by-area">
          <h2 id="by-area" className="kd-h2">
            {copy.byArea}
          </h2>
          <ul className="kd-bars">
            {data.poles.map((p) => (
              <li key={p.label}>
                <span className="kd-bar-label">{p.label}</span>
                <span className="kd-bar-track" aria-hidden="true">
                  <span className="kd-bar-fill" style={{ width: `${(p.amount / maxPole) * 100}%` }} />
                </span>
                <b className="kd-num">{eur(p.amount)}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="kd-section" aria-labelledby="anomalies">
          <h2 id="anomalies" className="kd-h2">
            {copy.anomalies}
          </h2>
          <ul className="kd-flux">
            {data.flux.map((f, i) => (
              <li key={i} className={`kd-flux-${f.tone}`}>
                <span>{loc(f.label)}</span>
                <b className="kd-num">{loc(f.value)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="kd-section" aria-labelledby="audit">
        <h2 id="audit" className="kd-h2">
          {copy.auditLog}
        </h2>
        <ul className="kd-audit">
          {AUDIT_ROWS.map((row) => (
            <li key={row.tool}>
              <code className="kd-mono">{row.tool}</code>
              <span className={row.out ? "kd-audit-out" : "kd-muted"}>
                {row.out
                  ? isFr
                    ? "envoyé : « Figma · design » (marchand + catégorie)"
                    : "sent: “Figma · design” (merchant + category)"
                  : isFr
                    ? "lecture, reste dans la machine"
                    : "read, stays in the machine"}
              </span>
            </li>
          ))}
        </ul>
        <p className="kd-muted kd-small">{copy.auditNote}</p>
      </section>
    </section>
  );
}
