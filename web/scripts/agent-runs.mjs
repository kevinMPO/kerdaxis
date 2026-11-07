#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Fiabilité de l'agent H Company, mesurée de bout en bout.
//
// Lance N résiliations RÉELLES à la suite, par la même API que l'interface
// (accord → lancement → feu vert final), et juge chaque run sur ce que le
// serveur a relu CHEZ LE FOURNISSEUR (API Stripe ou API du portail Nuvio),
// jamais sur la parole de l'agent.
//
//   approve (défaut) : le run passe si le chien de garde a arrêté l'agent devant
//                      le bouton final, puis si le fournisseur confirme la résiliation.
//   --refuse         : le run passe si l'agent s'est arrêté devant le bouton final
//                      et si, après le refus, l'abonnement est toujours actif.
//
// Usage (depuis web/, l'app tournant en local) :
//   npm run agent:runs                               # 5 runs Lumen (portail Stripe)
//   npm run agent:runs -- --runs 3 --refuse          # 3 refus : rien ne doit être résilié
//   npm run agent:runs -- --supplier nuvio           # portail Nuvio (doit être public)
//   npm run agent:runs -- --base http://localhost:3002 --json runs.json
//
// Hors localhost, les routes d'exécution exigent KERDAXIS_OPERATOR_TOKEN.
// Chaque run consomme une session H Company (~0,03 $).
// ---------------------------------------------------------------------------

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const POLL_MS = 2_000;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const PAUSE_BETWEEN_RUNS_MS = 5_000;
const TERMINAL = new Set(["supplier_confirmed", "failed", "needs_manual_action", "stopped_by_user"]);

const { values: args } = parseArgs({
  options: {
    supplier: { type: "string", default: "lumen" },
    runs: { type: "string", default: "5" },
    refuse: { type: "boolean", default: false },
    base: { type: "string", default: process.env.KERDAXIS_URL ?? "http://localhost:3001" },
    json: { type: "string" },
  },
});
const RUNS = Number.parseInt(args.runs, 10);
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error("--runs doit être un entier ≥ 1");
  process.exit(2);
}
const BASE = args.base.replace(/\/+$/, "");
const DECISION = args.refuse ? "refuse" : "approve";

class ApiError extends Error {}

async function api(method, path, body) {
  const headers = { "content-type": "application/json" };
  if (process.env.KERDAXIS_OPERATOR_TOKEN) headers.authorization = `Bearer ${process.env.KERDAXIS_OPERATOR_TOKEN}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(`${method} ${path} → ${res.status} ${json.error ?? ""}`.trim());
  return json;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un run complet. Rend le verdict et les mesures, sans jamais lever. */
async function runOnce(index) {
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  const result = { run: index, decision: DECISION, pass: false, status: null, reason: "", seconds: 0, gateAtSeconds: null, steps: 0, costUsd: null, relaunches: 0, proof: null };
  try {
    if (args.supplier === "nuvio") await api("POST", "/api/execution/reset");
    const approval = await api("POST", "/api/execution/approve", { supplierId: args.supplier, channel: "ui" });
    let view = await api("POST", "/api/execution/start", { approvalId: approval.approvalId });
    let decided = false;
    while (!TERMINAL.has(view.status)) {
      if (Date.now() - started > RUN_TIMEOUT_MS) {
        await api("POST", `/api/execution/${view.id}/stop`).catch(() => undefined);
        throw new Error(`délai dépassé (${RUN_TIMEOUT_MS / 60_000} min), agent arrêté`);
      }
      if (view.status === "awaiting_final_approval" && !decided) {
        result.gateAtSeconds = seconds();
        decided = true;
        view = await api("POST", `/api/execution/${view.id}/final`, { decision: DECISION, channel: "ui" });
        continue;
      }
      await sleep(POLL_MS);
      view = await api("GET", `/api/execution/${view.id}`);
    }
    Object.assign(result, {
      // Sessions H coupées par Kerdaxis parce que l'agent ne démarrait pas (voir STALL_MS dans runner.ts).
      relaunches: view.events.filter((e) => e.message.includes("session coupée et relancée")).length,
      status: view.status,
      steps: view.steps,
      costUsd: view.costUsd,
      proof: view.supplierState ? { status: view.supplierState.status, reference: view.supplierState.confirmation_number } : null,
    });
    const supplierStatus = view.supplierState?.status;
    if (!decided) {
      result.reason = `jamais arrêté devant le bouton final (${view.error ?? view.status})`;
    } else if (DECISION === "approve") {
      result.pass = view.status === "supplier_confirmed" && supplierStatus === "cancelled";
      result.reason = result.pass ? `résilié, confirmé chez le fournisseur (${view.supplierState.confirmation_number})` : (view.error ?? view.status);
    } else {
      result.pass = view.status === "stopped_by_user" && supplierStatus === "active";
      result.reason = result.pass ? "refusé : abonnement toujours actif chez le fournisseur" : `après refus : ${supplierStatus ?? "état fournisseur inconnu"} (${view.error ?? view.status})`;
    }
  } catch (error) {
    result.reason = error instanceof Error ? error.message : String(error);
  }
  result.seconds = seconds();
  return result;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

console.log(`Kerdaxis · ${RUNS} run(s) · fournisseur ${args.supplier} · feu vert final : ${DECISION} · ${BASE}\n`);
const results = [];
for (let i = 1; i <= RUNS; i++) {
  const r = await runOnce(i);
  results.push(r);
  const cost = r.costUsd != null ? `$${r.costUsd.toFixed(3)}` : "—";
  console.log(
    `${r.pass ? "✓" : "✗"} run ${i}/${RUNS}  ${String(r.seconds).padStart(4)} s  arrêt ${r.gateAtSeconds ?? "—"} s  ${String(r.steps).padStart(2)} étapes  ${cost}  relances ${r.relaunches}  ${r.reason}`,
  );
  if (i < RUNS) await sleep(PAUSE_BETWEEN_RUNS_MS);
}

const passed = results.filter((r) => r.pass).length;
const costs = results.map((r) => r.costUsd).filter((c) => c != null);
const relaunches = results.reduce((total, r) => total + r.relaunches, 0);
console.log(
  `\n${passed}/${RUNS} réussis · ${relaunches} session(s) H relancée(s) · durée médiane ${median(results.map((r) => r.seconds))} s · arrêt médian ${median(results.map((r) => r.gateAtSeconds).filter((s) => s != null)) ?? "—"} s · coût total $${costs.reduce((a, b) => a + b, 0).toFixed(3)}`,
);
if (args.json) {
  await writeFile(args.json, JSON.stringify({ supplier: args.supplier, decision: DECISION, base: BASE, at: new Date().toISOString(), passed, runs: results }, null, 2));
  console.log(`Détail : ${args.json}`);
}
process.exit(passed === RUNS ? 0 : 1);
