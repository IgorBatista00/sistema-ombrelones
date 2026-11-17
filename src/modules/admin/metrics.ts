import "server-only";
import { db } from "@/lib/db";

/**
 * Indicadores do dashboard. Faturamento considera SOMENTE pedidos pagos
 * (financialStatus = PAID), separando criados, pagos, cancelados e faturados.
 */
export async function getDashboardMetrics(from: Date, to: Date) {
  const range = { createdAt: { gte: from, lt: to } };
  const [created, paid, canceled, invoiced, paidAgg, customers, awaitingPayment, quoteRequests, awaitingShipment, top] = await Promise.all([
    db.order.count({ where: range }),
    db.order.count({ where: { ...range, financialStatus: "PAID" } }),
    db.order.count({ where: { ...range, commercialStatus: "CANCELED" } }),
    db.order.count({ where: { ...range, fiscalStatus: "AUTHORIZED" } }),
    db.order.aggregate({ where: { ...range, financialStatus: "PAID" }, _sum: { totalCents: true } }),
    db.company.groupBy({ by: ["status"], _count: true }),
    db.order.count({ where: { financialStatus: "AWAITING_PAYMENT", commercialStatus: { not: "CANCELED" } } }),
    db.shippingQuote.count({ where: { status: "REQUESTED" } }),
    db.order.count({ where: { financialStatus: "PAID", logisticStatus: { in: ["NOT_RELEASED", "PREPARING"] } } }),
    db.orderItem.groupBy({
      by: ["sku", "productName"],
      where: { order: { ...range, financialStatus: "PAID" } },
      _sum: { quantity: true, totalCents: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);
  const revenue = paidAgg._sum.totalCents ?? 0;
  return {
    revenueCents: revenue,
    orders: { created, paid, canceled, invoiced },
    avgTicketCents: paid ? Math.round(revenue / paid) : 0,
    customers: Object.fromEntries(customers.map((c) => [c.status, c._count])) as Record<string, number>,
    awaitingPayment, quoteRequests, awaitingShipment,
    topProducts: top.map((t) => ({ sku: t.sku, name: t.productName, quantity: t._sum.quantity ?? 0, totalCents: t._sum.totalCents ?? 0 })),
  };
}
