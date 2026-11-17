import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** "Ombrelones com LED" → "ombrelones-com-led" */
export const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "categoria";

export async function categoriesForAdmin() {
  const list = await db.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { products: { where: { deletedAt: null } } } } } });
  return list.map((c) => ({ id: c.id, name: c.name, slug: c.slug, imageUrl: c.imageUrl ?? "", description: c.description ?? "", seoTitle: c.seoTitle ?? "", seoDescription: c.seoDescription ?? "", isActive: c.isActive, products: c._count.products }));
}
export type AdminCategory = Awaited<ReturnType<typeof categoriesForAdmin>>[number];

const schema = z.object({
  rows: z.array(z.object({
    id: z.string().nullable(),
    name: z.string().trim().min(2, "Cada categoria precisa de um nome com ao menos 2 letras.").max(80),
    isActive: z.boolean(),
    imageUrl: z.string().trim().max(500).refine((u) => !u || u.startsWith("/") || u.startsWith("https://"), "URL da imagem inválida (use https://…)."),
    description: z.string().trim().max(2000, "Texto de apresentação: até 2.000 caracteres.").default(""),
    seoTitle: z.string().trim().max(70, "Título para o Google: até 70 caracteres.").default(""),
    seoDescription: z.string().trim().max(170, "Descrição para o Google: até 170 caracteres.").default(""),
  })).max(200),
  remove: z.array(z.string()).max(200),
});

/**
 * Salva a lista inteira de categorias (ordem = posição na lista).
 * Nova categoria ganha o endereço (slug) gerado do nome; renomear NÃO muda o endereço (links e buscadores continuam valendo).
 * Excluir só é permitido para categoria sem produtos (inclusive arquivados).
 */
export async function saveCategories(actorId: string, raw: unknown) {
  const p = schema.safeParse(raw);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const { rows, remove } = p.data;
  const seen = new Set<string>();
  for (const r of rows) { const k = r.name.toLocaleLowerCase("pt-BR"); if (seen.has(k)) throw new AppError("VALIDATION", `A categoria “${r.name}” aparece duas vezes.`, 422); seen.add(k); }
  if (!rows.length) throw new AppError("VALIDATION", "Mantenha ao menos uma categoria.", 422);
  return db.$transaction(async (tx) => {
    for (const id of remove) {
      const c = await tx.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
      if (!c) continue;
      if (c._count.products) throw new AppError("CATEGORY_IN_USE", `“${c.name}” tem ${c._count.products} produto(s) (incluindo arquivados). Mova os produtos para outra categoria ou desative a categoria em vez de excluir.`, 409);
      await tx.category.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId, action: "category.delete", entity: "Category", entityId: id, before: { name: c.name, slug: c.slug } } });
    }
    const taken = new Set((await tx.category.findMany({ select: { slug: true } })).map((c) => c.slug));
    for (const [position, r] of rows.entries()) {
      const data = { name: r.name, isActive: r.isActive, imageUrl: r.imageUrl || null, description: r.description || null, seoTitle: r.seoTitle || null, seoDescription: r.seoDescription || null, position };
      if (r.id) {
        const before = await tx.category.findUnique({ where: { id: r.id } });
        if (!before) throw new AppError("NOT_FOUND", `A categoria “${r.name}” não existe mais. Recarregue a página.`, 404);
        if (before.name === data.name && before.isActive === data.isActive && (before.imageUrl ?? null) === data.imageUrl && (before.description ?? null) === data.description && (before.seoTitle ?? null) === data.seoTitle && (before.seoDescription ?? null) === data.seoDescription && before.position === position) continue;
        await tx.category.update({ where: { id: r.id }, data });
        await tx.auditLog.create({ data: { actorId, action: "category.update", entity: "Category", entityId: r.id, before: { name: before.name, isActive: before.isActive, position: before.position }, after: data } });
      } else {
        let slug = slugify(r.name), n = 2;
        while (taken.has(slug)) slug = `${slugify(r.name)}-${n++}`;
        taken.add(slug);
        const c = await tx.category.create({ data: { ...data, slug } });
        await tx.auditLog.create({ data: { actorId, action: "category.create", entity: "Category", entityId: c.id, after: { ...data, slug } } });
      }
    }
    return { count: rows.length };
  });
}
