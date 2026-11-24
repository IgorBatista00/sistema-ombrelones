import { revalidatePath } from "next/cache";
import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdminAny } from "@/modules/auth/session";
import { commitMlSheet, previewMlSheet } from "@/modules/integrations/mercadolivre/sheet-import";

/** POST — planilha de vendas do Mercado Livre (multipart: file + mode=preview|commit). A prévia não grava nada. */
export const POST = route(async (req) => {
  const { user } = await requireAdminAny(["FINANCE", "ORDERS"]);
  await rateLimit(`ml-sheet:${user.id}`, 30, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("NO_FILE", "Selecione a planilha.");
  if (file.size > 15 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", "Planilha maior que 15 MB — exporte um período menor.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (form.get("mode") === "commit") {
    const r = await commitMlSheet(user.id, buf, file.name);
    revalidatePath("/admin/financeiro"); revalidatePath("/admin/meu-dia");
    return r;
  }
  return previewMlSheet(buf, file.name);
});
