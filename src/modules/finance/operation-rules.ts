/** Resultado da operação — regras puras (sem banco). Percentuais do markup incidem sobre a receita de produtos. */
import { COST_FIELDS, type MarkupCosts, type MarkupProfileRule } from "@/modules/pricing/markup";

export type MarkupSnapshot = MarkupProfileRule & { name: string };
export const snapshotOf = (p: MarkupSnapshot): MarkupSnapshot => ({
  name: p.name, cardFeeBps: p.cardFeeBps, extCommissionBps: p.extCommissionBps, intCommissionBps: p.intCommissionBps, taxBps: p.taxBps,
  packagingBps: p.packagingBps, financialBps: p.financialBps, otherBps: p.otherBps, idealMarginBps: p.idealMarginBps, minMarginBps: p.minMarginBps,
});
export function readSnapshot(v: unknown): MarkupSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  return { name: o.name, cardFeeBps: n("cardFeeBps"), extCommissionBps: n("extCommissionBps"), intCommissionBps: n("intCommissionBps"), taxBps: n("taxBps"), packagingBps: n("packagingBps"), financialBps: n("financialBps"), otherBps: n("otherBps"), idealMarginBps: n("idealMarginBps"), minMarginBps: n("minMarginBps") };
}

export type DeductionKey = keyof MarkupCosts;
export const DEDUCTIONS = COST_FIELDS;

/** Receita de produtos = total do orçamento sem o frete cobrado do cliente (CIF), que é repasse. */
export const productRevenue = (q: { totalCents: number; freightTerm: string; freightCents: number }) => {
  const freight = q.freightTerm === "CIF" ? q.freightCents : 0;
  return { revenue: q.totalCents - freight, freight };
};

/** Custo da mercadoria: soma de quantidade × custo unitário; itens sem custo ficam de fora e são sinalizados. */
export function goodsCost(items: { quantity: number; unitCostCents: number | null }[]) {
  const missing = items.filter((i) => i.unitCostCents == null).length;
  return { cost: items.reduce((a, i) => a + i.quantity * (i.unitCostCents ?? 0), 0), missing };
}

export function saleResult(revenue: number, cost: number, m: MarkupProfileRule) {
  const lines = Object.fromEntries(DEDUCTIONS.map((d) => [d.key, Math.round((revenue * m[d.key]) / 10_000)])) as Record<DeductionKey, number>;
  const deductions = Object.values(lines).reduce((a, b) => a + b, 0);
  const result = revenue - cost - deductions;
  const marginBps = revenue > 0 ? Math.round((result * 10_000) / revenue) : null;
  return { lines, deductions, result, marginBps, belowMin: marginBps != null && marginBps < m.minMarginBps, belowIdeal: marginBps != null && marginBps < m.idealMarginBps };
}

/** Sugestão de markup para o orçamento: o mais usado entre os produtos (pela quantidade). */
export function suggestProfile(items: { quantity: number; profileId: string | null }[]) {
  const count = new Map<string, number>();
  for (const i of items) if (i.profileId) count.set(i.profileId, (count.get(i.profileId) ?? 0) + Math.max(1, i.quantity));
  let best: string | null = null, n = 0;
  for (const [k, v] of count) if (v > n) { best = k; n = v; }
  return best;
}
