import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

/**
 * Reserva atômica: o UPDATE condicional só incrementa `reserved` se houver
 * saldo livre suficiente. Dois pedidos concorrentes nunca reservam o mesmo
 * saldo (o Postgres serializa o UPDATE na linha). Itens sob encomenda não
 * consomem saldo.
 */
export async function reserveStock(tx: Tx, orderId: string, items: { variantId: string; quantity: number; sku: string; madeToOrder: boolean }[], expiresAt: Date | null) {
  for (const item of items) {
    if (item.madeToOrder) continue;
    const updated = await tx.$executeRaw`
      UPDATE "StockLevel"
         SET "reserved" = "reserved" + ${item.quantity}, "version" = "version" + 1, "updatedAt" = now()
       WHERE "variantId" = ${item.variantId}
         AND "onHand" - "reserved" >= ${item.quantity}`;
    if (updated !== 1) {
      throw new AppError("INSUFFICIENT_STOCK", `Saldo insuficiente para o SKU ${item.sku}. Atualize a quantidade.`, 409, { sku: item.sku });
    }
    await tx.stockReservation.create({ data: { orderId, variantId: item.variantId, quantity: item.quantity, expiresAt } });
  }
}

/** Libera reservas ativas (cancelamento, expiração, cotação recusada). */
export async function releaseReservations(tx: Tx, orderId: string) {
  const active = await tx.stockReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  for (const r of active) {
    await tx.$executeRaw`UPDATE "StockLevel" SET "reserved" = GREATEST(0, "reserved" - ${r.quantity}), "updatedAt" = now() WHERE "variantId" = ${r.variantId}`;
    await tx.stockReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

/** Pagamento confirmado: baixa definitiva (saldo físico e reserva). */
export async function consumeReservations(tx: Tx, orderId: string) {
  const active = await tx.stockReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  for (const r of active) {
    // Baixa pelo custo médio (CMV). A saída não altera o médio.
    const [row] = await tx.$queryRaw<{ onHand: number; avgCostCents: number | null }[]>`UPDATE "StockLevel" SET "onHand" = "onHand" - ${r.quantity}, "reserved" = GREATEST(0, "reserved" - ${r.quantity}), "updatedAt" = now() WHERE "variantId" = ${r.variantId} RETURNING "onHand", "avgCostCents"`;
    await tx.stockReservation.update({ where: { id: r.id }, data: { status: "CONSUMED" } });
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { number: true, code: true } });
    const avg = row?.avgCostCents ?? null;
    await tx.stockMovement.create({ data: { variantId: r.variantId, type: "VENDA", delta: -r.quantity, balanceAfter: row?.onHand ?? null, unitCostCents: avg, reason: `Pedido ${order?.code ?? ""}`.trim(), reference: orderId } });
    if (avg != null) await tx.orderItem.updateMany({ where: { orderId, variantId: r.variantId }, data: { cogsCents: avg * r.quantity } });
  }
}

export async function extendReservations(tx: Tx, orderId: string, expiresAt: Date) {
  await tx.stockReservation.updateMany({ where: { orderId, status: "ACTIVE" }, data: { expiresAt } });
}
