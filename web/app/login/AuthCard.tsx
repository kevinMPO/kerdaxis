"use client";

// Formulaire d'accès partagé par /try, /signup, /signin (même habillage que /login).

import React, { useEffect, useRef, useState } from "react";

type Mode = "try" | "signup" | "signin";

const COPY: Record<Mode, { title: string; lede: string; cta: string; endpoint: string }> = {
  try: {
    title: "Try Kerdaxis for free",
    lede: "Just your work email. You get the whole app on a demo company. The H Company agent run is a replay of a real recorded session.",
    cta: "Start free trial ↗",
    endpoint: "/api/try",
  },
  signup: {
    title: "Create your account",
    lede: "5 € / month, cancel anytime. Includes live H Company agent runs on the demo supplier portal, with your final go before every irreversible click.",
    cta: "Continue to payment ↗",
    endpoint: "/api/signup",
  },
  signin: {
    title: "Sign in",
    lede: "Welcome back.",
    cta: "Sign in ↗",
    endpoint: "/api/signin",
  },
};

const ERR: Record<string, string> = {
  bad_email: "Please enter a valid email address.",
  weak_password: "Use at least 10 characters.",
  account_exists: "An account already exists for this email. Sign in instead.",
  already_subscribed: "You're already subscribed. Sign in instead.",
  bad_credentials: "Wrong email or password.",
  too_many_attempts: "Too many attempts, try again in a few minutes.",
  not_configured: "This is not available yet. Try the free trial.",
  checkout_failed: "Payment page unavailable, please try again.",
  billing_unavailable: "Billing is unreachable right now, please try again.",
};

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/demo";
}

export default function AuthCard({ mode, notice }: { mode: Mode; notice?: string }) {
  const c = COPY[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  // Venu du site (kerdaxis.com) avec l'e-mail déjà saisi : on démarre l'essai directement.
  useEffect(() => {
    if (mode !== "try") return;
    const pre = new URLSearchParams(window.location.search).get("email");
    if (pre && pre.length <= 254) {
      setEmail(pre);
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(c.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "try" ? { email } : { email, password }),
      });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      // Stripe Checkout (inscription, ou abonnement à reprendre à la connexion).
      if (d.url && /^https:\/\/checkout\.stripe\.com\//.test(d.url)) {
        window.location.href = d.url;
        return;
      }
      if (r.ok) {
        window.location.href = nextPath();
        return;
      }
      setErr(ERR[d.error ?? ""] ?? "Something went wrong, please try again.");
    } catch {
      setErr("Network error, please try again.");
    }
    setBusy(false);
  };

  return (
    <main className="kl">
      <style>{CSS}</style>
      <form ref={formRef} className="kl-card" onSubmit={submit}>
        <div className="kl-mark">K</div>
        <h1>{c.title}</h1>
        <p>{c.lede}</p>
        {notice && <p className="kl-note">{notice}</p>}
        <label htmlFor="em">Email</label>
        <input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        {mode !== "try" && (
          <>
            <label htmlFor="pw">Password{mode === "signup" ? " (10+ characters)" : ""}</label>
            <input
              id="pw"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}
        <button type="submit" disabled={busy}>{busy ? "…" : c.cta}</button>
        {err && <p className="kl-err" role="alert">{err}</p>}
        {mode === "signup" && <p className="kl-fine">Test mode: no real charge. Use card 4242 4242 4242 4242, any future date, any CVC.</p>}
        <nav className="kl-links">
          {mode !== "try" && <a href="/try">Try for free</a>}
          {mode !== "signup" && <a href="/signup">Create an account · 5 €/mo</a>}
          {mode !== "signin" && <a href="/signin">Sign in</a>}
          {mode === "signin" && <a href="/login">Jury / test access</a>}
          <a href="https://kerdaxis.com">← kerdaxis.com</a>
        </nav>
      </form>
    </main>
  );
}

const CSS = `
.kl{min-height:100vh;display:grid;place-items:center;background:#080d13;color:#eef8f5;font-family:Inter,system-ui,sans-serif;padding:20px;}
.kl-card{width:min(440px,100%);background:#111a22;border:1px solid #26343d;border-radius:18px;padding:30px;display:flex;flex-direction:column;gap:12px;}
.kl-mark{width:38px;height:38px;border:1px solid #b4f76880;border-radius:11px;display:grid;place-items:center;color:#b4f768;font-weight:900;transform:rotate(-8deg);}
.kl h1{font-size:24px;letter-spacing:-.03em;margin:4px 0 0;}
.kl p{color:#a3b4b9;font-size:14px;line-height:1.55;margin:0;}
.kl label{font-size:13px;color:#a3b4b9;margin-top:6px;}
.kl input{background:#0b1218;border:1px solid #26343d;border-radius:11px;color:#eef8f5;font:inherit;font-size:16px;padding:13px 14px;}
.kl input:focus-visible,.kl button:focus-visible,.kl a:focus-visible{outline:2px solid #b4f768;outline-offset:2px;}
.kl button{border:0;border-radius:12px;background:#b4f768;color:#102015;font:inherit;font-weight:750;padding:14px;cursor:pointer;margin-top:4px;}
.kl button:disabled{opacity:.6;}
.kl-err{color:#ff9b8a!important;}
.kl-note{color:#eef8f5!important;background:#0b1218;border:1px solid #26343d;border-radius:11px;padding:10px 12px;}
.kl-fine{font-size:12.5px!important;}
.kl-links{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:6px;}
.kl a{color:#a3b4b9;font-size:13px;text-decoration:none;}
.kl a:hover{color:#eef8f5;}
`;
