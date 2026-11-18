"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { changePromisedDate, createPurchaseOrder, deleteReceipt, registerReceipt, setPoStatus, updatePurchaseOrder } from "@/modules/purchase-orders/service";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: (actorId: string) => Promise<T>, paths: string[] = []): Promise<R<T>> {
  try {
    const { user } = await requireAdmin("STOCK");
    const data = await fn(user.id);
    for (const p of ["/admin/ordens-compra", "/admin/meu-dia", ...paths]) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." };
  }
}

export const createPoAction = async (input: unknown) => run((a) => createPurchaseOrder(a, input));
export const updatePoAction = async (id: string, input: unknown) => run((a) => updatePurchaseOrder(a, id, input), [`/admin/ordens-compra/${id}`]);
export const changePoDateAction = async (id: string, input: { promisedAt?: string; reason?: string }) => run((a) => changePromisedDate(a, id, input), [`/admin/ordens-compra/${id}`]);
export const registerPoReceiptAction = async (id: string, input: unknown) => run((a) => registerReceipt(a, id, input), [`/admin/ordens-compra/${id}`]);
export const deletePoReceiptAction = async (orderId: string, receiptId: string) => run((a) => deleteReceipt(a, receiptId), [`/admin/ordens-compra/${orderId}`]);
export const setPoStatusAction = async (id: string, action: "encerrar" | "cancelar" | "reabrir", reason?: string) => run((a) => setPoStatus(a, id, action, reason), [`/admin/ordens-compra/${id}`]);
