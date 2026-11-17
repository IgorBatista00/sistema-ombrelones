import { IntegrationNotConfiguredError } from "@/lib/errors";
import { PagarmeProvider } from "./pagarme";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(name = process.env.PAYMENT_PROVIDER): PaymentProvider {
  if (name === "pagarme" && process.env.PAGARME_SECRET_KEY) {
    return new PagarmeProvider(
      process.env.PAGARME_API_URL ?? "https://api.pagar.me/core/v5",
      process.env.PAGARME_SECRET_KEY,
      process.env.PAGARME_WEBHOOK_USER ?? "",
      process.env.PAGARME_WEBHOOK_PASSWORD ?? "",
    );
  }
  throw new IntegrationNotConfiguredError("Pagamentos");
}
export const isPaymentConfigured = () => process.env.PAYMENT_PROVIDER === "pagarme" && !!process.env.PAGARME_SECRET_KEY;
export type * from "./types";
