// Validação das vendas importadas do Mercado Livre: confere cada linha da planilha (puro, testável).

export type CheckLevel = "critico" | "aviso" | "info";
export type SaleIssue =
  | "sem_anuncio" | "sem_custo" | "total_diferente"
  | "sem_total" | "sem_tarifa" | "cancelada_com_valor" | "prejuizo" | "sem_imposto"
  | "total_centavos" | "sem_sku";

export const SALE_ISSUES: Record<SaleIssue, { label: string; level: CheckLevel; fix: string }> = {
  sem_anuncio: { label: "Venda sem anúncio cadastrado", level: "critico", fix: "Sem anúncio, o sistema não sabe qual produto saiu: a venda fica sem custo e o lucro aparece maior. Cadastre o anúncio (MLB) com o produto e a venda é ligada na hora." },
  sem_custo: { label: "Venda sem custo da mercadoria", level: "critico", fix: "O anúncio está ligado, mas o produto não tinha custo quando a venda entrou. Cadastre o custo em Produtos e clique em “Recalcular custos”." },
  total_diferente: { label: "Total do ML não bate com as colunas", level: "critico", fix: "A soma das colunas da planilha (receita − tarifas − frete − reembolsos) é diferente do Total que o ML informa. O sistema calcula o lucro pelas colunas; confira a venda no ML para ver o que foi descontado." },
  sem_total: { label: "Planilha sem o Total (BRL)", level: "aviso", fix: "Sem o Total do ML não dá para conferir os valores. Exporte a planilha de vendas com a coluna Total e importe de novo." },
  sem_tarifa: { label: "Sem tarifa de venda na planilha", level: "aviso", fix: "O sistema estimou a tarifa pelo cadastro do anúncio. Reimporte a planilha com a coluna “Tarifa de venda e impostos”." },
  cancelada_com_valor: { label: "Cancelada/devolvida com valor lançado", level: "aviso", fix: "Venda cancelada conta R$ 0 no sistema, mas o ML lançou um valor (ex.: frete de devolução ou valor retido). Confira no ML; esse valor hoje não entra no resultado." },
  prejuizo: { label: "Venda com prejuízo", level: "aviso", fix: "O lucro calculado ficou negativo. Confira se o custo do produto e as tarifas estão certos." },
  sem_imposto: { label: "Imposto não descontado", level: "aviso", fix: "O anúncio ligado não tem imposto (%) cadastrado, então o lucro desta venda não desconta imposto. Informe o imposto no anúncio." },
  total_centavos: { label: "Diferença pequena no Total do ML", level: "info", fix: "Diferença de até R$ 2,00 entre as colunas e o Total (arredondamento ou “Descontos e bônus”). Não afeta o resultado de forma relevante." },
  sem_sku: { label: "Venda sem SKU", level: "info", fix: "A linha da planilha não tem SKU. Não atrapalha se o anúncio (MLB) estiver cadastrado." },
};

export const LEVEL_LABEL: Record<CheckLevel | "ok", string> = { critico: "Crítico", aviso: "Atenção", info: "Observação", ok: "Conferida" };

export interface SaleCheckInput {
  cancelled: boolean;
  productCents: number;
  shippingRevenueCents: number | null;
  saleFeeCents: number | null; // tarifa de venda (total da linha)
  shippingFeeCents: number | null;
  refundCents: number | null;
  netCents: number | null; // Total (BRL) informado pelo ML
  sku: string | null;
  linked: boolean;
  costCents: number | null;
  taxBps: number | null;
  profitCents: number;
}

/** Líquido pela soma das colunas: receita + frete recebido − tarifa − tarifa de envio − reembolsos. */
export const columnsNet = (i: Pick<SaleCheckInput, "productCents" | "shippingRevenueCents" | "saleFeeCents" | "shippingFeeCents" | "refundCents">) =>
  i.productCents + (i.shippingRevenueCents ?? 0) - (i.saleFeeCents ?? 0) - (i.shippingFeeCents ?? 0) - (i.refundCents ?? 0);

/** Total do ML − soma das colunas (negativo = o ML pagou menos do que as colunas somam). */
export const netDiff = (i: SaleCheckInput) => (i.netCents == null ? null : i.netCents - columnsNet(i));

export function saleIssues(i: SaleCheckInput): SaleIssue[] {
  const out: SaleIssue[] = [];
  if (i.cancelled) {
    if (i.netCents != null && i.netCents !== 0) out.push("cancelada_com_valor");
    return out;
  }
  if (!i.linked) out.push("sem_anuncio");
  else if (i.costCents == null) out.push("sem_custo");
  const d = netDiff(i);
  if (d == null) out.push("sem_total");
  else if (Math.abs(d) >= 200) out.push("total_diferente");
  else if (d !== 0) out.push("total_centavos");
  if (i.saleFeeCents == null && i.productCents > 0) out.push("sem_tarifa");
  if (i.linked && i.costCents != null && i.profitCents < 0) out.push("prejuizo");
  if (i.linked && !i.taxBps) out.push("sem_imposto");
  if (!i.sku) out.push("sem_sku");
  return out;
}

/** Nível da venda = o pior problema; "ok" quando não há crítico nem atenção. */
export function saleLevel(issues: SaleIssue[]): "critico" | "aviso" | "ok" {
  if (issues.some((c) => SALE_ISSUES[c].level === "critico")) return "critico";
  if (issues.some((c) => SALE_ISSUES[c].level === "aviso")) return "aviso";
  return "ok";
}
