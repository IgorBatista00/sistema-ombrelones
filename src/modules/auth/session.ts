import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { AdminPermission } from "@prisma/client";

export const SESSION_COOKIE = "b2b_session";
const ttlDays = () => Number(process.env.SESSION_TTL_DAYS ?? 30);

/** Cria sessão: token aleatório no cookie (httpOnly), apenas o hash no banco. */
export async function createSession(userId: string, activeCompanyId: string | null, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlDays() * 86_400_000);
  await db.session.create({ data: { id: sha256(token), userId, activeCompanyId, expiresAt, ip: meta.ip, userAgent: meta.userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt,
  });
}

/** Id (hash) da sessão atual — usado para encerrar as OUTRAS sessões ao trocar a senha. */
export async function currentSessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type Viewer = Awaited<ReturnType<typeof getViewer>>;

/**
 * Contexto do visitante, resolvido UMA vez por requisição.
 * `canSeePrices` é a única fonte de verdade para exposição de preços B2B.
 */
export const getViewer = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { user: null, company: null, role: null, admin: null, canSeePrices: false } as const;

  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { adminRole: true, memberships: { include: { company: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return { user: null, company: null, role: null, admin: null, canSeePrices: false } as const;
  }
  const { user } = session;
  const membership =
    user.memberships.find((m) => m.companyId === session.activeCompanyId) ?? user.memberships[0] ?? null;
  const company = membership?.company ?? null;
  const canSeePrices = !!user.emailVerifiedAt && company?.status === "ACTIVE";

  return {
    user: { id: user.id, name: user.name, email: user.email, emailVerified: !!user.emailVerifiedAt, mustChangePassword: user.mustChangePassword },
    company,
    role: membership?.role ?? null,
    admin: user.adminRole,
    canSeePrices,
  } as const;
});

/** Exige comprador de empresa validada (preços liberados). */
export async function requireBuyer() {
  const v = await getViewer();
  if (!v.user) throw new AppError("UNAUTHENTICATED", "Faça login para continuar.", 401);
  if (!v.canSeePrices || !v.company) {
    throw new AppError("COMPANY_NOT_VALIDATED", "Sua empresa ainda não está validada para compras.", 403);
  }
  if (v.role === "VIEWER") throw new AppError("FORBIDDEN", "Seu usuário não tem permissão de compra.", 403);
  return { ...v, user: v.user, company: v.company };
}

export async function requireAdmin(permission: AdminPermission) {
  const v = await getViewer();
  if (!v.user || !v.admin) throw new AppError("FORBIDDEN", "Acesso restrito.", 403);
  if (!v.admin.permissions.includes(permission)) throw new AppError("FORBIDDEN", "Permissão insuficiente.", 403);
  return { ...v, user: v.user, admin: v.admin };
}

/** Exige ao menos uma das permissões (ex.: envio de fotos por quem cadastra produtos OU faz orçamentos). */
export async function requireAdminAny(permissions: AdminPermission[]) {
  const v = await getViewer();
  if (!v.user || !v.admin) throw new AppError("FORBIDDEN", "Acesso restrito.", 403);
  if (!permissions.some((p) => v.admin!.permissions.includes(p))) throw new AppError("FORBIDDEN", "Permissão insuficiente.", 403);
  return { ...v, user: v.user, admin: v.admin };
}

/**
 * Versão para PÁGINAS do painel: em vez de erro, leva para o login (sem sessão),
 * para a troca de senha obrigatória ou para "Sem acesso" (área fora do nível da pessoa).
 * Em ações e rotas de API continue usando requireAdmin / requireAdminAny (devolvem erro).
 */
export async function requireAdminPage(permission: AdminPermission | AdminPermission[]) {
  const v = await getViewer();
  if (!v.user) redirect("/entrar?next=/admin");
  if (!v.admin) redirect("/");
  if (v.user.mustChangePassword) redirect("/trocar-senha");
  const need = Array.isArray(permission) ? permission : [permission];
  if (!need.some((p) => v.admin!.permissions.includes(p))) redirect("/admin/sem-acesso");
  return { ...v, user: v.user, admin: v.admin };
}
