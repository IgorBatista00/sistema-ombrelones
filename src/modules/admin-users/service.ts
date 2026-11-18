import "server-only";
import { z } from "zod";
import type { AdminPermission, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword, passwordSchema, verifyPassword } from "@/modules/auth/password";
import { DEFAULT_MATRIX, LEVELS, guardChange, levelLabel, matrixError, normalizeMatrix, permissionsFor, type LevelKey, type LevelMatrix } from "./levels";

type Tx = Prisma.TransactionClient;
const KEY = "access-levels";
const levelEnum = z.enum(LEVELS.map((l) => l.key) as [LevelKey, ...LevelKey[]], { errorMap: () => ({ message: "Escolha o nível de acesso." }) });

export async function getLevelMatrix(tx: Tx | typeof db = db): Promise<LevelMatrix> {
  const s = await tx.setting.findUnique({ where: { key: KEY } });
  return s ? normalizeMatrix(s.value) : { ...DEFAULT_MATRIX };
}

/** Salva a tabela de níveis e atualiza na hora as permissões de todos os usuários de cada nível. */
export async function saveLevelMatrix(actorId: string, raw: unknown) {
  const m = normalizeMatrix(raw);
  const err = matrixError(m);
  if (err) throw new AppError("VALIDATION", err, 422);
  return db.$transaction(async (tx) => {
    const before = await getLevelMatrix(tx);
    await tx.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: m, updatedBy: actorId }, update: { value: m, updatedBy: actorId } });
    let changed = 0;
    for (const lv of Object.keys(m) as (keyof LevelMatrix)[]) {
      const r = await tx.adminUser.updateMany({ where: { level: lv }, data: { permissions: permissionsFor(lv, m) as AdminPermission[] } });
      changed += r.count;
    }
    await tx.auditLog.create({ data: { actorId, action: "access_levels.update", entity: "Setting", entityId: KEY, before, after: m } });
    return { users: changed };
  });
}

const activeAdmCount = (tx: Tx) => tx.adminUser.count({ where: { level: "ADM", user: { isActive: true } } });

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  level: levelEnum,
  password: passwordSchema,
});

export async function createAdminUser(actorId: string, input: unknown) {
  const p = createUserSchema.safeParse(input);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const f = p.data;
  return db.$transaction(async (tx) => {
    const exists = await tx.user.findUnique({ where: { email: f.email }, include: { adminRole: true } });
    if (exists?.adminRole) throw new AppError("DUPLICATE", "Já existe um usuário do painel com este e-mail.", 409);
    if (exists) throw new AppError("DUPLICATE", "Este e-mail já está cadastrado como cliente da loja. Use outro e-mail para o acesso ao painel.", 409);
    const m = await getLevelMatrix(tx);
    const user = await tx.user.create({
      data: { email: f.email, name: f.name, phone: f.phone, passwordHash: await hashPassword(f.password), emailVerifiedAt: new Date(), mustChangePassword: true,
        adminRole: { create: { level: f.level, permissions: permissionsFor(f.level, m) as AdminPermission[], createdById: actorId } } },
    });
    await tx.auditLog.create({ data: { actorId, action: "admin_user.create", entity: "User", entityId: user.id, after: { email: f.email, name: f.name, level: f.level } } });
    return { id: user.id };
  });
}

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  level: levelEnum,
});

export async function updateAdminUser(actorId: string, userId: string, input: unknown) {
  const p = updateUserSchema.safeParse(input);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const f = p.data;
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, include: { adminRole: true } });
    if (!u?.adminRole) throw new AppError("NOT_FOUND", "Usuário não encontrado.", 404);
    const err = guardChange({ actorId, targetId: userId, targetLevel: u.adminRole.level, targetActive: u.isActive, nextLevel: f.level, nextActive: u.isActive, activeAdmCount: await activeAdmCount(tx) });
    if (err) throw new AppError("FORBIDDEN", err, 409);
    const m = await getLevelMatrix(tx);
    await tx.user.update({ where: { id: userId }, data: { name: f.name, phone: f.phone } });
    await tx.adminUser.update({ where: { userId }, data: { level: f.level, permissions: permissionsFor(f.level, m) as AdminPermission[] } });
    await tx.auditLog.create({ data: { actorId, action: "admin_user.update", entity: "User", entityId: userId, before: { name: u.name, level: u.adminRole.level }, after: { name: f.name, level: f.level } } });
  });
}

