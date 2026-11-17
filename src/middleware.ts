import { NextResponse, type NextRequest } from "next/server";

/** Barreira rápida (sem banco): sem cookie de sessão, redireciona para login.
 *  A autorização real (papel/permissão) é feita no servidor em cada página e rota. */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("b2b_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*", "/minha-conta/:path*", "/orcamento/:path*"] };
