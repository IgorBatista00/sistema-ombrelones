import { describe, expect, it } from "vitest";
import { listingIssues, qualityScore, worstSeverity, type QualityInput } from "@/modules/mercadolivre/quality-rules";

const ok: QualityInput = { status: "ATIVO", priceCents: 37065, saleFeeBps: 1650, taxBps: 1450, listingType: "premium", shippingCostCents: 4000, packagingCents: 500, sku: "PA5005025",
  components: [{ sku: "PA5005025", code: "PA5005025", image: "/x.jpg", unitCostCents: 18895 }], simulation: { profit: 5000, marginBps: 1350, costMissing: false }, lastSoldPriceCents: 37065 };

describe("qualidade dos anúncios", () => {
  it("anúncio completo não tem pendência", () => { expect(listingIssues(ok)).toEqual([]); expect(worstSeverity([])).toBe("ok"); expect(qualityScore([])).toBe(100); });
  it("sem produto é crítico", () => { const c = listingIssues({ ...ok, components: [], simulation: null }); expect(c).toContain("sem_produto"); expect(worstSeverity(c)).toBe("critico"); });
  it("produto sem custo e sem foto", () => { const c = listingIssues({ ...ok, components: [{ ...ok.components[0], unitCostCents: null, image: null }], simulation: { profit: 0, marginBps: null, costMissing: true } }); expect(c).toEqual(expect.arrayContaining(["sem_custo", "sem_foto"])); });
  it("imposto zero, sem tarifa, sem tipo", () => { expect(listingIssues({ ...ok, taxBps: 0, saleFeeBps: null, listingType: null })).toEqual(expect.arrayContaining(["sem_imposto", "sem_tarifa", "sem_tipo"])); });
  it("SKU do anúncio diferente do produto (aceita o código do produto)", () => {
    expect(listingIssues({ ...ok, sku: "PA5005026" })).toContain("sku_diferente");
    expect(listingIssues({ ...ok, sku: "PA5005037", components: [{ ...ok.components[0], sku: "PA500537", code: "PA5005037" }] })).not.toContain("sku_diferente");
  });
  it("prejuízo, margem baixa e preço diferente do vendido", () => {
    expect(listingIssues({ ...ok, simulation: { profit: -100, marginBps: -30, costMissing: false } })).toContain("prejuizo");
    expect(listingIssues({ ...ok, simulation: { profit: 100, marginBps: 500, costMissing: false } })).toContain("margem_baixa");
    expect(listingIssues({ ...ok, lastSoldPriceCents: 33000 })).toContain("preco_diferente");
  });
  it("frete só é cobrado de anúncio sem vendas", () => {
    expect(listingIssues({ ...ok, shippingCostCents: null, hasSales: false })).toContain("sem_frete");
    expect(listingIssues({ ...ok, shippingCostCents: null, hasSales: true })).not.toContain("sem_frete");
  });
  it("nota", () => { expect(qualityScore(["sem_custo", "sem_foto"])).toBe(58); });
});
