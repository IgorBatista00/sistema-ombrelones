import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { cancelledOf, getOwnPrefixes, mlListingsView, range, type MlFilter } from "./service";
import { lineProfit, soldLineOf } from "./rules";
import { emptyListing, listingInitFrom, type ListingInit } from "./listing-form";
import { SALE_ISSUES, columnsNet, costChecks, netDiff, saleIssues, saleLevel, type CostKey, type CostState, type SaleIssue } from "./sale-check-rules";

export type SaleCheckRow = {
  id: string; orderId: string; saleDate: Date; status: string; cancelled: boolean;
  title: string; itemId: string; variation: string | null; sku: string | null; quantity: number; listingTitle: string | null;
  productCents: number; feesCents: number; netCents: number | null; columnsNetCents: number; diffCents: number | null;
  costCents: number | null; profitCents: number; costs: Record<CostKey, CostState> | null; issues: SaleIssue[]; level: ReturnType<typeof saleLevel>;
  listingId: string | null; init: ListingInit | null; foreign: boolean; foreignManual: boolean | null;
};

/** Confere cada venda importada da planilha do ML: vínculo, custo, tarifas e se a conta bate com o Total do ML. */
export async function mlSaleCheck(f: MlFilter) {
  const where: Prisma.MlOrderItemWhereInput = f.de || f.ate ? { saleDate: range(f.de ?? "2000-01-01", f.ate ?? "2100-01-01") } : {};
  const items = await db.mlOrderItem.findMany({
    where, orderBy: [{ saleDate: "desc" }, { orderId: "asc" }, { position: "asc" }], take: 20000,
    include: { listing: { select: { id: true, title: true, saleFeeBps: true, fixedFeeCents: true, shippingCostCents: true, packagingCents: true, taxBps: true, otherCostCents: true } } },
  });
  const lv = await mlListingsView({});
  const initOf = new Map(lv.listings.map((l) => [l.id, listingInitFrom(l)]));

  const rows: SaleCheckRow[] = items.map((i) => {
    const cancelled = cancelledOf(i.orderStatus);
    const line = soldLineOf(i, cancelled);
    const p = lineProfit(line, i.listing, i.costCents != null ? i.costCents / i.quantity : null);
    const input = {
      cancelled, productCents: line.productCents, shippingRevenueCents: i.shippingRevenueCents, saleFeeCents: line.saleFeeTotalCents ?? null,
      shippingFeeCents: i.shippingFeeCents, refundCents: i.refundCents, netCents: i.netCents, sku: i.sku, linked: !!i.listingId,
      costCents: i.costCents, taxBps: i.listing?.taxBps ?? null, profitCents: p.profit, inPack: i.inPack, bonusCents: i.bonusCents, listingFeeBps: i.listing?.saleFeeBps ?? null, otherCents: line.otherCents ?? null,
    };
    const issues = i.foreign ? [] : saleIssues(input); // de outra empresa: não é conferida
    const price = Math.round(line.productCents / Math.max(1, i.quantity));
    return {
      id: i.id, orderId: i.orderId, saleDate: i.saleDate, status: i.statusText ?? i.orderStatus, cancelled,
      title: i.title, itemId: i.itemId, variation: i.variation, sku: i.sku, quantity: i.quantity, listingTitle: i.listing?.title ?? null,
      productCents: line.productCents, feesCents: (line.saleFeeTotalCents ?? 0) + (i.shippingFeeCents ?? 0), netCents: i.netCents,
      columnsNetCents: columnsNet(input), diffCents: netDiff(input), costCents: i.costCents, profitCents: p.profit, costs: cancelled || i.foreign ? null : costChecks(input), issues, level: saleLevel(issues),
      listingId: i.listingId, foreign: i.foreign, foreignManual: i.foreignManual,
      init: i.listingId ? initOf.get(i.listingId) ?? null : emptyListing({
        mlItemId: /^[A-Z]{3}\d+$/.test(i.itemId) ? i.itemId : "", variation: i.variation ?? "", sku: i.sku ?? "", title: i.title.replace(/ — .*$/, ""),
        price: (price / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      }),
    };
  });

  const foreignRows = rows.filter((r) => r.foreign);
  const own = rows.filter((r) => !r.foreign); // vendas de outra empresa ficam fora de todos os números
  const active = own.filter((r) => !r.cancelled);
  const sum = (xs: SaleCheckRow[], k: (r: SaleCheckRow) => number) => xs.reduce((a, r) => a + k(r), 0);
  const withTotal = active.filter((r) => r.netCents != null);
  const summary = {
    total: own.length, active: active.length, cancelled: own.length - active.length,
    ok: active.filter((r) => r.level === "ok").length, critico: own.filter((r) => r.level === "critico").length, aviso: own.filter((r) => r.level === "aviso").length,
    byIssue: (Object.keys(SALE_ISSUES) as SaleIssue[]).map((c) => ({ code: c, ...SALE_ISSUES[c], count: own.filter((r) => r.issues.includes(c)).length })).filter((x) => x.count),
    foreign: foreignRows.length, foreignRevenue: foreignRows.filter((r) => !r.cancelled).reduce((a, r) => a + r.productCents, 0), prefixes: await getOwnPrefixes(),
    noCostRevenue: sum(active.filter((r) => r.issues.includes("sem_anuncio") || r.issues.includes("sem_custo")), (r) => r.productCents),
    noCostUnits: sum(active.filter((r) => r.issues.includes("sem_anuncio") || r.issues.includes("sem_custo")), (r) => r.quantity),
    mlNet: sum(withTotal, (r) => r.netCents!), columnsNet: sum(withTotal, (r) => r.columnsNetCents), withTotal: withTotal.length,
    costs: (["tarifa", "frete", "imposto", "mercadoria"] as CostKey[]).map((k) => ({ key: k, ok: active.filter((r) => r.costs && (r.costs[k] === "ok" || r.costs[k] === "pacote")).length, missing: active.filter((r) => r.costs?.[k] === "falta").length, estimated: active.filter((r) => r.costs?.[k] === "estimado").length })),
    allCosts: active.filter((r) => r.costs && Object.values(r.costs).every((v) => v === "ok" || v === "pacote")).length,
    cancelledValue: sum(own.filter((r) => r.issues.includes("cancelada_com_valor")), (r) => r.netCents ?? 0),
  };

  const q = (f.q ?? "").trim().toLowerCase();
  const rank = { critico: 0, aviso: 1, ok: 2 } as const;
  const list = (f.sev === "outras" ? foreignRows : own)
    .filter((r) => (f.sev === "outras" ? true : f.sev === "canceladas" ? r.cancelled : !f.sev || (r.level === f.sev && (f.sev !== "ok" || !r.cancelled))))
    .filter((r) => !f.problema || r.issues.includes(f.problema as SaleIssue))
    .filter((r) => !q || `${r.orderId} ${r.title} ${r.itemId} ${r.sku ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => rank[a.level] - rank[b.level] || b.saleDate.getTime() - a.saleDate.getTime());
  return { summary, list };
}
