// ---------------------------------------------------------------------------
// Verrou d'accès de l'app exposée (app.kerdaxis.com via tunnel). Depuis la
// machine locale : libre. Depuis Internet : vitrine, pages d'accès et leurs API
// sont publiques ; le reste exige une session signée :
//   - kx_test (mot de passe de test) ou kx_session « member » (abonné Stripe)
//     → en-tête interne x-kx-test-auth=1 : agent H Company réel autorisé ;
//   - kx_session « trial » (e-mail seul) → x-kx-role=trial : Nuvio est REJOUÉ, aucun agent réel.
// Les deux en-têtes internes sont TOUJOURS effacés puis reposés ici : une
// valeur envoyée par le client n'est jamais prise telle quelle.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { isLocalHost, TEST_COOKIE, verifyTestCookie } from "@/lib/auth/test-access";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/user-session";

const PUBLIC = [
  /^\/$/,
  /^\/kerdaxis\.html$/,
  /^\/(login|try|signup|signin)$/,
  // Documents légaux : publics par obligation (mentions légales, CGV, RGPD).
  /^\/(mentions-legales|confidentialite|cgv|dpa|sous-traitants)$/,
  /^\/api\/(test-login|try|signup|signin|signout|me)$/,
  /^\/api\/try\/guest$/,
  /^\/api\/billing\/return$/,
  // API moteur : authentifiée par son propre Bearer (ENGINE_API_TOKENS), pas par cookie.
  /^\/api\/v1\/engine\/(analyze|simulate|health)$/,
  /^\/media\//,
  /^\/_next\//,
  /^\/favicon/,
];

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-kx-test-auth");
  headers.delete("x-kx-role");
  const local = isLocalHost(req.headers.get("host"));
  const tester = !local && (await verifyTestCookie(req.cookies.get(TEST_COOKIE)?.value));
  const session = local || tester ? null : await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const full = tester || session?.role === "member";
  if (full) headers.set("x-kx-test-auth", "1");
  else if (session?.role === "trial") headers.set("x-kx-role", "trial");
  const ok = local || full || session?.role === "trial";

  const path = req.nextUrl.pathname;
  if (!ok && !PUBLIC.some((r) => r.test(path))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  // Accueil = front Kerdaxis statique. Sur Cloudflare (OpenNext), la réécriture
  // `beforeFiles` de next.config vers un fichier de public/ ne sert rien (404) :
  // on la refait ici, où elle passe par la couche de routage qui voit les assets.
  if (path === "/") {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as
      | { env?: { ASSETS?: { fetch(u: string): Promise<Response> } } }
      | undefined;
    const assets = ctx?.env?.ASSETS;
    if (assets) {
      const page = await assets.fetch(new URL("/kerdaxis.html", req.url).toString());
      if (page.ok) {
        return new NextResponse(page.body, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
            "x-frame-options": "DENY",
            "x-content-type-options": "nosniff",
            "referrer-policy": "strict-origin-when-cross-origin",
            "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
          },
        });
      }
    }
    return NextResponse.rewrite(new URL("/kerdaxis.html", req.url), { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
