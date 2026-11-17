import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDocNumber } from "@/lib/doc-code";
import { dayRange } from "@/modules/quotes/funnel";
import { plannedOtherIncome, receivedOtherIncome } from "./other-income";
import { cashForecast, dayStartBR, financeKpis, receivableState, saleSummary, type ReceivableState } from "./receivables";

export const financeFilterSchema = z.object({
  aba: z.enum(["vendas", "faturamento", "receber", "saidas", "outras", "mercadolivre", "site"]).catch("vendas").default("vendas"),
  q: z.string().trim().max(120).optional().catch(undefined),
  de: z.string().optional().catch(undefined), ate: z.string().optional().catch(undefined), // período (vendas: fechamento · receber: vencimento)
  situacao: z.string().optional().catch(undefined),
  venda: z.string().optional().catch(undefined),
  categoria: z.string().optional().catch(undefined),
  liberacao: z.enum(["a_liberar", "liberado", "sem_info", "estornado"]).optional().catch(undefined),
  ml: z.string().optional().catch(undefined),
  pedido: z.string().max(60).optional().catch(undefined), // categoria interna do pedido ("sem" = sem categoria)
});
export type FinanceFilters = z.infer<typeof financeFilterSchema>;

async function saleSearch(q?: string): Promise<Prisma.SaleWhereInput> {
  if (!q) return {};
  const n = parseDocNumber(q), up = q.toUpperCase();
  return { OR: [{ code: { contains: up } }, { clientName: { contains: q, mode: "insensitive" } }, { clientDoc: { contains: q.replace(/\D/g, "") || "§" } }, ...(n && /^[a-z]{0,3}[-\s]?\d+$/i.test(q) ? [{ code: { endsWith: String(n).padStart(4, "0") } }] : [])] };
}

/** Aba Vendas: vendas do período (data de fechamento) com resumo de recebimento. */
export async function salesView(f: FinanceFilters) {
  const range = dayRange(f.de, f.ate);
  const where: Prisma.SaleWhereInput = { ...(await saleSearch(f.q)), ...(range ? { closedAt: range } : {}), ...(f.pedido ? { category: f.pedido === "sem" ? null : f.pedido } : {}) };
  const sales = await db.sale.findMany({ where, orderBy: { closedAt: "desc" }, take: 1000, include: { receivables: { orderBy: { position: "asc" } }, documents: { where: { deletedAt: null }, select: { type: true } }, _count: { select: { notes: { where: { deletedAt: null } } } } } });
  const now = new Date();
  const rows = sales.map((s) => ({ ...s, sum: saleSummary(s, s.receivables, now) })).filter((s) => !f.situacao || s.sum.state === f.situacao);
  // carteira: TODAS as parcelas em aberto de vendas ativas (independe do período) + recebido no período
  const [openRecs, receivedInPeriod] = await Promise.all([
    db.receivable.findMany({ where: { status: "ABERTO", sale: { status: "ATIVA" } }, select: { status: true, dueDate: true, amountCents: true, receivedCents: true, receivedAt: true } }),
    db.receivable.findMany({ where: { status: "RECEBIDO", ...(range ? { receivedAt: range } : {}) }, select: { status: true, dueDate: true, amountCents: true, receivedCents: true, receivedAt: true } }),
  ]);
  const k = financeKpis(sales, [...openRecs, ...receivedInPeriod], now);
  const [planned, othersReceived] = await Promise.all([plannedOtherIncome(), receivedOtherIncome(range)]);
  const forecastInput = [...openRecs, ...planned.map((o) => ({ status: "ABERTO", dueDate: o.date, amountCents: o.amountCents }))];
  return { rows, kpis: k, othersReceived: othersReceived._sum.amountCents ?? 0, othersPlanned: planned.reduce((a, o) => a + o.amountCents, 0), forecast: cashForecast(forecastInput, 6, now) };
}

