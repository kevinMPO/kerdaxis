import { NextResponse } from "next/server";
import { stopExecution } from "@/lib/execution/runner";
import { stopReplay } from "@/lib/execution/replay";
import { getExecution, publicView, withExecution } from "@/lib/execution/store";
import { noStore, execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Arrêt d'urgence : annule la session H Company. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const { id } = await params;
  const exec = await getExecution(id);
  if (!exec) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  // Un compte d'essai ne voit que ses rediffusions, jamais une exécution réelle.
  if (g.mode === "replay" && !exec.replay) return noStore(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const done = await withExecution(
    id,
    async (e) => {
      if (e.replay) stopReplay(e);
      else await stopExecution(e);
    },
    { wait: true },
  );
  if (done === null) return noStore(NextResponse.json({ error: "not_found" }, { status: 404 }));
  if (done === "busy") return noStore(NextResponse.json({ error: "busy_retry" }, { status: 409 }));
  return noStore(NextResponse.json(publicView(done.exec)));
}
