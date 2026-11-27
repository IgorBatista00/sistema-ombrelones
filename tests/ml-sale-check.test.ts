import { describe, expect, it } from "vitest";
import { columnsNet, costChecks, netDiff, saleIssues, saleLevel, type SaleCheckInput } from "@/modules/mercadolivre/sale-check-rules";
import { soldLineOf } from "@/modules/mercadolivre/rules";

// linha [TESTE] parecida com a planilha: 431,44 − 58,24 − 45,25 = 327,95
const ok: SaleCheckInput = { cancelled: false, productCents: 43144, shippingRevenueCents: null, saleFeeCents: 5824, shippingFeeCents: 4525, refundCents: null, netCents: 32795, sku: "TESTE-1", linked: true, costCents: 20000, taxBps: 600, profitCents: 9000 };

describe("validação das vendas do ML", () => {
  it("venda completa e que fecha com o Total fica conferida", () => {
    expect(columnsNet(ok)).toBe(32795);
    expect(saleIssues(ok)).toEqual([]);
    expect(saleLevel([])).toBe("ok");
  });
  it("sem anúncio e sem custo são críticos", () => {
    expect(saleIssues({ ...ok, linked: false, costCents: null })).toContain("sem_anuncio");
    expect(saleIssues({ ...ok, costCents: null })).toEqual(["sem_custo"]);
    expect(saleLevel(["sem_custo"])).toBe("critico");
  });
  it("Total do ML diferente da soma das colunas", () => {
    const r = { ...ok, netCents: 31295 }; // ML pagou R$ 15,00 a menos
    expect(netDiff(r)).toBe(-1500);
    expect(saleIssues(r)).toContain("total_diferente");
    expect(saleIssues({ ...ok, netCents: 32917 })).toEqual(["total_centavos"]); // + R$ 1,22 de bônus
    expect(saleLevel(["total_centavos"])).toBe("ok");
    expect(saleIssues({ ...ok, netCents: null })).toContain("sem_total");
  });
  it("cancelada só é conferida pelo valor lançado", () => {
    expect(saleIssues({ ...ok, cancelled: true, netCents: 0, linked: false, costCents: null })).toEqual([]);
    expect(saleIssues({ ...ok, cancelled: true, netCents: -7495 })).toEqual(["cancelada_com_valor"]);
  });
  it("tarifa, prejuízo, imposto e SKU", () => {
    expect(saleIssues({ ...ok, saleFeeCents: null, netCents: 38619 })).toEqual(["sem_tarifa"]);
    expect(saleIssues({ ...ok, profitCents: -10 })).toEqual(["prejuizo"]);
    expect(saleIssues({ ...ok, taxBps: null })).toEqual(["sem_imposto"]);
    expect(saleIssues({ ...ok, sku: null })).toEqual(["sem_sku"]);
  });
  it("confere os 4 custos: tarifa, frete, imposto e mercadoria", () => {
    expect(costChecks(ok)).toEqual({ tarifa: "ok", frete: "ok", imposto: "ok", mercadoria: "ok" });
    const semFrete = { ...ok, shippingFeeCents: null, netCents: 37320 };
    expect(saleIssues(semFrete)).toEqual(["sem_frete"]);
    expect(costChecks({ ...semFrete, inPack: true }).frete).toBe("pacote");
    expect(saleIssues({ ...semFrete, inPack: true })).toEqual([]);
    expect(costChecks({ ...ok, saleFeeCents: null, listingFeeBps: 1200 }).tarifa).toBe("estimado");
    expect(costChecks({ ...ok, linked: false, costCents: null })).toMatchObject({ imposto: "ok", mercadoria: "falta" }) // sem anúncio: imposto padrão;
    expect(saleLevel(saleIssues({ ...ok, taxBps: 0 }))).toBe("critico");
  });
  it("reembolso em venda válida é crítico", () => {
    expect(saleIssues({ ...ok, refundCents: 56540, netCents: ok.netCents! - 56540 })).toEqual(["reembolso_em_valida"]);
  });
  it("bônus do ML entra na conta", () => {
    expect(columnsNet({ ...ok, bonusCents: 122 })).toBe(32917);
    expect(saleIssues({ ...ok, bonusCents: 122, netCents: 32917 })).toEqual([]);
  });
  it("na planilha, frete em branco conta como zero (não estima pelo anúncio)", () => {
    const base = { quantity: 1, productCents: 40000, unitPriceCents: 40000, shippingRevenueCents: null, saleFeeTotalCents: 4200, saleFeeCents: null, shippingFeeCents: null, refundCents: null };
    expect(soldLineOf({ ...base, netCents: 35800 }, false).shippingFeeCents).toBe(0);
    expect(soldLineOf({ ...base, netCents: null }, false).shippingFeeCents).toBeNull();
  });
});

describe("imposto padrão do ML", () => {
  it("novo anúncio já vem com 14,5%", async () => {
    const { emptyListing } = await import("@/modules/mercadolivre/listing-form");
    expect(emptyListing().taxPct).toBe("14,5");
  });
});
