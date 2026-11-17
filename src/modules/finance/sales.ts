import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildReceivablesPlan, RECEIPT_METHODS } from "./receivables";
import { installmentError } from "@/modules/quotes/totals";

type Tx = Prisma.TransactionClient;
const RECEIVED_BLOCK = "Esta venda já tem recebimentos lançados no Financeiro. Estorne as baixas antes de alterar ou reabrir o orçamento.";

/**
 * Orçamento fechado (APROVADO) → venda + parcelas a receber.
 * Chamada ao fechar no funil e ao salvar um orçamento já fechado (mantém o financeiro em dia).
 * Se já houver parcela recebida, só aceita mudanças que não afetem valores, parcelamento ou data da venda.
 */
export async function syncSaleFromQuote(tx: Tx, quoteId: string) {
  const q = await tx.quote.findUnique({ where: { id: quoteId }, include: { sale: { include: { receivables: true } } } });
  if (!q || q.status !== "APROVADO") return null;
  const c = q.clientSnapshot as Record<string, string>;
  const closedAt = q.closedAt ?? new Date();
  const info = {
    code: q.code, category: q.category, clientName: c.name || "Cliente não informado", clientDoc: c.cnpj || c.cpf || null, seller: q.seller,
    closedAt, totalCents: q.totalCents, costCents: q.costCents, paymentTerms: q.paymentTerms, installmentPlan: q.installmentPlan,
  };
  const fixed = Array.isArray(q.installmentValues) ? (q.installmentValues as (number | null)[]) : null;
  const valuesKey = JSON.stringify(fixed ?? null);
  const sale = q.sale;
  const hasReceipts = !!sale?.receivables.some((r) => r.status === "RECEBIDO");
  if (sale && hasReceipts) {
    const financialChange = sale.totalCents !== info.totalCents || (sale.installmentPlan ?? "") !== (info.installmentPlan ?? "") || JSON.stringify(sale.installmentValues ?? null) !== valuesKey || sale.closedAt.getTime() !== closedAt.getTime() || sale.status !== "ATIVA";
    if (financialChange) throw new AppError("FINANCE_LOCKED", RECEIVED_BLOCK, 409);
    return tx.sale.update({ where: { id: sale.id }, data: { category: info.category, clientName: info.clientName, clientDoc: info.clientDoc, seller: info.seller, costCents: info.costCents, paymentTerms: info.paymentTerms } });
  }
  const { parcels, diffCents } = buildReceivablesPlan(info.totalCents, info.installmentPlan, closedAt, fixed);
  if (diffCents !== 0) throw new AppError("INSTALLMENTS_MISMATCH", `${installmentError(diffCents)} (orçamento ${q.code})`, 409);
  const saleData = { ...info, installmentValues: fixed ?? Prisma.DbNull };
  if (sale) {
    await tx.receivable.deleteMany({ where: { saleId: sale.id } });
    return tx.sale.update({ where: { id: sale.id }, data: { ...saleData, status: "ATIVA", cancelledAt: null, receivables: { create: parcels } } });
  }
  return tx.sale.create({ data: { ...saleData, quoteId: q.id, receivables: { create: parcels } } });
}

/** Orçamento saiu de Fechados (reaberto ou perdido) → venda cancelada. Bloqueia se já houver recebimento. */
export async function cancelSaleForQuote(tx: Tx, quoteId: string) {
  const sale = await tx.sale.findUnique({ where: { quoteId }, include: { receivables: true } });
  if (!sale || sale.status === "CANCELADA") return;
  if (sale.receivables.some((r) => r.status === "RECEBIDO")) throw new AppError("FINANCE_LOCKED", RECEIVED_BLOCK, 409);
  await tx.receivable.updateMany({ where: { saleId: sale.id }, data: { status: "CANCELADO" } });
  await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELADA", cancelledAt: new Date() } });
}

