import { NextResponse } from "next/server";
import { z } from "zod";
import { createApproval } from "@/lib/execution/policy";
import { getSupplier } from "@/lib/execution/suppliers";
import { db } from "@/lib/execution/store";
import { DEMO_ORG, noStore, execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ supplierId: z.string().max(40), channel: z.enum(["ui", "voice"]).default("ui") }).strict();

/**
 * Accord humain sur une action précise. Les paramètres viennent du catalogue
 * serveur, jamais du client : le navigateur ne choisit que le fournisseur.
 */
export async function POST(req: Request): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return noStore(NextResponse.json({ error: "invalid_body" }, { status: 400 }));

  const supplier = getSupplier(parsed.data.supplierId);
  if (!supplier) return noStore(NextResponse.json({ error: "supplier_not_configured" }, { status: 409 }));

  const approval = await createApproval(
    {
      orgId: DEMO_ORG,
      supplierId: supplier.id,
      vendor: supplier.vendor,
      account: supplier.account,
      action: "cancel",
      plan: supplier.plan,
      monthlyCents: supplier.monthlyCents,
      currency: supplier.currency,
      allowedHost: supplier.allowedHost,
    },
    "demo-owner",
    parsed.data.channel,
  );
  db.approvals.set(approval.id, approval);

  return noStore(
    NextResponse.json({
      approvalId: approval.id,
      actionHash: approval.actionHash,
      expiresAt: approval.expiresAt,
      action: {
        vendor: approval.params.vendor,
        plan: approval.params.plan,
        account: approval.params.account,
        monthlyCents: approval.params.monthlyCents,
        host: approval.params.allowedHost,
      },
    }),
  );
}
