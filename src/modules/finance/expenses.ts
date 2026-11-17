import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dayRange } from "@/modules/quotes/funnel";
import { deleteDocumentFile, saveDocument } from "@/modules/integrations/storage/private";
import { RECEIPT_METHODS } from "./receivables";
import { DOC_TYPES, type DocTypeKey } from "./document-rules";
import { DEFAULT_EXPENSE_CATEGORIES, buildExpenseSeries, expenseState, expenseSummary, type ExpenseState } from "./expense-rules";
import { normalizeCategories } from "./other-income-rules";

const KEY = "finance.expenseCategories";
const brDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const atNoonBR = (iso: string) => new Date(`${iso}T12:00:00-03:00`);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const money = z.union([z.string(), z.number()]).transform((v) => {
  const t = String(v).trim().replace(/[R$\s]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}).refine((c) => Number.isInteger(c) && c > 0 && c < 10_000_000_000, "Informe um valor maior que zero.");
const opt = z.string().trim().max(300).optional().nullable().transform((v) => v || null);

export async function getExpenseCategories() {
  const s = await db.setting.findUnique({ where: { key: KEY } });
  const list = (s?.value as { categories?: string[] } | null)?.categories;
  return Array.isArray(list) && list.length ? list : DEFAULT_EXPENSE_CATEGORIES;
}
export async function saveExpenseCategories(actorId: string, raw: string[]) {
  const categories = normalizeCategories(raw);
  if (!categories.length) throw new AppError("VALIDATION", "Mantenha ao menos uma categoria.", 422);
  await db.setting.upsert({ where: { key: KEY }, update: { value: { categories }, updatedBy: actorId }, create: { key: KEY, value: { categories }, updatedBy: actorId } });
  return categories;
}
async function audit(tx: Prisma.TransactionClient, actorId: string, action: string, id: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { actorId, action, entity: "Expense", entityId: id, before: (before ?? undefined) as Prisma.InputJsonValue, after: (after ?? undefined) as Prisma.InputJsonValue } });
}
const fail = (r: z.SafeParseReturnType<unknown, unknown>) => { if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422); };

const createSchema = z.object({
  description: z.string().trim().min(2, "Descreva a saída.").max(160), category: z.string().trim().min(1, "Escolha a categoria."), payee: opt,
  amount: money, dueDate: isoDay, repeat: z.enum(["none", "installments", "monthly"]).default("none"), times: z.coerce.number().int().min(1).max(60).default(1),
  paidNow: z.boolean().default(false), paidAt: isoDay.optional(), method: opt, note: opt,
});
/** Lança uma saída (ou a série: parcelada ou recorrente). "Já paga" vale só para a primeira. */
export async function createExpenses(actorId: string, raw: unknown) {
  const r = createSchema.safeParse(raw); fail(r);
  const d = r.data!;
  if (!(await getExpenseCategories()).includes(d.category)) throw new AppError("VALIDATION", "Categoria inexistente — cadastre-a em “Categorias”.", 422);
  if (d.paidNow) {
    if (!d.paidAt || d.paidAt > brDay(new Date())) throw new AppError("VALIDATION", "Informe a data do pagamento (não pode ser futura).", 422);
    if (!d.method || !RECEIPT_METHODS.includes(d.method)) throw new AppError("VALIDATION", "Informe a forma de pagamento.", 422);
  }
  const series = buildExpenseSeries(d.amount, d.dueDate, d.repeat, d.times);
  const seriesId = series.length > 1 ? randomUUID() : null;
  return db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const [i, s] of series.entries()) {
      const paid = d.paidNow && i === 0;
      const e = await tx.expense.create({ data: {
        description: d.description, category: d.category, payee: d.payee, amountCents: s.amountCents, dueDate: atNoonBR(s.dueDate), note: d.note, seriesId, seriesLabel: s.label, createdById: actorId,
        ...(paid ? { status: "PAGA", paidAt: atNoonBR(d.paidAt!), paidCents: s.amountCents, method: d.method } : {}),
      } });
      ids.push(e.id);
    }
    await audit(tx, actorId, "expense.create", ids[0], null, { description: d.description, amountCents: d.amount, repeat: d.repeat, count: series.length, seriesId });
    return { ids, count: series.length };
  });
}

