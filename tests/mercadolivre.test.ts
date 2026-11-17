import { describe, expect, it } from "vitest";
import { categoryBreakdown, categoryPath, mlSummary, needsRefresh, orderToItems, orderToReceipts, releaseState } from "@/modules/integrations/mercadolivre/rules";

// formato conforme exemplos da documentação oficial (valores fictícios de teste)
const order = {
  id: 2000003508419013, pack_id: null, status: "paid", date_created: "2026-11-10T10:01:50.000-03:00", date_closed: "2026-11-10T10:01:53.000-03:00",
  buyer: { nickname: "COMPRADOR_TESTE" },
  order_items: [{ item: { title: "Ombrelone teste" }, quantity: 2 }],
  payments: [{ id: 1833868697, status: "approved", transaction_amount: 1299.9, shipping_cost: 0, marketplace_fee: 155.99, date_approved: "2026-11-10T10:02:00.000-03:00" }],
};

describe("Mercado Livre", () => {
  it("pedido → recebimento por pagamento (centavos, itens, comprador)", () => {
    const [r] = orderToReceipts(order);
    expect(r).toMatchObject({ paymentId: "1833868697", orderId: "2000003508419013", grossCents: 129_990, feeCents: 15_599, shippingCents: 0, netCents: null, itemsSummary: "2× Ombrelone teste", buyerNickname: "COMPRADOR_TESTE", releaseDate: null });
  });
  it("usa liberação e líquido do Mercado Pago quando disponíveis", () => {
    const mp = new Map([["1833868697", { money_release_date: "2026-11-24T10:02:00.000-03:00", money_release_status: "pending", transaction_details: { net_received_amount: 1143.91 } }]]);
    const [r] = orderToReceipts(order, mp);
    expect(r.netCents).toBe(114_391); expect(r.releaseStatus).toBe("pending"); expect(r.releaseDate!.toISOString()).toBe("2026-11-24T13:02:00.000Z");
  });
  it("situação da liberação", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(releaseState({ paymentStatus: "approved", releaseStatus: "released", releaseDate: null }, now)).toBe("liberado");
    expect(releaseState({ paymentStatus: "approved", releaseStatus: "pending", releaseDate: new Date("2026-11-24T00:00:00Z") }, now)).toBe("a_liberar");
    expect(releaseState({ paymentStatus: "approved", releaseStatus: null, releaseDate: null }, now)).toBe("sem_info");
    expect(releaseState({ paymentStatus: "refunded", releaseStatus: "released", releaseDate: null }, now)).toBe("estornado");
  });
  it("indicadores: só aprovados; líquido estimado quando o MP não informa", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    const s = mlSummary([
      { paymentStatus: "approved", grossCents: 10_000, feeCents: 1_200, netCents: 8_500, releaseStatus: "released", releaseDate: null },
      { paymentStatus: "approved", grossCents: 20_000, feeCents: 2_400, netCents: null, releaseStatus: "pending", releaseDate: new Date("2026-12-01T00:00:00Z") },
      { paymentStatus: "refunded", grossCents: 5_000, feeCents: 600, netCents: null, releaseStatus: null, releaseDate: null },
    ], now);
    expect(s).toEqual({ count: 2, gross: 30_000, fees: 3_600, net: 26_100, netEstimated: true, toRelease: 17_600, released: 8_500, refunded: 1 });
  });
  it("renova o token antes de expirar", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(needsRefresh(new Date("2026-11-16T12:20:00Z"), now)).toBe(true);
    expect(needsRefresh(new Date("2026-11-16T15:00:00Z"), now)).toBe(false);
  });
});

describe("Mercado Livre — categoria do anúncio", () => {
  const o = (id: number, status: string, items: [string, string | null, number, number, number][]) => ({
    id, status, date_created: "2026-11-10T10:00:00.000-03:00",
    order_items: items.map(([itemId, cat, qty, price, fee]) => ({ item: { id: itemId, title: `Anúncio ${itemId}`, category_id: cat }, quantity: qty, unit_price: price, sale_fee: fee })),
  });
  it("itens do pedido com categoria, preço e comissão por unidade", () => {
    const it = orderToItems(o(1, "paid", [["MLB1", "MLB100", 2, 62.96, 11.07]]));
    expect(it[0]).toMatchObject({ orderId: "1", position: 0, itemId: "MLB1", categoryId: "MLB100", quantity: 2, unitPriceCents: 6_296, saleFeeCents: 1_107 });
  });
  it("caminho legível da categoria", () => {
    expect(categoryPath({ name: "Ombrelones", path_from_root: [{ name: "Casa, Móveis e Decoração" }, { name: "Jardim" }, { name: "Ombrelones" }] })).toBe("Casa, Móveis e Decoração > Jardim > Ombrelones");
    expect(categoryPath({ name: "Outros" })).toBe("Outros");
  });
  it("vendas por categoria: pedidos, unidades, faturamento, tarifas, participação; ignora cancelados", () => {
    const items = [
      ...orderToItems(o(1, "paid", [["MLB1", "MLB100", 2, 100, 12], ["MLB2", "MLB200", 1, 50, 6]])),
      ...orderToItems(o(2, "paid", [["MLB1", "MLB100", 1, 100, 12]])),
      ...orderToItems(o(3, "cancelled", [["MLB3", "MLB200", 5, 50, 6]])),
      ...orderToItems(o(4, "paid", [["MLB9", null, 1, 50, 0]])),
    ];
    const names = new Map([["MLB100", { name: "Ombrelones", path: "Casa > Jardim > Ombrelones" }]]);
    const b = categoryBreakdown(items, names);
    expect(b.map((r) => [r.name, r.orders, r.units, r.revenueCents, r.feeCents, r.sharePct])).toEqual([
      ["Ombrelones", 2, 3, 30_000, 3_600, 75], ["MLB200", 1, 1, 5_000, 600, 12.5], ["Sem categoria", 1, 1, 5_000, 0, 12.5],
    ]);
    expect(b[0].avgTicketCents).toBe(15_000);
  });
});
