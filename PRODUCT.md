# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience for this round: the H Company x 42 hackathon jury, H engineers judging a computer-use agent on 2026-11-08. They want to see the agent act on a real interface, how the irreversible click is guarded, and how the result is proven.

The product's intended users: owners of very small French and European businesses (TPE, freelancers, EI) with a Qonto account and no CFO. They pay for subscriptions nobody uses and never find the time to cancel them.

## Product Purpose

Kerdaxis reads a company's bank account (Qonto, read-only), finds the subscriptions nobody uses, and sends an H Company computer-use agent to cancel them on the supplier's own website. Success: a cancellation that the supplier's own system confirms, then a saving verified on the bank statement at D+30.

## Positioning

"AI doesn't just find savings. It makes them happen." Other tools list subscriptions; Kerdaxis executes the cancellation in the supplier's UI, stops before the irreversible button for a human click, and only counts it once the supplier confirms (portal API or Stripe API), never on the agent's word.

## Operating Context

A run has seven steps: Read (Qonto, read-only), Count (deterministic engine computes every euro, the LLM only labels), Decide (Autopilot card names one action, a human approves), Act (H agent in its cloud browser), Stop (paused before the final button), Prove (supplier state read through its API), Verify (D+30 on the statement).

Surfaces: landing at `/` (marketing), app at `/demo` (dashboard `Argentier.tsx`, `ExecutionPanel.tsx` for the agent run, `VoiceCommand.tsx` for Gladia voice), access pages (`/try`, `/signup`, `/signin`, `/login`), report, risk, verify and legal pages.

## Capabilities and Constraints

- Five languages (FR, EN, DE, ES, IT), persisted in localStorage; French is the default.
- Final-click gate: three layers (two-turn mission, watchdog pause, UI-only approval). Voice can never give the final go.
- Approval is bound to one exact action by a SHA-256 hash, single use, 10 minutes.
- Ledger keeps five values apart: potential, approved, executed, supplier-confirmed, verified on statement.
- Lever taxonomy: nature (pilotable, structurel, ponctuel, perso) and motif (abonnement, doublon, fx, variable).
- Access levels: free trial (replay of a real recorded run, labelled as replay), subscriber 5 EUR/month (Stripe test mode), jury test password.
- Suppliers: Nuvio CRM (fictional portal at portal.kerdaxis.com) and Lumen Analytics (fictional, billed through Stripe's real hosted customer portal).
- Next.js 15, React 19, TypeScript; styles are CSS template strings per component. Other agents edit the same files in parallel, so business logic and data flow must stay intact.

## Brand Commitments

- Name: Kerdaxis (built on Argentier, the read-only CFO agent for Qonto).
- Voice: plain, factual, numbers with source and date. No hype.
- The visual identity is free to replace entirely (confirmed by the user, 2026-11-08).

## Evidence on Hand

- Real recorded run, H session `192149b8-…`, 7 Nov 2026: ~45 s first screen to confirmation including a 9 s pause, 10 agent steps, $0.027, injected "accept the offer" note ignored, result `supplier_confirmed` NUV-RW3L2Y. Ten captures in `web/public/replay/`.
- First Stripe portal run, 7 Nov 2026: 124 s approval to proof including research, 9 steps, $0.030, Stripe API shows `canceled`.
- Films and posters in `web/public/media/`.
- Demo company data is fictional (`web/lib/mock.ts`). No real customers, testimonials or press exist: never invent them.

## Product Principles

1. Prove, don't claim: every saving shows where it comes from and how it was confirmed.
2. The human holds the irreversible click; the interface makes that moment unmistakable.
3. The engine owns the euros; the model only labels.
4. Show the agent at work on a real interface, not a description of it.

## Accessibility & Inclusion

Voice commands exist for hands-free use. No formal standard was set; WCAG AA contrast and full keyboard reachability are the floor.
