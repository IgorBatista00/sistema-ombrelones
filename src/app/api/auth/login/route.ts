import { headers } from "next/headers";
import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { verifyPassword } from "@/modules/auth/password";
import { createSession } from "@/modules/auth/session";

const GENERIC = "E-mail ou senha incorretos.";

export const POST = route(async (req) => {
  const { email, password } = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) }));
  const ip = await clientIp();
  await rateLimit(`login:${ip}`, 20, 900);
  await rateLimit(`login-email:${email}`, 8, 900);

  const user = await db.user.findUnique({ where: { email }, include: { memberships: { include: { company: true } } } });
  if (!user) { await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv"); throw new AppError("INVALID_CREDENTIALS", GENERIC, 401); }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("LOCKED", "Acesso temporariamente bloqueado por excesso de tentativas. Tente mais tarde ou redefina a senha.", 423);
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= 10 ? new Date(Date.now() + 30 * 60_000) : null } });
    throw new AppError("INVALID_CREDENTIALS", GENERIC, 401);
  }
  if (!user.isActive) throw new AppError("INACTIVE", "Usuário desativado. Fale com o comercial ou com o administrador do sistema.", 403);
  const blocked = user.memberships.length > 0 && user.memberships.every((m) => m.company.status === "BLOCKED");
  if (blocked) throw new AppError("COMPANY_BLOCKED", "O acesso desta empresa está bloqueado. Fale com o comercial.", 403);

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const active = user.memberships.find((m) => m.company.status !== "BLOCKED");
  await createSession(user.id, active?.companyId ?? null, { ip, userAgent: (await headers()).get("user-agent") ?? undefined });
  return { admin: !!(await db.adminUser.findUnique({ where: { userId: user.id } })) };
});
