"use client";

// Formulaire d'accès partagé par /try, /signup, /signin (même habillage que /login).

import React, { useEffect, useRef, useState } from "react";
import { DEMO_PATH, LIVE_DASHBOARD_PATH } from "@/lib/site";
import { AuthShell } from "./AuthShell";

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

/** Trial users get the demo company; account holders land on their own data. */
const DEFAULT_NEXT: Record<Mode, string> = {
  try: DEMO_PATH,
  signup: LIVE_DASHBOARD_PATH,
  signin: LIVE_DASHBOARD_PATH,
};

function nextPath(mode: Mode): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : DEFAULT_NEXT[mode];
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
        window.location.href = nextPath(mode);
        return;
      }
      setErr(ERR[d.error ?? ""] ?? "Something went wrong, please try again.");
    } catch {
      setErr("Network error, please try again.");
    }
    setBusy(false);
  };

  return (
    <AuthShell>
      <form ref={formRef} className="ka-card" onSubmit={submit}>
        <div className="ka-body">
          <h1>{c.title}</h1>
          <p className="ka-lede">{c.lede}</p>
          {notice && <p className="ka-note">{notice}</p>}
          <div className="ka-fields">
            <label htmlFor="em">Email</label>
            <input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            {mode !== "try" && (
              <>
                <label htmlFor="pw">
                  Password{mode === "signup" && <span className="ka-hint"> (10+ characters)</span>}
                </label>
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
          </div>
          <button className="ka-btn" type="submit" disabled={busy}>{busy ? "…" : c.cta}</button>
          {err && <p className="ka-err" role="alert">{err}</p>}
          {mode === "try" && (
            <p className="ka-fine">
              No email? <a href="/api/try/guest">See the demo as a guest →</a>
            </p>
          )}
          {mode === "signup" && (
            <p className="ka-fine">
              Test mode: no real charge. Use card <span className="ka-mono">4242 4242 4242 4242</span>, any future date, any CVC.
            </p>
          )}
        </div>
        <nav className="ka-links" aria-label="Other ways in">
          {mode !== "try" && <a href="/try">Try for free</a>}
          {mode !== "signup" && (
            <a href="/signup">
              Create an account <span className="ka-price">· 5 €/mo</span>
            </a>
          )}
          {mode !== "signin" && <a href="/signin">Sign in</a>}
          {mode === "signin" && (
            <a className="ka-links-aside" href="/login">
              Jury / test access
            </a>
          )}
        </nav>
      </form>
    </AuthShell>
  );
}
