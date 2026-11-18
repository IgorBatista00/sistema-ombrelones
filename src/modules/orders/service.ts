import "server-only";
import { z } from "zod";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPricedCart, type PricedCart } from "@/modules/cart/service";
import { DEFAULT_PRICE_LIST } from "@/modules/pricing";
import { getShippingProvider, type ShippingVolume } from "@/modules/integrations/shipping";
import { getPaymentProvider } from "@/modules/integrations/payments";
import { sendEmail } from "@/modules/integrations/email";
import { reservationExpiry, type PaymentMethodKey } from "@/modules/inventory/availability";
import { consumeReservations, extendReservations, releaseReservations, reserveStock } from "@/modules/inventory/reservations";
import { transition } from "./transition";
import { docCode, nextDocNumber } from "@/lib/doc-code";
import { appUrl } from "@/lib/app-url";

type BuyerCtx = { user: { id: string; name: string; email: string }; company: { id: string; cnpj: string; legalName: string; tradeName: string | null } };

export interface CommercialSettings {
  reservationMinutes: Record<PaymentMethodKey, number>;
  quoteReservationHours: number;
  enabledMethods: PaymentMethodKey[];
  maxInstallments: number;
  boletoDueDays: number;
}

export async function getCommercialSettings(): Promise<CommercialSettings> {
  const s = await db.setting.findUnique({ where: { key: "commercial" } });
  if (!s) throw new AppError("SETTINGS_MISSING", "Condições comerciais não configuradas no painel.", 503);
  return s.value as unknown as CommercialSettings;
}

export function volumesFromCart(cart: PricedCart): ShippingVolume[] {
  return cart.lines.flatMap((l) =>
    l.packages.map((p) => ({ lengthMm: p.lengthMm, widthMm: p.widthMm, heightMm: p.heightMm, weightG: p.weightG, quantity: p.quantity * l.quantity })),
  );
}

/** Consulta automática de frete para o carrinho atual + endereço escolhido. */
export async function quoteCartShipping(ctx: BuyerCtx, addressId: string) {
  const [cart, address] = await Promise.all([
    getPricedCart(ctx),
    db.address.findFirst({ where: { id: addressId, companyId: ctx.company.id } }),
  ]);
  if (!address) throw new AppError("ADDRESS_NOT_FOUND", "Endereço não encontrado.", 404);
  if (!cart.canCheckout || cart.subtotalCents == null) throw new AppError("CART_INVALID", "Revise os itens do carrinho.", 409);
  const volumes = volumesFromCart(cart);
  if (volumes.length === 0 || cart.lines.some((l) => l.packages.length === 0)) {
    throw new AppError("PACKAGES_MISSING", "Há produtos sem dimensões de embalagem cadastradas. Solicite cotação manual.", 422);
  }
  return getShippingProvider().quote({
    originZip: process.env.SHIPPING_ORIGIN_ZIP!, destinationZip: address.zipCode, volumes, declaredValueCents: cart.subtotalCents,
  });
}

export const checkoutSchema = z.discriminatedUnion("shippingMode", [
  z.object({ shippingMode: z.literal("AUTOMATIC"), addressId: z.string(), shippingOptionId: z.string(), idempotencyKey: z.string().min(16).max(64), notes: z.string().max(500).optional() }),
  z.object({ shippingMode: z.literal("MANUAL_QUOTE"), addressId: z.string(), idempotencyKey: z.string().min(16).max(64), notes: z.string().max(500).optional() }),
]);

/**
 * Cria o pedido a partir do carrinho. Tudo recalculado no servidor:
 * preços, disponibilidade e (no modo automático) o frete escolhido.
 * Idempotente: o mesmo idempotencyKey devolve o mesmo pedido.
 */
