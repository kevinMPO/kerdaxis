"use client";

import React from "react";
import type { StepCheck } from "@/lib/execution/research/compare";
import type { Dashboard } from "./use-dashboard";
import type { ExecutionView } from "./use-execution";
import { Icon } from "./Icon";

/**
 * The path handed to the agent, and, for a path researched by Linkup, how it
 * held up on the real screen. Each documented button label is marked as named
 * or never named by the agent. The server computes the marks; this only renders them.
 */
export function ResearchPath({ view, d }: { view: ExecutionView; d: Dashboard }): React.ReactElement | null {
  const { copy } = d;
  const playbook = view.playbook;
  if (!playbook || playbook.steps.length === 0) return null;
  const check = view.researchCheck ?? null;
  const researched = playbook.source === "research" && !playbook.fallbackReason;
  const day = playbook.researchedAt
    ? new Date(playbook.researchedAt).toLocaleDateString(d.lang, { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <details className="kd-playbook" open={playbook.source === "research"}>
      <summary>{copy.playbook}</summary>
      {researched && day && (
        <p className="kd-path-meta">
          {copy.pathResearched(playbook.sourceUrls?.length ?? 0, day)}
          {playbook.officialDocUrl && (
            <>
              {" · "}
              <a className="kd-link" href={playbook.officialDocUrl} target="_blank" rel="noreferrer">
                {playbook.merchant ?? "source"} <Icon name="external" size={13} />
              </a>
            </>
          )}
        </p>
      )}
      <ol>
        {playbook.steps.map((step, index) => (
          <li key={index}>
            {step}
            <Mark check={check?.steps[index]?.check} d={d} />
          </li>
        ))}
      </ol>
      {researched && (
        <p className="kd-path-meta">
          {copy.pathFinal(playbook.finalButtonLabel)} · {copy.pathFinalSource[playbook.finalLabelSource ?? "catalog"]}
          <Mark check={check?.finalLabel.check} d={d} />
        </p>
      )}
      {check && check.labelledSteps > 0 && (
        <p className={`kd-path-score ${check.seenSteps === check.labelledSteps ? "is-ok" : ""}`}>
          {copy.pathScore(check.seenSteps, check.labelledSteps)}
        </p>
      )}
      {check?.agentNotes && (
        <p className="kd-path-notes">
          <b>{copy.pathNotes}</b> · {check.agentNotes}
        </p>
      )}
      {!researched && playbook.officialDocUrl && (
        <a className="kd-link" href={playbook.officialDocUrl} target="_blank" rel="noreferrer">
          {playbook.merchant ?? "source"} <Icon name="external" size={13} />
        </a>
      )}
    </details>
  );
}

function Mark({ check, d }: { check: StepCheck | undefined; d: Dashboard }): React.ReactElement | null {
  if (check === "seen") {
    return (
      <span className="kd-path-mark is-seen">
        <Icon name="check" size={12} /> {d.copy.pathSeen}
      </span>
    );
  }
  if (check === "not_seen") return <span className="kd-path-mark is-missed">{d.copy.pathNotSeen}</span>;
  return null;
}
