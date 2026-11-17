import { describe, expect, it } from "vitest";
import { dayRange, funnelSummary, planMove, stageOf } from "@/modules/quotes/funnel";

const now = new Date("2026-11-13T15:00:00Z");
const open = { status: "ENVIADO" as const, issuedAt: new Date("2026-11-10T12:00:00Z"), validDays: 15 };

describe("funil de orçamentos", () => {
  it("coluna de cada situação", () => {
    expect(["RASCUNHO", "EMITIDO", "ENVIADO"].map((s) => stageOf(s as never))).toEqual(["salvos", "salvos", "salvos"]);
    expect(stageOf("APROVADO")).toBe("fechados");
    expect(stageOf("RECUSADO")).toBe("perdidos");
    expect(stageOf("EXPIRADO")).toBe("perdidos");
  });
  it("fechar registra a data de fechamento", () => {
    expect(planMove(open, "fechados", null, now)).toEqual({ status: "APROVADO", closedAt: now, lostReason: null });
  });
  it("perder registra data e motivo", () => {
    expect(planMove(open, "perdidos", " Preço ", now)).toEqual({ status: "RECUSADO", closedAt: now, lostReason: "Preço" });
  });
  it("reabrir limpa o fechamento; rascunho continua rascunho", () => {
    expect(planMove({ ...open, status: "APROVADO" }, "salvos", null, now)).toEqual({ status: "ENVIADO", closedAt: null, lostReason: null });
    expect(planMove({ ...open, status: "RECUSADO", draftBefore: true }, "salvos", null, now)).toMatchObject({ status: "RASCUNHO" });
  });
  it("não reabre orçamento com validade vencida", () => {
    expect(planMove({ status: "EXPIRADO", issuedAt: new Date("2026-10-01T12:00:00Z"), validDays: 15 }, "salvos", null, now)).toHaveProperty("error");
  });
  it("mesma coluna não muda nada", () => expect(planMove(open, "salvos", null, now)).toBeNull());
  it("filtro de datas no fuso de Brasília, fim inclusivo", () => {
    const r = dayRange("2026-11-01", "2026-11-13")!;
    expect(r.gte!.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(r.lt!.toISOString()).toBe("2026-11-14T03:00:00.000Z");
    expect(dayRange("", "")).toBeNull();
    expect(dayRange("13/11/2026")).toBeNull();
  });
  it("indicadores: taxa de fechamento e ticket médio", () => {
    const s = funnelSummary([{ stage: "salvos", totalCents: 1000 }, { stage: "fechados", totalCents: 3000 }, { stage: "fechados", totalCents: 5000 }, { stage: "perdidos", totalCents: 2000 }]);
    expect(s.count).toEqual({ salvos: 1, fechados: 2, perdidos: 1 });
    expect(s.conversion).toBe(66.7);
    expect(s.conversionValue).toBe(80);
    expect(s.avgTicket).toBe(4000);
  });
});
