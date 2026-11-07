import { NextResponse } from "next/server";
import { getExecution } from "@/lib/execution/store";
import { execGuard } from "@/lib/execution/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dernière capture d'écran de l'agent, relayée par notre serveur : la CSP de
 * l'app n'autorise que les images de notre origine, et l'URL d'origine n'est
 * jamais exposée au navigateur.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = execGuard(req);
  if ("denied" in g) return g.denied;
  const { id } = await params;
  const exec = await getExecution(id);
  if (g.mode === "replay" && !exec?.replay) return new NextResponse(null, { status: 403 });
  const shot = exec?.lastScreenshot;
  if (!shot) return new NextResponse(null, { status: 404 });
  // Rediffusion : capture enregistrée servie depuis notre propre origine.
  if (exec?.replay && /^\/replay\/obs-\d{2}-[a-z0-9-]+\.png$/.test(shot)) {
    return new NextResponse(null, { status: 302, headers: { Location: shot, "Cache-Control": "no-store" } });
  }

  let url: URL;
  try {
    url = new URL(shot);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (url.protocol !== "https:") return new NextResponse(null, { status: 404 });

  // La clé n'est envoyée qu'à l'API H Company elle-même, jamais à un autre hôte.
  const headers: Record<string, string> = {};
  if (/(^|\.)hcompany\.ai$/.test(url.hostname) && process.env.HAI_API_KEY) {
    headers.Authorization = `Bearer ${process.env.HAI_API_KEY}`;
  }
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok || !res.body) return new NextResponse(null, { status: 502 });
  const type = res.headers.get("content-type") ?? "image/png";
  if (!type.startsWith("image/")) return new NextResponse(null, { status: 502 });
  return new NextResponse(res.body, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
}
