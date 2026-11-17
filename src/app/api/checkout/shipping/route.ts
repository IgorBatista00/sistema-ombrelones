import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { rateLimit } from "@/lib/rate-limit";
import { requireBuyer } from "@/modules/auth/session";
import { quoteCartShipping } from "@/modules/orders/service";

/** POST /api/checkout/shipping — cotação automática para o carrinho atual. */
export const POST = route(async (req) => {
  const ctx = await requireBuyer();
  const { addressId } = await parseBody(req, z.object({ addressId: z.string() }));
  await rateLimit(`ship-quote:${ctx.user.id}`, 30, 600);
  return quoteCartShipping(ctx, addressId);
});
