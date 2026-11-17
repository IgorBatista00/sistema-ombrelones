import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalizeCategories } from "@/modules/finance/other-income-rules";

/** Categorias internas de pedido (escolhidas no "Novo orçamento"). Não saem na impressão/PDF do orçamento. */
const KEY = "quotes.categories";
export const DEFAULT_ORDER_CATEGORIES = ["Revenda / lojistas", "Projetos (arquitetos e paisagistas)", "Hotelaria e comércio"];

export async function getOrderCategories() {
  const s = await db.setting.findUnique({ where: { key: KEY } });
  const list = (s?.value as { categories?: string[] } | null)?.categories;
  return Array.isArray(list) && list.length ? list : DEFAULT_ORDER_CATEGORIES;
}
export async function saveOrderCategories(actorId: string, raw: string[]) {
  const categories = normalizeCategories(raw);
  if (!categories.length) throw new AppError("VALIDATION", "Mantenha ao menos uma categoria.", 422);
  await db.$transaction([
    db.setting.upsert({ where: { key: KEY }, update: { value: { categories }, updatedBy: actorId }, create: { key: KEY, value: { categories }, updatedBy: actorId } }),
    db.auditLog.create({ data: { actorId, action: "quote.categories", entity: "Setting", entityId: KEY, after: { categories } } }),
  ]);
  return categories;
}
/** Categorias que existem nos registros + as cadastradas (para os filtros não perderem as renomeadas/excluídas). */
export async function orderCategoryOptions() {
  const [list, used] = await Promise.all([getOrderCategories(), db.quote.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true } })]);
  return [...new Set([...list, ...used.map((u) => u.category!)])];
}
