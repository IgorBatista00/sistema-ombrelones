import { describe, expect, it } from "vitest";
import { receivedPct, addDays, brDate, checkReceipt, dayDiff, deadline, dueDate, isIsoDay, itemProgress, parseQty, poCode, poState, supplierPerformance } from "@/modules/purchase-orders/rules";

const at = (s: string, h = "12:00") => new Date(`${s}T${h}:00-03:00`);

describe("ordens de compra · regras", () => {
  it("formata o código e lê quantidades com vírgula", () => {
    expect(poCode(7)).toBe("OC-0007");
    expect(parseQty("1.234,5")).toBe(1234.5);
    expect(parseQty("12,345")).toBe(12.345);
    expect(parseQty("")).toBeNull();
    expect(parseQty("abc")).toBeNull();
  });

  it("valida datas de calendário", () => {
    expect(isIsoDay("2026-11-18")).toBe(true);
    expect(isIsoDay("2026-02-31")).toBe(false);
    expect(isIsoDay("18/11/2026")).toBe(false);
  });

  it("conta dias pelo calendário de São Paulo, mesmo à noite", () => {
    expect(dayDiff(at("2026-11-18", "23:30"), at("2026-11-19", "00:10"))).toBe(1);
    expect(dayDiff(at("2026-11-18", "08:00"), at("2026-11-18", "22:00"))).toBe(0);
    expect(addDays(at("2026-11-18"), 30).toISOString()).toBe(brDate("2026-12-18").toISOString());
  });

  it("soma o recebido por item e calcula o saldo", () => {
    const p = itemProgress([{ id: "a", quantity: 10 }, { id: "b", quantity: 2.5 }], [{ itemId: "a", quantity: 4 }, { itemId: "a", quantity: 6 }, { itemId: "b", quantity: 1.2 }]);
    expect(p).toEqual([{ id: "a", quantity: 10, received: 10, pending: 0 }, { id: "b", quantity: 2.5, received: 1.2, pending: 1.3 }]);
  });

  it("calcula o % recebido sem misturar unidades", () => {
    expect(receivedPct([{ quantity: 10, received: 0 }, { quantity: 12.5, received: 12.5 }])).toBe(50);
    expect(receivedPct([{ quantity: 10, received: 10 }])).toBe(100);
    expect(receivedPct([])).toBe(0);
  });

  it("usa a data prometida; sem ela, estima pelo maior prazo do cadastro", () => {
    expect(dueDate({ orderedAt: at("2026-11-01"), promisedAt: brDate("2026-11-20") }, [30])).toEqual({ date: brDate("2026-11-20"), estimated: false });
    expect(dueDate({ orderedAt: at("2026-11-01"), promisedAt: null }, [15, null, 30])).toEqual({ date: brDate("2026-12-01"), estimated: true });
    expect(dueDate({ orderedAt: at("2026-11-01"), promisedAt: null }, [null])).toEqual({ date: null, estimated: false });
  });

  it("deriva a situação", () => {
    expect(poState({ status: "ABERTA" }, [{ received: 0, pending: 5 }])).toBe("AGUARDANDO");
    expect(poState({ status: "ABERTA" }, [{ received: 2, pending: 3 }])).toBe("PARCIAL");
    expect(poState({ status: "ENCERRADA" }, [{ received: 5, pending: 0 }])).toBe("ENTREGUE");
    expect(poState({ status: "ENCERRADA" }, [{ received: 2, pending: 3 }])).toBe("ENCERRADA_SALDO");
    expect(poState({ status: "CANCELADA" }, [{ received: 0, pending: 5 }])).toBe("CANCELADA");
  });

  it("marca atraso só depois do dia prometido", () => {
    const due = brDate("2026-11-18");
    expect(deadline("AGUARDANDO", due, null, at("2026-11-18", "23:00"))).toMatchObject({ late: false, daysLeft: 0 });
    expect(deadline("PARCIAL", due, null, at("2026-11-21"))).toMatchObject({ late: true, lateDays: 3 });
    expect(deadline("AGUARDANDO", null, null, at("2026-12-30"))).toMatchObject({ late: false, daysLeft: null });
    expect(deadline("ENTREGUE", due, brDate("2026-11-20"), at("2026-12-01"))).toMatchObject({ late: false, lateDays: 2, onTime: false });
    expect(deadline("ENTREGUE", due, brDate("2026-11-18"))).toMatchObject({ onTime: true, lateDays: 0 });
  });

  it("não deixa receber mais que o saldo", () => {
    const prog = itemProgress([{ id: "a", quantity: 10 }], [{ itemId: "a", quantity: 7 }]);
    expect(checkReceipt(prog, [{ itemId: "a", quantity: 0 }], () => "Lona")).toMatch(/pelo menos um item/);
    expect(checkReceipt(prog, [{ itemId: "a", quantity: 4 }], () => "Lona")).toMatch(/maior que o saldo/);
    expect(checkReceipt(prog, [{ itemId: "a", quantity: 3 }], () => "Lona")).toBeNull();
    expect(checkReceipt(prog, [{ itemId: "x", quantity: 1 }], () => "Lona")).toMatch(/não pertence/);
  });

  it("mede pontualidade e prazo médio por fornecedor", () => {
    const base = { supplierName: "F", open: false, late: false };
    const perf = supplierPerformance([
      { ...base, supplierId: "f", orderedAt: brDate("2026-10-01"), due: brDate("2026-10-31"), lastReceiptAt: brDate("2026-10-30"), state: "ENTREGUE" },
      { ...base, supplierId: "f", orderedAt: brDate("2026-10-01"), due: brDate("2026-10-31"), lastReceiptAt: brDate("2026-11-04"), state: "ENTREGUE" },
      { ...base, supplierId: "f", orderedAt: brDate("2026-11-01"), due: brDate("2026-11-10"), lastReceiptAt: null, state: "AGUARDANDO", open: true, late: true },
    ]);
    expect(perf).toEqual([{ supplierId: "f", supplierName: "F", open: 1, lateOpen: 1, done: 2, onTimePct: 50, avgLateDays: 4, avgLeadDays: 31.5 }]);
  });
});
