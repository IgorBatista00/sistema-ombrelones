import { db } from "@/lib/db";
import { toErrorResponse, AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { readDocument } from "@/modules/integrations/storage/private";

/**
 * GET /api/admin/financeiro/documentos/<id> — baixa/visualiza um documento. Exige permissão FINANCE.
 * PDF e imagens abrem no navegador (em sandbox); XML sempre baixa. Nunca fica em cache compartilhado.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin("FINANCE");
    const d = await db.financeDocument.findUnique({ where: { id: (await params).id } });
    if (!d || d.deletedAt) throw new AppError("NOT_FOUND", "Documento não encontrado.", 404);
    const buf = await readDocument(d.storageKey);
    const inline = d.mimeType !== "application/xml" && new URL(req.url).searchParams.get("baixar") !== "1";
    const name = encodeURIComponent(d.fileName);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": d.mimeType, "Content-Length": String(buf.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        // imagens: nada além da própria imagem; PDF usa o visualizador do navegador (CSP sandbox o bloquearia)
        ...(d.mimeType.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
