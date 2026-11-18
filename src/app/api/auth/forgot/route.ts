import { z } from "zod";
import { route, parseBody } from "@/lib/route";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { issueToken } from "@/modules/auth/tokens";
import { sendEmail } from "@/modules/integrations/email";
import { appUrl } from "@/lib/app-url";

/** Resposta sempre igual: não revela se o e-mail existe. */
export const POST = route(async (req) => {
  const { email } = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido") }));
  await rateLimit(`forgot:${await clientIp()}`, 5, 3600);
  const user = await db.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    await sendEmail(user.email, { kind: "password-reset", name: user.name, url: `${appUrl()}/redefinir-senha?token=${token}` });
  }
  return { sent: true };
});
