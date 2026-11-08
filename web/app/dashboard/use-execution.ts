"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FinalLabelSource, ResearchRunCheck } from "@/lib/execution/research/compare";
import type { RunStatus } from "./copy";

export interface ExecutionEvent {
  at: string;
  kind: string;
  message: string;
  url?: string;
}

export interface PlaybookView {
  source: "catalog" | "research";
  merchant: string | null;
  officialDocUrl: string | null;
  steps: string[];
  finalButtonLabel: string;
  retentionTraps: string[];
  fallbackReason: string | null;
  researchedAt?: string | null;
  sourceUrls?: string[];
  finalLabelSource?: FinalLabelSource;
}

export interface ExecutionView {
  id: string;
  status: RunStatus;
  vendor: string;
  plan: string;
  account: string;
  monthlyCents: number;
  actionHash: string;
  agentViewUrl: string | null;
  liveViewUrl: string | null;
  pendingApproval: { page_summary?: string; account_shown?: string; button_label?: string } | null;
  finalDecision: { decision: "approve" | "refuse"; at: string } | null;
  confirmationNumber: string | null;
  supplierState: { status: string; confirmation_number: string | null; access_until?: string } | null;
  hasScreenshot: boolean;
  steps: number;
  costUsd: number | null;
  error: string | null;
  updatedAt: string;
  events: ExecutionEvent[];
  replay?: boolean;
  playbook?: PlaybookView | null;
  /** Linkup's documented path checked against the agent's log, computed by the server. */
  researchCheck?: ResearchRunCheck | null;
}

export const TERMINAL_STATUSES: RunStatus[] = ["supplier_confirmed", "failed", "needs_manual_action", "stopped_by_user"];

const ACTIVE_POLL_MS = 600;
const BACKGROUND_POLL_MS = 2500;

export class ExecutionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionRequestError";
  }
}

interface UseExecution {
  view: ExecutionView | null;
  busy: boolean;
  error: string | null;
  decide: (decision: "approve" | "refuse") => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Each GET advances the server-side state machine, so the panel that watches a
 * run polls fast and list rows poll slowly. Polling ends at a terminal status.
 */
export function useExecution(id: string | null, mode: "active" | "background" = "active"): UseExecution {
  const [view, setView] = useState<ExecutionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    if (!id) {
      setView(null);
      return;
    }
    alive.current = true;
    const interval = mode === "active" ? ACTIVE_POLL_MS : BACKGROUND_POLL_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/execution/${id}`, { cache: "no-store" });
        if (!alive.current) return;
        if (response.status === 404) return;
        const next = (await response.json()) as ExecutionView;
        if (!alive.current) return;
        if (response.ok) {
          setView(next);
          if (TERMINAL_STATUSES.includes(next.status)) return;
        }
      } catch {
        /* network blip: retry on the next tick */
      }
      if (alive.current) timer = setTimeout(tick, interval);
    };
    void tick();
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, mode]);

  const decide = useCallback(
    async (decision: "approve" | "refuse") => {
      if (!id) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/execution/${id}/final`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, channel: "ui" }),
        });
        const next = (await response.json()) as ExecutionView & { error?: string };
        if (!response.ok) throw new ExecutionRequestError(next.error ?? "final_decision_failed");
        setView(next);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [id],
  );

  const stop = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/execution/${id}/stop`, { method: "POST" });
      if (response.ok) setView((await response.json()) as ExecutionView);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [id]);

  return { view, busy, error, decide, stop };
}
