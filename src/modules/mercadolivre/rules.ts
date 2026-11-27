/** Vendas do Mercado Livre — regras puras (sem banco): envio, custo, lucro, vínculo com anúncio e baixa de estoque. */

// ---------------------------------------------------------------- envio
export type ShipStage = "cancelada" | "a_enviar" | "enviada" | "entregue" | "problema" | "outra";
export const SHIP_STAGE: Record<ShipStage, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  a_enviar: { label: "A enviar", tone: "warning" },
  enviada: { label: "Enviada", tone: "neutral" },
  entregue: { label: "Entregue", tone: "success" },
  problema: { label: "Atenção", tone: "danger" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  outra: { label: "Ver status", tone: "neutral" },
};
const n = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Situação de envio a partir do texto de status da planilha do ML (ex.: "Pronto para enviar", "A caminho", "Entregue").
 * "Despachado" marcado aqui no sistema vale mais que a planilha antiga (a planilha é uma foto do momento da exportação).
 */
export function shipStage(statusText: string | null | undefined, cancelled: boolean, shippedAt?: Date | null): ShipStage {
  if (cancelled) return "cancelada";
  const t = n(statusText ?? "");
  if (/reclama|mediac|devolu|nao entregue|extravi|retid|problema|atrasad/.test(t)) return "problema";
  if (/entregue|recebid|concluid/.test(t)) return "entregue";
  if (/a caminho|enviad|em transito|despachad|coletad|em rota|saiu para/.test(t)) return "enviada";
  if (shippedAt) return "enviada";
  if (/pronto para enviar|etiqueta|imprimir|preparar|preparando|aguardando (envio|coleta|despacho|postagem)|para despachar|programad|pendente de envio|enviar/.test(t)) return "a_enviar";
  return "outra";
}

// ---------------------------------------------------------------- custo
/** Custo unitário de um produto: custo médio do estoque → última compra → custo cadastrado no produto. */
export function variantUnitCost(v: { avgCostCents?: number | null; lastCostCents?: number | null; productCostCents?: number | null }) {
  if (v.avgCostCents != null) return { cents: v.avgCostCents, source: "médio" as const };
  if (v.lastCostCents != null) return { cents: v.lastCostCents, source: "última compra" as const };
  if (v.productCostCents != null) return { cents: v.productCostCents, source: "cadastro" as const };
  return { cents: null, source: null };
}

/** Custo de 1 unidade do anúncio = soma dos produtos vinculados × quantidade. */
export function listingUnitCost(components: { quantity: number; unitCostCents: number | null }[]) {
  if (!components.length) return { cents: null as number | null, missing: true };
  const missing = components.some((c) => c.unitCostCents == null);
  return { cents: components.reduce((a, c) => a + (c.unitCostCents ?? 0) * c.quantity, 0), missing };
}

// ---------------------------------------------------------------- lucro
export interface ListingCosts { saleFeeBps?: number | null; fixedFeeCents?: number | null; shippingCostCents?: number | null; packagingCents?: number | null; taxBps?: number | null; otherCostCents?: number | null }
export interface SoldLine { quantity: number; productCents: number; shippingRevenueCents?: number | null; saleFeeTotalCents?: number | null; shippingFeeCents?: number | null; refundCents?: number | null; bonusCents?: number | null; otherCents?: number | null; cancelled?: boolean }
const pct = (v: number, bps: number | null | undefined) => Math.round((v * (bps ?? 0)) / 10_000);

/**
 * Lucro de uma linha vendida. Tarifas e frete REAIS da planilha têm prioridade; sem eles, estima pelo cadastro do anúncio.
 * lucro = produto + frete recebido − tarifa de venda − tarifa de envio − reembolso − custo dos produtos − embalagem − outros − imposto
 */
export function lineProfit(line: SoldLine, listing: ListingCosts | null, unitCostCents: number | null) {
  const q = line.quantity;
  if (line.cancelled) return { revenue: 0, fees: 0, shipping: 0, cost: 0, extras: 0, tax: 0, profit: 0, marginBps: null as number | null, feesEstimated: false, costMissing: false };
  const feeReal = line.saleFeeTotalCents != null;
  const shipReal = line.shippingFeeCents != null;
  const fees = feeReal ? line.saleFeeTotalCents! : listing ? pct(line.productCents, listing.saleFeeBps) + (listing.fixedFeeCents ?? 0) * q : 0;
  const shipping = shipReal ? line.shippingFeeCents! : listing ? (listing.shippingCostCents ?? 0) * q : 0;
  const cost = unitCostCents != null ? unitCostCents * q : 0;
  const extras = listing ? ((listing.packagingCents ?? 0) + (listing.otherCostCents ?? 0)) * q : 0;
  const tax = pct(line.productCents, listing ? listing.taxBps : ML_TAX_BPS); // venda sem anúncio cadastrado usa o imposto padrão
  const revenue = line.productCents + (line.shippingRevenueCents ?? 0) + (line.bonusCents ?? 0) + (line.otherCents ?? 0) - (line.refundCents ?? 0);
  const profit = revenue - fees - shipping - cost - extras - tax;
  return {
    revenue, fees, shipping, cost, extras, tax, profit,
    marginBps: line.productCents > 0 ? Math.round((profit / line.productCents) * 10_000) : null,
    feesEstimated: (!feeReal || !shipReal) && !!listing && ((!feeReal && !!(listing.saleFeeBps || listing.fixedFeeCents)) || (!shipReal && !!listing.shippingCostCents)),
    costMissing: unitCostCents == null,
  };
}

