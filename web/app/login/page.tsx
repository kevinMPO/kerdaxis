"use client";

import React, { useState } from "react";

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
    <main className="kl">
      <style>{CSS}</style>
      <form className="kl-card" onSubmit={submit}>
        <div className="kl-mark">K</div>
        <h1>Kerdaxis — test access</h1>
        <p>Demo environment: fictional company, fictional supplier portal. Real H Company agent, real approvals.</p>
        <label htmlFor="pw">Test password</label>
        <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        <button type="submit" disabled={busy}>{busy ? "…" : "Enter the app ↗"}</button>
        {err && <p className="kl-err">{err}</p>}
        <a href="https://kerdaxis.com">← Back to kerdaxis.com</a>
      </form>
    </main>
  );
}

const CSS = `
.kl{min-height:100vh;display:grid;place-items:center;background:#080d13;color:#eef8f5;font-family:Inter,system-ui,sans-serif;padding:20px;}
.kl-card{width:min(420px,100%);background:#111a22;border:1px solid #26343d;border-radius:18px;padding:30px;display:flex;flex-direction:column;gap:12px;}
.kl-mark{width:38px;height:38px;border:1px solid #b4f76880;border-radius:11px;display:grid;place-items:center;color:#b4f768;font-weight:900;transform:rotate(-8deg);}
.kl h1{font-size:24px;letter-spacing:-.03em;margin:4px 0 0;}
.kl p{color:#a3b4b9;font-size:14px;line-height:1.55;margin:0;}
.kl label{font-size:13px;color:#a3b4b9;margin-top:6px;}
.kl input{background:#0b1218;border:1px solid #26343d;border-radius:11px;color:#eef8f5;font:inherit;padding:13px 14px;}
.kl input:focus-visible,.kl button:focus-visible,.kl a:focus-visible{outline:2px solid #b4f768;outline-offset:2px;}
.kl button{border:0;border-radius:12px;background:#b4f768;color:#102015;font:inherit;font-weight:750;padding:14px;cursor:pointer;}
.kl button:disabled{opacity:.6;}
.kl-err{color:#ff9b8a!important;}
.kl a{color:#a3b4b9;font-size:13px;text-decoration:none;}
`;
