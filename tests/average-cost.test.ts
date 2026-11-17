import { describe, expect, it } from "vitest";
import { allocatePurchase, costVariationBps, newAverageCost } from "@/modules/inventory/movements-rules";

describe("Custo médio ponderado móvel", () => {
  it("exemplo: 10 a R$ 400 + 20 a R$ 430 = R$ 420", () => expect(newAverageCost(10, 40000, 20, 43000)).toBe(42000));
  it("venda não altera o médio; nova compra recalcula: 18 a R$ 420 + 10 a R$ 450 = R$ 430,71", () => expect(newAverageCost(18, 42000, 10, 45000)).toBe(43071));
  it("sem saldo, o médio vira o custo da compra", () => {
    expect(newAverageCost(0, 40000, 5, 47000)).toBe(47000);
    expect(newAverageCost(12, null, 5, 47000)).toBe(47000);
  });
});

describe("Rateio de frete e despesas da nota", () => {
  it("proporcional ao valor com IPI; soma exata do frete", () => {
    const r = allocatePurchase([
      { quantity: 10, unitCostCents: 46000, ipiBps: 650 }, // 489,90 × 10 = 4.899,00
      { quantity: 10, unitCostCents: 45500, ipiBps: 650 }, // 484,58 × 10 = 4.845,80
    ], 30000, 0);
    expect(r[0].allocatedCents).toBe(15082);
    expect(r[0].unitTotalCents).toBe(50498);
    expect(r[0].allocatedCents + r[1].allocatedCents).toBe(30000);
  });
  it("sem frete, custo final = custo + IPI", () => {
    expect(allocatePurchase([{ quantity: 3, unitCostCents: 10000, ipiBps: 1000 }], 0, 0)[0].unitTotalCents).toBe(11000);
  });
  it("outras despesas entram no rateio", () => {
    const r = allocatePurchase([{ quantity: 4, unitCostCents: 10000, ipiBps: 0 }], 2000, 2000);
    expect(r[0].unitTotalCents).toBe(11000);
  });
  it("variação contra o médio", () => {
    expect(costVariationBps(50498, 43937)).toBe(1493);
    expect(costVariationBps(100, null)).toBeNull();
  });
});
