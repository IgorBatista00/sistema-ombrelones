/** Cálculo PURO do orçamento (centavos inteiros). Testado em tests/quotes.test.ts. */
export interface QuoteLineCalc { quantity: number; unitPriceCents: number; unitDiscountCents: number; unitCostCents?: number | null; weightG?: number | null; cubageM3?: number | null }
export type FreightTermKey = "COTAR" | "CIF" | "FOB";

export function quoteTotals(lines: QuoteLineCalc[], opts: { extraDiscountCents: number; freightTerm: FreightTermKey; freightCents: number }) {
  const rows = lines.map((l) => {
    const net = Math.max(0, l.unitPriceCents - l.unitDiscountCents);
    return { ...l, gross: l.quantity * l.unitPriceCents, discount: l.quantity * Math.min(l.unitDiscountCents, l.unitPriceCents), total: l.quantity * net };
  });
  const subtotal = rows.reduce((a, r) => a + r.gross, 0);
  const itemDiscount = rows.reduce((a, r) => a + r.discount, 0);
  const extra = Math.min(Math.max(0, opts.extraDiscountCents), subtotal - itemDiscount);
  const freight = opts.freightTerm === "CIF" ? opts.freightCents : 0;
  const total = subtotal - itemDiscount - extra + freight;
  const quantity = rows.reduce((a, r) => a + r.quantity, 0);
  const missingLoad = rows.filter((r) => !r.weightG || !r.cubageM3).length;
  const weightKg = rows.reduce((a, r) => a + ((r.weightG ?? 0) * r.quantity) / 1000, 0);
  const cubageM3 = rows.reduce((a, r) => a + (r.cubageM3 ?? 0) * r.quantity, 0);
  const hasCost = rows.every((r) => r.unitCostCents != null);
  const cost = hasCost ? rows.reduce((a, r) => a + r.quantity * (r.unitCostCents ?? 0), 0) : null;
  const net = total - freight;
  return { rows, subtotal, itemDiscount, extraDiscount: extra, discount: itemDiscount + extra, freight, total, quantity, weightKg, cubageM3, missingLoad, cost,
    marginBps: cost != null && net > 0 ? Math.round(((net - cost) / net) * 10_000) : null };
}

/**
 * Parcelamento a partir do plano ("entrada/30/60/90", "28", "entrada/entrega").
 * Parcelas iguais; a diferença de centavos vai para a última (ex.: 5 × 946,90 + 946,91).
 */
/**
 * Parcelas: as DATAS vêm do texto do parcelamento ("entrada/30/60/90" = dias contados da data base;
 * "na entrega" = sem data). Os VALORES podem ser fixados parcela a parcela (`fixed[i]` em centavos; null = automático):
 * as fixadas ficam como estão e o restante do total é dividido igualmente entre as automáticas (a última absorve o
 * arredondamento). `diffCents` = total − soma das parcelas (0 quando fecha; ≠ 0 só quando todas estão fixadas ou as
 * fixadas passam do total).
 */
export function installmentPlan(totalCents: number, plan: string | null | undefined, baseDate: Date, fixed?: (number | null | undefined)[] | null) {
  const parts = String(plan ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  if (!parts.length || totalCents <= 0) return { rows: [] as InstallmentRow[], diffCents: 0, sumCents: 0 };
  const n = parts.length;
  const fx = parts.map((_, i) => { const v = fixed?.[i]; return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null; });
  const fixedSum = fx.reduce<number>((a, v) => a + (v ?? 0), 0);
  const autos = fx.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
  const remaining = totalCents - fixedSum;
  const each = autos.length && remaining > 0 ? Math.floor(remaining / autos.length) : 0;
  const rest = autos.length && remaining > 0 ? remaining - each * autos.length : 0;
  const rows: InstallmentRow[] = parts.map((p, i) => {
    const onSale = /^(entrada|na venda|[àa] vista|0)$/i.test(p), onDelivery = /entrega/i.test(p);
    const days = onSale ? 0 : onDelivery ? null : parseInt(p, 10);
    const due = days == null || Number.isNaN(days) ? null : new Date(baseDate.getTime() + days * 86_400_000);
    const isFixed = fx[i] != null;
    const valueCents = isFixed ? fx[i]! : each + (i === autos[autos.length - 1] ? rest : 0);
    return { index: `${i + 1}/${n}`, label: onSale ? "na venda" : onDelivery ? "na entrega" : `${days} dias`, due, valueCents, fixed: isFixed };
  });
  const sumCents = rows.reduce((a, r) => a + r.valueCents, 0);
  return { rows, sumCents, diffCents: totalCents - sumCents };
}
export interface InstallmentRow { index: string; label: string; due: Date | null; valueCents: number; fixed: boolean }

/** Compatibilidade: parcelas iguais (ou com valores fixados). */
export function installments(totalCents: number, plan: string | null | undefined, issuedAt: Date, fixed?: (number | null | undefined)[] | null) {
  return installmentPlan(totalCents, plan, issuedAt, fixed).rows;
}

/** Mensagem quando as parcelas não fecham o total (null quando fecham). */
export function installmentError(diffCents: number) {
  if (diffCents === 0) return null;
  const v = (Math.abs(diffCents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return diffCents > 0 ? `As parcelas somam ${v} a menos que o total do pedido. Ajuste os valores fixados.` : `As parcelas passam ${v} do total do pedido. Ajuste os valores fixados.`;
}


export const validUntil = (issuedAt: Date, days: number) => new Date(issuedAt.getTime() + days * 86_400_000);
export const isExpired = (status: string, issuedAt: Date, days: number, now = new Date()) =>
  (status === "EMITIDO" || status === "ENVIADO") && validUntil(issuedAt, days).getTime() + 86_400_000 <= now.getTime();

export const PAY_METHODS = [
  { key: "PIX", label: "Pix à vista", plan: "na venda" },
  { key: "BOL28", label: "Boleto 28 dias", plan: "28" },
  { key: "BOL3", label: "Boleto 30/60/90", plan: "30/60/90" },
  { key: "CART3", label: "Cartão 3x sem juros", plan: "entrada/30/60" },
  { key: "CART6", label: "Cartão 6x sem juros", plan: "entrada/30/60/90/120/150" },
  { key: "CART10", label: "Cartão 10x sem juros", plan: "entrada/30/60/90/120/150/180/210/240/270" },
  { key: "METADE", label: "50% entrada + 50% na entrega", plan: "entrada/entrega" },
  { key: "OUTRO", label: "Personalizado", plan: "" },
] as const;
export const STATUS_LABEL = { RASCUNHO: "Rascunho", EMITIDO: "Emitido", ENVIADO: "Enviado", APROVADO: "Aprovado", RECUSADO: "Recusado", EXPIRADO: "Expirado" } as const;
export const PAYMENT_TERMS = PAY_METHODS.map((m) => m.label);
