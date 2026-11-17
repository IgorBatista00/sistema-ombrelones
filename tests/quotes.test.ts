import { installmentError, installmentPlan } from "@/modules/quotes/totals";
import { describe, expect, it } from "vitest";
import { installments, isExpired, quoteTotals } from "@/modules/quotes/totals";
import { docCode, parseDocNumber } from "@/lib/doc-code";

describe("Totais do orçamento (modelo da empresa)", () => {
  const lines = [
    { quantity: 2, unitPriceCents: 128900, unitDiscountCents: 5000, unitCostCents: 70000, weightG: 18500, cubageM3: 0.18275 },
    { quantity: 1, unitPriceCents: 59900, unitDiscountCents: 0, unitCostCents: 30000, weightG: 52000, cubageM3: 0.072 },
  ];
  it("desconto unitário em R$ e frete FOB", () => {
    const t = quoteTotals(lines, { extraDiscountCents: 0, freightTerm: "FOB", freightCents: 0 });
    expect(t.subtotal).toBe(317700);
    expect(t.itemDiscount).toBe(10000);
    expect(t.total).toBe(307700);
    expect(t.quantity).toBe(3);
  });
  it("peso e cubagem da carga", () => {
    const t = quoteTotals(lines, { extraDiscountCents: 0, freightTerm: "FOB", freightCents: 0 });
    expect(t.weightKg).toBe(89);
    expect(t.cubageM3).toBeCloseTo(0.4375, 4);
    expect(t.missingLoad).toBe(0);
  });
  it("frete CIF soma; desconto geral não passa do valor", () => {
    expect(quoteTotals(lines, { extraDiscountCents: 7700, freightTerm: "CIF", freightCents: 85000 }).total).toBe(307700 - 7700 + 85000);
    expect(quoteTotals(lines, { extraDiscountCents: 99999999, freightTerm: "FOB", freightCents: 0 }).total).toBe(0);
  });
  it("itens sem peso/medidas são sinalizados", () => {
    expect(quoteTotals([{ quantity: 1, unitPriceCents: 100, unitDiscountCents: 0 }], { extraDiscountCents: 0, freightTerm: "FOB", freightCents: 0 }).missingLoad).toBe(1);
  });
});

describe("Parcelamento", () => {
  const issued = new Date("2026-11-13T12:00:00Z");
  it("modelo: R$ 5.681,41 em 6x → 5 × 946,90 + 946,91, datas 0/30/60…", () => {
    const p = installments(568141, "entrada/30/60/90/120/150", issued);
    expect(p.map((x) => x.valueCents)).toEqual([94690, 94690, 94690, 94690, 94690, 94691]);
    expect(p[0].label).toBe("na venda");
    expect(p[1].due!.toISOString().slice(0, 10)).toBe("2026-12-13");
    expect(p[2].due!.toISOString().slice(0, 10)).toBe("2027-01-12");
  });
  it("entrada + entrega", () => {
    const p = installments(1001, "entrada/entrega", issued);
    expect(p.map((x) => [x.label, x.valueCents])).toEqual([["na venda", 500], ["na entrega", 501]]);
  });
  it("plano vazio", () => expect(installments(1000, "", issued)).toEqual([]));
});

describe("Numeração e validade", () => {
  it("código MÊS-0000 (3 letras do mês + número contínuo)", () => {
    expect(docCode(41, new Date("2026-11-13T12:00:00Z"))).toBe("NOV-0041");
    expect(docCode(42, new Date("2026-12-01T12:00:00Z"))).toBe("DEZ-0042");
    expect(docCode(7, new Date("2027-06-10T12:00:00Z"))).toBe("JUN-0007");
    expect(docCode(12345, new Date("2027-07-10T12:00:00Z"))).toBe("JUL-12345");
  });
  it("mês pelo fuso de Brasília (virada do mês em UTC)", () => {
    // 01/12 01:00 UTC ainda é 30/11 22:00 em São Paulo
    expect(docCode(50, new Date("2026-12-01T01:00:00Z"))).toBe("NOV-0050");
  });
  it("busca aceita o código ou o número", () => {
    expect(parseDocNumber("NOV-0041")).toBe(41); expect(parseDocNumber("41")).toBe(41); expect(parseDocNumber("abc")).toBeNull();
  });
  it("expira só depois do último dia de validade", () => {
    const issued = new Date("2026-11-01T12:00:00Z");
    expect(isExpired("ENVIADO", issued, 15, new Date("2026-11-16T10:00:00Z"))).toBe(false);
    expect(isExpired("ENVIADO", issued, 15, new Date("2026-11-17T13:00:00Z"))).toBe(true);
  });
});

describe("parcelas com valores diferentes", () => {
  const base = new Date("2026-11-13T12:00:00Z");
  it("datas pelo texto (entrada/30/60) e valores iguais por padrão", () => {
    const r = installmentPlan(100_000, "entrada/30/60", base);
    expect(r.rows.map((x) => x.valueCents)).toEqual([33_333, 33_333, 33_334]);
    expect(r.rows.map((x) => x.due!.toISOString().slice(0, 10))).toEqual(["2026-11-13", "2026-12-13", "2027-01-12"]);
    expect(r.diffCents).toBe(0);
  });
  it("entrada fixada maior; o restante se divide entre as automáticas", () => {
    const r = installmentPlan(100_000, "entrada/30/60", base, [50_000, null, null]);
    expect(r.rows.map((x) => [x.valueCents, x.fixed])).toEqual([[50_000, true], [25_000, false], [25_000, false]]);
    expect(r.diffCents).toBe(0);
  });
  it("todas diferentes e fixadas: precisa fechar o total", () => {
    expect(installmentPlan(100_000, "entrada/30/60/90", base, [40_000, 30_000, 18_000, 12_000]).diffCents).toBe(0);
    const falta = installmentPlan(100_000, "entrada/30/60/90", base, [40_000, 30_000, 18_000, 11_000]);
    expect(falta.diffCents).toBe(1_000); expect(installmentError(falta.diffCents)).toMatch(/a menos/);
  });
  it("fixadas passando do total: automáticas ficam zeradas e acusa a diferença", () => {
    const r = installmentPlan(100_000, "entrada/30/60", base, [80_000, 30_000, null]);
    expect(r.rows[2].valueCents).toBe(0); expect(r.diffCents).toBe(-10_000); expect(installmentError(r.diffCents)).toMatch(/passam/);
  });
  it("arredondamento vai para a última automática; fixados além do nº de parcelas são ignorados", () => {
    const r = installmentPlan(100_000, "entrada/10/20/30", base, [10_000, null, null, 20_000, 99_999]);
    expect(r.rows.map((x) => x.valueCents)).toEqual([10_000, 35_000, 35_000, 20_000]);
    const q = installmentPlan(100_001, "entrada/10/20", base, [null, 50_000, null]);
    expect(q.rows.map((x) => x.valueCents)).toEqual([25_000, 50_000, 25_001]);
  });
});
