import { headers } from "next/headers";
import { route, parseBody } from "@/lib/route";
import { clientIp } from "@/lib/request";
import { registerCompany, registerSchema } from "@/modules/companies/register";
import { createSession } from "@/modules/auth/session";
import { db } from "@/lib/db";

/** POST /api/auth/register — cria empresa + usuário (preços liberados após verificar e-mail). */
export const POST = route(async (req) => {
  const input = await parseBody(req, registerSchema);
  const ip = await clientIp();
  const { userId, needsReview } = await registerCompany(input, { ip });
  const member = await db.companyMember.findFirst({ where: { userId } });
  await createSession(userId, member?.companyId ?? null, { ip, userAgent: (await headers()).get("user-agent") ?? undefined });
  return { needsReview };
});
