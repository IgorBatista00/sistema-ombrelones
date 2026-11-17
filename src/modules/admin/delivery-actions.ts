"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { updateDelivery } from "@/modules/deliveries/service";

export async function updateDeliveryAction(id: string, data: Record<string, string>) {
  try {
    const { user } = await requireAdmin("LOGISTICS");
    await updateDelivery(user.id, id, data);
    revalidatePath("/admin/entregas");
    return { ok: true as const };
  } catch (e) {
    if (e instanceof AppError) return { ok: false as const, error: e.message };
    console.error(e); return { ok: false as const, error: "Erro inesperado. Tente novamente." };
  }
}
