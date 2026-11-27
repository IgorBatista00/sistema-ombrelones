import { describe, expect, it } from "vitest";
import { costBreakdown, type BreakdownItem } from "@/modules/mercadolivre/cost-breakdown";
import { extraMoneyCols, findHeader, isCancelled, parseMlRow } from "@/modules/integrations/mercadolivre/sheet-rules";

// [TESTE] 1 un. a R$ 400 · tarifa 42 · frete 45 · acréscimo +10 e taxa de parcelamento −10 · custo 200 · imposto 14,5%
const base: BreakdownItem = {
  quantity: 1, productCents: 40000, unitPriceCents: 40000, shippingRevenueCents: null, saleFeeTotalCents: 4200, saleFeeCents: null, shippingFeeCents: 4500, refundCents: null,
  netCents: 31300, bonusCents: null, otherLines: [{ label: "Receita por acréscimo no preço", cents: 1000 }, { label: "Taxa de parcelamento equivalente ao acréscimo", cents: -1000 }],
  costCents: 20000, cancelled: false, listing: { taxBps: 1450, packagingCents: 300 },
};

describe("detalhamento de receitas e custos do ML", () => {
  it("a soma das linhas é o lucro e mostra todas as colunas", () => {
    const b = costBreakdown([base]);
    const v = (k: string) => [...b.income, ...b.costs].find((l) => l.key === k)?.cents;
    expect(v("produtos")).toBe(40000);
    expect(v("tarifa")).toBe(-4200);
    expect(v("frete")).toBe(-4500);
    expect(v("imposto")).toBe(-5800);
    expect(v("mercadoria")).toBe(-20000);
    expect(v("embalagem")).toBe(-300);
    expect(v("col:Receita por acréscimo no preço")).toBe(1000);
    expect(v("col:Taxa de parcelamento equivalente ao acréscimo")).toBe(-1000);
    expect(b.totalIncome + b.totalCosts).toBe(b.profit);
    expect(b.profit).toBe(40000 - 4200 - 4500 - 5800 - 20000 - 300);
    expect(b.outside.unexplained).toBe(0);
    expect(b.cash).toEqual({ mlReceived: 31300, tax: 5800, increase: 25500, noTotal: 0 });
  });
  it("caixa inclui o que o ML cobrou em devoluções; venda sem anúncio paga o imposto padrão", () => {
    const b = costBreakdown([{ ...base, listing: null, costCents: null }, { ...base, cancelled: true, netCents: -7495 }]);
    expect(b.cash.tax).toBe(5800); // 14,5% de R$ 400
    expect(b.cash.mlReceived).toBe(31300 - 7495);
  });
  it("os 4 custos aparecem mesmo zerados; canceladas ficam à parte", () => {
    const b = costBreakdown([{ ...base, listing: null, costCents: null, otherLines: null, netCents: 31300 }, { ...base, cancelled: true, netCents: -7495 }]);
    expect(b.costs.map((c) => c.key)).toEqual(expect.arrayContaining(["tarifa", "frete", "imposto", "mercadoria"]));
    expect(b.costs.find((c) => c.key === "mercadoria")?.cents).toBe(0);
    expect(b.outside).toMatchObject({ cancelled: -7495, cancelledCount: 1 });
  });
});

describe("planilha do ML: demais colunas de valor", () => {
  const header = ["N.º de venda", "Data de venda", "Estado", "Unidades", "Receita por produtos (BRL)", "Receita por acréscimo no preço (pago pelo comprador)", "Taxa de parcelamento equivalente ao acréscimo", "Tarifa de venda e impostos (BRL)", "Receita por envio (BRL)", "Tarifas de envio (BRL)", "Custo de envio com base nas medidas e peso declarados", "Custo por diferenças nas medidas e no peso do pacote", "Descontos e bônus", "Cancelamentos e reembolsos (BRL)", "Total (BRL)", "Título do anúncio"];
  it("“Devolvido no dia…” é devolução (fora do faturamento)", () => {
    expect(isCancelled("Devolvido no dia 4 de novembro — O produto retornou para você porque não foi entregue.")).toBe(true);
    expect(isCancelled("Entregue — Chegou em 10 de outubro")).toBe(false);
  });
  it("lê acréscimo, parcelamento e diferença de medidas; ignora a coluna informativa", () => {
    const h = findHeader([header])!;
    const extra = extraMoneyCols(header, h.cols);
    expect(extra.map((e) => e.label)).toEqual(["Receita por acréscimo no preço (pago pelo comprador)", "Taxa de parcelamento equivalente ao acréscimo", "Custo por diferenças nas medidas e no peso do pacote"]);
    const cells = ["2000000001", "10 de novembro de 2026 10:00 hs.", "Entregue", "1", "400,00", "35,92", "-35,92", "-42,00", "", "-45,00", "", "-12,00", "1,22", "", "317,22", "[TESTE] Ombrelone"];
    const r = parseMlRow(cells, h.cols, 2, extra).ok!;
    expect(r.otherLines).toEqual([{ label: extra[0].label, cents: 3592 }, { label: extra[1].label, cents: -3592 }, { label: extra[2].label, cents: -1200 }]);
    expect(r.bonusCents).toBe(122);
    expect(r.shippingFeeCents).toBe(4500);
  });
});

