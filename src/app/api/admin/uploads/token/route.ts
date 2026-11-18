import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { AppError, toErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin, requireAdminAny } from "@/modules/auth/session";
import { BLOB_PREFIX, blobToken, isBlob, type BlobKind } from "@/modules/integrations/storage/blob";

/**
 * POST /api/admin/uploads/token — autoriza o navegador a enviar UM arquivo direto ao Vercel Blob
 * (contorna o limite de 4,5 MB por requisição da Vercel). O token vale poucos minutos, só para a pasta,
 * os tipos e o tamanho permitidos. Depois, o servidor ainda confere o conteúdo real antes de registrar.
 */
const RULES: Record<BlobKind, { types: string[]; max: number }> = {
  image: { types: ["image/jpeg", "image/png", "image/webp", "image/avif"], max: 8 * 1024 * 1024 },
  doc: { types: ["application/pdf", "application/xml", "text/xml", "image/jpeg", "image/png", "image/webp"], max: 15 * 1024 * 1024 },
};

export async function POST(request: Request) {
  try {
    if (!isBlob()) throw new AppError("NOT_AVAILABLE", "Envio direto de arquivos não está ativo neste ambiente.", 400);
    const body = (await request.json()) as HandleUploadBody;
    const kind: BlobKind = (() => { try { return JSON.parse(body.type === "blob.generate-client-token" ? body.payload.clientPayload ?? "{}" : "{}").kind === "doc" ? "doc" : "image"; } catch { return "image"; } })();
    const json = await handleUpload({
      body, request, token: blobToken(kind),
      onBeforeGenerateToken: async (pathname) => {
        const { user } = kind === "doc" ? await requireAdmin("FINANCE") : await requireAdminAny(["PRODUCTS", "ORDERS"]);
        await rateLimit(`blob:${user.id}`, 200, 600);
        if (!pathname.startsWith(BLOB_PREFIX[kind]) || pathname.includes("..")) throw new AppError("FILE_REF", "Destino do arquivo inválido.", 400);
        return { allowedContentTypes: RULES[kind].types, maximumSizeInBytes: RULES[kind].max, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return toErrorResponse(e);
  }
}
