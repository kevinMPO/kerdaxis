import { NextResponse } from "next/server";
import { z } from "zod";
import { startExecution } from "@/lib/execution/runner";
import { startReplay } from "@/lib/execution/replay";
import { checkApproval } from "@/lib/execution/policy";
import { db, publicView } from "@/lib/execution/store";
import { DEMO_ORG, noStore, execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ approvalId: z.string().uuid() }).strict();

/** Lance l'agent H Company pour un accord donné (usage unique). */
export async function POST(req: Request): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return noStore(NextResponse.json({ error: "invalid_body" }, { status: 400 }));

  const approval = db.approvals.get(parsed.data.approvalId);
  if (!approval) return noStore(NextResponse.json({ error: "approval_not_found" }, { status: 404 }));

  try {
    let exec;
    if (g.mode === "replay") {
      // Essai gratuit : mêmes contrôles d'accord (usage unique, TTL), puis rediffusion.
      const check = await checkApproval(approval, DEMO_ORG);
      if (!check.ok) throw new Error(`accord_invalide:${check.reason}`);
      exec = startReplay(approval);
    } else {
      exec = await startExecution(approval, DEMO_ORG);
    }
    return noStore(NextResponse.json(publicView(exec)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "erreur";
    return noStore(NextResponse.json({ error: message }, { status: 409 }));
  }
}
