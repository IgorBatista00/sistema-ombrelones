"use server";
/**
 * Server Actions do cadastro de produtos, fornecedores e tabela de custos.
 * Todas exigem permissão PRODUCTS e retornam objetos simples (sem lançar para o navegador).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { deleteProducts } from "@/modules/products/delete";
import { saveCategories } from "@/modules/products/categories";
import { recalcProductsUsingCostItem, removeSupplier, saveProduct, saveSupplier } from "@/modules/products/service";
import { parseMoney } from "@/modules/products/cost";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string[] | undefined> };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fields: e.details as Record<string, string[]> | undefined };
    console.error(e);
    return { ok: false, error: "Erro inesperado ao salvar. Tente novamente." };
  }
}

export async function saveProductFormAction(payload: unknown) {
  return run(async () => {
    const { user } = await requireAdmin("PRODUCTS");
    const r = await saveProduct(user.id, payload);
    revalidatePath("/admin/produtos");
    revalidatePath("/produtos");
    return r;
  });
}

export async function saveSupplierAction(payload: unknown) {
  return run(async () => {
    const { user } = await requireAdmin("PRODUCTS");
    const s = await saveSupplier(user.id, payload);
    revalidatePath("/admin/fornecedores");
    return { id: s.id, legalName: s.legalName, tradeName: s.tradeName, cnpj: s.cnpj, contact: s.contact, phone: s.phone, email: s.email, notes: s.notes };
  });
}

export async function removeSupplierAction(id: string) {
  return run(async () => {
    const { user } = await requireAdmin("PRODUCTS");
    const r = await removeSupplier(user.id, id);
    revalidatePath("/admin/fornecedores");
    return r;
  });
}

const costItemSchema = z.object({
  id: z.string().optional().nullable(),
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,40}$/, "Chave: letras minúsculas, números, _ ou -"),
  label: z.string().trim().min(2, "Informe a descrição").max(120),
  unit: z.string().trim().min(1, "Informe a unidade").max(10),
  price: z.string(),
  category: z.enum(["CORTE", "TECIDO", "GRAFICA", "PLAQUINHA"]),
  isActive: z.boolean(),
});

export async function saveCostItemAction(payload: unknown) {
  return run(async () => {
    const { user } = await requireAdmin("PRODUCTS");
    const r = costItemSchema.safeParse(payload);
    if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
    const priceCents = parseMoney(r.data.price);
    if (priceCents == null || priceCents < 0) throw new AppError("VALIDATION", "Preço inválido.", 422);
    const { id, price: _p, ...rest } = r.data;
    const before = id ? await db.costItem.findUnique({ where: { id } }) : null;
    if (before && before.category !== rest.category && (await db.productCostItem.count({ where: { costItemId: id! } }))) {
      throw new AppError("IN_USE", "Item em uso por produtos: não é possível trocar a categoria.", 409);
    }
    let item;
    try {
      item = id ? await db.costItem.update({ where: { id }, data: { ...rest, priceCents } }) : await db.costItem.create({ data: { ...rest, priceCents } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new AppError("DUPLICATE", "Já existe um item com esta chave.", 409);
      throw e;
    }
    await db.auditLog.create({ data: { actorId: user.id, action: id ? "costitem.update" : "costitem.create", entity: "CostItem", entityId: item.id, before: before as unknown as Prisma.InputJsonValue, after: item as unknown as Prisma.InputJsonValue } });
    // Preço mudou → custo final dos produtos que usam o item é recalculado
    const recalculated = before && before.priceCents !== priceCents ? await recalcProductsUsingCostItem(item.id) : 0;
    revalidatePath("/admin/tabela-custos");
    revalidatePath("/admin/produtos");
    return { id: item.id, recalculated };
  });
}

export async function deleteProductAction(id: string) {
  return deleteProductsAction([id]);
}

/** Exclusão em massa (ou de um só): arquiva os que têm histórico e apaga os demais. */
export async function deleteProductsAction(ids: string[]) {
  return run(async () => {
    const { user } = await requireAdmin("PRODUCTS");
    if (!Array.isArray(ids)) throw new AppError("VALIDATION", "Seleção inválida.", 422);
    const r = await deleteProducts(user.id, ids);
    revalidatePath("/admin/produtos"); revalidatePath("/admin/tabela"); revalidatePath("/produtos", "layout"); revalidatePath("/");
    return r;
  });
}

export async function saveCategoriesAction(payload: unknown) {
  return run(async () => {
    const { user } = await requireAdmin("PRODUCTS");
    const r = await saveCategories(user.id, payload);
    revalidatePath("/admin/produtos"); revalidatePath("/admin/tabela"); revalidatePath("/", "layout");
    return r;
  });
}