export async function createOrder(ctx: BuyerCtx, input: z.infer<typeof checkoutSchema>) {
  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.companyId !== ctx.company.id) throw new AppError("CONFLICT", "Chave de requisição inválida.", 409);
    return existing;
  }

  const cart = await getPricedCart(ctx);
  if (!cart.canCheckout || cart.subtotalCents == null) throw new AppError("CART_INVALID", "Revise os itens do carrinho antes de finalizar.", 409);
  const address = await db.address.findFirst({ where: { id: input.addressId, companyId: ctx.company.id } });
  if (!address) throw new AppError("ADDRESS_NOT_FOUND", "Endereço não encontrado.", 404);
  const settings = await getCommercialSettings();

  let shipping: { priceCents: number; carrierName: string; serviceName: string; deadlineDays: number; id: string } | null = null;
  if (input.shippingMode === "AUTOMATIC") {
    const options = await quoteCartShipping(ctx, input.addressId);
    shipping = options.find((o) => o.id === input.shippingOptionId) ?? null;
    if (!shipping) throw new AppError("SHIPPING_OPTION_EXPIRED", "A opção de frete mudou. Consulte o frete novamente.", 409);
  }

  const subtotal = cart.subtotalCents;
  const order = await db.$transaction(async (tx) => {
    const number = await nextDocNumber(tx);
    const created = await tx.order.create({
      data: {
        number, code: docCode(number),
        companyId: ctx.company.id,
        userId: ctx.user.id,
        commercialStatus: shipping ? "CONFIRMED" : "AWAITING_QUOTE",
        companySnapshot: { cnpj: ctx.company.cnpj, legalName: ctx.company.legalName, tradeName: ctx.company.tradeName, buyer: ctx.user.name, email: ctx.user.email },
        addressSnapshot: { recipient: address.recipient, zipCode: address.zipCode, street: address.street, number: address.number, complement: address.complement, district: address.district, city: address.city, state: address.state },
        priceListCode: DEFAULT_PRICE_LIST,
        commercialTerms: settings as unknown as Prisma.InputJsonValue,
        subtotalCents: subtotal,
        shippingCents: shipping?.priceCents ?? null,
        totalCents: shipping ? subtotal + shipping.priceCents : null,
        shippingMode: input.shippingMode,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes,
        items: {
          create: cart.lines.map((l) => ({
            variantId: l.variantId, sku: l.sku, productName: l.productName, variantName: l.variantName,
            unitPriceCents: l.unitPriceCents!, quantity: l.quantity, totalCents: l.totalCents!,
            availability: l.madeToOrder ? "MADE_TO_ORDER" : "STOCK", leadTimeDays: l.leadTimeDays,
            packagesSnapshot: l.packages as unknown as Prisma.InputJsonValue,
          })),
        },
        shippingQuote: {
          create: shipping
            ? { status: "AUTOMATIC", provider: "auto", carrierName: shipping.carrierName, serviceName: shipping.serviceName, priceCents: shipping.priceCents, deadlineDays: shipping.deadlineDays, externalId: shipping.id }
            : { status: "REQUESTED", provider: "manual" },
        },
        history: { create: { dimension: "COMMERCIAL", toValue: shipping ? "CONFIRMED" : "AWAITING_QUOTE", actorType: "CUSTOMER", actorId: ctx.user.id } },
      },
    });

    // Reserva: automático usa o maior prazo de pagamento até a escolha do meio;
    // cotação manual reserva pelo prazo configurado para resposta da equipe.
    const expiresAt = shipping
      ? new Date(Date.now() + Math.max(...Object.values(settings.reservationMinutes)) * 60_000)
      : new Date(Date.now() + settings.quoteReservationHours * 3600_000);
    await reserveStock(tx, created.id, cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, sku: l.sku, madeToOrder: l.madeToOrder })), expiresAt);
    await tx.cartItem.deleteMany({ where: { cartId: cart.cartId } });
    return created;
  });

  const url = `${appUrl()}/minha-conta/pedidos/${order.id}`;
  await sendEmail(ctx.user.email, { kind: "order-created", orderNumber: order.code, url });
  if (!shipping && process.env.ADMIN_NOTIFICATION_EMAIL) {
    await sendEmail(process.env.ADMIN_NOTIFICATION_EMAIL, {
      kind: "quote-requested-admin", orderNumber: order.code, company: ctx.company.legalName, url: `${appUrl()}/admin/logistica`,
    });
  }
  return order;
}

// ---------------------------------------------------------------- Cotação manual

export const proposeQuoteSchema = z.object({
  carrierName: z.string().min(2).max(80),
  priceCents: z.number().int().min(0),
  deadlineDays: z.number().int().min(1).max(180),
  validUntil: z.coerce.date(),
  notes: z.string().max(500).optional(),
});

