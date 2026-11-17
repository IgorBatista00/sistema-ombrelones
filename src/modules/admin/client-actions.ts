"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { deleteClient } from "@/modules/clients/service";

export async function deleteClientAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { user } = await requireAdmin("CUSTOMERS");
    await deleteClient(user.id, String(id));
    revalidatePath("/admin/clientes");
    return { ok: true };
  } catch (e) { if (e instanceof AppError) return { ok: false, error: e.message }; console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." }; }
}
