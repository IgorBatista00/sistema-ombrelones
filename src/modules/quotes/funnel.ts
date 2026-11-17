/** Funil de orçamentos (kanban): regras puras — sem acesso ao banco, testáveis. */
import { isExpired } from "./totals";

export type Stage = "salvos" | "fechados" | "perdidos";
export type QuoteStatusKey = "RASCUNHO" | "EMITIDO" | "ENVIADO" | "APROVADO" | "RECUSADO" | "EXPIRADO";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "salvos", label: "Salvos", hint: "Rascunhos, emitidos e enviados — aguardando decisão" },
  { key: "fechados", label: "Fechados", hint: "Aprovados pelo cliente" },
  { key: "perdidos", label: "Perdidos", hint: "Recusados pelo cliente ou dados como perdidos" },
];
export const LOST_REASONS = ["Preço", "Prazo de entrega", "Comprou de concorrente", "Desistiu da compra", "Sem resposta do cliente", "Validade vencida", "Outro"];

export function stageOf(status: QuoteStatusKey): Stage {
  if (status === "APROVADO") return "fechados";
  if (status === "RECUSADO" || status === "EXPIRADO") return "perdidos";
  return "salvos";
}

/**
 * O que muda ao mover um orçamento de coluna.
 * - Fechados → APROVADO, data de fechamento = agora.
 * - Perdidos → RECUSADO, data de fechamento = agora, motivo opcional.
 * - Salvos (reabrir) → volta a ENVIADO (ou fica RASCUNHO se nunca foi emitido) e limpa fechamento/motivo.
 *   Orçamento com a validade vencida não reabre: deve ser duplicado (novo número e preços atuais).
 */
export function planMove(q: { status: QuoteStatusKey; issuedAt: Date; validDays: number; draftBefore?: boolean }, to: Stage, reason: string | null, now = new Date()) {
  const from = stageOf(q.status);
  if (from === to) return null;
  if (to === "fechados") return { status: "APROVADO" as const, closedAt: now, lostReason: null };
  if (to === "perdidos") return { status: "RECUSADO" as const, closedAt: now, lostReason: reason?.trim() || null };
  if (isExpired("ENVIADO", q.issuedAt, q.validDays, now)) {
    return { error: "A validade deste orçamento já venceu. Use “Duplicar” para reabrir com novo número e preços atuais." } as const;
  }
  return { status: q.draftBefore ? ("RASCUNHO" as const) : ("ENVIADO" as const), closedAt: null, lostReason: null };
}

/** Datas dos filtros (AAAA-MM-DD) no fuso de Brasília → intervalo UTC [início, fim). */
export function dayRange(from?: string, to?: string) {
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const r: { gte?: Date; lt?: Date } = {};
  if (ok(from)) r.gte = new Date(`${from}T00:00:00-03:00`);
  if (ok(to)) r.lt = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86_400_000);
  return r.gte || r.lt ? r : null;
}

export function funnelSummary(cards: { stage: Stage; totalCents: number }[]) {
  const by = (s: Stage) => cards.filter((c) => c.stage === s);
  const sum = (s: Stage) => by(s).reduce((a, c) => a + c.totalCents, 0);
  const won = by("fechados").length, lost = by("perdidos").length;
  return {
    count: { salvos: by("salvos").length, fechados: won, perdidos: lost },
    total: { salvos: sum("salvos"), fechados: sum("fechados"), perdidos: sum("perdidos") },
    conversion: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null, // % em quantidade
    conversionValue: sum("fechados") + sum("perdidos") ? Math.round((sum("fechados") / (sum("fechados") + sum("perdidos"))) * 1000) / 10 : null,
    avgTicket: won ? Math.round(sum("fechados") / won) : null,
  };
}
