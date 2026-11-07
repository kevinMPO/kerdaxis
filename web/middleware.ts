// ---------------------------------------------------------------------------
// Verrou d'accès de l'app exposée (app.kerdaxis.com via tunnel). Depuis la
// machine locale : libre. Depuis Internet : vitrine, pages d'accès et leurs API
// sont publiques ; le reste exige une session signée :
//   - kx_test (mot de passe de test) ou kx_session « member » (abonné Stripe)
//     → en-tête interne x-kx-test-auth=1 : agent H Company réel autorisé ;
//   - kx_session « trial » (e-mail seul) → x-kx-role=trial : l'agent est REJOUÉ.
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
  /^\/api\/(test-login|try|signup|signin|signout|me)$/,
  /^\/api\/billing\/return$/,
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
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
