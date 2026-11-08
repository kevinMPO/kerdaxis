// Voiceover v4 — "The click it didn't make". `v3` = what the voice reads (phonetics, numbers in words);
// `text` = captions. Sources: recorded H Company run NUV-RW3L2Y on Nuvio (fictional supplier); /demo
// dashboard, ACME Conseil (demo data: 5,388 €/yr, Nuvio CRM no login in 90 days); Stripe test-mode
// runs 7 Nov 2026 (5/5 confirmed by the Stripe API). No claim beyond these.
export const LINES = [
  { id: "01", text: "A supplier's page just told our AI agent to accept the offer." },
  { id: "02", text: "It said no." },
  { id: "03", text: "Before the one click you can't undo, it stopped. And waited for you." },
  { id: "04", text: "One green light. The supplier confirms, with its own number." },
  { id: "05", text: "It started here. Kerdaxis, your AI CFO, spotted a CRM with no login in 90 days.",
    v3: "It started here. Kehr-daxis, your AI CFO, spotted a CRM with no login in ninety days." },
  { id: "06", text: "On this demo company: 5,388 euros a year to recover. Every euro comes from a deterministic engine.",
    v3: "On this demo company: five thousand, three hundred and eighty-eight euros a year to recover. Every euro comes from a deterministic engine." },
  { id: "07", text: "Connect. Analyze. Compare. Then it waits for you. Execute. Verify." },
  { id: "08", text: "On Stripe's real customer portal, in test mode: 5 cancellations out of 5, confirmed by Stripe itself.",
    v3: "On Stripe's real customer portal, in test mode: five cancellations out of five, confirmed by Stripe itself." },
  { id: "09", text: "Kerdaxis. AI doesn't just find savings. It makes them happen.",
    v3: "Kehr-daxis. AI doesn't just find savings. It makes them happen." },
];
