import { NextResponse } from "next/server";
import { getSupplier, readSupplierState, resetSupplier } from "@/lib/execution/suppliers";
import { noStore, operatorGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Remet le portail de démo à « abonnement actif », pour rejouer la démo. */
export async function POST(req: Request): Promise<Response> {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const supplier = getSupplier("nuvio");
  if (!supplier) return noStore(NextResponse.json({ error: "supplier_not_configured" }, { status: 409 }));
  try {
    await resetSupplier(supplier);
    const state = await readSupplierState(supplier);
    return noStore(NextResponse.json({ ok: true, status: state.status }));
  } catch (err) {
    return noStore(NextResponse.json({ error: err instanceof Error ? err.message : "erreur" }, { status: 502 }));
  }
}
