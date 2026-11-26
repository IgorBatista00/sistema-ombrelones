import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { isIsoDay, spDay } from "@/modules/purchase-orders/rules";
import { mlSalesView } from "@/modules/mercadolivre/service";
import { DEDUCTIONS, goodsCost, productRevenue, readSnapshot, saleResult, snapshotOf, type DeductionKey } from "./operation-rules";
import { PROFILE_SELECT } from "@/modules/pricing/profiles";

export const resultFilterSchema = z.object({
  rde: z.string().optional().refine((v) => !v || isIsoDay(v)).catch(undefined),
  rate: z.string().optional().refine((v) => !v || isIsoDay(v)).catch(undefined),
});
/** Período padrão: mês atual (fuso de São Paulo). */
export function resultPeriod(f: z.infer<typeof resultFilterSchema>, now = new Date()) {
  const today = spDay(now), first = `${today.slice(0, 8)}01`;
  let de = f.rde ?? first, ate = f.rate ?? today;
  if (de > ate) [de, ate] = [ate, de];
  return { de, ate };
}
const range = (de: string, ate: string) => ({ gte: new Date(`${de}T00:00:00-03:00`), lt: new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000) });

type Agg = { revenue: number; cost: number; deductions: number; result: number; sales: number };
const emptyAgg = (): Agg => ({ revenue: 0, cost: 0, deductions: 0, result: 0, sales: 0 });
const add = (a: Agg, s: { revenue: number; cost: number; deductions: number; result: number }) => { a.revenue += s.revenue; a.cost += s.cost; a.deductions += s.deductions; a.result += s.result; a.sales++; };
const withMargin = <T extends Agg>(a: T) => ({ ...a, marginBps: a.revenue > 0 ? Math.round((a.result * 10_000) / a.revenue) : null });

/** Resultado da operação: vendas (orçamentos fechados no período) − custo da mercadoria − custos do markup. Mercado Livre em linha separada. */
export async function operationResult(f: z.infer<typeof resultFilterSchema>) {
  const { de, ate } = resultPeriod(f);
  const quotes = await db.quote.findMany({
    where: { status: "APROVADO", closedAt: range(de, ate) },
    orderBy: { closedAt: "desc" },
    select: { id: true, code: true, closedAt: true, clientSnapshot: true, seller: true, category: true, totalCents: true, freightTerm: true, freightCents: true, markupSnapshot: true,
      markupProfile: { select: PROFILE_SELECT }, items: { select: { quantity: true, unitCostCents: true } } },
  });

  const totals = { ...emptyAgg(), freight: 0, lines: Object.fromEntries(DEDUCTIONS.map((d) => [d.key, 0])) as Record<DeductionKey, number>, belowMin: 0, costMissing: 0 };
  const byMarkup = new Map<string, Agg & { name: string }>(), bySeller = new Map<string, Agg & { name: string }>(), byCategory = new Map<string, Agg & { name: string }>();
  const sales: { id: string; code: string; closedAt: Date; client: string; seller: string; category: string; markup: string; revenue: number; freight: number; cost: number; deductions: number; result: number; marginBps: number | null; belowMin: boolean; minMarginBps: number; costMissing: number }[] = [];
  const withoutMarkup: { id: string; code: string; closedAt: Date; client: string; revenue: number }[] = [];

  for (const q of quotes) {
    const client = String((q.clientSnapshot as Record<string, unknown> | null)?.name ?? "") || "Cliente não informado";
    const { revenue, freight } = productRevenue(q);
    const m = readSnapshot(q.markupSnapshot) ?? (q.markupProfile ? snapshotOf(q.markupProfile) : null);
    if (!m) { withoutMarkup.push({ id: q.id, code: q.code, closedAt: q.closedAt!, client, revenue }); continue; }
    const gc = goodsCost(q.items);
    const r = saleResult(revenue, gc.cost, m);
    const row = { id: q.id, code: q.code, closedAt: q.closedAt!, client, seller: q.seller || "Sem vendedor", category: q.category || "Sem categoria", markup: m.name, revenue, freight, cost: gc.cost, deductions: r.deductions, result: r.result, marginBps: r.marginBps, belowMin: r.belowMin, minMarginBps: m.minMarginBps, costMissing: gc.missing };
    sales.push(row);
    add(totals, row); totals.freight += freight;
    for (const d of DEDUCTIONS) totals.lines[d.key] += r.lines[d.key];
    if (r.belowMin) totals.belowMin++;
    if (gc.missing) totals.costMissing++;
    for (const [map, key] of [[byMarkup, m.name], [bySeller, row.seller], [byCategory, row.category]] as const) {
      const a = map.get(key) ?? { ...emptyAgg(), name: key }; add(a, row); map.set(key, a);
    }
  }

  const ml = (await mlSalesView({ de, ate })).summary;
  const sorted = (m: Map<string, Agg & { name: string }>) => [...m.values()].map(withMargin).sort((a, b) => b.revenue - a.revenue);
  return {
    de, ate, sales, withoutMarkup,
    totals: withMargin(totals),
    byMarkup: sorted(byMarkup), bySeller: sorted(bySeller), byCategory: sorted(byCategory),
    ml: { orders: ml.orders, revenue: ml.product, fees: ml.fees, cost: ml.cost, extras: ml.extras, result: ml.profit, marginBps: ml.marginBps, costMissing: ml.costMissing, unlinked: ml.unlinked },
  };
}
