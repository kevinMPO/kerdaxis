"use client";

import React, { useState } from "react";
import { AuthShell } from "./AuthShell";

export default function TestLogin() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/test-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (r.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/demo";
    } else {
      setErr(r.status === 429 ? "Too many attempts, try again in a few minutes." : "Wrong test password.");
    }
  };

  return (
    <AuthShell>
      <form className="ka-card" onSubmit={submit}>
        <div className="ka-body">
          <h1>Test access</h1>
          <p className="ka-lede">Demo environment: fictional company, fictional supplier portal. Real H Company agent, real approvals.</p>
          <div className="ka-fields">
            <label htmlFor="pw">Test password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </div>
          <button className="ka-btn" type="submit" disabled={busy}>{busy ? "…" : "Enter the app ↗"}</button>
          {err && <p className="ka-err" role="alert">{err}</p>}
        </div>
        <nav className="ka-links" aria-label="Other ways in">
          <a href="/try">Try for free</a>
          <a href="/signin">Sign in</a>
        </nav>
      </form>
    </AuthShell>
  );
}