const updateSchema = z.object({ description: z.string().trim().min(2, "Descreva a saída.").max(160), category: z.string().trim().min(1), payee: opt, amount: money, dueDate: isoDay, note: opt });
export async function updateExpense(actorId: string, id: string, raw: unknown) {
  const r = updateSchema.safeParse(raw); fail(r);
  const d = r.data!;
  return db.$transaction(async (tx) => {
    const before = await tx.expense.findUnique({ where: { id } });
    if (!before) throw new AppError("NOT_FOUND", "Saída não encontrada.", 404);
    const u = await tx.expense.update({ where: { id }, data: { description: d.description, category: d.category, payee: d.payee, amountCents: d.amount, dueDate: atNoonBR(d.dueDate), note: d.note } });
    await audit(tx, actorId, "expense.update", id, { description: before.description, amountCents: before.amountCents, dueDate: before.dueDate, category: before.category }, d);
    return u;
  });
}

const paySchema = z.object({ paidAt: isoDay, amount: money, method: z.string().refine((m) => RECEIPT_METHODS.includes(m), "Escolha a forma de pagamento."), note: opt });
export async function payExpense(actorId: string, id: string, raw: unknown) {
  const r = paySchema.safeParse(raw); fail(r);
  const d = r.data!;
  if (d.paidAt > brDay(new Date())) throw new AppError("VALIDATION", "A data do pagamento não pode ser futura.", 422);
  return db.$transaction(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e || e.status !== "A_PAGAR") throw new AppError("INVALID", "Esta saída não está em aberto.", 409);
    const u = await tx.expense.update({ where: { id }, data: { status: "PAGA", paidAt: atNoonBR(d.paidAt), paidCents: d.amount, method: d.method, ...(d.note ? { note: [e.note, d.note].filter(Boolean).join(" · ") } : {}) } });
    await audit(tx, actorId, "expense.pay", id, { status: e.status }, { paidCents: d.amount, method: d.method, paidAt: d.paidAt });
    return u;
  });
}
export async function reverseExpense(actorId: string, id: string) {
  return db.$transaction(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e || e.status !== "PAGA") throw new AppError("INVALID", "Esta saída não está paga.", 409);
    await tx.expense.update({ where: { id }, data: { status: "A_PAGAR", paidAt: null, paidCents: null, method: null } });
    await audit(tx, actorId, "expense.reverse", id, { paidCents: e.paidCents, method: e.method, paidAt: e.paidAt }, { status: "A_PAGAR" });
  });
}
/** Exclui a saída; com `future`, também as próximas EM ABERTO da mesma série (ex.: cancelou o contrato). */
export async function deleteExpense(actorId: string, id: string, future: boolean) {
  const res = await db.$transaction(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw new AppError("NOT_FOUND", "Saída não encontrada.", 404);
    const targets = future && e.seriesId ? await tx.expense.findMany({ where: { seriesId: e.seriesId, dueDate: { gte: e.dueDate }, OR: [{ id }, { status: "A_PAGAR" }] }, select: { id: true, description: true, amountCents: true, seriesLabel: true } }) : [{ id: e.id, description: e.description, amountCents: e.amountCents, seriesLabel: e.seriesLabel }];
    const docs = await tx.expenseDocument.findMany({ where: { expenseId: { in: targets.map((t) => t.id) } }, select: { storageKey: true } });
    await tx.expense.deleteMany({ where: { id: { in: targets.map((t) => t.id) } } });
    for (const t of targets) await audit(tx, actorId, "expense.delete", t.id, t, null);
    return { count: targets.length, keys: docs.map((d) => d.storageKey) };
  });
  for (const k of res.keys) await deleteDocumentFile(k); // só depois de confirmada a exclusão no banco
  return res.count;
}

