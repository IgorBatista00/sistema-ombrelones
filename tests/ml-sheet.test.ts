import { describe, expect, it } from "vitest";
import { fieldOf, findHeader, moneyCents, parseMlDate, parseMlRow } from "@/modules/integrations/mercadolivre/sheet-rules";

const HEAD = ["N.º de venda", "Data da venda", "Estado", "Descrição do status", "Pacote de diversos produtos", "Unidades", "Receita por produtos (BRL)", "Receita por envio (BRL)", "Tarifa de venda e impostos", "Tarifas de envio", "Cancelamentos e reembolsos (BRL)", "Total (BRL)", "SKU", "# de anúncio", "Título do anúncio", "Variação", "Preço unitário de venda do anúncio (BRL)", "Comprador"];
describe("planilha de vendas do Mercado Livre", () => {
  it("reconhece as colunas e acha o cabeçalho depois das linhas de título", () => {
    expect(HEAD.map(fieldOf)).toEqual(["order", "date", "status", "statusDesc", "pack", "units", "productRevenue", "shippingRevenue", "fee", "shippingFee", "refunds", "total", "sku", "itemId", "title", "variation", "unitPrice", "buyer"]);
    const h = findHeader([["Vendas"], ["Período: 01/11/2026 a 17/11/2026"], [], HEAD]);
    expect(h?.row).toBe(3);
  });
  it("valores e datas", () => {
    expect(moneyCents("1.234,56")).toBe(123456); expect(moneyCents("-123,45")).toBe(-12345); expect(moneyCents("R$ 99,9")).toBe(9990); expect(moneyCents("1234.5")).toBe(123450); expect(moneyCents("")).toBeNull();
    expect(parseMlDate("17 de novembro de 2026 08:41 hs.")?.toISOString()).toBe("2026-11-17T11:41:00.000Z");
    expect(parseMlDate("17/11/2026 08:41")?.toISOString()).toBe("2026-11-17T11:41:00.000Z");
    expect(parseMlDate("13 de março de 2026")?.toISOString()).toBe("2026-03-13T15:00:00.000Z");
    expect(parseMlDate("31/02/2026")).toBeNull();
  });
  it("linha de venda, cancelada e resumo de pacote", () => {
    const { cols } = findHeader([HEAD])!;
    const r = parseMlRow(["2000001234567890", "17 de novembro de 2026 08:41 hs.", "Entregue", "", "Não", "2", "1.798,00", "0", "-215,76", "-25,00", "", "1.557,24", "OMB-3", "MLB123456789", "Ombrelone Lateral 3 m", "Cor: Areia", "899,00", "COMPRADOR X"], cols, 5);
    expect(r.errors).toEqual([]);
    expect(r.ok).toMatchObject({ orderId: "2000001234567890", quantity: 2, productCents: 179800, unitPriceCents: 89900, feeCents: 24076, totalCents: 155724, cancelled: false, itemId: "MLB123456789", title: "Ombrelone Lateral 3 m — Cor: Areia" });
    expect(parseMlRow(["2000001", "17/11/2026", "Cancelada", "Cancelada pelo comprador", "", "1", "100,00", "", "", "", "-100,00", "0", "", "", "Base", "", "", ""], cols, 6).ok?.cancelled).toBe(true);
    expect(parseMlRow(["2000009", "17/11/2026", "Entregue", "", "Sim", "", "", "", "", "", "", "300,00", "", "", "", "", "", ""], cols, 7).skipped).toBe(true);
    expect(parseMlRow(["2000010", "data ruim", "", "", "", "1", "10,00", "", "", "", "", "", "", "", "X", "", "", ""], cols, 8).errors[0]).toMatch(/Data da venda/);
  });
});
