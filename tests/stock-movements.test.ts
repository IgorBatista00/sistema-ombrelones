import { describe, expect, it } from "vitest";
import { planMovement, stockState, stockText } from "@/modules/inventory/movements-rules";

describe("Movimentação de estoque", () => {
  const cur = { onHand: 20, reserved: 6 }; // disponível = 14
  it("entrada soma ao físico", () => expect(planMovement(cur, "ENTRADA", 10)).toEqual({ ok: true, after: 30, delta: 10 }));
  it("saída até o disponível", () => expect(planMovement(cur, "SAIDA", 14)).toEqual({ ok: true, after: 6, delta: -14 }));
  it("saída nunca consome unidades reservadas para pedidos", () => {
    const r = planMovement(cur, "SAIDA", 15);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/disponível \(14\)/);
  });
  it("ajuste de inventário define o saldo contado", () => expect(planMovement(cur, "AJUSTE", 8)).toEqual({ ok: true, after: 8, delta: -12 }));
  it("ajuste não pode ficar abaixo do reservado", () => expect(planMovement(cur, "AJUSTE", 5).ok).toBe(false));
  it("ajuste para zero é permitido sem reservas", () => expect(planMovement({ onHand: 3, reserved: 0 }, "AJUSTE", 0)).toEqual({ ok: true, after: 0, delta: -3 }));
  it("rejeita quantidade zero, negativa ou fracionada", () => {
    expect(planMovement(cur, "ENTRADA", 0).ok).toBe(false);
    expect(planMovement(cur, "ENTRADA", -2).ok).toBe(false);
    expect(planMovement(cur, "SAIDA", 1.5).ok).toBe(false);
  });
});

describe("Texto de estoque para o cliente", () => {
  it("quantidade exata", () => {
    expect(stockText(24, { mode: "exata", lowThreshold: 5 })).toBe("24 unidades disponíveis");
    expect(stockText(3, { mode: "exata", lowThreshold: 5 })).toBe("Últimas 3 unidades");
    expect(stockText(1, { mode: "exata", lowThreshold: 5 })).toBe("Últimas 1 unidade");
  });
  it("faixa", () => {
    expect(stockText(24, { mode: "faixa", lowThreshold: 5 })).toBe("Mais de 10 unidades disponíveis");
    expect(stockText(120, { mode: "faixa", lowThreshold: 5 })).toBe("Mais de 50 unidades disponíveis");
    expect(stockText(8, { mode: "faixa", lowThreshold: 5 })).toBe("8 unidades disponíveis");
  });
  it("simples não revela quantidade", () => expect(stockText(2, { mode: "simples", lowThreshold: 5 })).toBe("Em estoque"));
  it("sem saldo", () => expect(stockText(0)).toBe("Sem estoque"));
  it("situação considera o reservado e o mínimo", () => {
    expect(stockState("STOCK", 10, 10, 2)).toBe("zero");
    expect(stockState("STOCK", 10, 7, 5)).toBe("low");
    expect(stockState("STOCK", 10, 0, 5)).toBe("ok");
    expect(stockState("MADE_TO_ORDER", 0, 0, 5)).toBe("mto");
  });
});
