"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { registerMovement, registerPurchase, setMinQty } from "@/modules/inventory/movements";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { if (e instanceof AppError) return { ok: false, error: e.message }; console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." }; }
}
const refresh = () => { revalidatePath("/admin/estoque"); revalidatePath("/produtos"); revalidatePath("/"); };

export async function registerMovementAction(payload: unknown) {
  return run(async () => { const { user } = await requireAdmin("STOCK"); const r = await registerMovement(user.id, payload); refresh(); return r; });
}
export async function setMinQtyAction(variantId: string, minQty: number) {
  return run(async () => { const { user } = await requireAdmin("STOCK"); await setMinQty(user.id, variantId, minQty); revalidatePath("/admin/estoque"); return true; });
}
export async function saveStockDisplayAction(payload: unknown) {
  return run(async () => {
    const { user } = await requireAdmin("STOCK");
    const v = z.object({ mode: z.enum(["exata", "faixa", "simples"]), lowThreshold: z.coerce.number().int().min(0).max(1000) }).parse(payload);
    await db.setting.upsert({ where: { key: "store" }, update: { value: v, updatedBy: user.id }, create: { key: "store", value: v, updatedBy: user.id } });
    await db.auditLog.create({ data: { actorId: user.id, action: "setting.update", entity: "Setting", entityId: "store", after: v } });
    refresh();
    return v;
  });
}

export async function registerPurchaseAction(payload: unknown) {
  return run(async () => { const { user } = await requireAdmin("STOCK"); const r = await registerPurchase(user.id, payload); refresh(); revalidatePath("/admin/estoque/compras"); return r; });
}
