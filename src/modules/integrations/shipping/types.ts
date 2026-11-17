export interface ShippingVolume { lengthMm: number; widthMm: number; heightMm: number; weightG: number; quantity: number; insuranceCents?: number }

export interface ShippingOption {
  id: string; // ID do serviço no provedor (estável entre cotações)
  carrierName: string;
  serviceName: string;
  priceCents: number;
  deadlineDays: number;
}

export interface ShippingProvider {
  readonly name: string;
  quote(input: { originZip: string; destinationZip: string; volumes: ShippingVolume[]; declaredValueCents: number }): Promise<ShippingOption[]>;
}
