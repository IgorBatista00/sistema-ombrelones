import "server-only";
import { db } from "@/lib/db";
import { spDay } from "@/modules/purchase-orders/rules";

const DAY = 86_400_000;
const isoAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isoDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
import { mlPeriod, ordersIn, range, type MlFilter } from "./service";
import { SHIP_STAGE, type ShipStage } from "./rules";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const spParts = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hour: Number(p.hour) };
};

type Agg = { revenue: number; profit: number; units: number; orders: number; cost: number; fees: number; costMissing: boolean };
const agg = (): Agg => ({ revenue: 0, profit: 0, units: 0, orders: 0, cost: 0, fees: 0, costMissing: false });

/** Painel do Mercado Livre: indicadores, séries no tempo, composição do faturamento, produtos e anúncios com foto. */
export async function mlDashboard(f: MlFilter) {
  const { de, ate } = mlPeriod(f);
  const days = isoDiff(de, ate) + 1;
  const prevAte = isoAdd(de, -1), prevDe = isoAdd(prevAte, -(days - 1));
  const [rows, prevRows] = await Promise.all([ordersIn({ saleDate: range(de, ate) }), ordersIn({ saleDate: range(prevDe, prevAte) })]);
  const active = rows.filter((r) => !r.cancelled), prevActive = prevRows.filter((r) => !r.cancelled);
  const sum = (list: typeof rows, k: "product" | "fees" | "shipping" | "cost" | "extras" | "profit" | "units") => list.reduce((a, r) => a + r[k], 0);

  const kpi = {
    revenue: sum(active, "product"), orders: active.length, units: sum(active, "units"),
    fees: sum(active, "fees") + sum(active, "shipping"), cost: sum(active, "cost"), extras: sum(active, "extras"), profit: sum(active, "profit"),
    cancelled: rows.length - active.length, total: rows.length,
    toShip: active.filter((r) => r.stage === "a_enviar").length, problems: active.filter((r) => r.stage === "problema").length,
    costMissing: active.filter((r) => r.costMissing).length, unlinked: active.filter((r) => !r.linked).length,
  };
  const prev = { revenue: sum(prevActive, "product"), orders: prevActive.length, profit: sum(prevActive, "profit"), units: sum(prevActive, "units") };

  // série no tempo: por dia até 62 dias, por semana até 1 ano, senão por mês
  const bucket = days <= 62 ? "dia" : days <= 370 ? "semana" : "mes";
  const keyOf = (iso: string) => bucket === "dia" ? iso : bucket === "mes" ? iso.slice(0, 7) : isoAdd(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7)); // semana começa na segunda
  const series = new Map<string, { key: string; revenue: number; profit: number; orders: number }>();
  for (let d = de; d <= ate; d = isoAdd(d, 1)) { const k = keyOf(d); if (!series.has(k)) series.set(k, { key: k, revenue: 0, profit: 0, orders: 0 }); }
  for (const r of active) { const s = series.get(keyOf(spDay(r.saleDate))); if (s) { s.revenue += r.product; s.profit += r.profit; s.orders++; } }

  // quando vende
  const byWeekday = WEEK.map((label) => ({ label, orders: 0, revenue: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, orders: 0, revenue: 0 }));
  for (const r of active) { const p = spParts(r.saleDate); byWeekday[p.wd].orders++; byWeekday[p.wd].revenue += r.product; byHour[p.hour].orders++; byHour[p.hour].revenue += r.product; }

  // expedição
  const stages = (Object.keys(SHIP_STAGE) as ShipStage[]).map((s) => ({ stage: s, label: SHIP_STAGE[s].label, tone: SHIP_STAGE[s].tone, orders: rows.filter((r) => r.stage === s).length })).filter((s) => s.orders);

  // produtos e anúncios (com foto)
  const listingIds = [...new Set(active.flatMap((r) => r.lines.map((l) => l.listingId).filter(Boolean)))] as string[];
  const listings = await db.mlListing.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, title: true, mlItemId: true, listingType: true, components: { select: { variantId: true, quantity: true, variant: { select: { sku: true, product: { select: { name: true, images: { orderBy: { position: "asc" }, take: 6, select: { url: true, variantId: true } } } } } } } } },
  });
  const lmap = new Map(listings.map((l) => [l.id, l]));
  const imgOf = (c: (typeof listings)[number]["components"][number]) => c.variant.product.images.find((i) => i.variantId === c.variantId)?.url ?? c.variant.product.images[0]?.url ?? null;
  const byListing = new Map<string, Agg & { id: string; title: string; mlb: string | null; type: string | null; images: string[] }>();
  const byProduct = new Map<string, Agg & { id: string; name: string; sku: string; image: string | null }>();
  const byType = { classico: agg(), premium: agg(), outro: agg() };
  for (const r of active) for (const l of r.lines) {
    const li = l.listingId ? lmap.get(l.listingId) : null;
    const key = li?.id ?? `sem:${l.itemId}`;
    const a = byListing.get(key) ?? { ...agg(), id: key, title: li?.title ?? l.title, mlb: li?.mlItemId ?? l.itemId, type: li?.listingType ?? null, images: li ? li.components.map(imgOf).filter(Boolean) as string[] : [] };
    a.revenue += l.revenue; a.profit += l.profit; a.units += l.quantity; a.orders++; a.cost += l.cost; a.fees += l.fees + l.shipping; a.costMissing ||= l.costMissing;
    byListing.set(key, a);
    const t = byType[(li?.listingType as "classico" | "premium") ?? "outro"] ?? byType.outro;
    t.revenue += l.revenue; t.profit += l.profit; t.units += l.quantity; t.orders++; t.fees += l.fees + l.shipping; t.costMissing ||= l.costMissing;
    if (li?.components.length) {
      const totalQ = li.components.reduce((s, c) => s + c.quantity, 0);
      for (const c of li.components) { // kit: divide receita e lucro pela quantidade de peças
        const share = c.quantity / totalQ;
        const p = byProduct.get(c.variantId) ?? { ...agg(), id: c.variantId, name: c.variant.product.name, sku: c.variant.sku, image: imgOf(c) };
        p.revenue += Math.round(l.revenue * share); p.profit += Math.round(l.profit * share); p.units += l.quantity * c.quantity; p.orders++; p.costMissing ||= l.costMissing;
        byProduct.set(c.variantId, p);
      }
    }
  }
  const withMargin = <T extends Agg>(x: T) => ({ ...x, marginBps: x.revenue > 0 ? Math.round((x.profit * 10_000) / x.revenue) : null });
  const topListings = [...byListing.values()].map(withMargin).sort((a, b) => b.revenue - a.revenue);
  const topProducts = [...byProduct.values()].map(withMargin).sort((a, b) => b.revenue - a.revenue);
  const lowMargin = topListings.filter((l) => !l.costMissing && l.marginBps != null && l.marginBps < 1000).sort((a, b) => (a.marginBps ?? 0) - (b.marginBps ?? 0)).slice(0, 5);

  return {
    de, ate, days, prevDe, prevAte, bucket, kpi, prev,
    series: [...series.values()], byWeekday, byHour, stages,
    byType: { classico: withMargin(byType.classico), premium: withMargin(byType.premium) },
    topListings: topListings.slice(0, 10), listingsCount: topListings.length, topProducts: topProducts.slice(0, 10), productsCount: topProducts.length, lowMargin,
    recent: rows.slice(0, 8).map((r) => ({ orderId: r.orderId, saleDate: r.saleDate, buyer: r.buyer, title: r.lines.map((l) => `${l.quantity}× ${l.listingTitle ?? l.title}`).join(", "), product: r.product, profit: r.profit, cancelled: r.cancelled, stageLabel: r.stageLabel, image: (r.lines[0]?.listingId && lmap.get(r.lines[0].listingId)?.components[0] ? imgOf(lmap.get(r.lines[0].listingId!)!.components[0]) : null) })),
  };
}
export type MlDashboard = Awaited<ReturnType<typeof mlDashboard>>;
