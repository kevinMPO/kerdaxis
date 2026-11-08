import React from "react";
import type { DashboardCopy, RunStatus } from "./copy";

const TONE: Record<RunStatus, "run" | "wait" | "ok" | "bad" | "mute"> = {
  prepared: "run",
  running: "run",
  submitted: "run",
  awaiting_final_approval: "wait",
  supplier_confirmed: "ok",
  failed: "bad",
  needs_manual_action: "bad",
  stopped_by_user: "mute",
};

export function StatusPill({ status, copy }: { status: RunStatus; copy: DashboardCopy }): React.ReactElement {
  return <span className={`kd-pill kd-pill-${TONE[status]}`}>{copy.runStatus[status]}</span>;
}