/** Demais colunas de valor da planilha guardadas na venda ([{ label, cents }], com sinal). */
export function otherLinesOf(v: unknown): { label: string; cents: number }[] {
  return Array.isArray(v) ? v.filter((x): x is { label: string; cents: number } => !!x && typeof x.label === "string" && Number.isInteger(x.cents)) : [];
}

/** Linha vendida a partir do item importado. Na planilha (com "Total"), coluna de envio em branco = R$ 0 — não estima pelo anúncio. */
export function soldLineOf(i: { quantity: number; productCents: number | null; unitPriceCents: number; shippingRevenueCents: number | null; saleFeeTotalCents: number | null; saleFeeCents: number | null; shippingFeeCents: number | null; refundCents: number | null; netCents: number | null; bonusCents?: number | null; otherLines?: unknown }, cancelled: boolean): SoldLine {
  return {
    quantity: i.quantity, productCents: i.productCents ?? i.unitPriceCents * i.quantity, shippingRevenueCents: i.shippingRevenueCents,
    saleFeeTotalCents: i.saleFeeTotalCents ?? (i.saleFeeCents != null ? i.saleFeeCents * i.quantity : null),
    shippingFeeCents: i.shippingFeeCents ?? (i.netCents != null ? 0 : null), refundCents: i.refundCents, bonusCents: i.bonusCents ?? null, otherCents: otherLinesOf(i.otherLines).reduce((a, x) => a + x.cents, 0) || null, cancelled,
  };
}

/** Simulação no cadastro do anúncio: quanto sobra por unidade vendida ao preço informado. */
export function simulateListing(priceCents: number, l: ListingCosts, unitCostCents: number | null) {
  return lineProfit({ quantity: 1, productCents: priceCents }, l, unitCostCents);
}

// ---------------------------------------------------------------- vínculo
export interface ListingKey { id: string; mlItemId: string | null; variation: string; sku: string | null }
export const normVariation = (v: string | null | undefined) => n(v ?? "").replace(/\s+/g, " ").replace(/\s*:\s*/g, ": ").trim();

/** Venda → anúncio: MLB + variação exata → MLB (qualquer variação) → SKU. */
export function matchListing(listings: ListingKey[], item: { itemId: string | null; variation: string | null; sku: string | null }) {
  const id = (item.itemId ?? "").toUpperCase(), v = normVariation(item.variation);
  if (id) {
    const same = listings.filter((l) => l.mlItemId === id);
    const exact = same.find((l) => normVariation(l.variation) === v && v);
    if (exact) return exact.id;
    // "Cor: Branco" na venda × "Branco" no anúncio (a planilha de anúncios traz só o valor da variação)
    const values = (x: string) => x.split(/\s*[,;|]\s*/).map((p) => p.replace(/^[^:]*:\s*/, "").trim()).filter(Boolean).join(" | ");
    const byValue = v ? same.filter((l) => l.variation && values(normVariation(l.variation)) === values(v)) : [];
    if (byValue.length === 1) return byValue[0].id;
    const general = same.find((l) => !l.variation);
    if (general) return general.id;
    if (same.length === 1) return same[0].id; // anúncio com uma variação só: qualquer venda do MLB é dele
  }
  if (item.sku) { const s = listings.find((l) => l.sku && l.sku.toUpperCase() === item.sku!.toUpperCase()); if (s) return s.id; }
  return null;
}

// ---------------------------------------------------------------- estoque
/**
 * Baixa de estoque de uma venda, sem duplicar: compara o que a venda pede (0 se cancelada)
 * com o que já saiu do estoque para ela (movimentações com referência ML:<venda>) e devolve só a diferença.
 * delta < 0 = sai do estoque; delta > 0 = volta (cancelamento).
 */
export function stockAdjustments(desired: Map<string, number>, alreadyOut: Map<string, number>) {
  const ids = new Set([...desired.keys(), ...alreadyOut.keys()]);
  const out: { variantId: string; delta: number }[] = [];
  for (const id of ids) {
    const diff = (desired.get(id) ?? 0) - (alreadyOut.get(id) ?? 0);
    if (diff !== 0) out.push({ variantId: id, delta: -diff });
  }
  return out;
}
export const stockRef = (orderId: string) => `ML:${orderId}`;

/** Imposto padrão sobre as vendas no Mercado Livre (14,5%). */
export const ML_TAX_BPS = 1450;
export const bpsFromPct = (v: unknown) => { const t = String(v ?? "").trim().replace("%", "").replace(",", "."); if (!t) return null; const x = Number(t); return Number.isFinite(x) && x >= 0 && x <= 100 ? Math.round(x * 100) : NaN; };
export const fmtPct = (bps: number | null | undefined) => (bps == null ? "" : (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
