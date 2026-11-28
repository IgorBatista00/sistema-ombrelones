import "server-only";
import { db } from "@/lib/db";
import { dayRange } from "@/modules/quotes/funnel";
import { aggregateItems, deliveryTarget, type DayItem } from "./my-day-rules";
import { billingPending } from "@/modules/finance/billing";

type Perm = "ORDERS" | "LOGISTICS" | "FINANCE";

/** Tudo do dia escolhido (fuso de Brasília). Cada bloco só é carregado para quem tem a permissão da área. */
export async function myDay(day: string, perms: string[]) {
  const can = (p: Perm) => perms.includes(p);
  const range = dayRange(day, day)!; // { gte: 00:00, lt: 24:00 } em Brasília

  const [sales, siteOrders, quotes, deliveries, receivables, expenses, overdue, undated, mlItems, mlReceipts, mlConn] = await Promise.all([
    can("ORDERS") || can("FINANCE")
      ? db.sale.findMany({ where: { status: "ATIVA", closedAt: range }, orderBy: { closedAt: "asc" },
          select: { id: true, code: true, clientName: true, totalCents: true, category: true, paymentTerms: true, seller: true, quoteId: true, closedAt: true,
            quote: { select: { items: { orderBy: { position: "asc" }, select: { code: true, name: true, quantity: true, totalCents: true, measures: true, finish: true } } } } } })
      : [],
    can("ORDERS")
      ? db.order.findMany({ where: { payments: { some: { status: "PAID", paidAt: range } } }, orderBy: { createdAt: "asc" },
          select: { id: true, code: true, totalCents: true, subtotalCents: true, companySnapshot: true, items: { select: { sku: true, productName: true, variantName: true, quantity: true, totalCents: true } } } })
      : [],
    can("ORDERS")
      ? db.quote.findMany({ where: { createdAt: range }, orderBy: { createdAt: "asc" }, select: { id: true, code: true, status: true, totalCents: true, category: true, clientSnapshot: true, createdAt: true, _count: { select: { items: true } } } })
      : [],
    can("LOGISTICS")
      ? db.delivery.findMany({
          where: { OR: [
            { status: { in: ["A_AGENDAR", "AGENDADA", "EM_ROTA"] }, OR: [{ scheduledAt: { lt: range.lt } }, { scheduledAt: null, promisedAt: { lt: range.lt } }] }, // do dia ou atrasadas
            { status: "ENTREGUE", deliveredAt: range },
          ] },
          orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { promisedAt: { sort: "asc", nulls: "last" } }] })
      : [],
    can("FINANCE")
      ? db.receivable.findMany({ where: { status: "ABERTO", sale: { status: "ATIVA" }, dueDate: range }, orderBy: { position: "asc" },
          select: { id: true, label: true, amountCents: true, sale: { select: { id: true, code: true, clientName: true, paymentTerms: true } } } })
      : [],
    can("FINANCE")
      ? db.expense.findMany({ where: { status: "A_PAGAR", dueDate: range }, orderBy: { amountCents: "desc" }, select: { id: true, description: true, payee: true, category: true, amountCents: true, seriesLabel: true } })
      : [],
    can("FINANCE")
      ? Promise.all([
          db.receivable.aggregate({ where: { status: "ABERTO", sale: { status: "ATIVA" }, dueDate: { lt: range.gte } }, _sum: { amountCents: true }, _count: true }),
          db.expense.aggregate({ where: { status: "A_PAGAR", dueDate: { lt: range.gte } }, _sum: { amountCents: true }, _count: true }),
        ])
      : null,
    can("LOGISTICS") ? db.delivery.count({ where: { status: "A_AGENDAR", scheduledAt: null, promisedAt: null } }) : 0,
    // Mercado Livre: pedidos do dia (data da venda), exceto cancelados
    can("ORDERS") || can("FINANCE") ? db.mlOrderItem.findMany({ where: { saleDate: range, orderStatus: { not: "cancelled" }, foreign: false }, orderBy: [{ saleDate: "asc" }, { position: "asc" }] }) : [],
    can("ORDERS") || can("FINANCE") ? db.mlReceipt.findMany({ where: { saleDate: range, foreign: false }, select: { orderId: true, paymentStatus: true, grossCents: true, feeCents: true, netCents: true, buyerNickname: true } }) : [],
    can("ORDERS") || can("FINANCE") ? db.mlConnection.findUnique({ where: { id: "default" }, select: { nickname: true, lastSyncAt: true, lastSyncError: true } }) : null,
  ]);
  const okReceipts = mlReceipts.filter((r) => r.paymentStatus !== "refunded" && r.paymentStatus !== "cancelled" && r.paymentStatus !== "rejected");
  const mlOrders = [...new Set(mlItems.map((i) => i.orderId))].map((orderId) => {
    const its = mlItems.filter((i) => i.orderId === orderId), rec = okReceipts.filter((r) => r.orderId === orderId);
    const totalCents = its.reduce((a, i) => a + i.quantity * i.unitPriceCents, 0);
    const feeCents = its.reduce((a, i) => a + (i.saleFeeCents ?? 0) * i.quantity, 0) || rec.reduce((a, r) => a + (r.feeCents ?? 0), 0);
    return { orderId, saleDate: its[0].saleDate, buyer: mlReceipts.find((r) => r.orderId === orderId)?.buyerNickname ?? null, totalCents, feeCents,
      netCents: rec.length && rec.every((r) => r.netCents != null) ? rec.reduce((a, r) => a + (r.netCents ?? 0), 0) : null,
      items: its.map((i) => ({ code: i.itemId, name: i.title, quantity: i.quantity, totalCents: i.quantity * i.unitPriceCents })) as DayItem[] };
  });

  // vendas do dia + itens vendidos
  const saleRows = sales.map((s) => ({ ...s, items: (s.quote?.items ?? []) as DayItem[] }));
  const siteRows = siteOrders.map((o) => ({ id: o.id, code: o.code, client: ((o.companySnapshot as Record<string, string> | null)?.tradeName || (o.companySnapshot as Record<string, string> | null)?.legalName) ?? "Cliente do site", totalCents: o.totalCents ?? o.subtotalCents,
    items: o.items.map((i) => ({ code: i.sku, name: i.variantName ? `${i.productName} — ${i.variantName}` : i.productName, quantity: i.quantity, totalCents: i.totalCents })) as DayItem[] }));
  const soldItems = aggregateItems([...saleRows.flatMap((s) => s.items), ...siteRows.flatMap((o) => o.items), ...mlOrders.flatMap((o) => o.items.map((i) => ({ ...i, name: `${i.name} (Mercado Livre)` })))]);

  // faturamento: pendências (todas, não só do dia) e quais entregas estão sem NF
  const billing = can("FINANCE") ? await billingPending() : null;
  const noInvoice = new Set((deliveries.length ? await db.sale.findMany({ where: { quoteId: { in: deliveries.map((d) => d.quoteId) }, status: "ATIVA", invoiceNumber: null }, select: { quoteId: true } }) : []).map((s) => s.quoteId));
  // entregas: do dia, atrasadas e entregues no dia
  const startMs = range.gte!.getTime();
  const dl = deliveries.map((d) => {
    const target = deliveryTarget(d);
    const kind = d.status === "ENTREGUE" ? "entregue" : target && target.getTime() < startMs ? "atrasada" : "hoje";
    return { ...d, target, kind: kind as "hoje" | "atrasada" | "entregue", items: (d.items as DayItem[] | null) ?? [], noInvoice: noInvoice.has(d.quoteId) };
  });
  const toDeliver = dl.filter((d) => d.kind !== "entregue");
  const toDeliverItems = aggregateItems(toDeliver.flatMap((d) => d.items));

  const sum = (l: { totalCents?: number | null; amountCents?: number }[]) => l.reduce((a, x) => a + (x.totalCents ?? x.amountCents ?? 0), 0);
  return {
    can: { sales: can("ORDERS") || can("FINANCE"), orders: can("ORDERS"), logistics: can("LOGISTICS"), finance: can("FINANCE") },
    sales: { rows: saleRows, site: siteRows, ml: mlOrders, total: sum(saleRows) + sum(siteRows) + sum(mlOrders), count: saleRows.length + siteRows.length + mlOrders.length,
      byChannel: { funil: sum(saleRows), site: sum(siteRows), ml: sum(mlOrders) } },
    ml: { connected: !!mlConn, nickname: mlConn?.nickname ?? null, lastSyncAt: mlConn?.lastSyncAt ?? null, lastSyncError: mlConn?.lastSyncError ?? null, feeCents: mlOrders.reduce((a, o) => a + o.feeCents, 0) },
    soldItems,
    quotes: { rows: quotes.map((q) => ({ ...q, clientName: (q.clientSnapshot as Record<string, string>)?.name || "Cliente não informado" })), total: sum(quotes) },
    deliveries: { undated, today: dl.filter((d) => d.kind === "hoje"), late: dl.filter((d) => d.kind === "atrasada"), delivered: dl.filter((d) => d.kind === "entregue"), items: toDeliverItems },
    billing,
    due: {
      receivables, expenses, receivableTotal: sum(receivables), expenseTotal: sum(expenses),
      overdue: overdue ? { receivables: { cents: overdue[0]._sum.amountCents ?? 0, count: overdue[0]._count }, expenses: { cents: overdue[1]._sum.amountCents ?? 0, count: overdue[1]._count } } : null,
    },
  };
}
