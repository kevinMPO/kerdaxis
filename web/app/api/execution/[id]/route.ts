import { NextResponse } from "next/server";
import { advanceExecution } from "@/lib/execution/runner";
import { advanceReplay } from "@/lib/execution/replay";
import { db, publicView } from "@/lib/execution/store";
import { noStore, execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État de l'exécution ; chaque appel fait avancer la machine d'états (long-poll court). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const { id } = await params;
  const exec = db.executions.get(id);
  if (!exec) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  // Un compte d'essai ne voit que ses rediffusions, jamais une exécution réelle.
  if (g.mode === "replay" && !exec.replay) return noStore(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  if (exec.replay) return noStore(NextResponse.json(publicView(advanceReplay(exec))));
  try {
    await advanceExecution(exec, 5);
  } catch (err) {
    exec.error = err instanceof Error ? err.message.slice(0, 200) : "erreur";
  }
  return noStore(NextResponse.json(publicView(exec)));
}
