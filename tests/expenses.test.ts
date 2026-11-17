import { describe, expect, it } from "vitest";
import { addMonths, buildExpenseSeries, expenseState, expenseSummary } from "@/modules/finance/expense-rules";

describe("saídas", () => {
  it("soma meses respeitando fim de mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-16", 2)).toBe("2027-01-16");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("parcelado: divide o total, última parcela absorve o arredondamento", () => {
    const s = buildExpenseSeries(100_000, "2026-11-20", "installments", 3);
    expect(s.map((x) => [x.dueDate, x.amountCents, x.label])).toEqual([["2026-11-20", 33_333, "1/3"], ["2026-12-20", 33_333, "2/3"], ["2027-01-20", 33_334, "3/3"]]);
  });
  it("recorrente mensal: mesmo valor por N meses", () => {
    const s = buildExpenseSeries(250_000, "2026-11-05", "monthly", 12);
    expect(s).toHaveLength(12); expect(s.every((x) => x.amountCents === 250_000)).toBe(true); expect(s[11].dueDate).toBe("2027-10-05"); expect(s[11].label).toBe("12/12");
  });
  it("sem repetição: uma saída, sem rótulo; limite de 60", () => {
    expect(buildExpenseSeries(5_000, "2026-11-16", "none", 9)).toEqual([{ dueDate: "2026-11-16", amountCents: 5_000, label: null }]);
    expect(buildExpenseSeries(5_000, "2026-11-16", "monthly", 500)).toHaveLength(60);
  });
  it("situação e indicadores", () => {
    const t = "2026-11-16";
    expect(expenseState({ status: "A_PAGAR", dueDay: "2026-11-15" }, t)).toBe("vencida");
    expect(expenseState({ status: "A_PAGAR", dueDay: t }, t)).toBe("vence_hoje");
    expect(expenseState({ status: "PAGA", dueDay: "2026-11-01" }, t)).toBe("paga");
    const s = expenseSummary([
      { status: "A_PAGAR", dueDay: "2026-11-10", amountCents: 1_000, paidCents: null, category: "Aluguel" },
      { status: "A_PAGAR", dueDay: "2026-11-20", amountCents: 2_000, paidCents: null, category: "Frete e transporte" },
      { status: "A_PAGAR", dueDay: "2026-12-30", amountCents: 4_000, paidCents: null, category: "Aluguel" },
      { status: "PAGA", dueDay: "2026-11-05", amountCents: 3_000, paidCents: 3_150, category: "Impostos e taxas" },
      { status: "PAGA", dueDay: "2026-11-06", amountCents: 500, paidCents: null, category: "Aluguel" },
    ], t);
    expect(s).toMatchObject({ open: 7_000, openCount: 3, overdue: 1_000, overdueCount: 1, next7: 2_000, paid: 3_650, paidCount: 2 });
    expect(s.byCategory).toEqual([{ category: "Impostos e taxas", cents: 3_150 }, { category: "Aluguel", cents: 500 }]);
  });
});
