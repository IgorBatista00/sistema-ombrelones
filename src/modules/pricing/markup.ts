/** Tabela de preços — regras puras do markup (sem banco). Markup guardado como fator × 10.000 (2,5 → 25000). */
export const MARKUP_SCALE = 10_000;

/** "2,5" | "2.50" | "2" → 25000. Aceita até 4 casas. Retorna null se vazio; NaN se inválido. */
export function parseMarkup(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const t = String(input).trim().replace(/x$/i, "").trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(t)) return NaN;
  return Math.round(Number(t) * MARKUP_SCALE);
}

export function validateMarkup(m: number | null): string | null {
  if (m == null) return null;
  if (Number.isNaN(m)) return "Markup inválido. Use um número como 2,5.";
  if (m <= 0) return "O markup precisa ser maior que zero.";
  if (m > 100 * MARKUP_SCALE) return "Markup acima de 100 — confira o valor.";
  return null;
}

export const formatMarkup = (m: number | null | undefined) => (m == null ? "" : (m / MARKUP_SCALE).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

/** Preço calculado = custo final × markup, arredondado ao centavo. */
export function calcPrice(costCents: number | null | undefined, markup: number | null | undefined) {
  if (costCents == null || markup == null || costCents <= 0) return null;
  return Math.round((costCents * markup) / MARKUP_SCALE);
}

/** Margem sobre o preço resultante do markup: 1 − 1/markup (em pontos-base). */
export const marginFromMarkup = (markup: number | null | undefined) => (markup ? Math.round((1 - MARKUP_SCALE / markup) * 10_000) : null);

export type PriceRowState = "sem_custo" | "sem_markup" | "abaixo_custo" | "desatualizado" | "ok";
export const STATE_LABEL: Record<PriceRowState, string> = { sem_custo: "Sem custo", sem_markup: "Sem markup", abaixo_custo: "Abaixo do custo", desatualizado: "Preço do site diferente", ok: "Em dia" };

export function priceRowState(r: { costCents: number | null; markup: number | null; sitePriceCents: number | null }): PriceRowState {
  if (r.costCents == null || r.costCents <= 0) return "sem_custo";
  if (r.markup == null) return "sem_markup";
  if (r.markup < MARKUP_SCALE) return "abaixo_custo";
  const calc = calcPrice(r.costCents, r.markup);
  return calc !== r.sitePriceCents ? "desatualizado" : "ok";
}

// ───────────── Perfis de markup (custos % sobre o preço + margens) ─────────────
/** Percentuais em pontos-base (5,7% → 570), todos sobre o PREÇO DE VENDA. */
export type MarkupCosts = { cardFeeBps: number; extCommissionBps: number; intCommissionBps: number; taxBps: number; packagingBps: number; financialBps: number; otherBps: number };
export type MarkupProfileRule = MarkupCosts & { idealMarginBps: number; minMarginBps: number };
export const COST_FIELDS: { key: keyof MarkupCosts; label: string }[] = [
  { key: "cardFeeBps", label: "Taxa cartão" }, { key: "extCommissionBps", label: "Comissão externa" },
  { key: "intCommissionBps", label: "Comissão interna" }, { key: "taxBps", label: "Imposto" },
  { key: "packagingBps", label: "Embalagem" }, { key: "financialBps", label: "Financeiro" }, { key: "otherBps", label: "Outros" },
];
const BPS = 10_000;

/** "5,7" | "5.7" | "5,7%" → 570. Até 2 casas. null se vazio; NaN se inválido. */
export function parsePct(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const t = String(input).trim().replace(/%$/, "").trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}
export const fmtPct = (bps: number | null | undefined, digits = 2) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`);
/** Valor para campo de formulário: 570 → "5,7"; 0 → "0". */
export const pctInput = (bps: number) => (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export const totalCostsBps = (p: MarkupCosts) => COST_FIELDS.reduce((a, f) => a + (p[f.key] || 0), 0);
/** Divisor × 10.000 (0,583 → 5830). ≤ 0 = impossível. */
export const divisorBps = (p: MarkupProfileRule, which: "ideal" | "min") => BPS - totalCostsBps(p) - (which === "ideal" ? p.idealMarginBps : p.minMarginBps);
/** Multiplicador equivalente (1 ÷ divisor) × 10.000, para comparar com o markup antigo. */
export const multiplierFromDivisor = (div: number) => (div > 0 ? Math.round((BPS * BPS) / div) : null);

export function summarizeProfile(p: MarkupProfileRule) {
  const costs = totalCostsBps(p);
  const divMin = divisorBps(p, "min"), divIdeal = divisorBps(p, "ideal");
  return { costs, costsPlusMin: costs + p.minMarginBps, costsPlusIdeal: costs + p.idealMarginBps, divMin, divIdeal, multMin: multiplierFromDivisor(divMin), multIdeal: multiplierFromDivisor(divIdeal) };
}

export function validateProfile(p: MarkupProfileRule & { name: string }): string | null {
  if (!p.name.trim()) return "Dê um nome ao markup (ex.: Consumidor Final 6x).";
  if (p.minMarginBps > p.idealMarginBps) return "A margem mínima não pode ser maior que a margem ideal.";
  if (divisorBps(p, "ideal") < 500) return "Custos + margem ideal passam de 95% do preço — confira os percentuais.";
  return null;
}

/** Preço = custo ÷ divisor, arredondado ao centavo. */
export function priceFromDivisor(costCents: number | null | undefined, div: number) {
  if (costCents == null || costCents <= 0 || div <= 0) return null;
  return Math.round((costCents * BPS) / div);
}
/** Margem real (pontos-base) de um preço de venda, descontando os custos % do perfil e o custo do produto. */
export function realMarginBps(costCents: number | null | undefined, priceCents: number | null | undefined, p: MarkupCosts) {
  if (costCents == null || priceCents == null || priceCents <= 0) return null;
  return Math.round(BPS - totalCostsBps(p) - (costCents * BPS) / priceCents);
}

export type PricingState = PriceRowState | "abaixo_minimo";
export const PRICING_LABEL: Record<PricingState, string> = { ...STATE_LABEL, sem_markup: "Sem markup", abaixo_minimo: "Abaixo da margem mínima" };

/** Preço sugerido para a linha da tabela: perfil (divisor) tem prioridade; senão, markup manual (multiplicador). */
export function rowPricing(r: { costCents: number | null; markup: number | null; profile: MarkupProfileRule | null; sitePriceCents: number | null }) {
  if (r.profile) {
    const calc = priceFromDivisor(r.costCents, divisorBps(r.profile, "ideal"));
    const min = priceFromDivisor(r.costCents, divisorBps(r.profile, "min"));
    const siteMargin = realMarginBps(r.costCents, r.sitePriceCents, r.profile);
    let state: PricingState;
    if (r.costCents == null || r.costCents <= 0) state = "sem_custo";
    else if (calc !== r.sitePriceCents) state = r.sitePriceCents != null && min != null && r.sitePriceCents < min ? "abaixo_minimo" : "desatualizado";
    else state = "ok";
    return { calc, min, marginBps: calc != null ? r.profile.idealMarginBps : null, siteMarginBps: siteMargin, state };
  }
  const calc = calcPrice(r.costCents, r.markup);
  return { calc, min: null as number | null, marginBps: r.costCents != null ? marginFromMarkup(r.markup) : null, siteMarginBps: null as number | null, state: priceRowState(r) as PricingState };
}
