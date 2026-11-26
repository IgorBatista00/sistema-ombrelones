import { describe, expect, it } from "vitest";
import { goodsCost, productRevenue, saleResult, suggestProfile } from "@/modules/finance/operation-rules";

const cf6 = { cardFeeBps: 570, extCommissionBps: 0, intCommissionBps: 400, taxBps: 1000, packagingBps: 100, financialBps: 100, otherBps: 0, idealMarginBps: 2000, minMarginBps: 1400 };

describe("resultado da operação", () => {
  it("exemplo da Villa 2,70M bate com a margem ideal", () => {
    const r = saleResult(32410, 18895, cf6);
    expect(r.deductions).toBe(7032); expect(r.result).toBe(6483); expect(r.marginBps).toBe(2000); expect(r.belowMin).toBe(false);
    expect(r.lines.taxBps).toBe(3241); expect(r.lines.cardFeeBps).toBe(1847);
  });
  it("desconto derruba abaixo da mínima", () => {
    expect(saleResult(28000, 18895, cf6).belowMin).toBe(true);
  });
  it("frete CIF fica fora da receita", () => {
    expect(productRevenue({ totalCents: 50000, freightTerm: "CIF", freightCents: 3000 })).toEqual({ revenue: 47000, freight: 3000 });
    expect(productRevenue({ totalCents: 50000, freightTerm: "FOB", freightCents: 3000 })).toEqual({ revenue: 50000, freight: 0 });
  });
  it("custo da mercadoria sinaliza itens sem custo", () => {
    expect(goodsCost([{ quantity: 2, unitCostCents: 1000 }, { quantity: 1, unitCostCents: null }])).toEqual({ cost: 2000, missing: 1 });
  });
  it("sugestão de markup pelos produtos", () => {
    expect(suggestProfile([{ quantity: 1, profileId: "a" }, { quantity: 3, profileId: "b" }, { quantity: 1, profileId: null }])).toBe("b");
    expect(suggestProfile([{ quantity: 1, profileId: null }])).toBeNull();
  });
});
