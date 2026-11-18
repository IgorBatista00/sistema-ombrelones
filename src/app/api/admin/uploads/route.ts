import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdminAny } from "@/modules/auth/session";
import { saveImage } from "@/modules/integrations/storage";
import { formUploads, uploadName } from "@/modules/integrations/storage/uploads";

/** POST /api/admin/uploads — envio múltiplo de fotos (multipart, campo "files"). Admin com PRODUCTS ou ORDERS (fotos de orçamento). */
export const POST = route(async (req) => {
  const { user } = await requireAdminAny(["PRODUCTS", "ORDERS"]);
  await rateLimit(`upload:${user.id}`, 120, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  const files = formUploads(form);
  if (!files.length) throw new AppError("NO_FILES", "Selecione ao menos uma imagem.");
  if (files.length > 20) throw new AppError("TOO_MANY", "Envie até 20 imagens por vez.");
  const saved = [];
  for (const f of files) saved.push({ ...(await saveImage(f, uploadName(f))), name: uploadName(f) });
  return saved;
});