/** Aba Contas a receber: parcelas (filtro por vencimento, situação, busca, venda). */
export async function receivablesView(f: FinanceFilters) {
  const range = dayRange(f.de, f.ate);
  const where: Prisma.ReceivableWhereInput = {
    sale: { ...(await saleSearch(f.q)), ...(f.venda ? { id: f.venda } : {}), ...(f.pedido ? { category: f.pedido === "sem" ? null : f.pedido } : {}) },
    ...(range ? { dueDate: range } : {}),
    ...(f.situacao === "recebido" ? { status: "RECEBIDO" } : f.situacao === "todas" ? {} : f.situacao === "cancelado" ? { status: "CANCELADO" } : { status: "ABERTO" }),
  };
  const recs = await db.receivable.findMany({ where, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }], take: 2000, include: { sale: { select: { id: true, code: true, clientName: true, quoteId: true, paymentTerms: true, status: true, category: true } }, documents: { where: { deletedAt: null }, select: { id: true, type: true, fileName: true } } } });
  const now = new Date();
  const rows = recs.map((r) => ({ ...r, state: receivableState(r, now) as ReceivableState }))
    .filter((r) => !f.situacao || ["todas", "recebido", "cancelado"].includes(f.situacao) || r.state === f.situacao || (f.situacao === "abertas"));
  const total = (s: ReceivableState) => rows.filter((r) => r.state === s).reduce((a, r) => a + (r.state === "recebido" ? r.receivedCents ?? r.amountCents : r.amountCents), 0);
  return { rows, totals: { atrasado: total("atrasado"), aberto: total("aberto"), a_definir: total("a_definir"), recebido: total("recebido") } };
}

/**
 * Resumo do Financeiro para o Dashboard: carteira de contas a receber (vendas ativas do funil),
 * o que está em atraso e o que foi recebido no período (parcelas + outras receitas).
 */
export async function financeDashboard(from: Date, to: Date) {
  const today = dayStartBR(new Date());
  const in7 = new Date(today.getTime() + 8 * 86_400_000);
  const range = { gte: from, lt: to };
  const [open, received, others, upcoming] = await Promise.all([
    db.receivable.findMany({ where: { status: "ABERTO", sale: { status: "ATIVA" } }, select: { dueDate: true, amountCents: true } }),
    db.receivable.aggregate({ where: { status: "RECEBIDO", receivedAt: range }, _sum: { receivedCents: true, amountCents: true }, _count: true }),
    db.otherIncome.aggregate({ where: { status: "RECEBIDA", date: range }, _sum: { amountCents: true }, _count: true }),
    db.receivable.findMany({
      where: { status: "ABERTO", sale: { status: "ATIVA" }, dueDate: { not: null, lt: in7 } }, orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, label: true, dueDate: true, amountCents: true, sale: { select: { id: true, code: true, clientName: true } } },
    }),
  ]);
  const sum = (l: { amountCents: number }[]) => l.reduce((a, r) => a + r.amountCents, 0);
  const overdue = open.filter((r) => r.dueDate && r.dueDate < today);
  const next7 = open.filter((r) => r.dueDate && r.dueDate >= today && r.dueDate < in7);
  const undefinedDue = open.filter((r) => !r.dueDate);
  const receivedParcels = received._sum.receivedCents ?? received._sum.amountCents ?? 0;
  return {
    open: { cents: sum(open), count: open.length },
    overdue: { cents: sum(overdue), count: overdue.length },
    next7: { cents: sum(next7), count: next7.length },
    undefinedDue: { cents: sum(undefinedDue), count: undefinedDue.length },
    received: { cents: receivedParcels + (others._sum.amountCents ?? 0), parcels: receivedParcels, parcelsCount: received._count, others: others._sum.amountCents ?? 0, othersCount: others._count },
    upcoming: upcoming.map((r) => ({ ...r, late: !!r.dueDate && r.dueDate < today })),
  };
}
