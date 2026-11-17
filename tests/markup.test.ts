import { describe, expect, it } from "vitest";
import { calcPrice, formatMarkup, marginFromMarkup, parseMarkup, priceRowState, validateMarkup } from "@/modules/pricing/markup";

describe("tabela de preços — markup", () => {
  it("lê o markup como o usuário digita", () => {
    expect(parseMarkup("2,5")).toBe(25000); expect(parseMarkup("2.35")).toBe(23500); expect(parseMarkup(" 3 ")).toBe(30000);
    expect(parseMarkup("1,8x")).toBe(18000); expect(parseMarkup("")).toBeNull(); expect(parseMarkup("abc")).toBeNaN(); expect(parseMarkup("2,12345")).toBeNaN();
  });
  it("valida", () => {
    expect(validateMarkup(parseMarkup("0"))).toMatch(/maior que zero/); expect(validateMarkup(parseMarkup("abc"))).toMatch(/inválido/);
    expect(validateMarkup(parseMarkup("2,5"))).toBeNull(); expect(validateMarkup(null)).toBeNull();
  });
  it("preço = custo final × markup, arredondado ao centavo", () => {
    expect(calcPrice(59_065, 25000)).toBe(147_663); // R$ 590,65 × 2,5 = 1.476,625 → 1.476,63
    expect(calcPrice(10_000, 18000)).toBe(18_000);
    expect(calcPrice(null, 25000)).toBeNull(); expect(calcPrice(10_000, null)).toBeNull();
  });
  it("margem resultante e formatação", () => {
    expect(marginFromMarkup(25000)).toBe(6000); expect(marginFromMarkup(20000)).toBe(5000);
    expect(formatMarkup(25000)).toBe("2,50"); expect(formatMarkup(23750)).toBe("2,375");
  });
  it("situação da linha", () => {
    expect(priceRowState({ costCents: null, markup: 25000, sitePriceCents: null })).toBe("sem_custo");
    expect(priceRowState({ costCents: 10_000, markup: null, sitePriceCents: 20_000 })).toBe("sem_markup");
    expect(priceRowState({ costCents: 10_000, markup: 9000, sitePriceCents: 9_000 })).toBe("abaixo_custo");
    expect(priceRowState({ costCents: 10_000, markup: 20000, sitePriceCents: 19_900 })).toBe("desatualizado");
    expect(priceRowState({ costCents: 10_000, markup: 20000, sitePriceCents: 20_000 })).toBe("ok");
  });
});
