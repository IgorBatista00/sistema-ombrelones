import type { CommercialStatus, FinancialStatus, FiscalStatus, LogisticStatus } from "@prisma/client";

/**
 * Máquina de estados do pedido — quatro dimensões independentes.
 * Funções puras: usadas pelos serviços e cobertas por testes.
 */
export type Dimension = "COMMERCIAL" | "FINANCIAL" | "LOGISTIC" | "FISCAL";
export type ActorType = "CUSTOMER" | "ADMIN" | "SYSTEM" | "WEBHOOK";

const COMMERCIAL: Record<CommercialStatus, CommercialStatus[]> = {
  CREATED: ["CONFIRMED", "CANCELED"],
  AWAITING_QUOTE: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["CANCELED"],
  CANCELED: [],
};
const FINANCIAL: Record<FinancialStatus, FinancialStatus[]> = {
  NOT_STARTED: ["AWAITING_PAYMENT"],
  AWAITING_PAYMENT: ["PAID", "FAILED"],
  FAILED: ["AWAITING_PAYMENT"],
  PAID: ["REFUNDED"],
  REFUNDED: [],
};
const LOGISTIC: Record<LogisticStatus, LogisticStatus[]> = {
  NOT_RELEASED: ["PREPARING"],
  PREPARING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
};
const FISCAL: Record<FiscalStatus, FiscalStatus[]> = {
  NOT_ISSUED: ["ISSUING"],
  ISSUING: ["AUTHORIZED", "REJECTED"],
  REJECTED: ["ISSUING"],
  AUTHORIZED: ["CANCELED"],
  CANCELED: [],
};
const GRAPHS = { COMMERCIAL, FINANCIAL, LOGISTIC, FISCAL } as const;

export interface OrderState {
  commercialStatus: CommercialStatus;
  financialStatus: FinancialStatus;
  logisticStatus: LogisticStatus;
  fiscalStatus: FiscalStatus;
  shippingCents: number | null;
}

export function canTransition(dim: Dimension, from: string, to: string): boolean {
  return (GRAPHS[dim] as Record<string, string[]>)[from]?.includes(to) ?? false;
}

/** Regras cruzadas entre dimensões. Retorna mensagem de bloqueio ou null. */
export function guardTransition(order: OrderState, dim: Dimension, to: string, actor: ActorType): string | null {
  const from = { COMMERCIAL: order.commercialStatus, FINANCIAL: order.financialStatus, LOGISTIC: order.logisticStatus, FISCAL: order.fiscalStatus }[dim];
  if (!canTransition(dim, from, to)) return `Transição ${dim} ${from} → ${to} não permitida.`;

  if (dim === "FINANCIAL") {
    // Confirmação/estorno de pagamento: SOMENTE via webhook autenticado do gateway.
    if ((to === "PAID" || to === "REFUNDED" || to === "FAILED") && actor !== "WEBHOOK") {
      return "Situação financeira só pode ser alterada pelo provedor de pagamento.";
    }
    if (to === "AWAITING_PAYMENT") {
      if (order.commercialStatus !== "CONFIRMED") return "Pagamento indisponível antes da confirmação do pedido.";
      if (order.shippingCents == null) return "Pagamento indisponível sem frete confirmado.";
    }
  }
  if (dim === "LOGISTIC" && to === "PREPARING" && order.financialStatus !== "PAID") {
    return "Expedição só é liberada após pagamento confirmado.";
  }
  if (dim === "LOGISTIC" && to === "DELIVERED" && actor === "CUSTOMER") return "Entrega é confirmada pela integração ou equipe.";
  if (dim === "FISCAL" && to === "ISSUING" && order.financialStatus !== "PAID") return "Nota fiscal só após pagamento confirmado.";
  if (dim === "COMMERCIAL" && to === "CANCELED" && order.financialStatus === "PAID") {
    return "Pedido pago: solicite estorno ao provedor antes de cancelar.";
  }
  return null;
}

export const LABELS = {
  COMMERCIAL: { CREATED: "Criado", AWAITING_QUOTE: "Aguardando cotação", CONFIRMED: "Confirmado", CANCELED: "Cancelado" },
  FINANCIAL: { NOT_STARTED: "Não iniciado", AWAITING_PAYMENT: "Aguardando pagamento", PAID: "Pago", FAILED: "Falhou", REFUNDED: "Estornado" },
  LOGISTIC: { NOT_RELEASED: "Não liberado", PREPARING: "Em preparação", SHIPPED: "Expedido", DELIVERED: "Entregue" },
  FISCAL: { NOT_ISSUED: "Não emitido", ISSUING: "Em emissão", AUTHORIZED: "Autorizado", REJECTED: "Rejeitado", CANCELED: "Cancelado" },
} as const;
