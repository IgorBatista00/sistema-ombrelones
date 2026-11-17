/** Saídas (contas a pagar) — regras puras. Datas como "AAAA-MM-DD" (dia no fuso de Brasília). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Mercadoria / fornecedores", "Frete e transporte", "Impostos e taxas", "Aluguel", "Energia, água e internet",
  "Salários e encargos", "Marketing e anúncios", "Tarifas bancárias e de cartão", "Manutenção", "Outras despesas",
];
export type RepeatMode = "none" | "installments" | "monthly";

/** Soma meses mantendo o dia; se o mês não tiver o dia (ex.: 31), usa o último dia do mês. */
export function addMonths(isoDay: string, months: number) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Gera as saídas de um lançamento:
 * - none: uma saída;
 * - installments: valor total dividido em N parcelas mensais (a última absorve o arredondamento);
 * - monthly: o mesmo valor repetido por N meses (ex.: aluguel).
 */
export function buildExpenseSeries(amountCents: number, firstDue: string, mode: RepeatMode, n: number) {
  const count = mode === "none" ? 1 : Math.max(1, Math.min(60, Math.trunc(n) || 1));
  if (count === 1) return [{ dueDate: firstDue, amountCents, label: null as string | null }];
  const base = mode === "installments" ? Math.floor(amountCents / count) : amountCents;
  const rest = mode === "installments" ? amountCents - base * count : 0;
  return Array.from({ length: count }, (_, i) => ({ dueDate: addMonths(firstDue, i), amountCents: base + (i === count - 1 ? rest : 0), label: `${i + 1}/${count}` }));
}

export type ExpenseState = "paga" | "vencida" | "vence_hoje" | "a_pagar";
export const EXPENSE_STATE_LABEL: Record<ExpenseState, string> = { paga: "Paga", vencida: "Vencida", vence_hoje: "Vence hoje", a_pagar: "A pagar" };
export function expenseState(e: { status: "A_PAGAR" | "PAGA"; dueDay: string }, today: string): ExpenseState {
  if (e.status === "PAGA") return "paga";
  return e.dueDay < today ? "vencida" : e.dueDay === today ? "vence_hoje" : "a_pagar";
}

/** Indicadores: em aberto (total, vencidas, próximos 7 dias) e pago (no conjunto filtrado), por categoria. */
export function expenseSummary(rows: { status: "A_PAGAR" | "PAGA"; dueDay: string; amountCents: number; paidCents: number | null; category: string }[], today: string) {
  const open = rows.filter((r) => r.status === "A_PAGAR"), paid = rows.filter((r) => r.status === "PAGA");
  const in7 = addDays(today, 7);
  const byCat = new Map<string, number>();
  for (const r of paid) byCat.set(r.category, (byCat.get(r.category) ?? 0) + (r.paidCents ?? r.amountCents));
  return {
    open: open.reduce((a, r) => a + r.amountCents, 0), openCount: open.length,
    overdue: open.filter((r) => r.dueDay < today).reduce((a, r) => a + r.amountCents, 0), overdueCount: open.filter((r) => r.dueDay < today).length,
    next7: open.filter((r) => r.dueDay >= today && r.dueDay <= in7).reduce((a, r) => a + r.amountCents, 0),
    paid: paid.reduce((a, r) => a + (r.paidCents ?? r.amountCents), 0), paidCount: paid.length,
    byCategory: [...byCat.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}
export function addDays(isoDay: string, days: number) {
  const d = new Date(`${isoDay}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
