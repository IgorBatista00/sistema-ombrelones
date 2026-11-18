"use server";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { currentSessionId, getViewer, requireAdmin } from "@/modules/auth/session";
import { changeOwnPassword, createAdminUser, resetAdminUserPassword, saveLevelMatrix, setAdminUserActive, updateAdminUser } from "@/modules/admin-users/service";
import { homeFor } from "@/modules/admin/menu";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
async function run<T>(fn: (actorId: string) => Promise<T>): Promise<R<T>> {
  try {
    const { user } = await requireAdmin("ADMIN_USERS");
    const data = await fn(user.id);
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." };
  }
}

export const createAdminUserAction = async (input: unknown) => run((a) => createAdminUser(a, input));
export const updateAdminUserAction = async (id: string, input: unknown) => run((a) => updateAdminUser(a, id, input));
export const setAdminUserActiveAction = async (id: string, active: boolean) => run((a) => setAdminUserActive(a, id, active));
export const resetAdminUserPasswordAction = async (id: string, password: string) => run((a) => resetAdminUserPassword(a, id, password));
export const saveLevelMatrixAction = async (matrix: unknown) => run((a) => saveLevelMatrix(a, matrix));

/** Qualquer usuário logado troca a própria senha. Devolve para onde ir depois. */
export async function changeOwnPasswordAction(input: { current?: string; password?: string; confirm?: string }): Promise<R<{ next: string }>> {
  try {
    const v = await getViewer();
    if (!v.user) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.", 401);
    await changeOwnPassword(v.user.id, await currentSessionId(), input);
    revalidatePath("/", "layout");
    return { ok: true, data: { next: v.admin ? homeFor(v.admin.permissions) : "/minha-conta" } };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e); return { ok: false, error: "Erro inesperado. Tente novamente." };
  }
}
