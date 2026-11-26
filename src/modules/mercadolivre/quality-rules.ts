/** Qualidade dos dados de cada anúncio do Mercado Livre — regras puras. */
export type Severity = "critico" | "aviso" | "info";
export type IssueCode =
  | "sem_produto" | "sem_custo" | "nao_cadastrado"
  | "sem_preco" | "sem_tarifa" | "sem_imposto" | "sku_diferente" | "prejuizo" | "margem_baixa" | "preco_diferente"
  | "sem_foto" | "sem_tipo" | "sem_frete" | "sem_embalagem" | "pausado";
export const ISSUES: Record<IssueCode, { label: string; sev: Severity; fix: string }> = {
  nao_cadastrado: { label: "Anúncio vendido e não cadastrado", sev: "critico", fix: "Cadastre o anúncio (MLB) com o produto e os custos." },
  sem_produto: { label: "Sem produto ligado", sev: "critico", fix: "Em Editar, escolha o produto (ou os produtos do kit)." },
  sem_custo: { label: "Produto sem custo", sev: "critico", fix: "Cadastre o custo do produto em Produtos (custo do fornecedor) ou registre uma entrada no estoque." },
  sem_preco: { label: "Sem preço", sev: "aviso", fix: "Informe o preço do anúncio (ou reimporte a planilha de anúncios)." },
  sem_tarifa: { label: "Sem tarifa de venda", sev: "aviso", fix: "Informe a tarifa (%) — vem na planilha de anúncios do Mercado Livre." },
  sem_imposto: { label: "Sem imposto", sev: "aviso", fix: "Informe o imposto (%) do anúncio." },
  sku_diferente: { label: "SKU do anúncio diferente do produto ligado", sev: "aviso", fix: "Confira se o produto ligado é o certo." },
  prejuizo: { label: "Prejuízo no preço atual", sev: "aviso", fix: "Revise o preço ou os custos: cada venda dá prejuízo." },
  margem_baixa: { label: "Margem abaixo de 10%", sev: "aviso", fix: "Revise o preço ou os custos." },
  preco_diferente: { label: "Preço cadastrado diferente do último vendido", sev: "info", fix: "Atualize o preço (reimporte a planilha de anúncios)." },
  sem_foto: { label: "Produto sem foto", sev: "info", fix: "Envie a foto do produto em Produtos." },
  sem_tipo: { label: "Sem tipo (Clássico/Premium)", sev: "info", fix: "Informe o tipo do anúncio." },
  sem_frete: { label: "Sem frete (anúncio ainda sem vendas)", sev: "info", fix: "Opcional: informe o frete para a simulação de lucro ficar fiel. Depois da primeira venda, o lucro usa o frete real." },
  sem_embalagem: { label: "Sem custo de embalagem", sev: "info", fix: "Opcional: informe a embalagem por unidade, se houver." },
  pausado: { label: "Anúncio pausado/encerrado", sev: "info", fix: "Só informativo." },
};
export const SEV_ORDER: Severity[] = ["critico", "aviso", "info"];
export const SEV_LABEL: Record<Severity, string> = { critico: "Crítico", aviso: "Atenção", info: "Sugestão" };

export type QualityInput = {
  status: string; priceCents: number | null; saleFeeBps: number | null; taxBps: number | null; listingType: string | null;
  shippingCostCents: number | null; packagingCents: number | null; sku: string | null;
  components: { sku: string; code: string | null; image: string | null; unitCostCents: number | null }[];
  simulation: { profit: number; marginBps: number | null; costMissing: boolean } | null;
  lastSoldPriceCents: number | null; hasSales?: boolean;
};

export function listingIssues(l: QualityInput): IssueCode[] {
  const out: IssueCode[] = [];
  if (!l.components.length) out.push("sem_produto");
  else if (l.components.some((c) => c.unitCostCents == null)) out.push("sem_custo");
  if (l.priceCents == null || l.priceCents <= 0) out.push("sem_preco");
  if (l.saleFeeBps == null) out.push("sem_tarifa");
  if (l.taxBps == null || l.taxBps === 0) out.push("sem_imposto");
  if (l.sku && l.components.length === 1) {
    const c = l.components[0], s = l.sku.toUpperCase();
    if (c.sku.toUpperCase() !== s && (c.code ?? "").toUpperCase() !== s) out.push("sku_diferente");
  }
  if (l.simulation && !l.simulation.costMissing && l.components.length) {
    if (l.simulation.profit < 0) out.push("prejuizo");
    else if (l.simulation.marginBps != null && l.simulation.marginBps < 1000) out.push("margem_baixa");
  }
  if (l.lastSoldPriceCents != null && l.priceCents && Math.abs(l.lastSoldPriceCents - l.priceCents) / l.priceCents > 0.05) out.push("preco_diferente");
  if (l.components.length && l.components.some((c) => !c.image)) out.push("sem_foto");
  if (!l.listingType) out.push("sem_tipo");
  if (!l.shippingCostCents && !l.hasSales) out.push("sem_frete"); // com vendas, o lucro usa o frete real da planilha

  if (!l.packagingCents) out.push("sem_embalagem");
  if (l.status !== "ATIVO") out.push("pausado");
  return out;
}
export const worstSeverity = (codes: IssueCode[]): Severity | "ok" => SEV_ORDER.find((s) => codes.some((c) => ISSUES[c].sev === s)) ?? "ok";

/** Nota 0–100: críticos pesam 40, avisos 10, sugestões 2 (mínimo 0). */
export const qualityScore = (codes: IssueCode[]) => Math.max(0, 100 - codes.reduce((a, c) => a + (ISSUES[c].sev === "critico" ? 40 : ISSUES[c].sev === "aviso" ? 10 : 2), 0));
