import React from "react";
import type { Dashboard } from "./use-dashboard";
import type { LedgerValues } from "./ledger";

const ORDER: (keyof LedgerValues)[] = ["potential", "approved", "executed", "confirmed", "verified"];

/** Five values side by side: each step only fills once the step before it really happened. */
export function LedgerBar({ values, d }: { values: LedgerValues; d: Dashboard }): React.ReactElement {
  const max = Math.max(values.potential, 1);
  return (
    <ol className="kd-ledgerbar">
      {ORDER.map((key, index) => {
        const value = values[key];
        const share = Math.min(100, (value / max) * 100);
        return (
          <li key={key} className={`kd-lb kd-lb-${key} ${value > 0 ? "is-on" : ""}`}>
            <span className="kd-lb-label">{d.copy.ledgerSteps[index]}</span>
            <span className="kd-lb-value kd-num">{value > 0 ? d.eur(value) : "—"}</span>
            <span className="kd-lb-track" aria-hidden="true">
              <span className="kd-lb-fill" style={{ width: `${share}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
