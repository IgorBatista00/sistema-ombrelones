import { revalidatePath } from "next/cache";
import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdminAny } from "@/modules/auth/session";
import { commitListingSheet, previewListingSheet } from "@/modules/mercadolivre/listing-import";

/** POST — planilha de anúncios do Mercado Livre (multipart: file + mode=preview|commit + custos padrão). A prévia não grava nada. */
export const POST = route(async (req) => {
  const { user } = await requireAdminAny(["PRODUCTS", "FINANCE"]);
  await rateLimit(`ml-listings:${user.id}`, 30, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("NO_FILE", "Selecione a planilha.");
  if (file.size > 15 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", "Planilha maior que 15 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (form.get("mode") === "commit") {
    const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : undefined; };
    const r = await commitListingSheet(user.id, buf, file.name, { taxPct: str("taxPct"), packaging: str("packaging"), shipping: str("shipping"), fixedFee: str("fixedFee"), other: str("other"), applyExisting: str("applyExisting") });
    revalidatePath("/admin/mercadolivre");
    return r;
  }
  return previewListingSheet(buf, file.name);
});
