import { NextResponse } from "next/server";
import { stopExecution } from "@/lib/execution/runner";
import { stopReplay } from "@/lib/execution/replay";
import { db, publicView } from "@/lib/execution/store";
import { noStore, execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Arrêt d'urgence : annule la session H Company. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const { id } = await params;
  const exec = db.executions.get(id);
  if (!exec) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  // Un compte d'essai ne voit que ses rediffusions, jamais une exécution réelle.
  if (g.mode === "replay" && !exec.replay) return noStore(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  if (exec.replay) stopReplay(exec);
  else await stopExecution(exec);
  return noStore(NextResponse.json(publicView(exec)));
}
