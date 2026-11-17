import type { CnpjRegistrationStatus } from "@prisma/client";

export interface CnpjLookupResult {
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  registrationStatus: CnpjRegistrationStatus;
  openedAt: string | null;
  mainActivity: { code: string; description: string } | null;
  email: string | null;
  phone: string | null;
  address: {
    zipCode: string; street: string; number: string; complement: string | null;
    district: string; city: string; state: string;
  } | null;
  raw: unknown;
}

export interface CnpjProvider {
  readonly name: string;
  /** Retorna null quando o CNPJ não existe na base do provedor. */
  lookup(cnpj: string): Promise<CnpjLookupResult | null>;
}
