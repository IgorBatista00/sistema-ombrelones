import { describe, expect, it } from "vitest";
import { deliveryAddress, deliverySummary, isLate, planDeliveryUpdate, promisedDate } from "@/modules/deliveries/rules";

const now = new Date("2026-11-15T13:00:00Z");
describe("entregas", () => {
  it("prazo prometido: fechamento + dias corridos", () => {
    expect(promisedDate(new Date("2026-11-13T17:00:00Z"), 30)!.toISOString()).toBe("2026-12-13T18:00:00.000Z");
    expect(promisedDate(new Date("2026-11-13T17:00:00Z"), null)).toBeNull();
  });
  it("endereço: usa o de entrega; senão compõe o do cliente", () => {
    expect(deliveryAddress({ delivery: "Rua das Palmeiras, 100 — Guarujá/SP", address: "Av. X, 1" }).address).toBe("Rua das Palmeiras, 100 — Guarujá/SP");
    expect(deliveryAddress({ address: "Av. X, 1", city: "Santos/SP", cep: "11000-000" })).toMatchObject({ address: "Av. X, 1 · Santos/SP · CEP 11000-000", fromClient: true });
    expect(deliveryAddress({}).address).toBe("Endereço não informado");
  });
  it("atraso pela data agendada ou, sem ela, pela prometida", () => {
    expect(isLate({ status: "A_AGENDAR", promisedAt: new Date("2026-11-14T15:00:00Z"), scheduledAt: null }, now)).toBe(true);
    expect(isLate({ status: "AGENDADA", promisedAt: new Date("2026-11-14T15:00:00Z"), scheduledAt: new Date("2026-11-16T15:00:00Z") }, now)).toBe(false);
    expect(isLate({ status: "ENTREGUE", promisedAt: new Date("2026-11-01T15:00:00Z"), scheduledAt: null }, now)).toBe(false);
    expect(isLate({ status: "EM_ROTA", promisedAt: new Date("2026-11-15T15:00:00Z"), scheduledAt: null }, now)).toBe(false);
  });
  it("agendar exige data; entregue exige data não futura", () => {
    expect(planDeliveryUpdate({ status: "A_AGENDAR", shippedAt: null }, { status: "AGENDADA" }, now)).toHaveProperty("error");
    expect(planDeliveryUpdate({ status: "AGENDADA", shippedAt: null }, { status: "ENTREGUE", deliveredAt: "2026-11-16" }, now)).toHaveProperty("error");
    const ok = planDeliveryUpdate({ status: "EM_ROTA", shippedAt: new Date("2026-11-14T12:00:00Z") }, { status: "ENTREGUE", deliveredAt: "2026-11-15", receivedBy: " Sr. João " }, now);
    const data = (ok as { data: Record<string, unknown> }).data;
    expect(data.receivedBy).toBe("Sr. João"); expect((data.shippedAt as Date).toISOString()).toBe("2026-11-14T12:00:00.000Z");
  });
  it("voltar para 'a agendar' limpa saída e entrega; cancelamento só pelo funil", () => {
    const r = planDeliveryUpdate({ status: "ENTREGUE", shippedAt: now }, { status: "A_AGENDAR" }, now);
    expect("data" in r && r.data).toMatchObject({ shippedAt: null, deliveredAt: null, receivedBy: null });
    expect(planDeliveryUpdate({ status: "AGENDADA", shippedAt: null }, { status: "CANCELADA" }, now)).toHaveProperty("error");
    expect(planDeliveryUpdate({ status: "CANCELADA", shippedAt: null }, { status: "AGENDADA", scheduledAt: "2026-11-20" }, now)).toHaveProperty("error");
  });
  it("indicadores: por situação, atrasadas, entregues no mês e no prazo", () => {
    const s = deliverySummary([
      { status: "A_AGENDAR", promisedAt: new Date("2026-11-10T15:00:00Z"), scheduledAt: null, deliveredAt: null },
      { status: "AGENDADA", promisedAt: null, scheduledAt: new Date("2026-11-20T15:00:00Z"), deliveredAt: null },
      { status: "ENTREGUE", promisedAt: new Date("2026-11-12T15:00:00Z"), scheduledAt: null, deliveredAt: new Date("2026-11-11T15:00:00Z") },
      { status: "ENTREGUE", promisedAt: new Date("2026-11-05T15:00:00Z"), scheduledAt: null, deliveredAt: new Date("2026-11-08T15:00:00Z") },
    ], now);
    expect(s).toEqual({ aAgendar: 1, agendadas: 1, emRota: 0, entregues: 2, late: 1, deliveredThisMonth: 2, onTimePct: 50 });
  });
});
