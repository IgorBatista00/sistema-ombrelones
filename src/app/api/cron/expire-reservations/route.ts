import { expireReservations } from "@/modules/orders/service";

/** Tarefa agendada da Vercel (vercel.json › crons). A Vercel envia "Authorization: Bearer <CRON_SECRET>". */
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const r = await expireReservations();
  return Response.json({ ok: true, canceled: r.canceled });
}
