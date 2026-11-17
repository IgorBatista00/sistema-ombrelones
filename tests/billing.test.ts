import { describe, expect, it } from "vitest";
import { defaultParcelMethod, invoiceAlert, normalizeInvoiceNumber, parcelStage } from "@/modules/finance/billing-rules";

describe("faturamento e cobrança", () => {
  it("forma prevista pela condição de pagamento", () => {
    expect(defaultParcelMethod("Pix + boleto", "1/4 · na venda")).toBe("Pix");
    expect(defaultParcelMethod("Pix + boleto", "2/4 · 30 dias")).toBe("Boleto");
    expect(defaultParcelMethod("Boleto 30/60/90", "1/3 · 30 dias")).toBe("Boleto");
    expect(defaultParcelMethod("Cartão 6x sem juros", "1/6 · na venda")).toBe("Cartão de crédito");
    expect(defaultParcelMethod("Pix à vista", "1/1 · na venda")).toBe("Pix");
    expect(defaultParcelMethod("50% entrada + 50% na entrega", "2/2 · na entrega")).toBeNull();
  });
  it("etapa da parcela", () => {
    const base = { status: "ABERTO" as const, plannedMethod: null, label: "2/3 · 30 dias", boletoIssuedAt: null, boletoNumber: null, hasBoletoDoc: false };
    expect(parcelStage(base, "Boleto 30/60/90")).toBe("boleto_a_emitir");
    expect(parcelStage({ ...base, hasBoletoDoc: true }, "Boleto 30/60/90")).toBe("boleto_emitido");
    expect(parcelStage({ ...base, boletoNumber: "123" }, "Boleto 30/60/90")).toBe("boleto_emitido");
    expect(parcelStage({ ...base, plannedMethod: "Pix" }, "Boleto 30/60/90")).toBe("aguardando");
    expect(parcelStage({ ...base, status: "RECEBIDO" }, "Boleto 30/60/90")).toBe("recebido");
    expect(parcelStage(base, "50% entrada + 50% na entrega")).toBe("forma_a_definir");
  });
  it("número da NF e alerta da entrega", () => {
    expect(normalizeInvoiceNumber("NF 001.234")).toBe("1234"); expect(normalizeInvoiceNumber("abc")).toBeNull(); expect(normalizeInvoiceNumber("1234567890")).toBeNull();
    expect(invoiceAlert({ status: "ENTREGUE", scheduledAt: null })?.tone).toBe("danger");
    expect(invoiceAlert({ status: "A_AGENDAR", scheduledAt: null })).toBeNull();
  });
});
