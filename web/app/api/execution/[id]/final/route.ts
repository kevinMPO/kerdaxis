import { NextResponse } from "next/server";
import { z } from "zod";
import { decideFinal } from "@/lib/execution/runner";
import { decideReplay } from "@/lib/execution/replay";
import { db, publicView } from "@/lib/execution/store";
import { noStore, execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feu vert (ou refus) final, au moment où l'agent attend devant le bouton
 * irréversible. Uniquement par un clic dans l'interface : la voix ne peut pas
 * donner ce feu vert (PRD Kerdaxis, QA §10).
 */
const Body = z.object({ decision: z.enum(["approve", "refuse"]), channel: z.literal("ui") }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const { id } = await params;
  const exec = db.executions.get(id);
  if (!exec) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  // Un compte d'essai ne voit que ses rediffusions, jamais une exécution réelle.
  if (g.mode === "replay" && !exec.replay) return noStore(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const parsed = Body.safeParse(await req.json().catch(() => null));
  // NB : `decideFinal` exige l'état awaiting_final_approval, atteint seulement
  // quand l'agent est arrêté devant la confirmation finale (pause Kerdaxis ou fin de tour 1).
  if (!parsed.success) return noStore(NextResponse.json({ error: "invalid_body" }, { status: 400 }));
  try {
    if (exec.replay) decideReplay(exec, parsed.data.decision);
    else await decideFinal(exec, parsed.data.decision);
    return noStore(NextResponse.json(publicView(exec)));
  } catch (err) {
    return noStore(NextResponse.json({ error: err instanceof Error ? err.message : "erreur" }, { status: 409 }));
  }
}
