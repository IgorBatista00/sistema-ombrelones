import { AppError } from "@/lib/errors";
import type { ShippingOption, ShippingProvider, ShippingVolume } from "./types";

/**
 * Adaptador Melhor Envio (API v2 — /api/v2/me/shipment/calculate).
 * PENDENTE DE HOMOLOGAÇÃO: confirmar quais transportadoras do contrato
 * aceitam volumes longos (ombrelones ultrapassam limites de Correios).
 * Opções sem preço ou com erro retornado pelo provedor são descartadas —
 * não há cobertura universal; quando nada retornar, o cliente usa a
 * cotação manual.
 */
export class MelhorEnvioProvider implements ShippingProvider {
  readonly name = "melhor-envio";
  constructor(private baseUrl: string, private token: string) {}

  async quote(input: { originZip: string; destinationZip: string; volumes: ShippingVolume[]; declaredValueCents: number }): Promise<ShippingOption[]> {
    const products = input.volumes.map((v, i) => ({
      id: String(i),
      width: Math.ceil(v.widthMm / 10),
      height: Math.ceil(v.heightMm / 10),
      length: Math.ceil(v.lengthMm / 10),
      weight: v.weightG / 1000,
      insurance_value: (v.insuranceCents ?? 0) / 100,
      quantity: v.quantity,
    }));
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "[NOME DA MARCA] B2B",
      },
      body: JSON.stringify({ from: { postal_code: input.originZip }, to: { postal_code: input.destinationZip }, products }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new AppError("SHIPPING_QUOTE_FAILED", "Não foi possível consultar o frete automático agora.", 502);
    const data = (await res.json()) as Array<{ id: number; name: string; price?: string; custom_price?: string; delivery_time?: number; custom_delivery_time?: number; error?: string; company?: { name: string } }>;
    return data
      .filter((o) => !o.error && (o.custom_price ?? o.price))
      .map((o) => ({
        id: String(o.id),
        carrierName: o.company?.name ?? "Transportadora",
        serviceName: o.name,
        priceCents: Math.round(Number(o.custom_price ?? o.price) * 100),
        deadlineDays: o.custom_delivery_time ?? o.delivery_time ?? 0,
      }));
  }
}
