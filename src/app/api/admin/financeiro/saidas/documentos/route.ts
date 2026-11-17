import { route } from "@/lib/route";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/modules/auth/session";
import { attachExpenseDocument } from "@/modules/finance/expenses";

/** POST — anexa boleto/NF/comprovante a uma saída (multipart: expenseId, type, files). */
export const POST = route(async (req) => {
  const { user } = await requireAdmin("FINANCE");
  await rateLimit(`exp-doc:${user.id}`, 120, 600);
  const form = await req.formData().catch(() => { throw new AppError("BAD_FORM", "Envio inválido."); });
  return attachExpenseDocument({ id: user.id, name: user.name }, form);
});