export async function attachExpenseDocument(actor: { id: string; name: string }, form: FormData) {
  const m = z.object({ expenseId: z.string().min(1), type: z.enum(Object.keys(DOC_TYPES) as [DocTypeKey, ...DocTypeKey[]]) }).safeParse({ expenseId: form.get("expenseId"), type: form.get("type") });
  if (!m.success) throw new AppError("VALIDATION", "Escolha o tipo do documento.", 422);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  if (!files.length) throw new AppError("NO_FILES", "Selecione o arquivo.");
  if (!(await db.expense.findUnique({ where: { id: m.data.expenseId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Saída não encontrada.", 404);
  const out = [];
  for (const f of files) {
    const s = await saveDocument(f);
    const d = await db.expenseDocument.create({ data: { expenseId: m.data.expenseId, type: m.data.type, fileName: s.fileName, storageKey: s.key, mimeType: s.mime, sizeBytes: s.size, uploadedById: actor.id, uploadedBy: actor.name } });
    await db.auditLog.create({ data: { actorId: actor.id, action: "expense.document.attach", entity: "Expense", entityId: m.data.expenseId, after: { documentId: d.id, type: d.type, fileName: d.fileName } } });
    out.push({ id: d.id, fileName: d.fileName });
  }
  return out;
}
export async function removeExpenseDocument(actorId: string, id: string) {
  const d = await db.expenseDocument.findUnique({ where: { id } });
  if (!d || d.deletedAt) throw new AppError("NOT_FOUND", "Documento não encontrado.", 404);
  await db.$transaction([db.expenseDocument.update({ where: { id }, data: { deletedAt: new Date() } }), db.auditLog.create({ data: { actorId, action: "expense.document.remove", entity: "Expense", entityId: d.expenseId, before: { documentId: id, fileName: d.fileName } } })]);
  await deleteDocumentFile(d.storageKey);
}

export const expenseFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined), de: z.string().optional().catch(undefined), ate: z.string().optional().catch(undefined),
  categoria: z.string().optional().catch(undefined), situacao: z.enum(["abertas", "vencidas", "pagas"]).optional().catch(undefined),
});
/** Período = vencimento (abertas) ou data do pagamento (pagas). */
export async function expensesView(f: z.infer<typeof expenseFilterSchema>) {
  const range = dayRange(f.de, f.ate);
  const and: Prisma.ExpenseWhereInput[] = [];
  if (f.q) and.push({ OR: [{ description: { contains: f.q, mode: "insensitive" } }, { payee: { contains: f.q, mode: "insensitive" } }, { note: { contains: f.q, mode: "insensitive" } }] });
  if (f.categoria) and.push({ category: f.categoria });
  if (f.situacao === "pagas") and.push({ status: "PAGA" });
  if (f.situacao === "abertas" || f.situacao === "vencidas") and.push({ status: "A_PAGAR" });
  if (range) and.push(f.situacao === "pagas" ? { paidAt: range } : f.situacao ? { dueDate: range } : { OR: [{ status: "A_PAGAR", dueDate: range }, { status: "PAGA", paidAt: range }] });
  const [list, categories] = await Promise.all([
    db.expense.findMany({ where: { AND: and }, take: 3000, orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { documents: { where: { deletedAt: null }, select: { id: true, type: true, fileName: true } } } }),
    getExpenseCategories(),
  ]);
  const today = brDay(new Date());
  const rows = list.map((e) => ({ ...e, dueDay: brDay(e.dueDate), state: expenseState({ status: e.status, dueDay: brDay(e.dueDate) }, today) as ExpenseState }))
    .filter((e) => f.situacao !== "vencidas" || e.state === "vencida")
    .sort((a, b) => (a.status === b.status ? (a.status === "PAGA" ? (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0) : a.dueDay.localeCompare(b.dueDay)) : a.status === "A_PAGAR" ? -1 : 1));
  return { rows, categories, summary: expenseSummary(rows, today), payees: [...new Set(list.map((e) => e.payee).filter(Boolean) as string[])].slice(0, 200) };
}
