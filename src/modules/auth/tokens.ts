import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { TokenPurpose } from "@prisma/client";

const TTL: Record<TokenPurpose, number> = { EMAIL_VERIFICATION: 48 * 3600_000, PASSWORD_RESET: 3600_000 };

export async function issueToken(userId: string, purpose: TokenPurpose) {
  const token = randomToken();
  await db.verificationToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await db.verificationToken.create({ data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[purpose]) } });
  return token;
}

export async function consumeToken(token: string, purpose: TokenPurpose) {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
    throw new AppError("TOKEN_INVALID", "Link inválido ou expirado. Solicite um novo.", 400);
  }
  await db.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}
