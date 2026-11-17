import { route, parseBody } from "@/lib/route";
import { requireBuyer } from "@/modules/auth/session";
import { startPayment, startPaymentSchema } from "@/modules/orders/service";

/** POST /api/orders/:id/pay — cria cobrança no gateway. Status "pago" só via webhook. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const p = await startPayment(await requireBuyer(), (await params).id, await parseBody(req, startPaymentSchema));
  return { id: p.id, method: p.method, status: p.status, pixQrCode: p.pixQrCode, pixQrCodeUrl: p.pixQrCodeUrl, boletoUrl: p.boletoUrl, boletoLine: p.boletoLine, dueAt: p.dueAt, failureReason: p.failureReason };
});
