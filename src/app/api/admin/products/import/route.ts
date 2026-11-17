import { revalidatePath } from "next/cache";
import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/modules/auth/session";
import { commitImport, readSheet, validateImport } from "@/modules/products/excel";

/** POST /api/admin/products/import — multipart: file + mode=preview|commit. A prévia não grava nada. */
export const POST = route(async (req) => {
  const { user } = await requireAdmin("PRODUCTS");
  await rateLimit(`import:${user.id}`, 30, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("NO_FILE", "Selecione a planilha.");
  if (file.size > 5 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", "Planilha maior que 5 MB.");
  const rows = await readSheet(Buffer.from(await file.arrayBuffer()), file.name);
  if (form.get("mode") === "commit") {
    const r = await commitImport(user.id, rows);
    revalidatePath("/admin/produtos");
    return r;
  }
  return { rows: await validateImport(rows) };
});
