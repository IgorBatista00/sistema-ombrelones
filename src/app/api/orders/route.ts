import { route, parseBody } from "@/lib/route";
import { requireBuyer } from "@/modules/auth/session";
import { checkoutSchema, createOrder } from "@/modules/orders/service";

/** POST /api/orders — cria pedido a partir do carrinho (idempotente). */
export const POST = route(async (req) => {
  const ctx = await requireBuyer();
  const order = await createOrder(ctx, await parseBody(req, checkoutSchema));
  return { id: order.id, number: order.number, code: order.code, commercialStatus: order.commercialStatus };
});
