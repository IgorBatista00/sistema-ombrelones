import { IntegrationNotConfiguredError } from "@/lib/errors";
import type { CnpjProvider } from "./types";
import { HttpCnpjProvider } from "./http-provider";

/**
 * Seleciona o provedor por CNPJ_PROVIDER. Sem credenciais, lança
 * IntegrationNotConfiguredError — o cadastro informa a indisponibilidade
 * em vez de liberar preços sem consulta.
 */
export function getCnpjProvider(): CnpjProvider {
  const name = process.env.CNPJ_PROVIDER;
  if (!name || !process.env.CNPJ_API_URL) throw new IntegrationNotConfiguredError("Consulta de CNPJ");
  return new HttpCnpjProvider(name, process.env.CNPJ_API_URL, process.env.CNPJ_API_KEY);
}
export type { CnpjProvider, CnpjLookupResult } from "./types";
