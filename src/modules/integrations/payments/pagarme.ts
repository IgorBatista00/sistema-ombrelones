import { AppError } from "@/lib/errors";
import { safeEqual } from "@/lib/crypto";
import type { PaymentStatus } from "@prisma/client";
import type { ChargeRequest, ChargeResult, PaymentProvider, WebhookEvent } from "./types";

/**
 * Adaptador Pagar.me (API Core v5). PENDENTE DE HOMOLOGAÇÃO com chaves
 * de teste (sk_test_/pk_test_). Cartão: tokenização no navegador com a
 * chave pública — o número do cartão nunca trafega pelo nosso servidor.
 * Webhook: autenticado por Basic Auth configurado no painel Pagar.me e,
 * em seguida, o status é reconsultado na API (não confiamos só no payload).
 */
const STATUS: Record<string, PaymentStatus> = {
  pending: "PENDING", processing: "PENDING", waiting_payment: "PENDING",
  authorized_pending_capture: "AUTHORIZED", paid: "PAID", overpaid: "PAID", underpaid: "FAILED",
  failed: "FAILED", not_authorized: "FAILED", canceled: "CANCELED", voided: "CANCELED",
  refunded: "REFUNDED", partial_refunded: "PARTIALLY_REFUNDED", chargedback: "CHARGEBACK",
};

export class PagarmeProvider implements PaymentProvider {
  readonly name = "pagarme";
  constructor(private baseUrl: string, private secretKey: string, private webhookUser: string, private webhookPassword: string) {}

  private async api<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new AppError("PAYMENT_PROVIDER_ERROR", "O provedor de pagamento recusou a solicitação.", 502, { status: res.status });
    return res.json() as Promise<T>;
  }

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    const payment =
      req.method === "PIX" ? { payment_method: "pix", pix: { expires_in: req.pixExpiresInSec ?? 3600 } }
      : req.method === "BOLETO" ? { payment_method: "boleto", boleto: { due_at: req.boletoDueAt?.toISOString(), document_number: req.orderNumber.replace(/\D/g, "") } }
      : { payment_method: "credit_card", credit_card: { installments: req.installments, card_token: req.cardToken, statement_descriptor: "MARCA" } };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await this.api<any>("/orders", {
      method: "POST",
      idempotencyKey: `order-${req.orderId}-${req.method}`,
      body: JSON.stringify({
        code: String(req.orderNumber),
        items: [{ amount: req.amountCents, description: `Pedido ${req.orderNumber}`, quantity: 1, code: String(req.orderNumber) }],
        customer: {
          name: req.customer.name, email: req.customer.email, type: "company",
          document: req.customer.document, document_type: "CNPJ",
          ...(req.customer.phone ? { phones: { mobile_phone: { country_code: "55", area_code: req.customer.phone.slice(0, 2), number: req.customer.phone.slice(2) } } } : {}),
        },
        payments: [{ ...payment, amount: req.amountCents }],
        metadata: { order_id: req.orderId },
      }),
    });
    const charge = order.charges?.[0];
    const tx = charge?.last_transaction ?? {};
    return {
      externalId: charge?.id ?? order.id,
      status: STATUS[charge?.status ?? order.status] ?? "PENDING",
      pixQrCode: tx.qr_code,
      pixQrCodeUrl: tx.qr_code_url,
      boletoUrl: tx.pdf ?? tx.url,
      boletoLine: tx.line,
      dueAt: tx.due_at ? new Date(tx.due_at) : tx.expires_at ? new Date(tx.expires_at) : undefined,
      failureReason: charge?.status === "failed" ? tx.acquirer_message ?? "Pagamento não autorizado" : undefined,
      raw: order,
    };
  }

  async verifyWebhook(req: Request, rawBody: string): Promise<WebhookEvent> {
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Basic ${Buffer.from(`${this.webhookUser}:${this.webhookPassword}`).toString("base64")}`;
    if (!this.webhookUser || !safeEqual(auth, expected)) throw new AppError("WEBHOOK_UNAUTHORIZED", "Webhook não autenticado.", 401);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse(rawBody) as any;
    const chargeId: string | null = body?.data?.id && String(body.type ?? "").startsWith("charge.") ? body.data.id : body?.data?.charges?.[0]?.id ?? null;

    // Fonte de verdade: reconsulta a cobrança na API.
    let status: PaymentStatus | null = null;
    if (chargeId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const charge = await this.api<any>(`/charges/${chargeId}`);
      status = STATUS[charge.status] ?? null;
    }
    return { eventId: String(body.id), type: String(body.type), chargeExternalId: chargeId, status, raw: body };
  }

  async refund(externalId: string, amountCents?: number) {
    await this.api(`/charges/${externalId}`, { method: "DELETE", body: JSON.stringify(amountCents ? { amount: amountCents } : {}) });
  }
}
