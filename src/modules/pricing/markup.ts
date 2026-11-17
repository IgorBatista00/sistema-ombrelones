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
