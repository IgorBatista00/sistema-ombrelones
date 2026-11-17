import { revalidatePath } from "next/cache";
import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/modules/auth/session";
import { setBoleto, setInvoice } from "@/modules/finance/billing";

/** POST — informar NF da venda (kind=nf: saleId, number, date, files?) ou boleto da parcela (kind=boleto: receivableId, number?, files?). */
export const POST = route(async (req) => {
  const { user } = await requireAdmin("FINANCE");
  await rateLimit(`billing:${user.id}`, 200, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  const actor = { id: user.id, name: user.name };
  const kind = form.get("kind");
  const r = kind === "nf" ? await setInvoice(actor, form) : kind === "boleto" ? await setBoleto(actor, form) : (() => { throw new AppError("VALIDATION", "Ação inválida."); })();
  revalidatePath("/admin/financeiro"); revalidatePath("/admin/meu-dia");
  return r ?? { ok: true };
});
