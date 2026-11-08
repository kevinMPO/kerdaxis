#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Records ONE real cancellation run so the free trial can replay it.
//
// Drives the run through the same API as the interface (approval, launch,
// human final go), then reads the whole H Company session back from the
// Agents API: every observation with its timestamp, page URL and screenshot.
// Screenshots land in public/replay/<supplier>/, the timeline in
// scripts/recordings/<supplier>.json. Nothing is invented: replay.ts is
// written from that file.
//
// Usage (from web/, the app running locally, HAI_API_KEY in .env.local):
//   node --env-file=.env.local scripts/record-replay.mjs --supplier lumen
//   ... --session <H session id>   re-reads a session already run, without a new run
//
// One run spends one H Company session (about $0.03). For Lumen it cancels a
// fresh Stripe TEST subscription of the fictional customer Acme Conseil SAS.
// ---------------------------------------------------------------------------

import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const POLL_MS = 1_500;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const TERMINAL = new Set(["supplier_confirmed", "failed", "needs_manual_action", "stopped_by_user"]);
const HAI_BASE = (process.env.HAI_BASE_URL ?? "https://agp.eu.hcompany.ai/api/v2").replace(/\/+$/, "");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const { values: args } = parseArgs({
  options: {
    supplier: { type: "string", default: "lumen" },
    base: { type: "string", default: "http://localhost:3001" },
    session: { type: "string" },
  },
});
const BASE = args.base.replace(/\/+$/, "");
const SUPPLIER = args.supplier;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error ?? ""} ${json.message ?? ""}`.trim());
  return json;
}

function haiKey() {
  const key = process.env.HAI_API_KEY;
  if (!key) throw new Error("HAI_API_KEY missing: run with --env-file=.env.local");
  return key;
}

async function hai(path) {
  const res = await fetch(`${HAI_BASE}${path}`, { headers: { Authorization: `Bearer ${haiKey()}` } });
  if (!res.ok) throw new Error(`H Company ${res.status} ${path.split("?")[0]}`);
  return res.status === 204 ? null : res.json();
}

/** Drives the run and returns the final public view, with the moment of each milestone. */
async function drive() {
  const approval = await api("POST", "/api/execution/approve", { supplierId: SUPPLIER, channel: "ui" });
  let view = await api("POST", "/api/execution/start", { approvalId: approval.approvalId });
  const started = Date.now();
  let gateSeenAt = null;
  let goGivenAt = null;
  while (!TERMINAL.has(view.status)) {
    if (Date.now() - started > RUN_TIMEOUT_MS) throw new Error("run timed out");
    if (view.status === "awaiting_final_approval" && !goGivenAt) {
      gateSeenAt = new Date().toISOString();
      console.log(`gate reached after ${Math.round((Date.now() - started) / 1000)} s, giving the final go`);
      goGivenAt = new Date().toISOString();
      view = await api("POST", `/api/execution/${view.id}/final`, { decision: "approve", channel: "ui" });
      continue;
    }
    await sleep(POLL_MS);
    view = await api("GET", `/api/execution/${view.id}`);
    process.stdout.write(`\r${view.status} · ${view.steps} steps   `);
  }
  console.log(`\nrun ended: ${view.status}`);
  return { view, gateSeenAt, goGivenAt };
}

/** Every event of the H session(s), in order, from the Agents API. */
async function sessionEvents(sessionId) {
  const events = [];
  for (let from = 0; ; ) {
    const changes = await hai(`/sessions/${sessionId}/changes?from_index=${from}&wait_for_seconds=0`);
    const batch = changes?.new_events ?? [];
    if (batch.length === 0) break;
    events.push(...batch);
    from = (changes.first_index ?? from) + batch.length;
  }
  return events;
}

const run = args.session ? null : await drive();
if (run && run.view.status !== "supplier_confirmed") {
  console.error(`Not recorded: the run ended as ${run.view.status} (${run.view.error ?? "no error"}). Nothing written.`);
  process.exit(1);
}
const sessionId = args.session ?? run.view.agentViewUrl?.match(UUID)?.[0];
if (!sessionId) throw new Error("no H session id in agentViewUrl");

const events = await sessionEvents(sessionId);
const recording = {
  supplier: SUPPLIER,
  sessionId,
  recordedAt: events[0]?.timestamp ?? null,
  gateSeenAt: run?.gateSeenAt ?? null,
  goGivenAt: run?.goGivenAt ?? null,
  status: run?.view.status ?? null,
  steps: run?.view.steps ?? null,
  costUsd: run?.view.costUsd ?? null,
  confirmationNumber: run?.view.confirmationNumber ?? null,
  supplierState: run?.view.supplierState ?? null,
  observations: [],
  agentNotes: events
    .filter((ev) => ev.type === "AgentEvent" && ev.data?.kind === "policy_event" && typeof ev.data.content === "string")
    .map((ev) => ({ at: ev.timestamp, text: ev.data.content.trim().slice(0, 280) }))
    .filter((note) => note.text),
  answers: events.filter((ev) => ev.data?.kind === "answer_event").map((ev) => ({ at: ev.timestamp, answer: ev.data.answer })),
  log: run ? run.view.events.map(({ at, kind, message, url }) => ({ at, kind, message, url })) : [],
};
await mkdir(new URL("./recordings/", import.meta.url), { recursive: true });
const out = new URL(`./recordings/${SUPPLIER}.json`, import.meta.url);
const save = () => writeFile(out, JSON.stringify(recording, null, 2));
// Written before the screenshots, so a failed download never loses the run.
await save();

const dir = new URL(`../public/replay/${SUPPLIER}/`, import.meta.url);
await mkdir(dir, { recursive: true });
for (const ev of events) {
  const d = ev.data ?? {};
  if (ev.type !== "AgentEvent" || d.kind !== "observation_event") continue;
  const src = d.image?.type === "url" ? d.image.source : null;
  if (typeof src !== "string") continue;
  const n = String(recording.observations.length + 1).padStart(2, "0");
  const clock = ev.timestamp.slice(11, 19).replaceAll(":", "");
  const file = `obs-${n}-${clock}.png`;
  // The key goes to the H Company API only, never to another host.
  const headers = /(^|\.)hcompany\.ai$/.test(new URL(src).hostname) ? { Authorization: `Bearer ${haiKey()}` } : {};
  const img = await fetch(src, { headers });
  if (!img.ok) throw new Error(`screenshot ${n}: ${img.status}`);
  await writeFile(new URL(file, dir), Buffer.from(await img.arrayBuffer()));
  const url = typeof d.metadata?.url === "string" ? new URL(d.metadata.url) : null;
  recording.observations.push({ at: ev.timestamp, file, path: url ? `${url.origin}${url.pathname}` : null, title: d.metadata?.title ?? "" });
}
await save();
console.log(`${recording.observations.length} screenshots in public/replay/${SUPPLIER}/, timeline in scripts/recordings/${SUPPLIER}.json`);
