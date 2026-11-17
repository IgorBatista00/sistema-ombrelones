import { describe, expect, it } from "vitest";
import { normalizeCategories, otherIncomeSummary } from "@/modules/finance/other-income-rules";

describe("outras receitas", () => {
  it("categorias sem vazias nem repetidas", () => {
    expect(normalizeCategories([" Juros ", "juros", "", "Rendimentos", "  Reembolso   de frete "])).toEqual(["Juros", "Rendimentos", "Reembolso de frete"]);
  });
  it("resumo: recebido, previsto, previsto vencido e por categoria", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const s = otherIncomeSummary([
      { status: "RECEBIDA", category: "Rendimentos", amountCents: 1500, date: now },
      { status: "RECEBIDA", category: "Juros de aplicação", amountCents: 4000, date: now },
      { status: "RECEBIDA", category: "Rendimentos", amountCents: 500, date: now },
      { status: "PREVISTA", category: "Reembolsos", amountCents: 900, date: new Date("2026-11-10T15:00:00Z") },
      { status: "PREVISTA", category: "Reembolsos", amountCents: 100, date: new Date("2026-12-10T15:00:00Z") },
    ], now);
    expect(s).toEqual({ received: 6000, planned: 1000, overduePlanned: 900, byCategory: [{ category: "Juros de aplicação", cents: 4000 }, { category: "Rendimentos", cents: 2000 }] });
  });
});
