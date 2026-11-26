"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { applyCalculatedPrices, setMarkup } from "@/modules/pricing/table";
import { deleteProfile, saveProfile, setProductsProfile } from "@/modules/pricing/profiles";

async function run<T>(fn: (actorId: string) => Promise<T>) {
  try {
    const { user } = await requireAdmin("PRODUCTS");
    const data = await fn(user.id);
    revalidatePath("/admin/tabela"); revalidatePath("/admin/markup"); revalidatePath("/admin/produtos"); revalidatePath("/produtos", "layout");
    return { ok: true as const, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false as const, error: e.message };
    console.error(e); return { ok: false as const, error: "Erro inesperado. Tente novamente." };
  }
}
export const setMarkupAction = async (ids: string[], markup: string) => run((a) => setMarkup(a, ids, markup));
export const applyPricesAction = async (ids: string[]) => run((a) => applyCalculatedPrices(a, ids));
export const setProfileAction = async (ids: string[], profileId: string | null) => run((a) => setProductsProfile(a, ids, profileId));
export const saveProfileAction = async (input: Record<string, string>) => run((a) => saveProfile(a, input));
export const deleteProfileAction = async (id: string) => run(async (a) => { await deleteProfile(a, id); return true; });
