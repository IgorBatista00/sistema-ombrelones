import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { COST_FIELDS, parsePct, validateProfile, type MarkupProfileRule } from "./markup";

export const PROFILE_SELECT = { id: true, name: true, cardFeeBps: true, extCommissionBps: true, intCommissionBps: true, taxBps: true, packagingBps: true, financialBps: true, otherBps: true, idealMarginBps: true, minMarginBps: true } as const;
export type ProfileRow = MarkupProfileRule & { id: string; name: string };

export async function listProfiles() {
  const list = await db.markupProfile.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { ...PROFILE_SELECT, _count: { select: { products: true } } } });
  return list.map(({ _count, ...p }) => ({ ...p, products: _count.products }));
}

const pctField = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = parsePct(v);
  if (n == null) return 0;
  if (Number.isNaN(n) || n < 0 || n > 9_000) { ctx.addIssue({ code: "custom", message: "Percentual inválido. Use números como 5,7." }); return z.NEVER; }
  return n;
});
export const profileInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Dê um nome ao markup.").max(60),
  ...Object.fromEntries([...COST_FIELDS.map((f) => f.key), "idealMarginBps", "minMarginBps"].map((k) => [k, pctField])),
}) as unknown as z.ZodType<ProfileRow & { id?: string }>;

export async function saveProfile(actorId: string, raw: unknown) {
  const parsed = profileInput.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const { id, ...data } = parsed.data;
  const err = validateProfile(data);
  if (err) throw new AppError("VALIDATION", err, 422);
  try {
    return await db.$transaction(async (tx) => {
      const before = id ? await tx.markupProfile.findUnique({ where: { id }, select: PROFILE_SELECT }) : null;
      if (id && !before) throw new AppError("NOT_FOUND", "Markup não encontrado.", 404);
      const saved = id
        ? await tx.markupProfile.update({ where: { id }, data, select: PROFILE_SELECT })
        : await tx.markupProfile.create({ data: { ...data, createdById: actorId, position: await tx.markupProfile.count() }, select: PROFILE_SELECT });
      await tx.auditLog.create({ data: { actorId, action: id ? "markup-profile.update" : "markup-profile.create", entity: "MarkupProfile", entityId: saved.id, before: before ?? undefined, after: saved } });
      return saved;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("VALIDATION", "Já existe um markup com esse nome.", 422);
    throw e;
  }
}

export async function deleteProfile(actorId: string, id: string) {
  const p = await db.markupProfile.findUnique({ where: { id }, select: { ...PROFILE_SELECT, _count: { select: { products: true } } } });
  if (!p) throw new AppError("NOT_FOUND", "Markup não encontrado.", 404);
  if (p._count.products) throw new AppError("VALIDATION", `Esse markup está em ${p._count.products} produto(s). Troque o markup deles na aba Tabela antes de excluir.`, 422);
  await db.$transaction([
    db.markupProfile.delete({ where: { id } }),
    db.auditLog.create({ data: { actorId, action: "markup-profile.delete", entity: "MarkupProfile", entityId: id, before: { name: p.name } } }),
  ]);
}

/** Define o perfil de markup de um ou mais produtos (null = voltar ao markup manual). */
export async function setProductsProfile(actorId: string, productIds: string[], profileId: string | null) {
  if (!productIds.length) throw new AppError("VALIDATION", "Selecione ao menos um produto.", 422);
  if (profileId && !(await db.markupProfile.findUnique({ where: { id: profileId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Markup não encontrado.", 404);
  return db.$transaction(async (tx) => {
    const before = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, markupProfileId: true } });
    await tx.product.updateMany({ where: { id: { in: productIds } }, data: { markupProfileId: profileId, markupUpdatedAt: new Date() } });
    await tx.auditLog.createMany({ data: before.filter((b) => b.markupProfileId !== profileId).map((b) => ({ actorId, action: "product.markup-profile", entity: "Product", entityId: b.id, before: { markupProfileId: b.markupProfileId }, after: { markupProfileId: profileId } })) });
    return { profileId, updated: before.length };
  });
}
