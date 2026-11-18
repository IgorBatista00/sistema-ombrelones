/** Ordens de compra — regras puras (sem banco). Datas de calendário sempre no fuso de São Paulo. */

export type PoState = "AGUARDANDO" | "PARCIAL" | "ENTREGUE" | "ENCERRADA_SALDO" | "CANCELADA";
export const PO_STATE: Record<PoState, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  AGUARDANDO: { label: "Aguardando entrega", tone: "neutral" },
  PARCIAL: { label: "Entrega parcial", tone: "warning" },
  ENTREGUE: { label: "Entregue", tone: "success" },
  ENCERRADA_SALDO: { label: "Encerrada com saldo", tone: "neutral" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
};

/** Prazo do cadastro (produto × fornecedor) em dias. Importação não tem prazo fixo. */
export const LEAD_DAYS: Record<string, number | null> = { PRONTA_ENTREGA: 0, D15: 15, D30: 30, D60: 60, D90: 90, IMPORTACAO: null };

const DAY = 86_400_000;
export const spDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
/** "2026-11-18" → meio-dia em São Paulo (evita virar o dia por fuso). */
export const brDate = (s: string) => new Date(`${s}T12:00:00-03:00`);
export const isIsoDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && spDay(brDate(s)) === s;
/** Diferença em dias de calendário (b − a), no fuso de São Paulo. */
export const dayDiff = (a: Date, b: Date) => Math.round((brDate(spDay(b)).getTime() - brDate(spDay(a)).getTime()) / DAY);
export const addDays = (d: Date, n: number) => brDate(spDay(new Date(brDate(spDay(d)).getTime() + n * DAY)));
export const poCode = (n: number) => `OC-${String(n).padStart(4, "0")}`;

/** Quantidades: até 3 casas (metros, kg…). Aceita "1.234,5" e "12,5". */
export function parseQty(v: unknown): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}
export const fmtQty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface PoItemProgress { id: string; quantity: number; received: number }
export function itemProgress(items: { id: string; quantity: number }[], lines: { itemId: string; quantity: number }[]): (PoItemProgress & { pending: number })[] {
  return items.map((i) => {
    const received = r3(lines.filter((l) => l.itemId === i.id).reduce((a, l) => a + l.quantity, 0));
    return { id: i.id, quantity: i.quantity, received, pending: Math.max(0, r3(i.quantity - received)) };
  });
}
/** % recebido = média do recebido de cada item (itens podem ter unidades diferentes: un, m, kg…). */
export const receivedPct = (p: { quantity: number; received: number }[]) =>
  p.length ? Math.round((p.reduce((a, x) => a + (x.quantity > 0 ? Math.min(x.received / x.quantity, 1) : 1), 0) / p.length) * 100) : 0;
export const fullyReceived = (p: { pending: number }[]) => p.length > 0 && p.every((x) => x.pending <= 0);

/**
 * Data-alvo da entrega: a data prometida pelo fornecedor; se não houver, estimativa pelo prazo do cadastro
 * (data do pedido + maior prazo entre os itens). Sem nenhum dos dois, não há como medir atraso.
 */
export function dueDate(po: { orderedAt: Date; promisedAt: Date | null }, itemLeadDays: (number | null)[]) {
  if (po.promisedAt) return { date: po.promisedAt, estimated: false };
  const known = itemLeadDays.filter((d): d is number => d != null);
  if (!known.length) return { date: null, estimated: false };
  return { date: addDays(po.orderedAt, Math.max(...known)), estimated: true };
}

export function poState(po: { status: "ABERTA" | "ENCERRADA" | "CANCELADA" }, progress: { received: number; pending: number }[]): PoState {
  if (po.status === "CANCELADA") return "CANCELADA";
  if (po.status === "ENCERRADA") return fullyReceived(progress) ? "ENTREGUE" : "ENCERRADA_SALDO";
  return progress.some((p) => p.received > 0) ? "PARCIAL" : "AGUARDANDO";
}