/** Desativar encerra as sessões abertas na hora; o histórico (orçamentos, lançamentos) continua com o nome da pessoa. */
export async function setAdminUserActive(actorId: string, userId: string, active: boolean) {
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, include: { adminRole: true } });
    if (!u?.adminRole) throw new AppError("NOT_FOUND", "Usuário não encontrado.", 404);
    const err = guardChange({ actorId, targetId: userId, targetLevel: u.adminRole.level, targetActive: u.isActive, nextLevel: u.adminRole.level, nextActive: active, activeAdmCount: await activeAdmCount(tx) });
    if (err) throw new AppError("FORBIDDEN", err, 409);
    if (active && !u.adminRole.level) throw new AppError("VALIDATION", "Escolha um nível de acesso antes de reativar este usuário.", 422);
    await tx.user.update({ where: { id: userId }, data: { isActive: active, ...(active ? { failedLogins: 0, lockedUntil: null } : {}) } });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    await tx.auditLog.create({ data: { actorId, action: active ? "admin_user.activate" : "admin_user.deactivate", entity: "User", entityId: userId } });
  });
}

/** Nova senha provisória definida pelo Adm (pessoa esqueceu a senha). Encerra as sessões e exige troca no próximo acesso. */
export async function resetAdminUserPassword(actorId: string, userId: string, password: unknown) {
  const p = passwordSchema.safeParse(password);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Senha inválida.", 422);
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, include: { adminRole: true } });
    if (!u?.adminRole) throw new AppError("NOT_FOUND", "Usuário não encontrado.", 404);
    if (actorId === userId) throw new AppError("FORBIDDEN", "Para trocar a sua própria senha, use “Minha senha”.", 409);
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(p.data), mustChangePassword: true, failedLogins: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.auditLog.create({ data: { actorId, action: "admin_user.reset_password", entity: "User", entityId: userId } });
  });
}

/** Troca da própria senha (obrigatória no primeiro acesso com senha provisória). Mantém só a sessão atual. */
export async function changeOwnPassword(userId: string, currentSessionId: string | null, input: { current?: string; password?: string; confirm?: string }) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw new AppError("NOT_FOUND", "Usuário não encontrado.", 404);
  if (!(await verifyPassword(input.current ?? "", u.passwordHash))) throw new AppError("VALIDATION", "A senha atual está incorreta.", 422);
  const p = passwordSchema.safeParse(input.password ?? "");
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Senha inválida.", 422);
  if (input.password !== input.confirm) throw new AppError("VALIDATION", "A confirmação não confere com a nova senha.", 422);
  if (await verifyPassword(p.data, u.passwordHash)) throw new AppError("VALIDATION", "A nova senha precisa ser diferente da atual.", 422);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(p.data), mustChangePassword: false } }),
    db.session.deleteMany({ where: { userId, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) } }),
    db.auditLog.create({ data: { actorId: userId, action: "user.change_password", entity: "User", entityId: userId } }),
  ]);
}

export async function adminUsersView() {
  const rows = await db.adminUser.findMany({
    include: { user: { select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true, mustChangePassword: true, createdAt: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const order = (r: (typeof rows)[number]) => (r.user.isActive ? 0 : 1);
  return rows.sort((a, b) => order(a) - order(b) || a.user.name.localeCompare(b.user.name, "pt-BR")).map((r) => ({
    id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone, active: r.user.isActive, lastLoginAt: r.user.lastLoginAt, createdAt: r.user.createdAt,
    pendingPassword: r.user.mustChangePassword, level: r.level, levelLabel: levelLabel(r.level),
  }));
}
