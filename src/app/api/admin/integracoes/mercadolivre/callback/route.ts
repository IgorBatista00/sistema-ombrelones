import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { completeConnection } from "@/modules/integrations/mercadolivre/service";

/** Retorno do OAuth: confere o state, troca o código por tokens e volta para a aba do Mercado Livre. */
export async function GET(req: NextRequest) {
  const { user } = await requireAdmin("FINANCE");
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/admin/financeiro?aba=mercadolivre&ml=${status}`, req.url));
    res.cookies.delete({ name: "ml_oauth_state", path: "/api/admin/integracoes/mercadolivre" });
    res.cookies.delete({ name: "ml_oauth_verifier", path: "/api/admin/integracoes/mercadolivre" });
    return res;
  };
  const url = new URL(req.url);
  const code = url.searchParams.get("code"), state = url.searchParams.get("state") ?? "";
  const saved = req.cookies.get("ml_oauth_state")?.value ?? "", verifier = req.cookies.get("ml_oauth_verifier")?.value ?? "";
  if (url.searchParams.get("error")) return back("negado");
  const sameState = saved.length > 0 && saved.length === state.length && timingSafeEqual(Buffer.from(saved), Buffer.from(state));
  if (!code || !verifier || !sameState) return back("invalido");
  try {
    await completeConnection(user.id, code, verifier);
    return back("conectado");
  } catch (e) {
    console.error("mercadolivre.callback", e instanceof AppError ? e.code : "erro"); // nunca registrar código/tokens
    return back("erro");
  }
}
