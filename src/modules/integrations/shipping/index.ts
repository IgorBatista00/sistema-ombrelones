import { IntegrationNotConfiguredError } from "@/lib/errors";
import { MelhorEnvioProvider } from "./melhor-envio";
import type { ShippingProvider } from "./types";

export function getShippingProvider(): ShippingProvider {
  const p = process.env.SHIPPING_PROVIDER;
  if (p === "melhorenvio" && process.env.MELHORENVIO_TOKEN && process.env.SHIPPING_ORIGIN_ZIP) {
    return new MelhorEnvioProvider(process.env.MELHORENVIO_API_URL ?? "https://sandbox.melhorenvio.com.br", process.env.MELHORENVIO_TOKEN);
  }
  throw new IntegrationNotConfiguredError("Frete automático");
}
export const isAutomaticShippingConfigured = () =>
  process.env.SHIPPING_PROVIDER === "melhorenvio" && !!process.env.MELHORENVIO_TOKEN && !!process.env.SHIPPING_ORIGIN_ZIP;
export type { ShippingOption, ShippingProvider, ShippingVolume } from "./types";
