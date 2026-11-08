import { NextResponse } from "next/server";
import { z } from "zod";
import { startExecution } from "@/lib/execution/runner";
import { startReplay, trialRunsReplay } from "@/lib/execution/replay";
import { checkApproval } from "@/lib/execution/policy";
import { getApproval, publicView, putApproval, putExecution } from "@/lib/execution/store";
import { DEMO_ORG, noStore, execGuard } from "@/lib/execution/http";
import { withAccessScope } from "@/lib/privacy/access-log";
import { runLangOf } from "@/lib/execution/run-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    approvalId: z.string().uuid(),
    /** Interface language: the run log and the agent's notes are written in it. */
    lang: z.enum(["fr", "en", "de", "es", "it"]).optional(),
  })
  .strict();

const TRIAL_REPLAY_ONLY_MESSAGE =
  "The free trial replays the recorded Nuvio CRM session. Live cancellations with the H Company agent are for subscribers.";

/** Lance l'agent H Company pour un accord donné (usage unique). */
async function handlePost(req: Request): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return noStore(NextResponse.json({ error: "invalid_body" }, { status: 400 }));

  const approval = await getApproval(parsed.data.approvalId);
  if (!approval) return noStore(NextResponse.json({ error: "approval_not_found" }, { status: 404 }));

  // Un essai ne lance jamais d'agent H Company réel (quota partagé, garde « un seul agent actif »
  // commune à tous) : seul le fournisseur enregistré est rejoué, les autres sont refusés AVANT de
  // consommer l'accord.
  const trial = g.mode === "trial";
  if (trial && !trialRunsReplay(approval.params.supplierId)) {
    return noStore(
      NextResponse.json({ error: "trial_replay_only", message: TRIAL_REPLAY_ONLY_MESSAGE }, { status: 403 }),
    );
  }

  try {
    let exec;
    if (trial) {
      // Essai gratuit sur le fournisseur de démo : mêmes contrôles d'accord (usage unique, TTL), puis rediffusion.
      const check = await checkApproval(approval, DEMO_ORG);
      if (!check.ok) throw new Error(`accord_invalide:${check.reason}`);
      exec = startReplay(approval, runLangOf(parsed.data.lang));
    } else {
      exec = await startExecution(approval, DEMO_ORG, runLangOf(parsed.data.lang));
    }
    // Usage unique : l'accord consommé (usedAt) est réécrit avant toute réponse.
    await putApproval(approval);
    await putExecution(exec);
    return noStore(NextResponse.json(publicView(exec)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "erreur";
    return noStore(NextResponse.json({ error: message }, { status: 409 }));
  }
}

export async function POST(req: Request): Promise<Response> {
  return withAccessScope(req, () => handlePost(req));
}
