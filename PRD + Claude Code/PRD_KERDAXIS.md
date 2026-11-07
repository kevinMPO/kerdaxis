# KERDAXIS — Product Requirements Document (PRD)

Version 0.1 · 7 novembre 2026 · Cible : hackathon H Company × Gladia × Linkup, puis produit B2B en marque blanche.

## 1. Product thesis
**AI doesn't just find savings. It makes them happen.**

Kerdaxis is an AI finance operator. It connects to financial products (Qonto, Sage, Pennylane and others), ingests transactions/invoices, identifies avoidable costs via auditable deterministic calculations, checks alternatives using dated/source-backed Linkup searches, proposes actions, gets explicit human approval, executes authorized steps on supplier portals using H Company computer use, and later verifies observed savings. Voice commands/transcription come from Gladia. Mastra orchestrates agents and workflow state.

Two distribution modes: (1) direct SMB subscription; (2) white-label product distributed by accounting firms to their clients, with clear tenant separation and audit trails.

**Non-goal:** replacing general-ledger accounting or financial advice by a licensed professional. No automatic money movement, bank payment authorizations, financial transfers, changes in payment instruments, or unauthorized access.

## 2. Evidence from GetArgentier (existing private GitHub project)
Repository inspected: `kevinMPO/getargentier` on `main` (README, Python engine, Mastra risk agent, audit command, package manifest). Existing assets worth reusing:
- `engine.py`: deterministic detection of subscriptions, recurring cadence, duplicates, FX fees, and indicative missing-receipt VAT; distinctions between annualizable and one-off savings.
- `sum_ledger.py`, `/verify`, and `decisions.json`: distinguish estimated, approved and verified savings; reversals correct totals.
- `web/`: Next.js/React frontend, dashboard, mock path, translations, and prior ElevenLabs voice prototype.
- `web/lib/risk/mastra.ts`: already uses `@mastra/core`, `@mastra/mcp`, a Linkup MCP client, optional persistent memory, and prompt-injection precautions.
- `/audit` workflow: read-only financial ingestion → deterministic financial analysis → sourced comparison → human gate → ledger.

**Critical delta from GetArgentier:** GetArgentier intentionally stops before sending/cancelling. Kerdaxis adds an explicitly approved, tracked, human-supervised **execution layer** using H Company. Preserve hard read-only permissions for bank and finance data; create a *separate supplier-portal execution capability* with an independent permission policy. Never loosen the previous Qonto write restrictions to make browser actions work.

Do not claim the current repo already contains H Company or Gladia working integrations. Verify actual SDK/API contracts, credentials, quotas and supported runtime before coding.

## 3. ICP, Jobs To Be Done, outcomes
**Primary pilot:** founder/finance manager of a 10–250-person business paying for SaaS/telecom recurring services. JTBD: 'Find recurring spend I can avoid, and complete the cancellation with my consent.'

**Channel ICP:** accountants with SMB portfolios. JTBD: 'Offer every client an ongoing financial optimization service under my firm brand with measurable financial outcomes and minimal manual work.'

North star: **verified annualized recurring savings** from an observed post-action debit reduction. Record one-shot recoveries separately. Leading metrics: source connected, audit completed, actionable suggestions, benchmark verified, action approved, execution success, proof received, post-cycle verification completion.

## 4. User journey and acceptance criteria
### 4.1 Connect & ingest
- User chooses provider from Qonto / Sage / Pennylane / other. Show availability: real connector, browser-assisted, CSV/demo, or not yet supported.
- Prefer supported read-only API/MCP for reliability and cost. Use Computer Use where no supported API/MCP exists or to interact with third-party UIs needed to fulfill the user request. Source provenance is visible.
- For browser login, user logs in within an approved isolated session; handle MFA manually; never request passwords in chat, store plain-text credentials, bypass CAPTCHA, or silently reuse credentials.
- Gather date-bounded, paginated transactions and invoices if available, normalize with traceable raw source IDs and timestamps; deduplicate by source and ID.
- If not connected, launch sample dataset without pretending it is live.

### 4.2 Deterministic analysis
- Use a pure, testable engine for every currency figure. LLM only classifies where needed, orchestrates and explains; confidence and classification reasons must be visible.
- Candidate types for MVP: recurring subscriptions (monthly/quarterly), duplicate spend, price hikes, SaaS overlap. Later: FX, telecom/insurance, renegotiations, missing invoices, revenue leakage.
- Important fix: subscription cost is not automatically *100% saveable*. Show actual current spend separately from candidate savings; savings require user confirmation of disuse OR a supported alternative with switching/exit costs and comparable features. Don't treat current spend as savings until criteria are met.
- Prevent overlapping savings for the same vendor, mixed currencies, cancelled subscriptions and one-time spend. Explicitly handle low confidence and stale prices.

