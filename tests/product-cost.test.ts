import { describe, expect, it } from "vitest";
import { computeCost, cubicMeters, fromMm, marginBps, normalizePrincipal, parseLeadTime, parseMoney, parsePercentBps, principalOf, toMm } from "@/modules/products/cost";

describe("Custo final base", () => {
  it("mercadoria + IPI + adicionais do fornecedor principal", () => {
    const r = computeCost(
      [{ costCents: 50000, ipiBps: 1000, isPrincipal: false }, { costCents: 40000, ipiBps: 650, isPrincipal: true }],
      [{ category: "CORTE", priceCents: 1250, quantity: 2 }, { category: "TECIDO", priceCents: 3990, quantity: 3.5 }],
    );
    expect(r.merchandiseCents).toBe(40000);
    expect(r.ipiCents).toBe(2600);
    expect(r.withIpiCents).toBe(42600);
    expect(r.byCategory.CORTE).toBe(2500);
    expect(r.byCategory.TECIDO).toBe(13965);
    expect(r.finalCents).toBe(42600 + 2500 + 13965);
  });
  it("sem principal marcado usa o primeiro vínculo", () => {
    expect(computeCost([{ costCents: 10000, ipiBps: null, isPrincipal: false }], []).finalCents).toBe(10000);
  });
  it("sem fornecedor sinaliza custo ausente", () => {
    const r = computeCost([], [{ category: "GRAFICA", priceCents: 500, quantity: 1 }]);
    expect(r.missingSupplierCost).toBe(true);
    expect(r.finalCents).toBe(500);
  });
  it("normaliza um único principal", () => {
    expect(normalizePrincipal([{ isPrincipal: false }, { isPrincipal: true }, { isPrincipal: true }]).map((l) => l.isPrincipal)).toEqual([false, true, false]);
    expect(normalizePrincipal([{ isPrincipal: false }, { isPrincipal: false }]).map((l) => l.isPrincipal)).toEqual([true, false]);
    expect(principalOf([])).toBeNull();
  });
  it("margem sobre o preço", () => {
    expect(marginBps(20000, 12000)).toBe(4000);
    expect(marginBps(null, 100)).toBeNull();
  });
});

describe("Medidas, cubagem e conversões", () => {
  it("cubagem em m³ (caixa 190×25×25 cm, 2 volumes)", () => {
    expect(cubicMeters([{ lengthMm: 1900, widthMm: 250, heightMm: 250, quantity: 2 }])).toBeCloseTo(0.2375, 6);
  });
  it("cm/m ⇄ mm", () => {
    expect(toMm(2.7, "M")).toBe(2700);
    expect(toMm(45.5, "CM")).toBe(455);
    expect(fromMm(2700, "M")).toBe(2.7);
    expect(toMm(null, "CM")).toBeNull();
  });
  it("leitura de valores em formato brasileiro", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 99,9")).toBe(9990);
    expect(parseMoney("1234.5")).toBe(123450);
    expect(parseMoney("")).toBeNull();
    expect(parsePercentBps("6,5%")).toBe(650);
    expect(parseLeadTime("Pronta entrega")).toBe("PRONTA_ENTREGA");
    expect(parseLeadTime("30 dias")).toBe("D30");
    expect(parseLeadTime("importação")).toBe("IMPORTACAO");
  });
});