export async function proposeQuote(adminUserId: string, orderId: string, input: z.infer<typeof proposeQuoteSchema>) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { shippingQuote: true } });
  if (!order || order.commercialStatus !== "AWAITING_QUOTE" || !order.shippingQuote) {
    throw new AppError("INVALID_STATE", "Pedido não está aguardando cotação.", 409);
  }
  await db.$transaction(async (tx) => {
    await tx.shippingQuote.update({
      where: { orderId },
      data: { status: "PROPOSED", provider: "manual", carrierName: input.carrierName, priceCents: input.priceCents, deadlineDays: input.deadlineDays, validUntil: input.validUntil, notes: input.notes, proposedById: adminUserId, proposedAt: new Date() },
    });
    await extendReservations(tx, orderId, input.validUntil);
    await tx.auditLog.create({ data: { actorId: adminUserId, action: "quote.propose", entity: "Order", entityId: orderId, after: input as unknown as Prisma.InputJsonValue } });
  });
  const buyer = await db.user.findUnique({ where: { id: order.userId } });
  if (buyer) await sendEmail(buyer.email, { kind: "quote-available", orderNumber: order.code, url: `${appUrl()}/minha-conta/pedidos/${order.id}` });
}

export async function respondQuote(ctx: BuyerCtx, orderId: string, accept: boolean) {
  const order = await db.order.findFirst({ where: { id: orderId, companyId: ctx.company.id }, include: { shippingQuote: true } });
  const q = order?.shippingQuote;
  if (!order || !q || q.status !== "PROPOSED") throw new AppError("INVALID_STATE", "Não há proposta de frete pendente.", 409);
  if (q.validUntil && q.validUntil < new Date()) throw new AppError("QUOTE_EXPIRED", "A proposta de frete expirou. Fale com o comercial.", 409);

  await db.$transaction(async (tx) => {
    await tx.shippingQuote.update({ where: { orderId }, data: { status: accept ? "ACCEPTED" : "REJECTED", respondedAt: new Date() } });
    if (accept) {
      await tx.order.update({ where: { id: orderId }, data: { shippingCents: q.priceCents!, totalCents: order.subtotalCents + q.priceCents! } });
      await transition(tx, orderId, "COMMERCIAL", "CONFIRMED", { type: "CUSTOMER", id: ctx.user.id }, "Cotação aceita");
    } else {
      await transition(tx, orderId, "COMMERCIAL", "CANCELED", { type: "CUSTOMER", id: ctx.user.id }, "Cotação recusada");
      await tx.order.update({ where: { id: orderId }, data: { canceledAt: new Date(), cancelReason: "Cotação de frete recusada" } });
      await releaseReservations(tx, orderId);
    }
  });
}

// ---------------------------------------------------------------- Pagamento

export const startPaymentSchema = z.object({
  method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  installments: z.number().int().min(1).max(12).default(1),
  cardToken: z.string().optional(),
});

export async function startPayment(ctx: BuyerCtx, orderId: string, input: z.infer<typeof startPaymentSchema>) {
  const order = await db.order.findFirst({ where: { id: orderId, companyId: ctx.company.id }, include: { payments: true } });
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  const settings = await getCommercialSettings();
  if (!settings.enabledMethods.includes(input.method)) throw new AppError("METHOD_DISABLED", "Forma de pagamento indisponível.");
  if (input.installments > settings.maxInstallments) throw new AppError("INSTALLMENTS", "Parcelamento não permitido.");
  if (input.method === "CREDIT_CARD" && !input.cardToken) throw new AppError("CARD_TOKEN", "Dados do cartão não informados.");
  if (order.totalCents == null) throw new AppError("NO_TOTAL", "Frete ainda não confirmado.", 409);
  const pending = order.payments.find((p) => p.status === "PENDING" && p.method === input.method);
  if (pending) return pending; // reaproveita cobrança aberta (evita duplicidade)

  const provider = getPaymentProvider(); // lança se não configurado — nunca simula
  const addr = order.addressSnapshot as Record<string, string>;
  const buyer = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });

  // Transição para AWAITING_PAYMENT valida regras (pedido confirmado + frete definido)
  await db.$transaction((tx) =>
    order.financialStatus === "AWAITING_PAYMENT" ? Promise.resolve() : transition(tx, orderId, "FINANCIAL", "AWAITING_PAYMENT", { type: "CUSTOMER", id: ctx.user.id }),
  );

  const charge = await provider.createCharge({
    orderId, orderNumber: order.code, amountCents: order.totalCents, method: input.method as PaymentMethod,
    installments: input.installments, cardToken: input.cardToken,
    boletoDueAt: new Date(Date.now() + settings.boletoDueDays * 86_400_000),
    pixExpiresInSec: settings.reservationMinutes.PIX * 60,
    customer: { name: ctx.company.legalName, email: buyer.email, document: ctx.company.cnpj, phone: buyer.phone },
    billingAddress: { zipCode: addr.zipCode, street: addr.street, number: addr.number, district: addr.district, city: addr.city, state: addr.state, complement: addr.complement },
  });

  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orderId, provider: provider.name, method: input.method, status: charge.status === "PAID" ? "PENDING" : charge.status,
        amountCents: order.totalCents!, installments: input.installments, externalId: charge.externalId,
        pixQrCode: charge.pixQrCode, pixQrCodeUrl: charge.pixQrCodeUrl, boletoUrl: charge.boletoUrl, boletoLine: charge.boletoLine,
        dueAt: charge.dueAt, failureReason: charge.failureReason,
      },
    });
    // Status PAID só é aplicado pelo webhook autenticado (fonte única de verdade).
    await extendReservations(tx, orderId, reservationExpiry(input.method, settings.reservationMinutes));
    return payment;
  });
}