/** Orçamentos fechados antes desta integração (ou por outro caminho) que ainda não viraram venda. */
/** Um orçamento com problema (ex.: parcelas que não fecham o total) é pulado e devolvido em `skipped` — a tela avisa e não trava. */
export async function backfillSales() {
  const missing = await db.quote.findMany({ where: { status: "APROVADO", sale: null }, select: { id: true, code: true }, take: 500 });
  const skipped: { id: string; code: string; reason: string }[] = [];
  for (const q of missing) {
    try { await db.$transaction((tx) => syncSaleFromQuote(tx, q.id)); }
    catch (e) { if (!(e instanceof AppError)) console.error(e); skipped.push({ id: q.id, code: q.code, reason: e instanceof AppError ? e.message : "Erro inesperado ao gerar a venda." }); }
  }
  return { created: missing.length - skipped.length, skipped };
}

// ------------------------------------------------------------------ baixas
const moneyIn = z.union([z.string(), z.number()]).transform((v) => {
  const t = String(v).trim().replace(/[R$\s]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}).refine((c) => Number.isInteger(c) && c > 0, "Valor recebido inválido");
const dateIn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").transform((d) => new Date(`${d}T12:00:00-03:00`));

export const receiptSchema = z.object({
  receivedAt: dateIn.refine((d) => d.getTime() <= Date.now() + 86_400_000, "A data do recebimento não pode ser futura"),
  amount: moneyIn,
  method: z.enum(RECEIPT_METHODS as [string, ...string[]], { message: "Escolha a forma de recebimento" }),
  note: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
});

async function audit(tx: Tx, actorId: string, action: string, id: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { actorId, action, entity: "Receivable", entityId: id, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue } });
}

export async function registerReceipt(actorId: string, receivableId: string, raw: unknown) {
  const r = receiptSchema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
  return db.$transaction(async (tx) => {
    const rec = await tx.receivable.findUnique({ where: { id: receivableId }, include: { sale: true } });
    if (!rec) throw new AppError("NOT_FOUND", "Parcela não encontrada.", 404);
    if (rec.status !== "ABERTO" || rec.sale.status !== "ATIVA") throw new AppError("INVALID", "Esta parcela não está em aberto.", 409);
    const u = await tx.receivable.update({ where: { id: rec.id }, data: { status: "RECEBIDO", receivedAt: r.data.receivedAt, receivedCents: r.data.amount, method: r.data.method, note: r.data.note } });
    await audit(tx, actorId, "receivable.receive", rec.id, { status: rec.status }, { status: "RECEBIDO", receivedCents: r.data.amount, method: r.data.method });
    return u;
  });
}

export async function reverseReceipt(actorId: string, receivableId: string) {
  return db.$transaction(async (tx) => {
    const rec = await tx.receivable.findUnique({ where: { id: receivableId } });
    if (!rec || rec.status !== "RECEBIDO") throw new AppError("INVALID", "Esta parcela não está recebida.", 409);
    const u = await tx.receivable.update({ where: { id: rec.id }, data: { status: "ABERTO", receivedAt: null, receivedCents: null, method: null, note: null } });
    await audit(tx, actorId, "receivable.reverse", rec.id, { status: "RECEBIDO", receivedCents: rec.receivedCents, method: rec.method }, { status: "ABERTO" });
    return u;
  });
}

export async function setDueDate(actorId: string, receivableId: string, date: string) {
  const d = dateIn.safeParse(date);
  if (!d.success) throw new AppError("VALIDATION", "Informe uma data válida.", 422);
  return db.$transaction(async (tx) => {
    const rec = await tx.receivable.findUnique({ where: { id: receivableId } });
    if (!rec || rec.status !== "ABERTO") throw new AppError("INVALID", "Só é possível alterar o vencimento de parcelas em aberto.", 409);
    const due = new Date(`${date}T00:00:00-03:00`);
    const u = await tx.receivable.update({ where: { id: rec.id }, data: { dueDate: due } });
    await audit(tx, actorId, "receivable.due", rec.id, { dueDate: rec.dueDate }, { dueDate: due });
    return u;
  });
}
