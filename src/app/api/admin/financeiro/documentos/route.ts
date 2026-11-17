import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/modules/auth/session";
import { attachDocument } from "@/modules/finance/documents";

/** POST /api/admin/financeiro/documentos — anexa NF/boleto/comprovante a uma venda (multipart: saleId, receivableId?, type, description?, files). */
export const POST = route(async (req) => {
  const { user } = await requireAdmin("FINANCE");
  await rateLimit(`fin-doc:${user.id}`, 120, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  return attachDocument({ id: user.id, name: user.name }, form);
});