/**
 * Processamento idempotente de webhook de pagamento.
 * 1) autentica  2) registra evento (unique provider+externalId)
 * 3) se já processado, ignora  4) aplica transições  5) marca processado.
 */
export async function processPaymentWebhook(providerName: string, req: Request) {
  const provider = getPaymentProvider(providerName);
  const raw = await req.text();
  const event = await provider.verifyWebhook(req, raw);

  const record = await db.integrationEvent.upsert({
    where: { provider_externalId: { provider: provider.name, externalId: event.eventId } },
    update: { attempts: { increment: 1 } },
    create: { provider: provider.name, eventType: event.type, externalId: event.eventId, payload: event.raw as Prisma.InputJsonValue, signatureOk: true, attempts: 1 },
  });
  if (record.processedAt) return { duplicate: true };
  if (!event.chargeExternalId || !event.status) {
    await db.integrationEvent.update({ where: { id: record.id }, data: { processedAt: new Date() } });
    return { ignored: true };
  }

  try {
    const order = await db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { externalId: event.chargeExternalId! }, include: { order: true } });
      if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "Cobrança desconhecida.", 404);
      if (payment.status === event.status) return null;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: event.status!, paidAt: event.status === "PAID" ? new Date() : undefined },
      });
      const o = payment.order;
      const actor = { type: "WEBHOOK" as const, id: provider.name };
      if (event.status === "PAID" && o.financialStatus !== "PAID") {
        if (o.financialStatus !== "AWAITING_PAYMENT") await transition(tx, o.id, "FINANCIAL", "AWAITING_PAYMENT", actor);
        await transition(tx, o.id, "FINANCIAL", "PAID", actor);
        await consumeReservations(tx, o.id);
        return { ...o, paid: true };
      }
      if ((event.status === "FAILED" || event.status === "CANCELED") && o.financialStatus === "AWAITING_PAYMENT") {
        await transition(tx, o.id, "FINANCIAL", "FAILED", actor);
      }
      if ((event.status === "REFUNDED" || event.status === "CHARGEBACK") && o.financialStatus === "PAID") {
        await transition(tx, o.id, "FINANCIAL", "REFUNDED", actor);
      }
      return null;
    });
    await db.integrationEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), error: null } });
    if (order?.paid) {
      const buyer = await db.user.findUnique({ where: { id: order.userId } });
      if (buyer) await sendEmail(buyer.email, { kind: "payment-confirmed", orderNumber: order.code, url: `${appUrl()}/minha-conta/pedidos/${order.id}` });
    }
    return { ok: true };
  } catch (e) {
    await db.integrationEvent.update({ where: { id: record.id }, data: { error: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}

// ---------------------------------------------------------------- Job: expiração

/** Executar periodicamente (cron a cada 5 min): libera reservas vencidas e cancela pedidos não pagos. */
export async function expireReservations(now = new Date()) {
  const expired = await db.stockReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: now } },
    select: { orderId: true },
    distinct: ["orderId"],
  });
  let canceled = 0;
  for (const { orderId } of expired) {
    await db.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.financialStatus === "PAID") return;
      await releaseReservations(tx, orderId);
      if (order.commercialStatus !== "CANCELED") {
        await transition(tx, orderId, "COMMERCIAL", "CANCELED", { type: "SYSTEM" }, "Reserva expirada sem pagamento");
        await tx.order.update({ where: { id: orderId }, data: { canceledAt: now, cancelReason: "Prazo de pagamento expirado" } });
        await tx.shippingQuote.updateMany({ where: { orderId, status: { in: ["REQUESTED", "PROPOSED"] } }, data: { status: "EXPIRED" } });
        canceled++;
      }
    });
  }
  return { canceled };
}
