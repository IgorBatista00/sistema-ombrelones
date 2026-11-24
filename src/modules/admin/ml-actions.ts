"use server";
import { revalidatePath } from "next/cache";
import type { AdminPermission } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { requireAdminAny } from "@/modules/auth/session";
import { applyPendingStock, deleteListing, markShipped, saveListing, setMlStockFrom } from "@/modules/mercadolivre/service";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(perms: AdminPermission[], fn: (actorId: string) => Promise<T>): Promise<R<T>> {
  try {
    const { user } = await requireAdminAny(perms);
    const data = await fn(user.id);
    for (const p of ["/admin/mercadolivre", "/admin/meu-dia", "/admin/estoque"]) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." };
  }
}

export const saveListingAction = async (id: string | null, input: unknown) => run(["PRODUCTS", "FINANCE"], (a) => saveListing(a, id, input));
export const deleteListingAction = async (id: string) => run(["PRODUCTS", "FINANCE"], (a) => deleteListing(a, id));
export const markShippedAction = async (orderIds: string[], shipped: boolean) => run(["LOGISTICS", "ORDERS"], (a) => markShipped(a, orderIds, shipped));
export const setMlStockFromAction = async (from: string | null) => run(["STOCK"], (a) => setMlStockFrom(a, from));
export const applyPendingStockAction = async () => run(["STOCK"], (a) => applyPendingStock(a));
