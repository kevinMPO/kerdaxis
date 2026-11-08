"use client";

import React from "react";
import type { Lang } from "@/lib/types";
import VoiceCommand from "../VoiceCommand";
import AccountBar from "../demo/AccountBar";
import { useDashboard, type Dashboard as DashboardState, type DashboardMode } from "./use-dashboard";
import type { ViewId } from "./copy";
import { TodayView } from "./TodayView";
import { SubscriptionsView } from "./SubscriptionsView";
import { RunsView, RunWatcher } from "./RunsView";
import { LedgerView } from "./LedgerView";
import { LetterDrawer } from "./LetterDrawer";
import { BrandMark, Icon, type IconName } from "./Icon";
import "./dashboard.css";

const NAV: { id: ViewId; icon: IconName }[] = [
  { id: "today", icon: "inbox" },
  { id: "subscriptions", icon: "stack" },
  { id: "runs", icon: "route" },
  { id: "ledger", icon: "book" },
];

const LANG_OPTIONS: Lang[] = ["fr", "en", "de", "es", "it"];

interface DashboardProps {
  fontClassName: string;
  mode?: DashboardMode;
}

export function Dashboard({ fontClassName, mode = "demo" }: DashboardProps): React.ReactElement {
  const d = useDashboard(mode);
  const { copy, view, setView, data, loc, runs, runViews } = d;
  const waitingCount = runs.filter((r) => runViews[r.id]?.status === "awaiting_final_approval").length;
  const isLive = data.meta?.source === "qonto";

  return (
    <div className={`kd-root ${fontClassName}`}>
      <aside className="kd-rail">
        <a className="kd-brand" href="/">
          <BrandMark className="kd-brand-mark" />
          Kerdaxis
        </a>

        <nav className="kd-nav" aria-label="Kerdaxis">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`kd-nav-item ${view === item.id ? "is-on" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} />
              <span>{copy.nav[item.id]}</span>
              {item.id === "today" && waitingCount > 0 && <span className="kd-nav-badge">{waitingCount}</span>}
              {item.id === "runs" && runs.length > 0 && <span className="kd-nav-count">{runs.length}</span>}
            </button>
          ))}
        </nav>

        <div className="kd-rail-foot">
          <a className="kd-nav-item kd-nav-quiet" href="/classic">
            <Icon name="presentation" />
            <span>{copy.navClassic}</span>
          </a>
          <label className="kd-lang">
            <span className="kd-sr">Language</span>
            <select value={d.lang} onChange={(e) => d.setLang(e.target.value as Lang)}>
              {LANG_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <AccountBar />
        </div>
      </aside>

      <div className="kd-main">
        <header className="kd-topbar">
          {d.loaded && !d.needsQonto && (
            <>
              <span className="kd-account">{data.account.name}</span>
              <span className="kd-muted">{loc(data.window.label)}</span>
              <span className={`kd-source ${isLive ? "is-live" : ""}`}>{isLive ? copy.liveData : copy.demoData}</span>
            </>
          )}
          <span className="kd-topbar-spacer" />
          {d.qontoConnected ? (
            <button className="kd-btn kd-btn-quiet" onClick={() => void d.disconnectQonto()}>
              {copy.disconnect}
            </button>
          ) : d.qontoConnectable === false ? (
            <button className="kd-btn kd-btn-quiet kd-btn-closed" disabled title={copy.connectClosedHint}>
              {copy.connectQonto}
            </button>
          ) : (
            <a className="kd-btn kd-btn-quiet" href="/api/auth/qonto/start">
              {copy.connectQonto}
            </a>
          )}
        </header>

        {d.qontoConnectBlocked && (
          <p className="kd-banner" role="status">
            {copy.connectClosed}
          </p>
        )}

        {d.refusal && (
          <p className="kd-banner" role="alert">
            {d.refusal === "reconnect" ? copy.reconnect : copy.unavailable}
          </p>
        )}

        {/* Until /api/analyze answers, no amount is drawn: the sample data must never flash as if it were the account's. */}
        <main className="kd-content" aria-busy={!d.loaded}>
          {!d.loaded ? (
            <div className="kd-analyzing" role="status">
              <span className="kd-analyzing-dot" aria-hidden="true" />
              {copy.analyzing}
            </div>
          ) : d.needsQonto ? (
            <ConnectQontoPanel d={d} />
          ) : (
            <>
              {view === "today" && <TodayView d={d} />}
              {view === "subscriptions" && <SubscriptionsView d={d} />}
              {view === "runs" && <RunsView d={d} />}
              {view === "ledger" && <LedgerView d={d} />}
            </>
          )}
        </main>
      </div>

      {runs.map((run) => (
        <RunWatcher key={run.id} id={run.id} d={d} />
      ))}

      <LetterDrawer d={d} />

      <div className="kd-voice">
        <VoiceCommand lang={d.lang} onCommand={d.onVoiceCommand} />
      </div>
    </div>
  );
}

function ConnectQontoPanel({ d }: { d: DashboardState }): React.ReactElement {
  const { copy } = d;
  const closed = d.qontoConnectable === false;
  return (
    <section className="kd-connect" aria-labelledby="kd-connect-title">
      <h1 id="kd-connect-title" className="kd-h1">
        {copy.connectTitle}
      </h1>
      <p className="kd-lede">{closed ? copy.connectClosed : copy.connectLede}</p>
      {!closed && (
        <a className="kd-btn kd-btn-accent kd-btn-lg" href="/api/auth/qonto/start">
          {copy.connectQonto}
        </a>
      )}
    </section>
  );
}
