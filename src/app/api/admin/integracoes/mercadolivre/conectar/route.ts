import { NextResponse } from "next/server";
import { requireAdmin } from "@/modules/auth/session";
import { authorizationUrl, isMlConfigured, pkce } from "@/modules/integrations/mercadolivre/client";

const back = (req: Request, status: string) => NextResponse.redirect(new URL(`/admin/financeiro?aba=mercadolivre&ml=${status}`, req.url));

/** Inicia o OAuth: guarda state + code_verifier em cookies httpOnly (10 min) e redireciona ao Mercado Livre. */
export async function GET(req: Request) {
  await requireAdmin("FINANCE");
  if (!isMlConfigured()) return back(req, "pendente");
  const p = pkce();
  const res = NextResponse.redirect(authorizationUrl(p.state, p.challenge));
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 600, path: "/api/admin/integracoes/mercadolivre" };
  res.cookies.set("ml_oauth_state", p.state, opts);
  res.cookies.set("ml_oauth_verifier", p.verifier, opts);
  return res;
}
