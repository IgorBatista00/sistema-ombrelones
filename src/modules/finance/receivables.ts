/** Financeiro — regras puras de vendas e contas a receber (sem banco). */
import { installmentPlan } from "@/modules/quotes/totals";

export const RECEIPT_METHODS = ["Pix", "Boleto", "Cartão de crédito", "Cartão de débito", "Transferência", "Dinheiro", "Cheque"];
export type ReceivableState = "aberto" | "atrasado" | "a_definir" | "recebido" | "cancelado";
export const STATE_LABEL: Record<ReceivableState, string> = { aberto: "A receber", atrasado: "Em atraso", a_definir: "Vencimento a definir", recebido: "Recebido", cancelado: "Cancelado" };

/** Início do dia (fuso de Brasília) da data informada, em UTC. */
export const dayStartBR = (d: Date) => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)}T00:00:00-03:00`);

/**
 * Parcelas da venda a partir do parcelamento do orçamento, contando os prazos a partir da DATA DE FECHAMENTO.
 * "na venda"/"entrada" vence no fechamento; "na entrega" fica com vencimento a definir.
 * Sem parcelamento informado: parcela única à vista. Valores fixados no orçamento são respeitados; o restante é
 * dividido igualmente (a última automática absorve o arredondamento). Retorna diffCents ≠ 0 se não fechar o total.
 */
export function buildReceivablesPlan(totalCents: number, plan: string | null | undefined, closedAt: Date, fixed?: (number | null)[] | null) {
  const base = dayStartBR(closedAt);
  const hasPlan = !!(plan && plan.trim());
  const ip = installmentPlan(totalCents, hasPlan ? plan : "na venda", new Date(base.getTime() + 15 * 3_600_000), hasPlan ? fixed : null);
  return { diffCents: ip.diffCents, parcels: ip.rows.map((r, i) => ({ position: i + 1, label: `${r.index} · ${r.label}`, dueDate: r.due ? dayStartBR(r.due) : null, amountCents: r.valueCents })) };
}
export const buildReceivables = (totalCents: number, plan: string | null | undefined, closedAt: Date, fixed?: (number | null)[] | null) => buildReceivablesPlan(totalCents, plan, closedAt, fixed).parcels;

export function receivableState(r: { status: "ABERTO" | "RECEBIDO" | "CANCELADO"; dueDate: Date | null }, now = new Date()): ReceivableState {
  if (r.status === "RECEBIDO") return "recebido";
  if (r.status === "CANCELADO") return "cancelado";
  if (!r.dueDate) return "a_definir";
  return r.dueDate.getTime() < dayStartBR(now).getTime() ? "atrasado" : "aberto";
}

export type SaleState = "quitada" | "em_aberto" | "em_atraso" | "cancelada";
export const SALE_LABEL: Record<SaleState, string> = { quitada: "Quitada", em_aberto: "Em aberto", em_atraso: "Em atraso", cancelada: "Cancelada" };

export function saleSummary(sale: { status: "ATIVA" | "CANCELADA"; totalCents: number; costCents?: number | null }, recs: { status: "ABERTO" | "RECEBIDO" | "CANCELADO"; dueDate: Date | null; amountCents: number; receivedCents: number | null }[], now = new Date()) {
  const live = recs.filter((r) => r.status !== "CANCELADO");
  const received = live.filter((r) => r.status === "RECEBIDO").reduce((a, r) => a + (r.receivedCents ?? r.amountCents), 0);
  const open = live.filter((r) => r.status === "ABERTO").reduce((a, r) => a + r.amountCents, 0);
  const overdue = live.filter((r) => receivableState(r, now) === "atrasado").reduce((a, r) => a + r.amountCents, 0);
  const state: SaleState = sale.status === "CANCELADA" ? "cancelada" : open === 0 ? "quitada" : overdue > 0 ? "em_atraso" : "em_aberto";
  const margin = sale.costCents != null && sale.totalCents > 0 ? Math.round(((sale.totalCents - sale.costCents) / sale.totalCents) * 10000) : null;
  return { received, open, overdue, state, marginBps: margin };
}

/** Indicadores do período (vendas ativas) + carteira de recebíveis. */
export function financeKpis(sales: { status: "ATIVA" | "CANCELADA"; totalCents: number; costCents: number | null }[], recs: { status: "ABERTO" | "RECEBIDO" | "CANCELADO"; dueDate: Date | null; amountCents: number; receivedCents: number | null; receivedAt: Date | null }[], now = new Date()) {
  const active = sales.filter((s) => s.status === "ATIVA");
  const revenue = active.reduce((a, s) => a + s.totalCents, 0);
  const withCost = active.filter((s) => s.costCents != null);
  const cost = withCost.reduce((a, s) => a + (s.costCents ?? 0), 0);
  const revWithCost = withCost.reduce((a, s) => a + s.totalCents, 0);
  const open = recs.filter((r) => r.status === "ABERTO");
  const today = dayStartBR(now).getTime(), in7 = today + 8 * 86_400_000;
  return {
    salesCount: active.length, revenue, avgTicket: active.length ? Math.round(revenue / active.length) : null,
    cost: withCost.length ? cost : null, grossMarginBps: revWithCost ? Math.round(((revWithCost - cost) / revWithCost) * 10000) : null,
    received: recs.filter((r) => r.status === "RECEBIDO").reduce((a, r) => a + (r.receivedCents ?? r.amountCents), 0),
    toReceive: open.reduce((a, r) => a + r.amountCents, 0),
    overdue: open.filter((r) => r.dueDate && r.dueDate.getTime() < today).reduce((a, r) => a + r.amountCents, 0),
    next7: open.filter((r) => r.dueDate && r.dueDate.getTime() >= today && r.dueDate.getTime() < in7).reduce((a, r) => a + r.amountCents, 0),
    undefinedDue: open.filter((r) => !r.dueDate).reduce((a, r) => a + r.amountCents, 0),
  };
}

/** Previsão de recebimento por mês (parcelas em aberto com vencimento definido; atrasadas entram no mês atual). */
export function cashForecast(recs: { status: string; dueDate: Date | null; amountCents: number }[], months = 6, now = new Date()) {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d);
  const out: { month: string; cents: number }[] = [];
  const start = new Date(dayStartBR(now).getTime());
  for (let i = 0; i < months; i++) { const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 15)); out.push({ month: key(d), cents: 0 }); }
  for (const r of recs) {
    if (r.status !== "ABERTO" || !r.dueDate) continue;
    const k = r.dueDate < start ? out[0].month : key(r.dueDate);
    const slot = out.find((o) => o.month === k); if (slot) slot.cents += r.amountCents;
  }
  return out;
}
