import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { requireBuyer } from "@/modules/auth/session";
import { reorder } from "@/modules/cart/service";

export const POST = route(async (req) => {
  const { orderId } = await parseBody(req, z.object({ orderId: z.string() }));
  return reorder(await requireBuyer(), orderId);
});
