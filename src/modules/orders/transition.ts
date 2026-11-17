import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { guardTransition, type ActorType, type Dimension } from "./state";

const FIELD = { COMMERCIAL: "commercialStatus", FINANCIAL: "financialStatus", LOGISTIC: "logisticStatus", FISCAL: "fiscalStatus" } as const;

/** Aplica transição validada e grava histórico, dentro da transação recebida. */
export async function transition(
  tx: Prisma.TransactionClient, orderId: string, dim: Dimension, to: string,
  actor: { type: ActorType; id?: string | null }, note?: string,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const blocked = guardTransition(order, dim, to, actor.type);
  if (blocked) throw new AppError("INVALID_TRANSITION", blocked, 409);
  const field = FIELD[dim];
  await tx.order.update({ where: { id: orderId }, data: { [field]: to } as Prisma.OrderUpdateInput });
  await tx.orderStatusHistory.create({
    data: { orderId, dimension: dim, fromValue: String(order[field]), toValue: to, actorType: actor.type, actorId: actor.id ?? null, note },
  });
}
