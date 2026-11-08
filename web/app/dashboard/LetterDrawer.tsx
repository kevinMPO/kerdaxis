"use client";

import React, { useEffect, useState } from "react";
import type { Dashboard } from "./use-dashboard";
import { LaunchButton } from "./RunsView";
import { Icon } from "./Icon";

const COPIED_FEEDBACK_MS = 1800;

export function LetterDrawer({ d }: { d: Dashboard }): React.ReactElement | null {
  const { copy, letter, closeLetter, eur } = d;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!letter.lever) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeLetter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [letter.lever, closeLetter]);

  if (!letter.lever) return null;
  const lever = letter.lever;
  const canRun = lever.action === "cancel" && d.agentState(lever.id) !== "unsupported";

  const copyText = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(letter.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      /* clipboard unavailable: the text stays selectable */
    }
  };

  return (
    <>
      <div className="kd-scrim" onClick={closeLetter} aria-hidden="true" />
      <aside className="kd-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="kd-drawer-head">
          <div>
            <h2 id="drawer-title" className="kd-h2">
              {lever.label}
            </h2>
            <p className="kd-muted">
              {lever.to} · <span className="kd-num kd-money">{eur(lever.saving * 12)}</span>
              {copy.perYear}
            </p>
          </div>
          <button className="kd-icon-btn" onClick={closeLetter} aria-label={copy.close}>
            <Icon name="close" />
          </button>
        </header>

        {canRun && (
          <div className="kd-drawer-run">
            <LaunchButton d={d} lever={lever} />
          </div>
        )}

        <section className="kd-drawer-section">
          <h3 className="kd-h3">{copy.drawerTitle}</h3>
          {letter.loading ? <p className="kd-muted">{copy.drawerLoading}</p> : <pre className="kd-letter">{letter.text}</pre>}
          <div className="kd-drawer-actions">
            <button className="kd-btn kd-btn-quiet" onClick={() => void copyText()} disabled={letter.loading || !letter.text}>
              {copied ? copy.copied : copy.copy}
            </button>
            <button className="kd-btn kd-btn-quiet" onClick={() => void d.runBenchmark(lever)} disabled={letter.benchLoading}>
              {copy.benchmark}
            </button>
          </div>
        </section>

        {(letter.benchLoading || letter.bench) && (
          <section className="kd-drawer-section">
            {letter.benchLoading && <p className="kd-muted">{copy.benchSearching}</p>}
            {letter.bench && letter.bench.alternatives.length > 0 && (
              <>
                <ul className="kd-bench">
                  {letter.bench.alternatives.map((alt) => (
                    <li key={alt.name}>
                      <span>{alt.name}</span>
                      <b className="kd-num">{alt.monthlyPrice != null ? `${alt.monthlyPrice} €${alt.unit}` : "—"}</b>
                      <a className="kd-link" href={alt.sourceUrl} target="_blank" rel="noopener">
                        {alt.sourceDate} <Icon name="external" size={12} />
                      </a>
                    </li>
                  ))}
                </ul>
                <button className="kd-btn kd-btn-quiet" onClick={d.regenerateWithPrices}>
                  {copy.drawerTitle} + {copy.benchmark.split(" (")[0].toLowerCase()}
                </button>
              </>
            )}
            {letter.bench && letter.bench.alternatives.length === 0 && <p className="kd-muted">{letter.bench.note ?? copy.benchNone}</p>}
          </section>
        )}
      </aside>
    </>
  );
}