import { allocatePackShipping, shipStage, soldLineOf } from "@/modules/mercadolivre/rules";
describe("auditoria: frete de pacote e situação de envio", () => {
  it("rateia o frete do pacote pela receita; soma igual ao lançado", () => {
    const a = allocatePackShipping([
      { key: "a", group: "ana|2026-10-26", productCents: 38236, shippingFeeCents: 12980 },
      { key: "b", group: "ana|2026-10-26", productCents: 104118, shippingFeeCents: null },
      { key: "c", group: null, productCents: 40000, shippingFeeCents: 4525 },
      { key: "d", group: "bia|2026-10-27", productCents: 40000, shippingFeeCents: 4525 },
    ]);
    expect(a.get("a")! + a.get("b")!).toBe(12980);
    expect(a.get("a")).toBe(Math.round((12980 * 38236) / 142354));
    expect(a.get("c")).toBeNull();
    expect(a.get("d")).toBeNull(); // pacote com uma venda só: sem rateio
    const line = soldLineOf({ quantity: 1, productCents: 38236, unitPriceCents: 38236, shippingRevenueCents: null, saleFeeTotalCents: 5162, saleFeeCents: null, shippingFeeCents: 12980, shipAllocCents: a.get("a"), refundCents: null, netCents: 20094 }, false);
    expect(line.shippingFeeCents).toBe(a.get("a"));
  });
  it("situação de envio da planilha real", () => {
    expect(shipStage("Pronto para coleta — Você deve entregar o pacote à coleta que passará hoje", false)).toBe("a_enviar");
    expect(shipStage("Envio pendente — Entre em contato com o seu comprador para entregar o produto.", false)).toBe("a_enviar");
    expect(shipStage("Combine a entrega — Entre em contato com o seu comprador", false)).toBe("a_enviar");
    expect(shipStage("Para entregar na coleta do dia 9 de dezembro — Para organizar os envios, você poderá imprimir a etiqueta", false)).toBe("a_enviar");
    expect(shipStage("Reclamação encerrada — Encerramos a reclamação da venda e liberamos o dinheiro para você.", false)).toBe("entregue");
    expect(shipStage("Venda entregue — Encerramos a reclamação da venda e liberamos o dinheiro para você.", false)).toBe("entregue");
    expect(shipStage("Reclamação encerrada. Devolvemos o dinheiro — Você pode vê-lo na sua conta Mercado Pago.", false)).toBe("entregue");
    expect(shipStage("Reclamação aberta — O comprador abriu uma reclamação", false)).toBe("problema");
    expect(shipStage("A caminho — Chega entre os dias 23 e 25", false)).toBe("enviada");
    expect(shipStage("Entregue — Chegou em 10 de outubro", false)).toBe("entregue");
  });
});

describe("auditoria: linha vendida leva todos os campos", () => {
  it("reembolso, bônus, demais colunas e cancelamento chegam ao cálculo", () => {
    const l = soldLineOf({ quantity: 1, productCents: 40000, unitPriceCents: 40000, shippingRevenueCents: 100, saleFeeTotalCents: 4200, saleFeeCents: null, shippingFeeCents: 4500, shipAllocCents: 3000, refundCents: 700, netCents: 1, bonusCents: 122, otherLines: [{ label: "x", cents: -50 }] }, true);
    expect(l).toEqual({ quantity: 1, productCents: 40000, shippingRevenueCents: 100, saleFeeTotalCents: 4200, shippingFeeCents: 3000, refundCents: 700, bonusCents: 122, otherCents: -50, cancelled: true });
  });
});
