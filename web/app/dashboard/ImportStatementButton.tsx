"use client";

import React, { useCallback, useRef } from "react";
import type { Dashboard } from "./use-dashboard";

export const SAMPLE_STATEMENT_URL = "/samples/releve-exemple.pdf";

export function ImportStatementButton({ d, className }: { d: Dashboard; className: string }): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = d.importState.status === "reading" || d.importState.status === "analyzing";

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so picking the same file again still triggers a change.
      event.target.value = "";
      if (file) void d.importStatement(file);
    },
    [d],
  );

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? (d.importState.status === "reading" ? d.copy.importReading : d.copy.importAnalyzing) : d.copy.importPdf}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={onChange}
      />
    </>
  );
}
