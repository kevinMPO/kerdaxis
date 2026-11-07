# KERDAXIS — Technical architecture film (v3)

Audience: H Company × 42 AI Computer Use hackathon jury. 49.9 s · 1920×1080 · 30 fps · English,
burned-in English captions · AI voice "Liam" (ElevenLabs eleven_v3, ×1.12) · elegant ElevenLabs
loop (100 BPM) ducked under the voice. Built by `tools/build_v3.py` (timings) + `tools/gen_lines.sh`
(voice, each line Whisper-checked). Render: `renders/kerdaxis-arch-v3-linkedin.mp4`.
Previous films kept separately: `video-yc/` (v2 "AI CFO", live on kerdaxis.com), tag `video-yc-v1`.

North Star: "The LLM reasons. The engine calculates. Mastra orchestrates. H Company executes.
Humans stay in control."

## Exact voiceover transcript

| # | Start | Line |
|---|---|---|
| 1 | 0.20 s | Millions of small businesses can't afford a full-time CFO. What if AI could actually do the work? |
| 2 | 5.75 s | Kerdaxis connects through MCP and APIs, and can use H Company's computer use when software has no integration. |
| 3 | 12.05 s | Mastra orchestrates agents and tools. Our deterministic engine calculates every euro, while the agent harness controls execution, permissions and evidence. |
| 4 | 21.35 s | Linkup compares market alternatives, turning anomalies into actionable recommendations. |
| 5 | 26.05 s | H Company's agent executes inside a real interface, ignores malicious page instructions, and stops before the irreversible click until a human approves. |
| 6 | 35.40 s | The supplier confirms. Kerdaxis records the proof and schedules the bank check. |
| 7 | 39.40 s | Services as Software: accounting firms distribute it, Forward Deployed Engineers adapt it, and SMEs get the work done. |

Changes vs the brief's wording (accuracy): "uses" → "can use" (computer-use ingestion is a capability,
not built); "Linkup MCP" → "Linkup" (the web app calls the Linkup API; MCP is used by the risk agent
and the Claude Code skill); "schedules financial verification" → "schedules the bank check";
"Inspired by Sequoia's…" moved on screen (source line) to stay under 50 s.

## Scene timings

| Scene | Time | On screen |
|---|---|---|
| 1 Opportunity | 0.0–5.7 | demo transactions stream into the Kerdaxis node · YOUR AI CFO. FROM INSIGHT TO ACTION. |
| 2 Connect | 5.7–12.0 | MCP/APIs lane: Qonto LIVE (read-only via MCP), Sage + Pennylane ROADMAP · computer-use lane: apps with no API CAPABILITY, supplier portals LIVE (recorded run) · legend live / roadmap |
| 3 Orchestrate | 12.0–21.3 | node graph: Mastra centre; LLM · engine · Linkup · Qonto MCP · H Company agent · policy · human approval · ledger; "The LLM reasons. The engine calculates. The harness controls."; legend live in code / target architecture |
| 4 Market | 21.3–26.0 | Linkup market search (merchant + category only) · current Nuvio CRM €129/mo (demo) · 3 alternatives "price · source · date" (illustrative) · cancel / switch / downgrade / renegotiate |
| 5 Execute | 26.0–35.3 | REAL COMPUTER USE. — recorded H Company run: subscription → reason → offer, injected note boxed, IGNORED · HUMAN CONTROL. — agent halts on "Confirm cancellation", "Give the final go" |
| 6 Prove | 35.3–39.3 | FROM RECOMMENDATION TO VERIFIED EXECUTION. · NUV-RW3L2Y carried into the ledger · supplier-verified now, bank check "Scheduled · D+30" |
| 7 Services as Software | 39.3–46.9 | Sequoia source line · accounting firms / FDEs / SMEs · white-label dashboard (illustrative, roadmap) |
| Final | 46.9–49.9 | KERDAXIS · AI doesn't just find savings. It makes them happen. · kerdaxis.com |

## Technical accuracy checklist

- [x] Qonto shown LIVE and read-only (MCP read client + read-only guard in the code).
- [x] Sage and Pennylane shown ROADMAP (dashed).
- [x] Computer-use ingestion of apps without APIs shown as CAPABILITY, not live.
- [x] Computer-use execution on supplier portals shown LIVE only as the recorded run (7 Nov 2026, NUV-RW3L2Y), on a fictional demo supplier labelled as such.
- [x] Mastra: labelled "live in our risk agent · full router = target"; only Mastra→LLM and Mastra→Linkup edges are solid (implemented in lib/risk/mastra.ts); all other Mastra edges dashed "target architecture". The cancellation runner is its own state machine today.
- [x] The LLM never shown calculating: "The engine calculates", engine node "calculates every euro".
- [x] Policy & permissions = real mechanisms (hash-bound single-use approval, domain lock); human approval before the irreversible click (recorded).
- [x] Prompt injection shown as untrusted data, ignored (recorded).
- [x] Linkup alternatives labelled "Illustrative · no live search shown · prices only with source + date"; no price invented.
- [x] Supplier confirmation ≠ savings verified: "Supplier-verified now. Bank check at D+30", D+30 row never ticked.
- [x] White label + FDE distribution labelled "Go-to-market roadmap · illustrative dashboard"; clients B and C labelled illustrative.
- [x] Sequoia attribution: "Generative AI's Act o1" (2024), service-as-software thesis.
- [x] No customer, revenue or savings evidence invented. Demo data labelled.
- [x] Duration 49.9 s ≤ 50 s; captions on every voice line; mobile type ≥ 28 px.
