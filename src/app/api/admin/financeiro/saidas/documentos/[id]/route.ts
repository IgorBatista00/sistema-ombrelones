import { db } from "@/lib/db";
import { AppError, toErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { openDocument } from "@/modules/integrations/storage/private";

/** GET — abre/baixa o anexo da saída (permissão FINANCE; nunca em cache compartilhado; XML sempre baixa). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin("FINANCE");
    const d = await db.expenseDocument.findUnique({ where: { id: (await params).id } });
    if (!d || d.deletedAt) throw new AppError("NOT_FOUND", "Documento não encontrado.", 404);
    const body = await openDocument(d.storageKey);
    const inline = d.mimeType !== "application/xml" && new URL(req.url).searchParams.get("baixar") !== "1";
    return new Response(body instanceof Buffer ? new Uint8Array(body) : (body as ReadableStream<Uint8Array>), { headers: {
      "Content-Type": d.mimeType, ...(body instanceof Buffer ? { "Content-Length": String(body.length) } : {}), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      ...(d.mimeType.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
    } });
  } catch (e) { return toErrorResponse(e); }
}
