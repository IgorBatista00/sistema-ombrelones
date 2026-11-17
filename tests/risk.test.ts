import { describe, expect, it } from "vitest";
import { assessRisk } from "@/modules/companies/risk";
import type { CnpjLookupResult } from "@/modules/integrations/cnpj";

const lookup = (o: Partial<CnpjLookupResult> = {}): CnpjLookupResult => ({
  cnpj: "11222333000181", legalName: "Empresa", tradeName: null, registrationStatus: "ATIVA",
  openedAt: "2015-01-01", mainActivity: null, email: "contato@empresa.com.br", phone: null, address: null, raw: {}, ...o,
});

describe("Análise de risco", () => {
  it("cadastro comum é liberado automaticamente", () => {
    expect(assessRisk({ lookup: lookup(), email: "compras@gmail.com", recentSignupsFromIp: 0 }).needsReview).toBe(false);
  });
  it("e-mail descartável vai para revisão", () => {
    expect(assessRisk({ lookup: lookup(), email: "x@mailinator.com", recentSignupsFromIp: 0 }).needsReview).toBe(true);
  });
  it("empresa recém-aberta + muitos cadastros do IP vai para revisão", () => {
    const r = assessRisk({ lookup: lookup({ openedAt: new Date().toISOString() }), email: "a@b.com", recentSignupsFromIp: 5 });
    expect(r.needsReview).toBe(true);
    expect(r.reasons.length).toBe(2);
  });
  it("domínio corporativo igual ao do CNPJ reduz risco", () => {
    const r = assessRisk({ lookup: lookup({ openedAt: new Date().toISOString() }), email: "joao@empresa.com.br", recentSignupsFromIp: 0 });
    expect(r.score).toBe(10);
  });
});
