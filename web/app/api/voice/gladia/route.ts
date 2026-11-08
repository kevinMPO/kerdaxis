import { NextResponse } from "next/server";
import { z } from "zod";
import { noStore, operatorGuard } from "@/lib/execution/http";
import { withAccessScope } from "@/lib/privacy/access-log";
import { recordAccess } from "@/lib/privacy/access-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Ouvre une session de transcription en direct Gladia (POST /v2/live).
// La clé GLADIA_API_KEY reste ici : le navigateur ne reçoit que l'URL
// WebSocket à jeton temporaire, à laquelle le SDK officiel se connecte
// (`connectSession`). Format audio imposé : PCM 16 bits, 16 kHz, mono.
// ---------------------------------------------------------------------------

const Body = z.object({ lang: z.string().max(5).default("fr") }).strict();

const VOCABULARY = ["Kerdaxis", "Nuvio", "Qonto", "Instantly", "ChatGPT", "Waalaxy", "Autopilote", "H Company", "Linkup"];

async function handlePost(req: Request): Promise<Response> {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const key = process.env.GLADIA_API_KEY;
  if (!key) return noStore(NextResponse.json({ error: "gladia_not_configured" }, { status: 503 }));

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return noStore(NextResponse.json({ error: "invalid_body" }, { status: 400 }));
  const primary = parsed.data.lang === "en" ? "en" : "fr";

  void recordAccess({ service: "gladia", operation: "live transcription", direction: "sent", sent: "microphone audio of this voice command" });
  const res = await fetch("https://api.gladia.io/v2/live", {
    method: "POST",
    headers: { "x-gladia-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      model: "solaria-1",
      encoding: "wav/pcm",
      sample_rate: 16000,
      bit_depth: 16,
      channels: 1,
      language_config: { languages: [primary, primary === "fr" ? "en" : "fr"], code_switching: false },
      // Commande vocale : une phrase, puis on agit. Fin de phrase après ~0,4 s de silence.
      endpointing: 0.4,
      maximum_duration_without_endpointing: 12,
      realtime_processing: {
        custom_vocabulary: true,
        custom_vocabulary_config: { vocabulary: VOCABULARY },
      },
      messages_config: { receive_partial_transcripts: true },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    return noStore(NextResponse.json({ error: `gladia_${res.status}`, detail }, { status: 502 }));
  }
  const session = (await res.json()) as { id: string; url: string; created_at?: string };
  return noStore(NextResponse.json({ id: session.id, url: session.url, created_at: session.created_at }));
}

export async function POST(req: Request): Promise<Response> {
  return withAccessScope(req, () => handlePost(req));
}
