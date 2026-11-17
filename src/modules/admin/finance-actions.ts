"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { registerReceipt, reverseReceipt, setDueDate } from "@/modules/finance/sales";
import { createExpenses, deleteExpense, payExpense, removeExpenseDocument, reverseExpense, saveExpenseCategories, updateExpense } from "@/modules/finance/expenses";
import { clearBoleto, clearInvoice, setPlannedMethod } from "@/modules/finance/billing";
import { addSaleNote, removeDocument, removeSaleNote } from "@/modules/finance/documents";
import { disconnectMercadoLivre, syncMercadoLivre } from "@/modules/integrations/mercadolivre/service";
import { deleteOtherIncome, markOtherIncomeReceived, saveCategories, saveOtherIncome } from "@/modules/finance/other-income";


type Result = { ok: true } | { ok: false; error: string };
async function run(fn: (actorId: string) => Promise<unknown>): Promise<Result> {
  try { const { user } = await requireAdmin("FINANCE"); await fn(user.id); revalidatePath("/admin/financeiro"); return { ok: true }; }
  catch (e) { if (e instanceof AppError) return { ok: false, error: e.message }; console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." }; }
}
export const receiveAction = async (id: string, data: { receivedAt: string; amount: string; method: string; note: string }) => run((a) => registerReceipt(a, id, data));
export const reverseAction = async (id: string) => run((a) => reverseReceipt(a, id));
export const dueDateAction = async (id: string, date: string) => run((a) => setDueDate(a, id, date));
export const saveOtherIncomeAction = async (id: string | null, data: Record<string, string>) => run((a) => saveOtherIncome(a, id, data));
export const receiveOtherIncomeAction = async (id: string, date: string, method: string) => run((a) => markOtherIncomeReceived(a, id, date, method));
export const deleteOtherIncomeAction = async (id: string) => run((a) => deleteOtherIncome(a, id));
export const saveCategoriesAction = async (list: string[]) => run((a) => saveCategories(a, list));
export const removeDocumentAction = async (id: string) => run((a) => removeDocument(a, id));
export const addNoteAction = async (saleId: string, text: string) => {
  try { const { user } = await requireAdmin("FINANCE"); await addSaleNote({ id: user.id, name: user.name }, saleId, text); revalidatePath("/admin/financeiro"); return { ok: true as const }; }
  catch (e) { if (e instanceof AppError) return { ok: false as const, error: e.message }; console.error(e); return { ok: false as const, error: "Erro inesperado. Tente novamente." }; }
};
export const removeNoteAction = async (id: string) => run((a) => removeSaleNote(a, id));
export const syncMlAction = async (days: number) => {
  try {
    const { user } = await requireAdmin("FINANCE");
    const r = await syncMercadoLivre(user.id, Math.min(90, Math.max(1, Math.round(days) || 30)));
    revalidatePath("/admin/financeiro"); revalidatePath("/admin/meu-dia");
    return { ok: true as const, data: r };
  } catch (e) { if (e instanceof AppError) return { ok: false as const, error: e.message }; console.error(e); return { ok: false as const, error: "Erro inesperado. Tente novamente." }; }
};
export const disconnectMlAction = async () => run((a) => disconnectMercadoLivre(a));
export const createExpensesAction = async (data: Record<string, unknown>) => run((a) => createExpenses(a, data));
export const updateExpenseAction = async (id: string, data: Record<string, unknown>) => run((a) => updateExpense(a, id, data));
export const payExpenseAction = async (id: string, data: Record<string, unknown>) => run((a) => payExpense(a, id, data));
export const reverseExpenseAction = async (id: string) => run((a) => reverseExpense(a, id));
export const deleteExpenseAction = async (id: string, future: boolean) => run((a) => deleteExpense(a, id, future));
export const removeExpenseDocumentAction = async (id: string) => run((a) => removeExpenseDocument(a, id));
export const saveExpenseCategoriesAction = async (list: string[]) => run((a) => saveExpenseCategories(a, list));
export const clearInvoiceAction = async (saleId: string) => run((a) => clearInvoice(a, saleId));
export const clearBoletoAction = async (receivableId: string) => run((a) => clearBoleto(a, receivableId));
export const setPlannedMethodAction = async (receivableId: string, method: string) => run((a) => setPlannedMethod(a, receivableId, method));
