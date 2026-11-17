import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export interface ChargeRequest {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  method: PaymentMethod;
  installments: number;
  /** Token gerado NO NAVEGADOR pelo script do gateway. O servidor nunca vê o cartão. */
  cardToken?: string;
  boletoDueAt?: Date;
  pixExpiresInSec?: number;
  customer: { name: string; email: string; document: string; phone?: string | null };
  billingAddress?: { zipCode: string; street: string; number: string; district: string; city: string; state: string; complement?: string | null };
}

export interface ChargeResult {
  externalId: string;
  status: PaymentStatus;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
  boletoUrl?: string;
  boletoLine?: string;
  dueAt?: Date;
  failureReason?: string;
  raw: unknown;
}

export interface WebhookEvent {
  eventId: string;
  type: string;
  chargeExternalId: string | null;
  status: PaymentStatus | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
  /** Valida autenticidade e devolve evento normalizado; lança se inválido. */
  verifyWebhook(req: Request, rawBody: string): Promise<WebhookEvent>;
  refund(externalId: string, amountCents?: number): Promise<void>;
}
