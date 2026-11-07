import { NextResponse } from "next/server";
import { haiConfigured } from "@/lib/execution/hcompany";
import { getSupplier, reachableByAgent, SUPPLIER_IDS } from "@/lib/execution/suppliers";
import { linkupConfigured } from "@/lib/execution/research";
import { noStore } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ce qui est réellement branché : l'interface n'annonce jamais du « live » à tort. */
export async function GET(req: Request): Promise<Response> {
  const configured = SUPPLIER_IDS.map((id) => getSupplier(id)).filter((s) => s !== null);
  const nuvio = getSupplier("nuvio");
  return noStore(
    NextResponse.json({
      hcompany: haiConfigured(),
      gladia: Boolean(process.env.GLADIA_API_KEY),
      linkup: linkupConfigured(),
      // Seuls les fournisseurs joignables par le navigateur cloud de H sont exécutables.
      suppliers: configured
        .filter((s) => reachableByAgent(s))
        .map((s) => ({ id: s.id, vendor: s.vendor, host: s.allowedHost, playbook: s.guide.source })),
      portal: { configured: Boolean(nuvio), online: nuvio ? reachableByAgent(nuvio) : false },
      // Essai gratuit : l'agent est rejoué (session enregistrée), jamais lancé.
      replay: req.headers.get("x-kx-role") === "trial",
    }),
  );
}
