/**
 * Regras PURAS de movimentação de estoque (testadas em tests/stock-movements.test.ts).
 *  - ENTRADA: soma ao saldo físico.
 *  - SAIDA:   subtrai; nunca pode consumir unidades reservadas para pedidos.
 *  - AJUSTE:  define o saldo contado (inventário); não pode ficar abaixo do reservado.
 */
export type ManualMovementType = "ENTRADA" | "SAIDA" | "AJUSTE";

export function planMovement(current: { onHand: number; reserved: number }, type: ManualMovementType, quantity: number):
  { ok: true; after: number; delta: number } | { ok: false; error: string } {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) return { ok: false, error: "Informe uma quantidade inteira válida." };
  if (type !== "AJUSTE" && quantity === 0) return { ok: false, error: "A quantidade deve ser maior que zero." };
  const free = Math.max(0, current.onHand - current.reserved);
  let after: number;
  if (type === "ENTRADA") after = current.onHand + quantity;
  else if (type === "SAIDA") {
    if (quantity > free) return { ok: false, error: `Saída maior que o disponível (${free}).${current.reserved ? ` ${current.reserved} un. estão reservadas para pedidos.` : ""}` };
    after = current.onHand - quantity;
  } else {
    if (quantity < current.reserved) return { ok: false, error: `O saldo contado não pode ser menor que o reservado em pedidos (${current.reserved}).` };
    after = quantity;
  }
  return { ok: true, after, delta: after - current.onHand };
}

export const MOVEMENT_REASONS: Record<ManualMovementType, string[]> = {
  // Compras com nota fiscal entram por "Registrar compra" (recalcula o custo médio)
  ENTRADA: ["Devolução de cliente", "Transferência recebida", "Outro"],
  SAIDA: ["Venda fora do site", "Perda / avaria", "Amostra / mostruário", "Transferência enviada", "Outro"],
  AJUSTE: ["Inventário (contagem)", "Correção de lançamento", "Outro"],
};
export const MOVEMENT_LABEL: Record<string, string> = { ENTRADA: "Entrada", SAIDA: "Saída", AJUSTE: "Ajuste", VENDA: "Venda (pedido)" };

// ---------------------------------------------------------------- exibição na loja
export type StockDisplayMode = "exata" | "faixa" | "simples";
export interface StockDisplay { mode: StockDisplayMode; lowThreshold: number }
export const DEFAULT_STOCK_DISPLAY: StockDisplay = { mode: "exata", lowThreshold: 5 };

/** Texto mostrado ao CLIENTE para um saldo disponível. */
export function stockText(available: number, d: StockDisplay = DEFAULT_STOCK_DISPLAY): string {
  if (available <= 0) return "Sem estoque";
  if (d.mode === "simples") return "Em estoque";
  const un = (n: number) => `${n} ${n === 1 ? "unidade" : "unidades"}`;
  if (available <= d.lowThreshold) return `Últimas ${un(available)}`;
  if (d.mode === "faixa") return available > 50 ? "Mais de 50 unidades disponíveis" : available > 10 ? "Mais de 10 unidades disponíveis" : `${un(available)} disponíveis`;
  return `${un(available)} disponíveis`;
}

export type StockState = "zero" | "low" | "ok" | "mto";
export function stockState(mode: "STOCK" | "MADE_TO_ORDER" | "UNAVAILABLE", onHand: number, reserved: number, minQty: number): StockState {
  if (mode === "MADE_TO_ORDER") return "mto";
  const free = Math.max(0, onHand - reserved);
  if (free <= 0) return "zero";
  return free <= minQty ? "low" : "ok";
}

// ---------------------------------------------------------------- custo médio ponderado móvel
/**
 * novo médio = (saldo × médio atual + qtd × custo da compra) ÷ (saldo + qtd)
 * Sem saldo (ou sem médio conhecido), o médio passa a ser o custo da compra.
 */
export function newAverageCost(stock: number, avgCents: number | null, qty: number, unitTotalCents: number) {
  if (stock <= 0 || avgCents == null) return unitTotalCents;
  return Math.round((stock * avgCents + qty * unitTotalCents) / (stock + qty));
}

export interface PurchaseLineInput { quantity: number; unitCostCents: number; ipiBps: number }
/**
 * Rateio de frete e outras despesas proporcional ao valor (mercadoria + IPI) de cada linha.
 * A soma rateada é exatamente igual ao total das despesas (a sobra de arredondamento vai para a última linha).
 */
export function allocatePurchase(lines: PurchaseLineInput[], freightCents: number, otherCents: number) {
  const base = lines.map((l) => {
    const unitWithIpi = l.unitCostCents + Math.round((l.unitCostCents * l.ipiBps) / 10_000);
    return { ...l, unitWithIpi, gross: unitWithIpi * l.quantity };
  });
  const total = base.reduce((a, l) => a + l.gross, 0);
  const extra = freightCents + otherCents;
  let used = 0;
  return base.map((l, i) => {
    const allocated = i === base.length - 1 ? extra - used : total ? Math.round((extra * l.gross) / total) : 0;
    used += allocated;
    const unitTotalCents = l.unitWithIpi + Math.round(allocated / l.quantity);
    return { ...l, allocatedCents: allocated, unitTotalCents };
  });
}

/** Variação da compra em relação ao médio (pontos-base). */
export const costVariationBps = (unitTotal: number, avg: number | null) => (avg ? Math.round(((unitTotal - avg) / avg) * 10_000) : null);
export const COST_ALERT_BPS = 500; // alerta quando a compra vem 5% acima do médio
