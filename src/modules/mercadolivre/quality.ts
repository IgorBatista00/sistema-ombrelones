import "server-only";
import { db } from "@/lib/db";
import { mlListingsView, type MlFilter } from "./service";
import { emptyListing, listingInitFrom, type ListingInit } from "./listing-form";
import { ISSUES, listingIssues, qualityScore, worstSeverity, type IssueCode, type Severity } from "./quality-rules";

export type QualityRow = {
  key: string; listingId: string | null; title: string; mlb: string | null; variation: string; type: string | null; status: string;
  priceCents: number | null; images: { image: string | null; name: string }[]; products: string; issues: IssueCode[]; severity: Severity | "ok"; score: number;
  soldUnits: number; salesWithoutCost: number; lastSoldPriceCents: number | null; init: ListingInit;
};

/** Pendências de cada anúncio cadastrado + anúncios vendidos sem cadastro. */
export async function mlDataQuality(f: MlFilter & { sev?: string; problema?: string }) {
  const v = await mlListingsView({ ...f, q: undefined, produto: undefined, tipo: undefined });
  const ids = v.listings.map((l) => l.id);
  const last = ids.length ? await db.mlOrderItem.findMany({ where: { listingId: { in: ids }, orderStatus: { not: "cancelled" } }, orderBy: { saleDate: "desc" }, distinct: ["listingId"], select: { listingId: true, unitPriceCents: true } }) : [];
  const lastMap = new Map(last.map((x) => [x.listingId!, x.unitPriceCents]));
  const noCost = await db.mlOrderItem.groupBy({ by: ["listingId"], where: { listingId: { in: ids }, costCents: null, orderStatus: { not: "cancelled" } }, _count: true });
  const noCostMap = new Map(noCost.map((x) => [x.listingId!, x._count]));

  const rows: QualityRow[] = v.listings.map((l) => {
    const issues = listingIssues({
      status: l.status, priceCents: l.priceCents, saleFeeBps: l.saleFeeBps, taxBps: l.taxBps, listingType: l.listingType, shippingCostCents: l.shippingCostCents, packagingCents: l.packagingCents, sku: l.sku,
      components: l.components.map((c) => ({ sku: c.sku, code: c.code, image: c.image, unitCostCents: c.unitCostCents })),
      simulation: l.simulation ? { profit: l.simulation.profit, marginBps: l.simulation.marginBps, costMissing: l.simulation.costMissing } : null,
      lastSoldPriceCents: lastMap.get(l.id) ?? null, hasSales: lastMap.has(l.id),
    });
    return {
      key: l.id, listingId: l.id, title: l.title, mlb: l.mlItemId, variation: l.variation, type: l.listingType, status: l.status, priceCents: l.priceCents,
      images: l.components.map((c) => ({ image: c.image, name: c.name })), products: l.components.map((c) => `${c.quantity}× ${c.sku}`).join(" + "),
      issues, severity: worstSeverity(issues), score: qualityScore(issues), soldUnits: l.soldUnits, salesWithoutCost: noCostMap.get(l.id) ?? 0, lastSoldPriceCents: lastMap.get(l.id) ?? null, init: listingInitFrom(l),
    };
  });
  for (const u of v.unlinked) rows.push({
    key: `sem:${u.itemId}|${u.variation}`, listingId: null, title: u.title, mlb: u.itemId, variation: u.variation, type: null, status: "ATIVO", priceCents: u.lastPriceCents,
    images: [], products: u.sku ? `SKU na venda: ${u.sku}` : "", issues: ["nao_cadastrado"], severity: "critico", score: 0, soldUnits: u.units, salesWithoutCost: u.units, lastSoldPriceCents: u.lastPriceCents,
    init: emptyListing({ mlItemId: /^[A-Z]{3}\d+$/.test(u.itemId) ? u.itemId : "", variation: u.variation, sku: u.sku ?? "", title: u.title.replace(/ — .*$/, ""), price: u.lastPriceCents != null ? (u.lastPriceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "" }),
  });

  const count = (code: IssueCode) => rows.filter((r) => r.issues.includes(code)).length;
  const summary = {
    total: rows.length, ok: rows.filter((r) => r.severity === "ok" || r.severity === "info").length, // completo = sem crítico nem atenção
    critico: rows.filter((r) => r.severity === "critico").length, aviso: rows.filter((r) => r.severity === "aviso").length, info: rows.filter((r) => r.severity === "info").length,
    score: rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 100,
    byIssue: (Object.keys(ISSUES) as IssueCode[]).map((c) => ({ code: c, ...ISSUES[c], count: count(c) })).filter((x) => x.count),
    salesWithoutCost: rows.reduce((a, r) => a + r.salesWithoutCost, 0),
  };
  const q = (f.q ?? "").trim().toLowerCase();
  const sevRank = { critico: 0, aviso: 1, info: 2, ok: 3 } as const;
  const list = rows
    .filter((r) => !f.sev || r.severity === f.sev)
    .filter((r) => !f.problema || r.issues.includes(f.problema as IssueCode))
    .filter((r) => !q || `${r.title} ${r.mlb} ${r.products}`.toLowerCase().includes(q))
    .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.score - b.score || b.soldUnits - a.soldUnits);
  return { summary, list };
}
