import { describe, expect, it } from "vitest";
import { buildReceivables, buildReceivablesPlan, cashForecast, financeKpis, receivableState, saleSummary } from "@/modules/finance/receivables";

const closed = new Date("2026-11-13T17:00:00Z"); // 13/11 14h em Brasília
const iso = (d: Date | null) => (d ? d.toISOString() : null);

describe("contas a receber", () => {
  it("parcelas a partir da data de fechamento, última absorve arredondamento", () => {
    const r = buildReceivables(100_000, "30/60/90", closed);
    expect(r.map((x) => x.amountCents)).toEqual([33_333, 33_333, 33_334]);
    expect(r.map((x) => iso(x.dueDate))).toEqual(["2026-12-13T03:00:00.000Z", "2027-01-12T03:00:00.000Z", "2027-02-11T03:00:00.000Z"]);
    expect(r[0].label).toBe("1/3 · 30 dias");
  });
  it("entrada vence no fechamento e 'na entrega' fica a definir", () => {
    const r = buildReceivables(50_000, "entrada/entrega", closed);
    expect(iso(r[0].dueDate)).toBe("2026-11-13T03:00:00.000Z");
    expect(r[1].dueDate).toBeNull();
  });
  it("sem parcelamento: parcela única à vista", () => {
    const r = buildReceivables(12_345, "", closed);
    expect(r).toHaveLength(1); expect(r[0].amountCents).toBe(12_345);
  });
  it("fechamento perto da meia-noite usa o dia de Brasília", () => {
    const r = buildReceivables(1000, "na venda", new Date("2026-12-01T02:30:00Z")); // 30/11 23h30
    expect(iso(r[0].dueDate)).toBe("2026-11-30T03:00:00.000Z");
  });
  it("situação da parcela", () => {
    const now = new Date("2026-12-14T12:00:00Z");
    expect(receivableState({ status: "ABERTO", dueDate: new Date("2026-12-13T03:00:00Z") }, now)).toBe("atrasado");
    expect(receivableState({ status: "ABERTO", dueDate: new Date("2026-12-14T03:00:00Z") }, now)).toBe("aberto");
    expect(receivableState({ status: "ABERTO", dueDate: null }, now)).toBe("a_definir");
    expect(receivableState({ status: "RECEBIDO", dueDate: null }, now)).toBe("recebido");
  });
  it("resumo da venda: recebido, saldo, atraso e margem", () => {
    const now = new Date("2027-01-20T12:00:00Z");
    const recs = buildReceivables(90_000, "30/60/90", closed).map((r, i) => ({ ...r, status: (i === 0 ? "RECEBIDO" : "ABERTO") as "RECEBIDO" | "ABERTO", receivedCents: i === 0 ? 30_000 : null }));
    const s = saleSummary({ status: "ATIVA", totalCents: 90_000, costCents: 54_000 }, recs, now);
    expect(s).toMatchObject({ received: 30_000, open: 60_000, overdue: 30_000, state: "em_atraso", marginBps: 4000 });
  });
  it("indicadores e previsão de caixa", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const recs = [
      { status: "RECEBIDO" as const, dueDate: new Date("2026-11-13T03:00:00Z"), amountCents: 1000, receivedCents: 1000, receivedAt: now },
      { status: "ABERTO" as const, dueDate: new Date("2026-11-15T03:00:00Z"), amountCents: 2000, receivedCents: null, receivedAt: null },
      { status: "ABERTO" as const, dueDate: new Date("2026-11-25T03:00:00Z"), amountCents: 3000, receivedCents: null, receivedAt: null },
      { status: "ABERTO" as const, dueDate: new Date("2027-01-10T03:00:00Z"), amountCents: 4000, receivedCents: null, receivedAt: null },
      { status: "ABERTO" as const, dueDate: null, amountCents: 500, receivedCents: null, receivedAt: null },
    ];
    const k = financeKpis([{ status: "ATIVA", totalCents: 10_500, costCents: 6_300 }, { status: "CANCELADA", totalCents: 9_999, costCents: null }], recs, now);
    expect(k).toMatchObject({ salesCount: 1, revenue: 10_500, received: 1000, toReceive: 9500, overdue: 2000, next7: 3000, undefinedDue: 500, grossMarginBps: 4000 });
    expect(cashForecast(recs, 3, now)).toEqual([{ month: "2026-11", cents: 5000 }, { month: "2026-12", cents: 0 }, { month: "2027-01", cents: 4000 }]);
  });
});

describe("contas a receber com valores negociados", () => {
  it("usa os valores fixados no orçamento e as datas a partir do fechamento", () => {
    const r = buildReceivablesPlan(100_000, "entrada/30/60", new Date("2026-11-13T17:00:00Z"), [50_000, null, null]);
    expect(r.diffCents).toBe(0);
    expect(r.parcels.map((p) => p.amountCents)).toEqual([50_000, 25_000, 25_000]);
    expect(r.parcels[0].dueDate!.toISOString()).toBe("2026-11-13T03:00:00.000Z");
  });
  it("acusa quando os valores não fecham o total", () => {
    expect(buildReceivablesPlan(100_000, "entrada/30", new Date("2026-11-13T17:00:00Z"), [50_000, 40_000]).diffCents).toBe(10_000);
  });
});
