import { db } from "./db";
import { AppError } from "./errors";

/** Rate limit persistido no Postgres (funciona com múltiplas instâncias).
 *  Para alto volume, trocar por Redis mantendo a mesma assinatura. */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  const bucket = await db.$transaction(async (tx) => {
    const b = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!b || b.resetAt < now) {
      return tx.rateLimitBucket.upsert({ where: { key }, update: { count: 1, resetAt }, create: { key, count: 1, resetAt } });
    }
    return tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  });
  if (bucket.count > limit) {
    throw new AppError("RATE_LIMITED", "Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429);
  }
}
