"use client";

import { useEffect, useState } from "react";

export interface AccessEntryView {
  id: string;
  at: string;
  service: "qonto" | "anthropic" | "linkup" | "hcompany" | "gladia" | "elevenlabs";
  operation: string;
  direction: "read" | "sent";
  sent: string | null;
}

const POLL_MS = 5000;

/** The visitor's real third-party calls, refreshed while the ledger is open. */
export function useAccessLog(): { entries: AccessEntryView[]; loaded: boolean; failed: boolean } {
  const [entries, setEntries] = useState<AccessEntryView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/access-log", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`access_log_${response.status}`);
        const body = (await response.json()) as { entries: AccessEntryView[] };
        setEntries(body.entries);
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
      }
      setLoaded(true);
      if (!controller.signal.aborted) timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { entries, loaded, failed };
}
