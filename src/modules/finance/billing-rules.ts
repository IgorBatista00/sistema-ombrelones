/** Faturamento e cobrança — regras puras (vendas do funil de orçamentos). */

/** Forma prevista de cada parcela, deduzida da condição de pagamento quando não foi escolhida à mão. */
export function defaultParcelMethod(paymentTerms: string, label: string): string | null {
  const t = paymentTerms.toLowerCase(), entrada = /na venda|entrada/i.test(label);
  const boleto = t.includes("boleto"), pix = t.includes("pix"), cartao = /cart[aã]o/.test(t);
  if (boleto) return entrada && pix ? "Pix" : "Boleto";
  if (cartao) return "Cartão de crédito";
  if (pix && !/entrega/.test(t)) return "Pix";
  return null; // ex.: "50% entrada + 50% na entrega", personalizado — escolher na parcela
}
export const effectiveMethod = (r: { plannedMethod: string | null; label: string }, terms: string) => r.plannedMethod ?? defaultParcelMethod(terms, r.label);

export type ParcelStage = "recebido" | "cancelado" | "boleto_a_emitir" | "boleto_emitido" | "aguardando" | "forma_a_definir";
export const PARCEL_STAGE_LABEL: Record<ParcelStage, string> = {
  recebido: "Recebido", cancelado: "Cancelado", boleto_a_emitir: "Boleto a emitir", boleto_emitido: "Boleto emitido", aguardando: "Aguardando pagamento", forma_a_definir: "Forma a definir",
};

/** Etapa da parcela na cobrança. Boleto conta como emitido com número informado OU boleto anexado à parcela. */
export function parcelStage(r: { status: "ABERTO" | "RECEBIDO" | "CANCELADO"; plannedMethod: string | null; label: string; boletoIssuedAt: Date | null; boletoNumber: string | null; hasBoletoDoc: boolean }, terms: string): ParcelStage {
  if (r.status === "RECEBIDO") return "recebido";
  if (r.status === "CANCELADO") return "cancelado";
  const m = effectiveMethod(r, terms);
  if (!m) return "forma_a_definir";
  if (m === "Boleto") return r.boletoIssuedAt || r.boletoNumber || r.hasBoletoDoc ? "boleto_emitido" : "boleto_a_emitir";
  return "aguardando";
}

/** Normaliza o número da NF: só dígitos e no máximo 9 (padrão da NF-e); aceita "NF 1.234" → "1234". Vazio → null. */
export function normalizeInvoiceNumber(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return d && d.length <= 9 ? d : null;
}

/** Alerta de venda sem NF conforme a entrega: já entregue/em rota (urgente) ou agendada. */
export function invoiceAlert(delivery: { status: string; scheduledAt: Date | null } | null): { tone: "danger" | "warning"; text: string } | null {
  if (!delivery) return null;
  if (delivery.status === "ENTREGUE") return { tone: "danger", text: "Já entregue sem NF" };
  if (delivery.status === "EM_ROTA") return { tone: "danger", text: "Em rota sem NF" };
  if (delivery.status === "AGENDADA" && delivery.scheduledAt) return { tone: "warning", text: `Entrega agendada ${delivery.scheduledAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` };
  return null;
}
