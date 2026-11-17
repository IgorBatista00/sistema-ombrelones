import { describe, expect, it } from "vitest";
import { computeAvailability, isValidQuantity, reservationExpiry } from "@/modules/inventory/availability";
import { cartSubtotal } from "@/modules/cart/totals";

describe("Disponibilidade", () => {
  it("saldo disponível desconta reservas", () => {
    expect(computeAvailability("STOCK", { onHand: 10, reserved: 4 }, null)).toEqual({ state: "in_stock", available: 6 });
  });
  it("saldo totalmente reservado = sem estoque", () => {
    expect(computeAvailability("STOCK", { onHand: 5, reserved: 5 }, null)).toEqual({ state: "out_of_stock" });
  });
  it("sob encomenda não depende de saldo", () => {
    expect(computeAvailability("MADE_TO_ORDER", null, 30)).toEqual({ state: "made_to_order", leadTimeDays: 30 });
  });
  it("sem pedido mínimo além da unidade de venda", () => {
    expect(isValidQuantity(1, 1)).toBe(true);
    expect(isValidQuantity(0, 1)).toBe(false);
    expect(isValidQuantity(3, 2)).toBe(false);
    expect(isValidQuantity(4, 2)).toBe(true);
    expect(isValidQuantity(1.5, 1)).toBe(false);
  });
  it("reserva expira conforme o meio de pagamento", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const mins = { PIX: 60, BOLETO: 4320, CREDIT_CARD: 30 };
    expect(reservationExpiry("PIX", mins, from).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(reservationExpiry("BOLETO", mins, from).toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("Totais do carrinho", () => {
  it("soma em centavos inteiros", () => {
    expect(cartSubtotal([{ unitPriceCents: 1999, quantity: 3 }, { unitPriceCents: 1, quantity: 1 }])).toBe(5998);
  });
  it("item sem preço vigente bloqueia o total", () => {
    expect(cartSubtotal([{ unitPriceCents: 1000, quantity: 1 }, { unitPriceCents: null, quantity: 1 }])).toBeNull();
  });
});
