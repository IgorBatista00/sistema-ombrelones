"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { saveOrderCategories } from "@/modules/quotes/categories";
import { duplicateQuote, moveQuote, saveQuote, setQuoteStatus } from "@/modules/quotes/service";
import type { Stage } from "@/modules/quotes/funnel";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { if (e instanceof AppError) return { ok: false, error: e.message }; console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." }; }
}
export async function saveQuoteAction(payload: unknown, generate: boolean) {
  return run(async () => { const { user } = await requireAdmin("ORDERS"); const r = await saveQuote(user.id, payload, generate); revalidatePath("/admin/orcamentos"); return r; });
}
export async function setQuoteStatusAction(id: string, status: "ENVIADO" | "APROVADO" | "RECUSADO") {
  return run(async () => { const { user } = await requireAdmin("ORDERS"); await setQuoteStatus(user.id, id, status); revalidatePath("/admin/orcamentos"); return true; });
}
export async function duplicateQuoteAction(id: string) {
  return run(async () => { const { user } = await requireAdmin("ORDERS"); const r = await duplicateQuote(user.id, id); revalidatePath("/admin/orcamentos"); return r; });
}
export async function moveQuoteAction(id: string, to: Stage, lostReason: string | null) {
  return run(async () => {
    if (!["salvos", "fechados", "perdidos"].includes(to)) throw new AppError("INVALID", "Coluna inválida.", 422);
    const { user } = await requireAdmin("ORDERS");
    const q = await moveQuote(user.id, id, to, lostReason ? String(lostReason).slice(0, 200) : null);
    revalidatePath("/admin/funil"); revalidatePath("/admin/orcamentos");
    return { status: q.status, closedAt: q.closedAt?.toISOString() ?? null, lostReason: q.lostReason };
  });
}

export async function saveOrderCategoriesAction(list: string[]) {
  return run(async () => {
    const { user } = await requireAdmin("ORDERS");
    const r = await saveOrderCategories(user.id, Array.isArray(list) ? list.map(String) : []);
    revalidatePath("/admin/orcamentos"); revalidatePath("/admin/funil");
    return r;
  });
}
