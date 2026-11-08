"use client";

// Barre de compte de l'app exposée : essai gratuit → s'abonner ; abonné →
// gérer l'abonnement (portail Stripe) ; déconnexion. Rien en local.

import React, { useEffect, useState } from "react";

type Me = { role: "trial" | "member" | "tester" | null; email: string | null };

export default function AccountBar() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => undefined);
  }, []);
  if (!me?.role) return null;

  const signOut = async () => {
    await fetch("/api/signout", { method: "POST" });
    window.location.href = "/signin";
  };
  const portal = async () => {
    const r = await fetch("/api/billing/portal", { method: "POST" });
    const d = (await r.json().catch(() => ({}))) as { url?: string };
    if (d.url && /^https:\/\/billing\.stripe\.com\//.test(d.url)) window.location.href = d.url;
  };

  return (
    <div className="kab" role="region" aria-label="Account">
      <style>{CSS}</style>
      {me.role === "trial" && (
        <>
          <span className="kab-tag">Free trial</span>
          <span className="kab-txt">Nuvio CRM is a replay. Live runs are for subscribers.</span>
          <a className="kab-cta" href="/signup">Go live · 5 €/mo</a>
        </>
      )}
      {me.role === "member" && (
        <>
          <span className="kab-tag on">Subscribed</span>
          <span className="kab-txt">{me.email}</span>
          <button className="kab-link" onClick={portal}>Billing</button>
        </>
      )}
      {me.role === "tester" && <span className="kab-tag">Test access</span>}
      <button className="kab-link" onClick={signOut}>Sign out</button>
    </div>
  );
}

const CSS = `
.kab{position:fixed;left:16px;bottom:16px;z-index:60;display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:calc(100vw - 32px);
  background:#111a22;color:#eef8f5;border:1px solid #26343d;border-radius:14px;padding:8px 10px 8px 8px;font:500 13px/1.2 Inter,system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.25);}
.kab-tag{background:#26343d;border-radius:8px;padding:5px 8px;font-weight:700;}
.kab-tag.on{background:#b4f768;color:#102015;}
.kab-txt{color:#a3b4b9;}
.kab-cta{background:#b4f768;color:#102015;border-radius:9px;padding:6px 10px;font-weight:750;text-decoration:none;}
.kab-link{background:none;border:0;color:#a3b4b9;font:inherit;cursor:pointer;padding:4px 2px;}
.kab-link:hover{color:#eef8f5;}
.kab a:focus-visible,.kab button:focus-visible{outline:2px solid #b4f768;outline-offset:2px;}
`;
