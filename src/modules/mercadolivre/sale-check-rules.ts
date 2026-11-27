// Validação das vendas importadas do Mercado Livre: confere cada linha da planilha (puro, testável).

export type CheckLevel = "critico" | "aviso" | "info";
export type SaleIssue =
  | "sem_anuncio" | "sem_custo" | "sem_imposto" | "total_diferente"
  | "sem_total" | "sem_tarifa" | "sem_frete" | "cancelada_com_valor" | "prejuizo"
  | "total_centavos" | "sem_sku";

export const SALE_ISSUES: Record<SaleIssue, { label: string; level: CheckLevel; fix: string }> = {
  sem_anuncio: { label: "Venda sem anúncio cadastrado", level: "critico", fix: "Sem anúncio, o sistema não sabe qual produto saiu: a venda fica sem custo da mercadoria e sem imposto, e o lucro aparece maior. Cadastre o anúncio (MLB) com o produto e a venda é ligada na hora." },
  sem_custo: { label: "Custo da mercadoria não contabilizado", level: "critico", fix: "O anúncio está ligado, mas o produto não tinha custo quando a venda entrou. Cadastre o custo em Produtos e clique em “Recalcular custos”." },
  sem_imposto: { label: "Imposto não contabilizado", level: "critico", fix: "O anúncio ligado está sem imposto (%), então o lucro desta venda não desconta imposto. Informe o imposto no anúncio (padrão 14,5%)." },
  total_diferente: { label: "Total do ML não bate com as colunas", level: "critico", fix: "A soma das colunas da planilha (receita + frete recebido + bônus − tarifas − frete − reembolsos) é diferente do Total que o ML informa. O sistema calcula o lucro pelas colunas; confira a venda no ML para ver o que foi descontado." },
  sem_total: { label: "Planilha sem o Total (BRL)", level: "aviso", fix: "Sem o Total do ML não dá para conferir os valores. Exporte a planilha de vendas com a coluna Total e importe de novo." },
  sem_tarifa: { label: "Tarifa do Mercado Livre não contabilizada", level: "aviso", fix: "A planilha não trouxe a tarifa de venda desta venda. Reimporte a planilha com a coluna “Tarifa de venda e impostos”; enquanto isso o sistema usa a tarifa (%) do anúncio, se houver." },
  sem_frete: { label: "Frete não contabilizado", level: "aviso", fix: "A planilha não trouxe tarifa de envio e a venda não está marcada como parte de um pacote. Confira no ML se foi retirada, Flex ou frete pago pelo comprador. Se a venda foi importada antes desta conferência, reimporte a planilha para o sistema reconhecer os pacotes." },
  cancelada_com_valor: { label: "Cancelada/devolvida com valor lançado", level: "aviso", fix: "Venda cancelada conta R$ 0 no sistema, mas o ML lançou um valor (ex.: frete de devolução ou valor retido). Confira no ML; esse valor hoje não entra no resultado." },
  prejuizo: { label: "Venda com prejuízo", level: "aviso", fix: "O lucro calculado ficou negativo. Confira se o custo do produto e as tarifas estão certos." },
  total_centavos: { label: "Diferença pequena no Total do ML", level: "info", fix: "Diferença de até R$ 2,00 entre as colunas e o Total (arredondamento). Não afeta o resultado de forma relevante." },
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
  inPack?: boolean | null;
  bonusCents?: number | null;
  listingFeeBps?: number | null; // tarifa (%) do anúncio, usada como estimativa
}

/** Os 4 custos que toda venda válida precisa ter: tarifa do ML, frete, imposto e custo da mercadoria. */
export type CostKey = "tarifa" | "frete" | "imposto" | "mercadoria";
export type CostState = "ok" | "pacote" | "estimado" | "falta";
export const COST_LABEL: Record<CostKey, string> = { tarifa: "Tarifa ML", frete: "Frete", imposto: "Imposto", mercadoria: "Mercadoria" };
export function costChecks(i: SaleCheckInput): Record<CostKey, CostState> {
  return {
    tarifa: (i.saleFeeCents ?? 0) > 0 ? "ok" : i.listingFeeBps ? "estimado" : "falta",
    frete: (i.shippingFeeCents ?? 0) > 0 ? "ok" : i.inPack ? "pacote" : "falta",
    imposto: i.linked && (i.taxBps ?? 0) > 0 ? "ok" : "falta",
    mercadoria: i.linked && i.costCents != null ? "ok" : "falta",
  };
}

/** Líquido pela soma das colunas: receita + frete recebido + bônus − tarifa − tarifa de envio − reembolsos. */
export const columnsNet = (i: Pick<SaleCheckInput, "productCents" | "shippingRevenueCents" | "saleFeeCents" | "shippingFeeCents" | "refundCents" | "bonusCents">) =>
  i.productCents + (i.shippingRevenueCents ?? 0) + (i.bonusCents ?? 0) - (i.saleFeeCents ?? 0) - (i.shippingFeeCents ?? 0) - (i.refundCents ?? 0);

/** Total do ML − soma das colunas (negativo = o ML pagou menos do que as colunas somam). */
export const netDiff = (i: SaleCheckInput) => (i.netCents == null ? null : i.netCents - columnsNet(i));

export function saleIssues(i: SaleCheckInput): SaleIssue[] {
  const out: SaleIssue[] = [];
  if (i.cancelled) {
    if (i.netCents != null && i.netCents !== 0) out.push("cancelada_com_valor");
    return out;
  }
  if (!i.linked) out.push("sem_anuncio");
  else {
    if (i.costCents == null) out.push("sem_custo");
    if (!i.taxBps) out.push("sem_imposto");
  }
  const d = netDiff(i);
  if (d == null) out.push("sem_total");
  else if (Math.abs(d) >= 200) out.push("total_diferente");
  else if (d !== 0) out.push("total_centavos");
  const c = costChecks(i);
  if (c.tarifa !== "ok" && i.productCents > 0) out.push("sem_tarifa");
  if (c.frete === "falta") out.push("sem_frete");
  if (i.linked && i.costCents != null && i.profitCents < 0) out.push("prejuizo");
  if (!i.sku) out.push("sem_sku");
  return out;
}

/** Nível da venda = o pior problema; "ok" quando não há crítico nem atenção. */
export function saleLevel(issues: SaleIssue[]): "critico" | "aviso" | "ok" {
  if (issues.some((c) => SALE_ISSUES[c].level === "critico")) return "critico";
  if (issues.some((c) => SALE_ISSUES[c].level === "aviso")) return "aviso";
  return "ok";
}
