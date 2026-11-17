/**
 * Motor de custo do produto — funções PURAS (testadas em tests/product-cost.test.ts).
 *
 *   fornecedor principal = vínculo marcado como principal, senão o primeiro
 *   custo c/ IPI         = mercadoria + mercadoria × IPI
 *   adicionais           = Σ quantidade × preço do item da tabela de custos (corte, tecido, gráfica, plaquinha)
 *   CUSTO FINAL BASE     = custo c/ IPI + adicionais
 *
 * Valores em centavos (inteiros). IPI em pontos-base (650 = 6,50%).
 */
export type CostCategory = "CORTE" | "TECIDO" | "GRAFICA" | "PLAQUINHA";
export const COST_CATEGORIES: { key: CostCategory; label: string; qtyLabel: string }[] = [
  { key: "CORTE", label: "Custo corte", qtyLabel: "Quantidade" },
  { key: "TECIDO", label: "Custo tecido", qtyLabel: "Metragem" },
  { key: "GRAFICA", label: "Custo gráfica", qtyLabel: "Quantidade" },
  { key: "PLAQUINHA", label: "Custo plaquinha", qtyLabel: "Quantidade" },
];

export interface SupplierLinkCost { costCents: number | null; ipiBps: number | null; isPrincipal: boolean }
export interface AdditionalCost { category: CostCategory; priceCents: number; quantity: number }

export function principalOf<T extends { isPrincipal: boolean }>(links: T[]): T | null {
  return links.find((l) => l.isPrincipal) ?? links[0] ?? null;
}

/** Garante exatamente um principal: mantém o marcado, senão promove o primeiro. */
export function normalizePrincipal<T extends { isPrincipal: boolean }>(links: T[]): T[] {
  if (links.length === 0) return links;
  const idx = Math.max(0, links.findIndex((l) => l.isPrincipal));
  return links.map((l, i) => ({ ...l, isPrincipal: i === idx }));
}

export function computeCost(links: SupplierLinkCost[], additional: AdditionalCost[]) {
  const principal = principalOf(links);
  const merchandiseCents = principal?.costCents ?? 0;
  const ipiBps = principal?.ipiBps ?? 0;
  const ipiCents = Math.round((merchandiseCents * ipiBps) / 10_000);
  const withIpiCents = merchandiseCents + ipiCents;
  const byCategory = { CORTE: 0, TECIDO: 0, GRAFICA: 0, PLAQUINHA: 0 } as Record<CostCategory, number>;
  for (const a of additional) byCategory[a.category] += Math.round(a.quantity * a.priceCents);
  const additionalCents = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return {
    merchandiseCents, ipiBps, ipiCents, withIpiCents, byCategory, additionalCents,
    finalCents: withIpiCents + additionalCents,
    missingSupplierCost: !principal || principal.costCents == null,
  };
}

/** Margem sobre o preço de venda, em pontos-base. null quando não há preço. */
export function marginBps(priceCents: number | null | undefined, costCents: number | null | undefined) {
  if (!priceCents || costCents == null) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 10_000);
}

/** Cubagem total em m³ (dimensões em mm). */
export function cubicMeters(packages: { lengthMm: number; widthMm: number; heightMm: number; quantity?: number }[]) {
  return packages.reduce((s, p) => s + (p.lengthMm * p.widthMm * p.heightMm * (p.quantity ?? 1)) / 1e9, 0);
}

// ---- conversões de unidade (o banco guarda mm; a tela usa cm ou m) ----
export type MeasureUnit = "CM" | "M";
export const toMm = (v: number | null | undefined, unit: MeasureUnit) => (v == null || Number.isNaN(v) ? null : Math.round(v * (unit === "M" ? 1000 : 10)));
export const fromMm = (mm: number | null | undefined, unit: MeasureUnit) => (mm == null ? null : unit === "M" ? mm / 1000 : mm / 10);

/** Aceita "1.234,56", "1234.56", "1234,5" → centavos. */
export function parseMoney(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v * 100);
  const s = v.trim().replace(/[R$\s]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
/** "6,5" → 650 pontos-base. */
export function parsePercentBps(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", "").trim().replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export const parseDecimal = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const LEAD_TIMES = [
  ["PRONTA_ENTREGA", "Pronta entrega"], ["D15", "15 dias"], ["D30", "30 dias"],
  ["D60", "60 dias"], ["D90", "90 dias"], ["IMPORTACAO", "Importação"],
] as const;
export type LeadTimeKey = (typeof LEAD_TIMES)[number][0];
export function parseLeadTime(v: string | null | undefined): LeadTimeKey | null {
  if (!v) return null;
  const s = String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  if (s.startsWith("pronta")) return "PRONTA_ENTREGA";
  if (s.startsWith("import")) return "IMPORTACAO";
  const n = parseInt(s, 10);
  return ({ 15: "D15", 30: "D30", 60: "D60", 90: "D90" } as Record<number, LeadTimeKey>)[n] ?? null;
}
