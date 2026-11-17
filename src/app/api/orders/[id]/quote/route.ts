import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { requireBuyer } from "@/modules/auth/session";
import { respondQuote } from "@/modules/orders/service";

/** POST /api/orders/:id/quote — cliente aceita ou recusa a cotação manual. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { accept } = await parseBody(req, z.object({ accept: z.boolean() }));
  await respondQuote(await requireBuyer(), (await params).id, accept);
  return { ok: true };
});
