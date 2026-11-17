import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dayRange } from "@/modules/quotes/funnel";
import { RECEIPT_METHODS } from "./receivables";
import { DEFAULT_CATEGORIES, normalizeCategories, otherIncomeSummary } from "./other-income-rules";

const KEY = "finance.otherIncome";

export async function getCategories() {
  const s = await db.setting.findUnique({ where: { key: KEY } });
  const list = (s?.value as { categories?: string[] } | null)?.categories;
  return Array.isArray(list) && list.length ? list : DEFAULT_CATEGORIES;
}
export async function saveCategories(actorId: string, raw: string[]) {
  const categories = normalizeCategories(raw);
  if (!categories.length) throw new AppError("VALIDATION", "Mantenha ao menos uma categoria.", 422);
  await db.setting.upsert({ where: { key: KEY }, update: { value: { categories }, updatedBy: actorId }, create: { key: KEY, value: { categories }, updatedBy: actorId } });
  return categories;
}

const money = z.union([z.string(), z.number()]).transform((v) => {
  const t = String(v).trim().replace(/[R$\s]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}).refine((c) => Number.isInteger(c) && c > 0 && c < 10_000_000_000, "Informe um valor maior que zero.");
const schema = z.object({
  description: z.string().trim().min(2, "Descreva a receita.").max(160),
  category: z.string().trim().min(1, "Escolha a categoria."),
  amount: money,
  status: z.enum(["PREVISTA", "RECEBIDA"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  method: z.string().optional().nullable().transform((v) => v || null),
  note: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
}).superRefine((v, ctx) => {
  const d = new Date(`${v.date}T12:00:00-03:00`);
  if (v.status === "RECEBIDA" && d.getTime() > Date.now() + 86_400_000) ctx.addIssue({ code: "custom", message: "Receita recebida não pode ter data futura. Use “Prevista”." });
  if (v.status === "RECEBIDA" && !v.method) ctx.addIssue({ code: "custom", message: "Informe a forma de recebimento." });
  if (v.method && !RECEIPT_METHODS.includes(v.method)) ctx.addIssue({ code: "custom", message: "Forma de recebimento inválida." });
});

function parse(raw: unknown, categories: string[]) {
  const r = schema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
  if (!categories.includes(r.data.category)) throw new AppError("VALIDATION", "Categoria inexistente — cadastre-a em “Categorias”.", 422);
  const { amount, date, ...rest } = r.data;
  return { ...rest, amountCents: amount, date: new Date(`${date}T12:00:00-03:00`) };
}
async function audit(tx: Prisma.TransactionClient, actorId: string, action: string, id: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { actorId, action, entity: "OtherIncome", entityId: id, before: (before ?? undefined) as Prisma.InputJsonValue, after: (after ?? undefined) as Prisma.InputJsonValue } });
}

export async function saveOtherIncome(actorId: string, id: string | null, raw: unknown) {
  const data = parse(raw, await getCategories());
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.otherIncome.findUnique({ where: { id } });
      if (!before) throw new AppError("NOT_FOUND", "Lançamento não encontrado.", 404);
      const u = await tx.otherIncome.update({ where: { id }, data });
      await audit(tx, actorId, "other-income.update", id, before, data); return u;
    }
    const c = await tx.otherIncome.create({ data: { ...data, createdById: actorId } });
    await audit(tx, actorId, "other-income.create", c.id, null, data); return c;
  });
}
export async function markOtherIncomeReceived(actorId: string, id: string, date: string, method: string) {
  const row = await db.otherIncome.findUnique({ where: { id } });
  if (!row || row.status !== "PREVISTA") throw new AppError("INVALID", "Este lançamento não está previsto.", 409);
  return saveOtherIncome(actorId, id, { description: row.description, category: row.category, amount: row.amountCents / 100, status: "RECEBIDA", date, method, note: row.note });
}
export async function deleteOtherIncome(actorId: string, id: string) {
  return db.$transaction(async (tx) => {
    const before = await tx.otherIncome.findUnique({ where: { id } });
    if (!before) throw new AppError("NOT_FOUND", "Lançamento não encontrado.", 404);
    await tx.otherIncome.delete({ where: { id } });
    await audit(tx, actorId, "other-income.delete", id, before, null);
  });
}

export async function otherIncomeView(f: { q?: string; de?: string; ate?: string; situacao?: string; categoria?: string }) {
  const range = dayRange(f.de, f.ate);
  const where: Prisma.OtherIncomeWhereInput = {
    ...(range ? { date: range } : {}),
    ...(f.q ? { OR: [{ description: { contains: f.q, mode: "insensitive" } }, { note: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.categoria ? { category: f.categoria } : {}),
    ...(f.situacao === "PREVISTA" || f.situacao === "RECEBIDA" ? { status: f.situacao } : {}),
  };
  const [rows, categories] = await Promise.all([db.otherIncome.findMany({ where, orderBy: { date: "desc" }, take: 2000 }), getCategories()]);
  return { rows, categories, summary: otherIncomeSummary(rows) };
}

/** Receitas previstas em aberto (entram na previsão de recebimento). */
export const plannedOtherIncome = () => db.otherIncome.findMany({ where: { status: "PREVISTA" }, select: { date: true, amountCents: true } });
/** Recebidas no período (somam no "Recebido" do Financeiro). */
export const receivedOtherIncome = (range: { gte?: Date; lt?: Date } | null) => db.otherIncome.aggregate({ where: { status: "RECEBIDA", ...(range ? { date: range } : {}) }, _sum: { amountCents: true } });
