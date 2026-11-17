import type { CnpjLookupResult } from "@/modules/integrations/cnpj";

/**
 * Análise de risco PROPORCIONAL. CNPJ ativo não prova que o usuário
 * representa a empresa; sinais somados definem se o cadastro é liberado
 * automaticamente ou vai para revisão excepcional (UNDER_REVIEW).
 * Os limiares são configuráveis e devem ser calibrados com dados reais.
 */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "bol.com.br",
  "uol.com.br", "icloud.com", "live.com", "terra.com.br", "ig.com.br",
]);
const DISPOSABLE_EMAIL_DOMAINS = new Set(["mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "yopmail.com"]);

export const REVIEW_THRESHOLD = 50;

export interface RiskInput {
  lookup: CnpjLookupResult;
  email: string;
  recentSignupsFromIp: number;
}

export function assessRisk({ lookup, email, recentSignupsFromIp }: RiskInput) {
  const reasons: string[] = [];
  let score = 0;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) { score += 60; reasons.push("E-mail descartável"); }

  const lookupDomain = lookup.email?.split("@")[1]?.toLowerCase();
  const domainMatches = !!lookupDomain && lookupDomain === domain && !FREE_EMAIL_DOMAINS.has(domain);
  if (domainMatches) { score -= 20; reasons.push("Domínio do e-mail coincide com o cadastro do CNPJ"); }

  if (lookup.openedAt) {
    const days = (Date.now() - new Date(lookup.openedAt).getTime()) / 86_400_000;
    if (days < 90) { score += 30; reasons.push("Empresa aberta há menos de 90 dias"); }
  }
  if (recentSignupsFromIp >= 3) { score += 40; reasons.push("Vários cadastros a partir do mesmo IP"); }

  return { score: Math.max(0, score), reasons, needsReview: score >= REVIEW_THRESHOLD };
}
