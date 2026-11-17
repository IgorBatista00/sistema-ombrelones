import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { requireBuyer } from "@/modules/auth/session";
import { addToCart, getPricedCart, setCartItem } from "@/modules/cart/service";

const item = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(0).max(100_000) });

export const GET = route(async () => getPricedCart(await requireBuyer()));
/** POST soma à quantidade existente; PATCH define a quantidade (0 remove). */
export const POST = route(async (req) => {
  const ctx = await requireBuyer();
  const { variantId, quantity } = await parseBody(req, item.extend({ quantity: z.number().int().min(1).max(100_000) }));
  await addToCart(ctx, variantId, quantity);
  return getPricedCart(ctx);
});
export const PATCH = route(async (req) => {
  const ctx = await requireBuyer();
  const { variantId, quantity } = await parseBody(req, item);
  await setCartItem(ctx, variantId, quantity);
  return getPricedCart(ctx);
});