/**
 * Situação do prazo.
 * - Em aberto: atrasada se a data-alvo já passou (dias de atraso até hoje); "vence hoje"; ou dias que faltam.
 * - Concluída: compara a última entrega com a data-alvo (entregue no prazo ou com X dias de atraso).
 */
export function deadline(state: PoState, due: Date | null, lastReceiptAt: Date | null, now = new Date()) {
  if (state === "CANCELADA" || !due) return { late: false, lateDays: 0, daysLeft: null as number | null, onTime: null as boolean | null };
  if (state === "ENTREGUE" || state === "ENCERRADA_SALDO") {
    if (!lastReceiptAt) return { late: false, lateDays: 0, daysLeft: null, onTime: null };
    const d = dayDiff(due, lastReceiptAt);
    return { late: false, lateDays: Math.max(0, d), daysLeft: null, onTime: d <= 0 };
  }
  const left = dayDiff(now, due);
  return { late: left < 0, lateDays: Math.max(0, -left), daysLeft: left, onTime: null };
}

/** Desempenho por fornecedor considerando OCs concluídas (entregues ou encerradas com saldo, com ao menos uma entrega). */
export function supplierPerformance(rows: { supplierId: string; supplierName: string; orderedAt: Date; due: Date | null; lastReceiptAt: Date | null; state: PoState; open: boolean; late: boolean }[]) {
  const map = new Map<string, { supplierId: string; supplierName: string; open: number; lateOpen: number; done: number; measured: number; onTime: number; lateDaysSum: number; leadSum: number; leadN: number }>();
  for (const r of rows) {
    const m = map.get(r.supplierId) ?? { supplierId: r.supplierId, supplierName: r.supplierName, open: 0, lateOpen: 0, done: 0, measured: 0, onTime: 0, lateDaysSum: 0, leadSum: 0, leadN: 0 };
    if (r.open) { m.open++; if (r.late) m.lateOpen++; }
    if ((r.state === "ENTREGUE" || r.state === "ENCERRADA_SALDO") && r.lastReceiptAt) {
      m.done++;
      m.leadSum += Math.max(0, dayDiff(r.orderedAt, r.lastReceiptAt)); m.leadN++;
      if (r.due) { m.measured++; const d = dayDiff(r.due, r.lastReceiptAt); if (d <= 0) m.onTime++; else m.lateDaysSum += d; }
    }
    map.set(r.supplierId, m);
  }
  return [...map.values()].map((m) => ({
    supplierId: m.supplierId, supplierName: m.supplierName, open: m.open, lateOpen: m.lateOpen, done: m.done,
    onTimePct: m.measured ? Math.round((m.onTime / m.measured) * 100) : null,
    avgLateDays: m.measured - m.onTime > 0 ? Math.round((m.lateDaysSum / (m.measured - m.onTime)) * 10) / 10 : null,
    avgLeadDays: m.leadN ? Math.round((m.leadSum / m.leadN) * 10) / 10 : null,
  })).sort((a, b) => b.lateOpen - a.lateOpen || b.open - a.open || a.supplierName.localeCompare(b.supplierName, "pt-BR"));
}

/** Valida as quantidades de uma entrega contra o saldo de cada item. */
export function checkReceipt(progress: (PoItemProgress & { pending: number })[], lines: { itemId: string; quantity: number }[], descr: (id: string) => string) {
  const used = lines.filter((l) => l.quantity > 0);
  if (!used.length) return "Informe a quantidade recebida de pelo menos um item.";
  for (const l of used) {
    const p = progress.find((x) => x.id === l.itemId);
    if (!p) return "Item não pertence a esta ordem de compra.";
    if (l.quantity > p.pending + 1e-9) return `“${descr(l.itemId)}”: recebido (${fmtQty(l.quantity)}) maior que o saldo pendente (${fmtQty(p.pending)}).`;
  }
  return null;
}
