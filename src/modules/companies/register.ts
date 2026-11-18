import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { hashPassword, passwordSchema } from "@/modules/auth/password";
import { issueToken } from "@/modules/auth/tokens";
import { sendEmail } from "@/modules/integrations/email";
import { getCnpjProvider } from "@/modules/integrations/cnpj";
import { isValidCnpj, normalizeCnpj } from "./cnpj";
import { assessRisk, REVIEW_THRESHOLD } from "./risk";
import type { Prisma } from "@prisma/client";
import { appUrl } from "@/lib/app-url";

export const registerSchema = z.object({
  cnpj: z.string().transform(normalizeCnpj).refine(isValidCnpj, "CNPJ inválido. Confira os números."),
  name: z.string().trim().min(3, "Informe o nome do responsável").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length >= 10 && v.length <= 11, "Telefone inválido"),
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar os termos comerciais" }) }),
});

/** Passo 1 do cadastro: pré-consulta para preencher os dados da empresa. */
export async function previewCnpj(rawCnpj: string, ip: string) {
  const cnpj = normalizeCnpj(rawCnpj);
  if (!isValidCnpj(cnpj)) throw new AppError("CNPJ_INVALID", "CNPJ inválido. Confira os números.");
  await rateLimit(`cnpj-lookup:${ip}`, 20, 3600);

  const existing = await db.company.findUnique({ where: { cnpj }, select: { id: true } });
  if (existing) {
    throw new AppError("CNPJ_ALREADY_REGISTERED",
      "Este CNPJ já possui cadastro. Faça login ou recupere o acesso. Se você é da empresa e não tem acesso, fale com nosso comercial.", 409);
  }
  const lookup = await getCnpjProvider().lookup(cnpj);
  if (!lookup) throw new AppError("CNPJ_NOT_FOUND", "CNPJ não encontrado na base da Receita Federal.", 404);
  if (lookup.registrationStatus !== "ATIVA") {
    throw new AppError("CNPJ_IRREGULAR", `A situação cadastral deste CNPJ é "${lookup.registrationStatus}". Apenas empresas ativas podem se cadastrar.`, 422);
  }
  return { cnpj, legalName: lookup.legalName, tradeName: lookup.tradeName, city: lookup.address?.city, state: lookup.address?.state };
}

/** Passo 2: cria usuário + empresa, envia verificação de e-mail. */
export async function registerCompany(input: z.infer<typeof registerSchema>, meta: { ip: string }) {
  await rateLimit(`register:${meta.ip}`, 5, 3600);
  await rateLimit(`register-cnpj:${input.cnpj}`, 3, 86400);

  const [companyExists, userExists] = await Promise.all([
    db.company.findUnique({ where: { cnpj: input.cnpj }, select: { id: true } }),
    db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
  ]);
  if (companyExists) throw new AppError("CNPJ_ALREADY_REGISTERED", "Este CNPJ já possui cadastro.", 409);
  if (userExists) throw new AppError("EMAIL_IN_USE", "Este e-mail já está em uso. Faça login ou recupere sua senha.", 409);

  // A consulta é refeita no servidor: nunca confiar nos dados enviados pelo navegador.
  const lookup = await getCnpjProvider().lookup(input.cnpj);
  if (!lookup) throw new AppError("CNPJ_NOT_FOUND", "CNPJ não encontrado.", 404);
  if (lookup.registrationStatus !== "ATIVA") throw new AppError("CNPJ_IRREGULAR", "CNPJ com situação cadastral irregular.", 422);

  const recentSignupsFromIp = await db.session.count({
    where: { ip: meta.ip, createdAt: { gte: new Date(Date.now() - 86_400_000) }, user: { emailVerifiedAt: null } },
  });
  const risk = assessRisk({ lookup, email: input.email, recentSignupsFromIp });

  const { user } = await db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        cnpj: input.cnpj,
        legalName: lookup.legalName,
        tradeName: lookup.tradeName,
        registrationStatus: lookup.registrationStatus,
        mainActivity: lookup.mainActivity?.description,
        mainActivityCode: lookup.mainActivity?.code,
        cnpjLookupRaw: lookup.raw as Prisma.InputJsonValue,
        cnpjCheckedAt: new Date(),
        riskScore: risk.score,
        riskReasons: risk.reasons,
        status: "PENDING_EMAIL",
        addresses: lookup.address
          ? { create: { ...lookup.address, label: "Endereço cadastral", recipient: lookup.tradeName ?? lookup.legalName, isDefault: true } }
          : undefined,
      },
    });
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, phone: input.phone, passwordHash: await hashPassword(input.password) },
    });
    await tx.companyMember.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
    await tx.auditLog.create({
      data: { action: "company.register", entity: "Company", entityId: company.id, actorId: user.id, ip: meta.ip, after: { risk } as Prisma.InputJsonValue },
    });
    return { user, company };
  });

  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  await sendEmail(user.email, { kind: "verify-email", name: user.name, url: `${appUrl()}/verificar-email?token=${token}` });
  return { userId: user.id, needsReview: risk.needsReview };
}

/** Após verificar o e-mail: libera automaticamente, salvo sinal de risco. */
export async function activateAfterEmailVerification(userId: string) {
  const memberships = await db.companyMember.findMany({ where: { userId }, include: { company: true } });
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  for (const m of memberships) {
    if (m.company.status !== "PENDING_EMAIL") continue;
    const needsReview = m.company.riskScore >= REVIEW_THRESHOLD;
    await db.company.update({ where: { id: m.companyId }, data: { status: needsReview ? "UNDER_REVIEW" : "ACTIVE" } });
  }
}
