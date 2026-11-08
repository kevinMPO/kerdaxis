// ---------------------------------------------------------------------------
// POST /api/cancel-channel : déclenché SUR ACCORD (règle 3), par le même clic
// que « vérifier les prix ». Linkup dit si le fournisseur se résilie en ligne ;
// la réponse choisit le livrable (agent H Company ou lettre).
//
// ACCÈS : ouvert mais PLAFONNÉ par IP, comme /api/benchmark (la démo publique
// l'appelle sans session). Un résultat en cache D1 est servi AVANT le plafond.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { z } from "zod";
import { reponseTropDeRequetes, verifierDebit } from "@/lib/api/rate-limit";
import { cachedCancelChannel, checkCancelChannel } from "@/lib/execution/research/cancel-channel";
import { withAccessScope } from "@/lib/privacy/access-log";
import type { CancelChannelCheck } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MERCHANT_LENGTH = 120;

const ChannelBody = z.object({ merchant: z.string().trim().min(1).max(MAX_MERCHANT_LENGTH) }).strict();

async function handlePost(request: Request): Promise<Response> {
  let merchant: string;
  try {
    merchant = ChannelBody.parse(await request.json()).merchant;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Corps attendu : { merchant }." } }, { status: 400 });
  }

  const hit = await cachedCancelChannel(merchant);
  if (hit) return NextResponse.json(hit);

  const debit = await verifierDebit(request, "cancel_channel");
  if (!debit.autorise) {
    const unknown: CancelChannelCheck = { channel: "unknown", sourceUrl: "", checkedAt: new Date().toISOString().slice(0, 10) };
    return reponseTropDeRequetes(debit, { ...unknown });
  }

  return NextResponse.json(await checkCancelChannel(merchant));
}

export async function POST(request: Request): Promise<Response> {
  return withAccessScope(request, () => handlePost(request));
}
