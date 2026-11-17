import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/health — verificação da hospedagem: o app responde e o banco está acessível. Não expõe dados. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
