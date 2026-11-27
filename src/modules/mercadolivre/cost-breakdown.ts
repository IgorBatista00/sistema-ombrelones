// Detalhamento de receitas e custos das vendas do ML (puro, testável): cada coluna da planilha + custos do cadastro.
import { lineProfit, otherLinesOf, soldLineOf, type ListingCosts } from "./rules";
import { columnsNet } from "./sale-check-rules";

export type BreakdownItem = {
  quantity: number; productCents: number | null; unitPriceCents: number; shippingRevenueCents: number | null; saleFeeTotalCents: number | null; saleFeeCents: number | null;
  shippingFeeCents: number | null; refundCents: number | null; netCents: number | null; bonusCents: number | null; otherLines: unknown; costCents: number | null;
  cancelled: boolean; listing: (ListingCosts & { packagingCents?: number | null; otherCostCents?: number | null }) | null;
};
export type BreakdownLine = { key: string; label: string; cents: number; hint?: string; source: "planilha" | "cadastro" };

/**
 * Para onde foi o faturamento das vendas válidas: receitas (+) e custos (−) até o lucro.
 * A soma das linhas é exatamente o lucro do Painel. Canceladas ficam fora (contam R$ 0) e são mostradas à parte.
 */
export function costBreakdown(items: BreakdownItem[]) {
  const acc = new Map<string, BreakdownLine>();
  const add = (key: string, label: string, cents: number, source: BreakdownLine["source"], hint?: string) => {
    if (!cents) return;
    const cur = acc.get(key) ?? { key, label, cents: 0, source, hint };
    cur.cents += cents; acc.set(key, cur);
  };
  const miss = { tarifa: 0, frete: 0, imposto: 0, mercadoria: 0 };
  // caixa: o que o ML repassa (Total, inclusive o que ele cobra em canceladas) − imposto pago na guia
  let mlReceived = 0, cashTax = 0, noTotal = 0;
  let profit = 0, product = 0, estFees = 0, outside = 0, outsideCount = 0, unexplained = 0, withNet = 0;
  for (const i of items) {
    const line = soldLineOf(i, i.cancelled);
    if (i.cancelled) { if (i.netCents) { outside += i.netCents; outsideCount++; mlReceived += i.netCents; } continue; }
    const p = lineProfit(line, i.listing, i.costCents != null ? i.costCents / i.quantity : null);
    cashTax += p.tax;
    if (i.netCents != null) mlReceived += i.netCents;
    else { noTotal++; mlReceived += columnsNet({ productCents: line.productCents, shippingRevenueCents: line.shippingRevenueCents ?? null, saleFeeCents: p.fees, shippingFeeCents: p.shipping, refundCents: line.refundCents ?? null, bonusCents: line.bonusCents, otherCents: line.otherCents }); }
    profit += p.profit; product += line.productCents;
    const q = i.quantity;
    if (line.saleFeeTotalCents == null) miss.tarifa++;
    if (!p.shipping) miss.frete++;
    if (i.listing && !i.listing.taxBps) miss.imposto++;
    if (i.costCents == null) miss.mercadoria++;
    add("produtos", "Receita por produtos", line.productCents, "planilha");
    add("frete_recebido", "Frete pago pelo comprador", line.shippingRevenueCents ?? 0, "planilha");
    add("bonus", "Descontos e bônus do ML", line.bonusCents ?? 0, "planilha");
    for (const o of otherLinesOf(i.otherLines)) add(`col:${o.label}`, o.label, o.cents, "planilha");
    add("reembolsos", "Reembolsos em vendas não canceladas", -(line.refundCents ?? 0), "planilha");
    add("tarifa", "Tarifa de venda do Mercado Livre", -p.fees, "planilha", line.saleFeeTotalCents == null ? "estimada pelo anúncio em parte das vendas" : undefined);
    if (line.saleFeeTotalCents == null) estFees += p.fees;
    add("frete", "Frete (tarifas de envio)", -p.shipping, "planilha");
    add("imposto", "Impostos", -p.tax, "cadastro");
    add("mercadoria", "Custo da mercadoria", -p.cost, "cadastro");
    add("embalagem", "Embalagem", -((i.listing?.packagingCents ?? 0) * q), "cadastro");
    add("outros", "Outros custos do anúncio", -((i.listing?.otherCostCents ?? 0) * q), "cadastro");
    if (i.netCents != null) {
      withNet++;
      const cols = line.productCents + (line.shippingRevenueCents ?? 0) + (line.bonusCents ?? 0) + (line.otherCents ?? 0) - (line.saleFeeTotalCents ?? 0) - (line.shippingFeeCents ?? 0) - (line.refundCents ?? 0);
      unexplained += i.netCents - cols;
    }
  }
  const order = ["produtos", "frete_recebido", "bonus", "tarifa", "frete", "imposto", "mercadoria", "embalagem", "outros", "reembolsos"];
  const rank = (k: string) => { const n = order.indexOf(k); return n < 0 ? (k.startsWith("col:") ? 3.5 : 99) : n; };
  const all = [...acc.values()];
  const lines = all.sort((a, b) => (a.cents > 0 ? 0 : 1) - (b.cents > 0 ? 0 : 1) || rank(a.key) - rank(b.key));
  // os 4 custos principais aparecem sempre, mesmo zerados (para ficar claro que foram conferidos)
  for (const [key, label, source] of [["tarifa", "Tarifa de venda do Mercado Livre", "planilha"], ["frete", "Frete (tarifas de envio)", "planilha"], ["imposto", "Impostos", "cadastro"], ["mercadoria", "Custo da mercadoria", "cadastro"]] as const)
    if (!acc.has(key)) lines.push({ key, label, cents: 0, source });
  const missHint: Record<keyof typeof miss, string> = { tarifa: "sem tarifa na planilha", frete: "sem tarifa de envio (pacote, retirada ou entrega própria)", imposto: "com anúncio sem imposto (%)", mercadoria: "sem custo (anúncio não cadastrado ou produto sem custo)" };
  for (const l of lines) { const k = l.key as keyof typeof miss; if (k in miss && miss[k]) l.hint = `${miss[k]} venda(s) ${missHint[k]}`; }
  const income = lines.filter((l) => l.cents > 0 || (l.cents === 0 && l.key === "produtos"));
  const costs = lines.filter((l) => !income.includes(l)).sort((a, b) => rank(a.key) - rank(b.key));
  return {
    product, income, costs, profit,
    totalIncome: income.reduce((a, l) => a + l.cents, 0), totalCosts: costs.reduce((a, l) => a + l.cents, 0),
    estimatedFees: estFees, missing: miss,
    cash: { mlReceived, tax: cashTax, increase: mlReceived - cashTax, noTotal },
    outside: { cancelled: outside, cancelledCount: outsideCount, unexplained, withNet },
  };
}
export type CostBreakdown = ReturnType<typeof costBreakdown>;
