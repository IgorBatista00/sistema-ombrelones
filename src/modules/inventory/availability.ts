import type { AvailabilityMode } from "@prisma/client";
import { stockText, type StockDisplay } from "./movements-rules";

export type AvailabilityInfo =
  | { state: "in_stock"; available: number }
  | { state: "made_to_order"; leadTimeDays: number | null }
  | { state: "out_of_stock" }
  | { state: "unavailable" };

/** Regra pura de disponibilidade (testável). */
export function computeAvailability(
  mode: AvailabilityMode,
  stock: { onHand: number; reserved: number } | null,
  leadTimeDays: number | null,
): AvailabilityInfo {
  if (mode === "UNAVAILABLE") return { state: "unavailable" };
  if (mode === "MADE_TO_ORDER") return { state: "made_to_order", leadTimeDays };
  const available = Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0));
  return available > 0 ? { state: "in_stock", available } : { state: "out_of_stock" };
}

export function availabilityLabel(a: AvailabilityInfo, display?: StockDisplay) {
  switch (a.state) {
    case "in_stock": return stockText(a.available, display);
    case "made_to_order": return a.leadTimeDays ? `Sob encomenda · ${a.leadTimeDays} dias` : "Sob encomenda";
    case "out_of_stock": return "Sem estoque";
    case "unavailable": return "Indisponível";
  }
}

/** Quantidade deve respeitar a unidade de venda (múltiplos). Sem mínimo além dela. */
export function isValidQuantity(qty: number, saleUnit: number) {
  return Number.isInteger(qty) && qty >= saleUnit && qty % saleUnit === 0 && qty <= 100_000;
}

export type PaymentMethodKey = "PIX" | "BOLETO" | "CREDIT_CARD";
/** Prazo de expiração da reserva conforme o meio de pagamento (minutos configuráveis). */
export function reservationExpiry(method: PaymentMethodKey, minutes: Record<PaymentMethodKey, number>, from = new Date()) {
  return new Date(from.getTime() + minutes[method] * 60_000);
}
