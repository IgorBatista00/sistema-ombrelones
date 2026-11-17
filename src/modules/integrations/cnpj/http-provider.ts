import { AppError } from "@/lib/errors";
import type { CnpjLookupResult, CnpjProvider } from "./types";
import type { CnpjRegistrationStatus } from "@prisma/client";

/**
 * Adaptador HTTP genérico. O mapeamento de campos (mapResponse) deve ser
 * ajustado ao contrato do provedor escolhido (CNPJá, ReceitaWS, SERPRO…)
 * durante a homologação. PENDENTE: confirmar contrato e limites de uso.
 */
export class HttpCnpjProvider implements CnpjProvider {
  constructor(readonly name: string, private baseUrl: string, private apiKey?: string) {}

  async lookup(cnpj: string): Promise<CnpjLookupResult | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/${cnpj}`, {
        headers: this.apiKey ? { Authorization: this.apiKey } : {},
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new AppError("CNPJ_LOOKUP_FAILED", "Não foi possível consultar o CNPJ agora.", 502);
      return mapResponse(cnpj, await res.json());
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("CNPJ_LOOKUP_FAILED", "Não foi possível consultar o CNPJ agora. Tente novamente em instantes.", 502);
    } finally {
      clearTimeout(t);
    }
  }
}

function mapStatus(v: unknown): CnpjRegistrationStatus {
  const s = String(v ?? "").toUpperCase();
  if (s.includes("ATIV")) return "ATIVA";
  if (s.includes("SUSP")) return "SUSPENSA";
  if (s.includes("INAPT")) return "INAPTA";
  if (s.includes("BAIX")) return "BAIXADA";
  if (s.includes("NUL")) return "NULA";
  return "DESCONHECIDA";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapResponse(cnpj: string, d: any): CnpjLookupResult {
  const addr = d.address ?? d.endereco ?? null;
  return {
    cnpj,
    legalName: d.company?.name ?? d.razao_social ?? d.nome ?? "",
    tradeName: d.alias ?? d.nome_fantasia ?? d.fantasia ?? null,
    registrationStatus: mapStatus(d.status?.text ?? d.situacao_cadastral ?? d.situacao),
    openedAt: d.founded ?? d.data_inicio_atividade ?? d.abertura ?? null,
    mainActivity: d.mainActivity
      ? { code: String(d.mainActivity.id), description: d.mainActivity.text }
      : d.cnae_fiscal ? { code: String(d.cnae_fiscal), description: d.cnae_fiscal_descricao ?? "" } : null,
    email: d.emails?.[0]?.address ?? d.email ?? null,
    phone: d.phones?.[0] ? `${d.phones[0].area}${d.phones[0].number}` : d.telefone ?? null,
    address: addr
      ? {
          zipCode: String(addr.zip ?? addr.cep ?? "").replace(/\D/g, ""),
          street: addr.street ?? addr.logradouro ?? "",
          number: addr.number ?? addr.numero ?? "",
          complement: addr.details ?? addr.complemento ?? null,
          district: addr.district ?? addr.bairro ?? "",
          city: addr.city ?? addr.municipio ?? "",
          state: addr.state ?? addr.uf ?? "",
        }
      : null,
    raw: d,
  };
}
