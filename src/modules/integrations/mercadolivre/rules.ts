/**
 * Mercado Livre — regras puras (sem rede/banco), testáveis.
 * Campos conforme a documentação oficial: pedidos (/orders/search: id, pack_id, status, date_closed, buyer.nickname,
 * order_items[].item.title/quantity, payments[].id/status/transaction_amount/shipping_cost/marketplace_fee) e
 * pagamento no Mercado Pago (/v1/payments/{id}: money_release_date, money_release_status,
 * transaction_details.net_received_amount).
 */
export interface MlOrder {
  id: number | string; pack_id?: number | string | null; status: string; date_created: string; date_closed?: string | null;
  buyer?: { nickname?: string | null } | null;
  order_items?: { item?: { id?: string | null; title?: string | null; category_id?: string | null } | null; quantity?: number | null; unit_price?: number | null; sale_fee?: number | null }[] | null;
  payments?: MlOrderPayment[] | null;
}
export interface MlOrderPayment { id: number | string; status: string; transaction_amount?: number | null; shipping_cost?: number | null; marketplace_fee?: number | null; date_approved?: string | null }
export interface MpPayment { money_release_date?: string | null; money_release_status?: string | null; transaction_details?: { net_received_amount?: number | null } | null }

const cents = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null);

/** Um registro por pagamento do pedido. `mp` = detalhes do Mercado Pago por id de pagamento (quando consultados). */
export function orderToReceipts(o: MlOrder, mp: Map<string, MpPayment> = new Map()) {
  const items = (o.order_items ?? []).map((i) => `${i.quantity ?? 1}× ${i.item?.title ?? "item"}`).join(" · ") || "—";
  return (o.payments ?? []).map((p) => {
    const d = mp.get(String(p.id));
    return {
      paymentId: String(p.id), orderId: String(o.id), packId: o.pack_id != null ? String(o.pack_id) : null,
      orderStatus: o.status, paymentStatus: p.status,
      saleDate: new Date(p.date_approved || o.date_closed || o.date_created),
      buyerNickname: o.buyer?.nickname ?? null, itemsSummary: items.slice(0, 500),
      grossCents: cents(p.transaction_amount) ?? 0, shippingCents: cents(p.shipping_cost), feeCents: cents(p.marketplace_fee),
      netCents: cents(d?.transaction_details?.net_received_amount),
      releaseDate: d?.money_release_date ? new Date(d.money_release_date) : null, releaseStatus: d?.money_release_status ?? null,
    };
  });
}

/** Renovar o token quando faltar menos de 30 min (o access token do ML dura 6 h). */
export const needsRefresh = (expiresAt: Date, now = new Date()) => expiresAt.getTime() - now.getTime() < 30 * 60_000;

export type ReleaseState = "liberado" | "a_liberar" | "sem_info" | "estornado";
export const RELEASE_LABEL: Record<ReleaseState, string> = { liberado: "Liberado", a_liberar: "A liberar", sem_info: "Sem informação", estornado: "Devolvido/estornado" };
export function releaseState(r: { paymentStatus: string; releaseStatus: string | null; releaseDate: Date | null }, now = new Date()): ReleaseState {
  if (["refunded", "charged_back", "cancelled", "rejected"].includes(r.paymentStatus)) return "estornado";
  if (r.releaseStatus === "released") return "liberado";
  if (r.releaseStatus === "pending" || (r.releaseDate && r.releaseDate.getTime() > now.getTime())) return "a_liberar";
  if (r.releaseDate && r.releaseDate.getTime() <= now.getTime()) return "liberado";
  return "sem_info";
}

/** Indicadores: só pagamentos aprovados entram em bruto/tarifas/líquido. Líquido "estimado" = bruto − tarifa quando o MP não informa. */
export function mlSummary(rows: { paymentStatus: string; grossCents: number; feeCents: number | null; netCents: number | null; releaseStatus: string | null; releaseDate: Date | null }[], now = new Date()) {
  const ok = rows.filter((r) => r.paymentStatus === "approved");
  const net = (r: (typeof ok)[number]) => r.netCents ?? r.grossCents - (r.feeCents ?? 0);
  return {
    count: ok.length,
    gross: ok.reduce((a, r) => a + r.grossCents, 0),
    fees: ok.reduce((a, r) => a + (r.feeCents ?? 0), 0),
    net: ok.reduce((a, r) => a + net(r), 0),
    netEstimated: ok.some((r) => r.netCents == null),
    toRelease: ok.filter((r) => releaseState(r, now) === "a_liberar").reduce((a, r) => a + net(r), 0),
    released: ok.filter((r) => releaseState(r, now) === "liberado").reduce((a, r) => a + net(r), 0),
    refunded: rows.filter((r) => releaseState(r, now) === "estornado").length,
  };
}

/** Itens (anúncios) do pedido, com a categoria do anúncio. sale_fee é por unidade (comissão). */
export function orderToItems(o: MlOrder) {
  return (o.order_items ?? []).map((i, position) => ({
    orderId: String(o.id), position, itemId: i.item?.id ?? "—", title: (i.item?.title ?? "item").slice(0, 300), categoryId: i.item?.category_id ?? null,
    quantity: i.quantity ?? 1, unitPriceCents: cents(i.unit_price) ?? 0, saleFeeCents: cents(i.sale_fee), orderStatus: o.status,
    saleDate: new Date(o.date_closed || o.date_created),
  }));
}

/** Caminho legível da categoria a partir de path_from_root (GET /categories/{id}). */
export function categoryPath(c: { name: string; path_from_root?: { name: string }[] | null }) {
  const p = (c.path_from_root ?? []).map((x) => x.name).filter(Boolean);
  return p.length ? p.join(" > ") : c.name;
}

export interface CategoryRow { categoryId: string | null; name: string; path: string; orders: number; units: number; revenueCents: number; feeCents: number; avgTicketCents: number; sharePct: number }
/**
 * Vendas por categoria de anúncio (pedidos não cancelados): faturamento = unit_price × quantidade (produtos, sem frete),
 * tarifas = sale_fee × quantidade. Ordenado por faturamento.
 */
export function categoryBreakdown(items: { orderId: string; categoryId: string | null; quantity: number; unitPriceCents: number; saleFeeCents: number | null; orderStatus: string }[], names: Map<string, { name: string; path: string }>): CategoryRow[] {
  const live = items.filter((i) => i.orderStatus !== "cancelled");
  const total = live.reduce((a, i) => a + i.unitPriceCents * i.quantity, 0);
  const by = new Map<string, { orders: Set<string>; units: number; revenue: number; fees: number; id: string | null }>();
  for (const i of live) {
    const k = i.categoryId ?? "∅";
    const g = by.get(k) ?? { orders: new Set<string>(), units: 0, revenue: 0, fees: 0, id: i.categoryId };
    g.orders.add(i.orderId); g.units += i.quantity; g.revenue += i.unitPriceCents * i.quantity; g.fees += (i.saleFeeCents ?? 0) * i.quantity;
    by.set(k, g);
  }
  return [...by.values()].map((g) => {
    const n = g.id ? names.get(g.id) : null;
    return { categoryId: g.id, name: n?.name ?? (g.id ? g.id : "Sem categoria"), path: n?.path ?? (g.id ?? ""), orders: g.orders.size, units: g.units, revenueCents: g.revenue, feeCents: g.fees,
      avgTicketCents: g.orders.size ? Math.round(g.revenue / g.orders.size) : 0, sharePct: total ? Math.round((g.revenue / total) * 1000) / 10 : 0 };
  }).sort((a, b) => b.revenueCents - a.revenueCents);
}
