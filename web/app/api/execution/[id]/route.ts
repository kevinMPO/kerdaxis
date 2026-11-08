import { NextResponse } from "next/server";
import { advanceExecution } from "@/lib/execution/runner";
import { advanceReplay } from "@/lib/execution/replay";
import { getExecution, publicView, withExecution } from "@/lib/execution/store";
import { noStore, execGuard } from "@/lib/execution/http";
import { withAccessScope } from "@/lib/privacy/access-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État de l'exécution ; chaque appel fait avancer la machine d'états (long-poll court). */
async function handleGet(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const { id } = await params;
  const current = await getExecution(id);
  if (!current) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  // Un compte d'essai ne voit que ses rediffusions, jamais une exécution réelle.
  if (g.mode === "replay" && !current.replay) return noStore(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  // Un autre sondage avance déjà cette exécution : on rend l'état lu, sans attendre.
  const done = await withExecution(id, async (exec) => {
    if (exec.replay) {
      advanceReplay(exec);
      return;
    }
    try {
      await advanceExecution(exec, 5);
    } catch (err) {
      exec.error = err instanceof Error ? err.message.slice(0, 200) : "erreur";
    }
  });
  if (done === null) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  return noStore(NextResponse.json(publicView(done === "busy" ? current : done.exec)));
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAccessScope(req, () => handleGet(req, context));
}
