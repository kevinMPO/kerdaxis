import { NextResponse } from "next/server";
import { haiConfigured } from "@/lib/execution/hcompany";
import { getSupplier, reachableByAgent } from "@/lib/execution/suppliers";
import { noStore } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ce qui est réellement branché : l'interface n'annonce jamais du « live » à tort. */
export async function GET(req: Request): Promise<Response> {
  const nuvio = getSupplier("nuvio");
  const online = nuvio ? reachableByAgent(nuvio) : false;
  return noStore(
    NextResponse.json({
      hcompany: haiConfigured(),
      gladia: Boolean(process.env.GLADIA_API_KEY),
      // Seuls les portails joignables par le navigateur cloud de H sont exécutables.
      suppliers: nuvio && online ? [{ id: nuvio.id, vendor: nuvio.vendor, host: nuvio.allowedHost }] : [],
      portal: { configured: Boolean(nuvio), online },
      // Essai gratuit : l'agent est rejoué (session enregistrée), jamais lancé.
      replay: req.headers.get("x-kx-role") === "trial",
    }),
  );
}
