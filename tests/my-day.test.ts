import { describe, expect, it } from "vitest";
import { aggregateItems, itemsSummary, resolveDay } from "@/modules/admin/my-day-rules";

describe("Meu dia", () => {
  it("soma itens iguais", () => {
    const a = aggregateItems([{ code: "A", name: "Ombrelone", quantity: 2, totalCents: 1000 }, { code: "A", name: "Ombrelone", quantity: 3, totalCents: 1500 }, { name: "Base", quantity: 1 }]);
    expect(a[0]).toMatchObject({ code: "A", quantity: 5, totalCents: 2500 }); expect(a[1]).toMatchObject({ name: "Base", quantity: 1, hasTotal: false });
  });
  it("resumo e navegação de dias", () => {
    expect(itemsSummary([{ name: "X", quantity: 2 }, { name: "Y", quantity: 1 }, { name: "Z", quantity: 1 }, { name: "W", quantity: 1 }], 2)).toBe("2× X, 1× Y e mais 2");
    const d = resolveDay("2026-03-01", new Date("2026-11-16T15:00:00Z"));
    expect(d).toMatchObject({ day: "2026-03-01", isToday: false, prev: "2026-02-28", next: "2026-03-02", today: "2026-11-16" });
    expect(resolveDay("lixo", new Date("2026-11-17T02:00:00Z")).day).toBe("2026-11-16"); // 23h em Brasília
  });
});
