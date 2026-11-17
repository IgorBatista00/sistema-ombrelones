import { describe, expect, it } from "vitest";
import { guardTransition, type OrderState } from "@/modules/orders/state";

const base: OrderState = { commercialStatus: "CONFIRMED", financialStatus: "NOT_STARTED", logisticStatus: "NOT_RELEASED", fiscalStatus: "NOT_ISSUED", shippingCents: 5000 };

describe("Estados do pedido", () => {
  it("pagamento indisponível enquanto aguarda cotação", () => {
    const o = { ...base, commercialStatus: "AWAITING_QUOTE" as const, shippingCents: null };
    expect(guardTransition(o, "FINANCIAL", "AWAITING_PAYMENT", "CUSTOMER")).toMatch(/confirmação/);
  });
  it("pagamento indisponível sem frete definido", () => {
    expect(guardTransition({ ...base, shippingCents: null }, "FINANCIAL", "AWAITING_PAYMENT", "CUSTOMER")).toMatch(/frete/);
  });
  it("pedido confirmado com frete pode iniciar pagamento", () => {
    expect(guardTransition(base, "FINANCIAL", "AWAITING_PAYMENT", "CUSTOMER")).toBeNull();
  });
  it("ADMIN não consegue marcar como pago — só o webhook", () => {
    const o = { ...base, financialStatus: "AWAITING_PAYMENT" as const };
    expect(guardTransition(o, "FINANCIAL", "PAID", "ADMIN")).toMatch(/provedor/);
    expect(guardTransition(o, "FINANCIAL", "PAID", "CUSTOMER")).toMatch(/provedor/);
    expect(guardTransition(o, "FINANCIAL", "PAID", "WEBHOOK")).toBeNull();
  });
  it("expedição só após pagamento", () => {
    expect(guardTransition(base, "LOGISTIC", "PREPARING", "ADMIN")).toMatch(/pagamento/);
    expect(guardTransition({ ...base, financialStatus: "PAID" }, "LOGISTIC", "PREPARING", "ADMIN")).toBeNull();
  });
  it("não pula etapas logísticas", () => {
    expect(guardTransition({ ...base, financialStatus: "PAID" }, "LOGISTIC", "DELIVERED", "ADMIN")).toMatch(/não permitida/);
  });
  it("pedido pago não pode ser cancelado sem estorno", () => {
    expect(guardTransition({ ...base, financialStatus: "PAID" }, "COMMERCIAL", "CANCELED", "ADMIN")).toMatch(/estorno/);
  });
  it("nota fiscal só após pagamento", () => {
    expect(guardTransition(base, "FISCAL", "ISSUING", "SYSTEM")).toMatch(/pagamento/);
  });
});
