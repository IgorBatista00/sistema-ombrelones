import { toErrorResponse } from "@/lib/errors";
import { readLocal } from "@/modules/integrations/storage";

/** GET /api/media/<chave> — imagens do armazenamento local (dev/homologação). */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const { buf, type } = await readLocal((await params).key.join("/"));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return toErrorResponse(e);
  }
}