### 4.3 Benchmark via Linkup MCP
- Send minimal non-sensitive attributes (supplier category, plan if non-sensitive); strip names and private company transaction details.
- Return cited URL, captured date, plan details, eligibility, contract duration, currency, VAT/tax assumptions and feature equivalence where available.
- If source/date missing or price cannot be verified, label as unverified; never infer a guaranteed saving.

### 4.4 Approval gate
- Opportunity table has merchant, spend/period, plausible action, sourced comparison, estimated net savings, confidence, contracts/risks, status and CTA.
- The user selects Cancel / Negotiate / Compare / Ignore. For a cancellation, show contract affected, notice, potential access loss, effective date and source evidence. Explicit approval required **before entering any final supplier action**.
- Voice approval is transcribed and read back with the essential terms; a separate UI confirmation is recommended for irreversible changes. Each approval binds to immutable action parameters and tenant+user identity.

### 4.5 H Company Computer Use execution
- Start scoped browser session on the *supplier portal*, not financial accounts. User must authorize the domain and account scope.
- Agent navigates to billing/subscription settings, finds the cancellation path, captures screenshots/step trace with sensitive data redacted, and stops for approval at irreversible confirmation.
- Only execute the exact approved action; never make purchases, sign contracts, submit bank info, or transfer money.
- On MFA/captcha/uncertain UI/wrong account, pause for user intervention. Detect malicious on-page instructions and ignore them.
- Distinguish `prepared`, `awaiting_final_approval`, `submitted`, `supplier_confirmed`, `failed`, `needs_manual_action`. UI must not say 'cancelled' solely because a button was clicked.
- If cancellation is unavailable, prepare a supplier email or letter, but only send if the user separately authorizes the channel and exact recipient.

### 4.6 Verification & ROI
- Keep proof (supplier email/confirmation number, screenshot where appropriate) and the expected cancellation date.
- On the next billing cycle, re-read connected transaction data (with user authorization); verify that the charge stopped or decreased. Flag ambiguous evidence and refunds separately.
- Dashboard: **Potential savings / Approved / Executed / Supplier confirmed / Verified on statement**. Never roll those five values into one mislabelled number.

## 5. Product surfaces
**Landing page:** provided `index.html`, static responsive EN/FR concept. Interactive demo is *simulated*, no real account connection, no backend, no real Gladia microphone or H Company invocation. Lead form launches a `mailto:` draft to an unverified placeholder address: configure production CRM/waitlist endpoint before publishing.

**Application:** `/onboarding`, `/sources`, `/dashboard`, `/opportunities`, `/actions/:id`, `/activity`, `/settings`, `/partner`. One clear primary CTA per page; mobile-ready responsive cards; error/loading/empty/permission/retry states; connection health, audit history and scoped permissions.

**White label:** firm tenant → client organizations → their financial connections → their action approvals. Theme, domain, logo and notification sender per partner. Access roles: platform_admin, partner_admin, advisor, client_owner, client_viewer. **Accountant cannot execute a client's cancellation without that client's explicit delegated approval**. Strict row-level separation.

## 6. Architecture (proposed, check latest SDK docs)
```
Next.js UI (EN/FR, dashboard, approval, Gladia voice input)
         |
Backend API + auth + organizations / tenant scope
         |
Mastra orchestration / workflow state machine / logs
   |               |                   |
Financial data  Deterministic core   Linkup MCP
read-only        (reuse Argentier)    benchmark+sources
MCP/API/Browser         |                   |
   +------ normalized transactions -----------+
                         |
                 Opportunity engine
                         |
              Explicit action approval
                         |
                  H Company adapter
              (supplier UI computer use)
                         |
                Evidence + event ledger
                         |
             J+30 verified statement delta
```

Implement adapters: `FinancialSourceAdapter`, `BenchmarkProvider`, `BrowserExecutor`, `SpeechAdapter`. `BrowserExecutor` API should abstract the exact H Company SDK; use an official SDK/tool contract only after validation. `SpeechAdapter` receives Gladia transcripts and exposes command intents to Mastra; do not pretend Gladia itself executes actions. Mastra must own long-running execution states, retries and tool guards. Persist execution checkpoints so replays don't double-cancel.

Recommended initial stack: Next.js + TypeScript + Mastra + existing deterministic Python/TS engine + PostgreSQL (tenants, approvals, events) + object storage (encrypted proofs) + scoped browser sessions + H Company + Linkup MCP + Gladia. For hackathon, use seeded JSON with a real H Company demonstration on a permitted sandbox/test supplier or owned demo website, while Linkup/Gladia are integrated if credentials are available. Avoid unnecessary migration of mature Argentier modules.

