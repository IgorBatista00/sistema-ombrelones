import { describe, expect, it } from "vitest";
import { divisorBps, multiplierFromDivisor, parsePct, priceFromDivisor, realMarginBps, rowPricing, summarizeProfile, validateProfile } from "@/modules/pricing/markup";

// Exemplo da tela enviada: Consumidor Final 6x
const cf6 = { cardFeeBps: 570, extCommissionBps: 0, intCommissionBps: 400, taxBps: 1000, packagingBps: 100, financialBps: 100, otherBps: 0, idealMarginBps: 2000, minMarginBps: 1400 };

describe("perfis de markup", () => {
  it("resumo bate com a planilha de referência", () => {
    const s = summarizeProfile(cf6);
    expect(s.costs).toBe(2170); expect(s.costsPlusMin).toBe(3570); expect(s.costsPlusIdeal).toBe(4170);
    expect(s.divMin).toBe(6430); expect(s.divIdeal).toBe(5830);
    expect(multiplierFromDivisor(5830)).toBe(17153); // ≈ 1,7153×
  });
  it("preço = custo ÷ divisor e margem real volta à margem ideal", () => {
    const p = priceFromDivisor(18895, divisorBps(cf6, "ideal"))!; // custo R$ 188,95
    expect(p).toBe(32410); // R$ 324,10
    expect(priceFromDivisor(18895, divisorBps(cf6, "min"))).toBe(29386);
    expect(realMarginBps(18895, p, cf6)).toBe(2000);
  });
  it("percentuais em pt-BR", () => {
    expect(parsePct("5,7")).toBe(570); expect(parsePct("10%")).toBe(1000); expect(parsePct("")).toBeNull(); expect(Number.isNaN(parsePct("abc"))).toBe(true);
  });
  it("validação", () => {
    expect(validateProfile({ ...cf6, name: "" })).toMatch(/nome/);
    expect(validateProfile({ ...cf6, name: "x", minMarginBps: 2500 })).toMatch(/mínima/);
    expect(validateProfile({ ...cf6, name: "x", idealMarginBps: 7500 })).toMatch(/95%/);
    expect(validateProfile({ ...cf6, name: "x" })).toBeNull();
  });
  it("situação da linha com perfil", () => {
    expect(rowPricing({ costCents: 18895, markup: null, profile: cf6, sitePriceCents: null }).state).toBe("desatualizado");
    expect(rowPricing({ costCents: 18895, markup: null, profile: cf6, sitePriceCents: 32410 }).state).toBe("ok");
    expect(rowPricing({ costCents: 18895, markup: null, profile: cf6, sitePriceCents: 25000 }).state).toBe("abaixo_minimo");
    expect(rowPricing({ costCents: null, markup: null, profile: cf6, sitePriceCents: null }).state).toBe("sem_custo");
    expect(rowPricing({ costCents: 1000, markup: 25000, profile: null, sitePriceCents: 2500 }).state).toBe("ok");
  });
});
