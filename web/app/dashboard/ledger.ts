import type { Lever } from "@/lib/types";
import type { RunRef } from "./use-dashboard";
import type { ExecutionView } from "./use-execution";

const MONTHS_PER_YEAR = 12;
const CENTS_PER_EURO = 100;

/** The five ledger values, kept apart and never merged (PRD §4.6). Yearly euros. */
export interface LedgerValues {
  potential: number;
  approved: number;
  executed: number;
  confirmed: number;
  verified: number;
}

export function ledgerValues(levers: Lever[], runs: RunRef[], runViews: Record<string, ExecutionView>): LedgerValues {
  const potential = levers.filter((l) => l.active).reduce((sum, l) => sum + l.saving, 0) * MONTHS_PER_YEAR;

  const approvedSuppliers = new Set(runs.map((r) => r.supplierId));
  const approved = levers.filter((l) => approvedSuppliers.has(l.id)).reduce((sum, l) => sum + l.saving, 0) * MONTHS_PER_YEAR;

  // One supplier counts once, whatever the number of runs against it.
  const yearlyBySupplier = (predicate: (view: ExecutionView) => boolean): number => {
    const seen = new Map<string, number>();
    for (const run of runs) {
      const view = runViews[run.id];
      if (view && predicate(view)) seen.set(run.supplierId, (view.monthlyCents / CENTS_PER_EURO) * MONTHS_PER_YEAR);
    }
    return [...seen.values()].reduce((sum, value) => sum + value, 0);
  };

  const executed = yearlyBySupplier((v) => v.finalDecision?.decision === "approve");
  const confirmed = yearlyBySupplier((v) => v.status === "supplier_confirmed");

  // Verified on the statement only happens at the next billing date (D+30); never inferred here.
  return { potential, approved, executed, confirmed, verified: 0 };
}