## 7. Data contracts (minimal)
- `Tenant(id, type, brand, plan)`; `Organization(id, tenant_id, name)`; `User(id, tenant_id, role)`.
- `Connection(id, org_id, provider, mode, status, permissions, last_synced_at)`.
- `Transaction(id, connection_id, external_id, merchant, amount_minor, currency, date, recurrence_evidence, source_ref)`.
- `Opportunity(id, org_id, merchant, kind, baseline_amount_minor, estimated_savings_minor, currency, period, confidence, source_refs, status)`.
- `Approval(id, opportunity_id, user_id, action_type, action_parameters_hash, approved_at, expires_at)`.
- `Execution(id, approval_id, target_domain, status, trace_ref, provider_confirmation, executed_at, error_code)`.
- `SavingsProof(id, opportunity_id, expected_amount_minor, observed_delta_minor, cycle_start, cycle_end, verified_at, status)`.

Use decimal-safe integer minor units, explicit recurrence factors, immutable ledger events, idempotency keys and rate-limited external steps. Do not log credentials, bank details or transcripts containing secrets.

## 8. Hackathon demo — 3-minute narrative
- **00:00–00:25**: 'My accountant helps me save money, not just file taxes.' Gladia transcribes 'Connect Qonto and find unused software.'
- **00:25–00:50**: Qonto read-only live/demo connection; show 90-day spend and deterministic identified subscription with traceable source.
- **00:50–01:20**: Linkup searches dated comparable plans. Agent shows potential annual saving and risk/contract details.
- **01:20–02:35**: User selects subscription and approves action. H Company uses browser on controlled supplier demo portal, pauses at final confirmation, user approves, supplier confirmation is visibly captured. **This is the centerpiece.**
- **02:35–03:00**: Dashboard updates from `approved` to `supplier_confirmed`; `verified on statement` stays zero pending a later cycle. Show white-label accountant view in 10 seconds.

**Fallback:** if a partner tool fails, show transparently marked recorded trace and prepared draft; do not falsely label mock actions as real. Keep one golden workflow rather than five fragile integrations.

## 9. Delivery priorities
**P0 / hackathon:** seeded financial transactions + port existing deterministic calculation + one Linkup benchmark + Gladia spoken command → action intent + real H Company action on a controlled test portal + approval gates + event timeline + small EN/FR landing page. No live bank credentials required.

**P1 / pilot accountants:** real Qonto read-only integration; multi-organization tenancy, role-based approvals, encryption and audit trails, supplier domain allowlist, production persistence and session isolation, branded partner dashboard.

**P2 / scale:** Sage/Pennylane adapters (subject to eligibility), company-wide recurring spend analysis, vendor playbooks, outbound negotiation, J+30 verification automation, billing and partner administration.

## 10. QA acceptance checklist
1. Financial arithmetic stays deterministic; every displayed figure is tied to an engine output.
2. Recurring vs one-time savings never conflated and projected savings aren't 'verified' before bank proof.
3. Multiple vendor sources deduplicate correctly; failed source logins show clear states.
4. Missing benchmarks have a visible 'unverified' flag.
5. Prompt injection on supplier web pages never bypasses approved scope.
6. Wrong customer account/domain, MFA and final confirmations pause execution.
7. Human approval cannot be forged, reused or extended to another action/tenant.
8. H Company failure/retry never creates duplicate cancellation or false success.
9. Agent traces and logs redact PII; partner tenants cannot read each other's customers.
10. Voice transcripts cannot directly trigger irreversible action without explicit final approval.
11. EN/FR copy and responsive design work on iPhone widths.
12. Demo states are labelled accurately and the complete P0 path runs end to end.

## 11. Unknowns to resolve with Claude Code before API integration
- Official H Company Computer Use SDK/API details, session authorization model, supported operating system/browser, tool action schema and hackathon access.
- Gladia preferred low-latency streaming transcription integration, browser microphone permissions and supported languages.
- Linkup MCP endpoint, auth, quotas and verifiable pricing sources.
- Authorized financial connectors for Sage/Pennylane and scope of banking/third-party portal automation.
- Brand/domain availability for Kerdaxis; obtain clearance before public launch.

## 12. Definition of Done
P0 qualifies as **READY TO SHIP FOR DEMO** only when one reproducible, approved action reaches supplier confirmation in a controlled real environment, the numbers are engine-generated and the UI distinguishes a true action from a simulation. Otherwise explicitly mark **SHIP WITH FOLLOW-UP** or **BLOCKED**.
