import { describe, expect, it } from "vitest";
import { bpsFromPct, lineProfit, listingUnitCost, matchListing, shipStage, simulateListing, stockAdjustments, variantUnitCost } from "@/modules/mercadolivre/rules";
import { fieldOf, parseMlRow, findHeader } from "@/modules/integrations/mercadolivre/sheet-rules";

describe("Mercado Livre · envio", () => {
  it("classifica pelo status da planilha", () => {
    expect(shipStage("Pronto para enviar — Imprima a etiqueta", false)).toBe("a_enviar");
    expect(shipStage("Etiqueta pronta para imprimir", false)).toBe("a_enviar");
    expect(shipStage("A caminho", false)).toBe("enviada");
    expect(shipStage("Entregue", false)).toBe("entregue");
    expect(shipStage("Não entregue — devolução em andamento", false)).toBe("problema");
    expect(shipStage("Cancelada pelo comprador", true)).toBe("cancelada");
    expect(shipStage("Pronto para enviar", false, new Date())).toBe("enviada"); // despachado aqui no sistema
    expect(shipStage("Venda paga", false)).toBe("outra");
  });
});

describe("Mercado Livre · custo e lucro", () => {
  it("custo: médio → última compra → cadastro", () => {
    expect(variantUnitCost({ avgCostCents: 100, lastCostCents: 90, productCostCents: 80 })).toEqual({ cents: 100, source: "médio" });
    expect(variantUnitCost({ lastCostCents: 90, productCostCents: 80 }).cents).toBe(90);
    expect(variantUnitCost({ productCostCents: 80 }).source).toBe("cadastro");
    expect(variantUnitCost({}).cents).toBeNull();
  });
  it("kit soma os produtos × quantidade e avisa custo faltando", () => {
    expect(listingUnitCost([{ quantity: 1, unitCostCents: 30000 }, { quantity: 2, unitCostCents: 5000 }])).toEqual({ cents: 40000, missing: false });
    expect(listingUnitCost([{ quantity: 1, unitCostCents: null }]).missing).toBe(true);
    expect(listingUnitCost([]).missing).toBe(true);
  });
  it("usa tarifa e frete reais da planilha quando existem", () => {
    const p = lineProfit({ quantity: 2, productCents: 100000, shippingRevenueCents: 0, saleFeeTotalCents: 16000, shippingFeeCents: 6000 }, { saleFeeBps: 1300, taxBps: 600, packagingCents: 500 }, 25000);
    // 100000 − 16000 − 6000 − 50000 (custo) − 1000 (embalagem) − 6000 (imposto 6%)
    expect(p.profit).toBe(21000);
    expect(p.marginBps).toBe(2100);
    expect(p.feesEstimated).toBe(false);
  });
  it("estima pelo cadastro quando a planilha não traz tarifas", () => {
    const p = lineProfit({ quantity: 1, productCents: 50000 }, { saleFeeBps: 1650, fixedFeeCents: 0, shippingCostCents: 3000 }, 20000);
    expect(p.fees).toBe(8250);
    expect(p.shipping).toBe(3000);
    expect(p.profit).toBe(50000 - 8250 - 3000 - 20000);
    expect(p.feesEstimated).toBe(true);
  });
  it("cancelada não conta; sem custo avisa", () => {
    expect(lineProfit({ quantity: 1, productCents: 50000, cancelled: true }, null, 1000).profit).toBe(0);
    expect(lineProfit({ quantity: 1, productCents: 50000 }, null, null).costMissing).toBe(true);
  });
  it("simula o lucro por unidade no cadastro do anúncio", () => {
    expect(simulateListing(30000, { saleFeeBps: 1300, fixedFeeCents: 600, taxBps: 400 }, 15000).profit).toBe(30000 - 3900 - 600 - 1200 - 15000);
  });
  it("lê percentual", () => {
    expect(bpsFromPct("13,5")).toBe(1350);
    expect(bpsFromPct("")).toBeNull();
    expect(Number.isNaN(bpsFromPct("150"))).toBe(true);
  });
});

describe("Mercado Livre · vínculo e estoque", () => {
  const L = [
    { id: "a", mlItemId: "MLB1", variation: "Cor: Areia", sku: null },
    { id: "b", mlItemId: "MLB1", variation: "Cor: Off-white", sku: null },
    { id: "c", mlItemId: "MLB2", variation: "", sku: null },
    { id: "d", mlItemId: null, variation: "", sku: "OC-300" },
  ];
  it("liga pela variação exata, pelo MLB geral e pelo SKU", () => {
    expect(matchListing(L, { itemId: "mlb1", variation: "Cor : Off-white", sku: null })).toBe("b");
    expect(matchListing(L, { itemId: "MLB2", variation: "Tamanho: 3 m", sku: null })).toBe("c");
    expect(matchListing(L, { itemId: "MLB1", variation: "Cor: Verde", sku: null })).toBeNull();
    expect(matchListing(L, { itemId: "MLB9", variation: null, sku: "oc-300" })).toBe("d");
  });
  it("baixa só a diferença (reimportar não duplica; cancelar devolve)", () => {
    expect(stockAdjustments(new Map([["v1", 2], ["v2", 1]]), new Map())).toEqual([{ variantId: "v1", delta: -2 }, { variantId: "v2", delta: -1 }]);
    expect(stockAdjustments(new Map([["v1", 2]]), new Map([["v1", 2]]))).toEqual([]);
    expect(stockAdjustments(new Map(), new Map([["v1", 2]]))).toEqual([{ variantId: "v1", delta: 2 }]);
    expect(stockAdjustments(new Map([["v1", 3]]), new Map([["v1", 2]]))).toEqual([{ variantId: "v1", delta: -1 }]);
  });
});

describe("Mercado Livre · planilha", () => {
  it("separa tarifa de venda e de envio e lê o prazo de despacho", () => {
    expect(fieldOf("Data limite de despacho")).toBe("shipBy");
    const head = ["N.º de venda", "Data da venda", "Estado", "Unidades", "Receita por produtos (BRL)", "Tarifa de venda e impostos (BRL)", "Tarifas de envio (BRL)", "# de anúncio", "Título do anúncio", "Data limite de despacho"];
    const h = findHeader([["Relatório"], head])!;
    const r = parseMlRow(["2000001", "20/11/2026 10:00", "Pronto para enviar", "2", "1.000,00", "-130,00", "-45,90", "MLB123", "Ombrelone", "21/11/2026"], h.cols, 3).ok!;
    expect(r.saleFeeCents).toBe(13000);
    expect(r.shippingFeeCents).toBe(4590);
    expect(r.feeCents).toBe(17590);
    expect(r.shipBy?.toISOString()).toBe(new Date("2026-11-21T12:00:00-03:00").toISOString());
  });
});
