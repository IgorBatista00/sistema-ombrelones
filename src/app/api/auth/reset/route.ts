import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { db } from "@/lib/db";
import { consumeToken } from "@/modules/auth/tokens";
import { hashPassword, passwordSchema } from "@/modules/auth/password";

export const POST = route(async (req) => {
  const { token, password } = await parseBody(req, z.object({ token: z.string().min(10), password: passwordSchema }));
  const userId = await consumeToken(token, "PASSWORD_RESET");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } }),
    db.session.deleteMany({ where: { userId } }), // encerra sessões antigas
  ]);
  return { ok: true };
});
