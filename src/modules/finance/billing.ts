import "server-only";
import { appendUploads, formUploads } from "@/modules/integrations/storage/uploads";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dayRange } from "@/modules/quotes/funnel";
import { attachDocument, removeDocument } from "./documents";
import { RECEIPT_METHODS, dayStartBR } from "./receivables";
import { defaultParcelMethod, effectiveMethod, invoiceAlert, normalizeInvoiceNumber, parcelStage, type ParcelStage } from "./billing-rules";

const brDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const atNoonBR = (iso: string) => new Date(`${iso}T12:00:00-03:00`);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const filesOf = (form: FormData) => formUploads(form);

/** Só vendas ativas do funil de orçamentos (Mercado Livre e site faturam pelo próprio canal). */
async function funnelSale(id: string) {
  const s = await db.sale.findUnique({ where: { id } });
  if (!s || !s.quoteId) throw new AppError("NOT_FOUND", "Venda não encontrada.", 404);
  if (s.status !== "ATIVA") throw new AppError("INVALID", "Venda cancelada.", 409);
  return s;
}

/** Informar a NF (uma por venda), com PDF/XML opcional. Pode ser chamado de novo para corrigir. */
export async function setInvoice(actor: { id: string; name: string }, form: FormData) {
  const p = z.object({ saleId: z.string().min(1), number: z.string().trim().min(1, "Informe o número da NF."), date: isoDay })
    .safeParse({ saleId: form.get("saleId"), number: form.get("number"), date: form.get("date") });
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const number = normalizeInvoiceNumber(p.data.number);
  if (!number) throw new AppError("VALIDATION", "Número da NF inválido (até 9 números).", 422);
  if (p.data.date > brDay(new Date())) throw new AppError("VALIDATION", "A data de emissão não pode ser futura.", 422);
  const sale = await funnelSale(p.data.saleId);
  const dup = await db.sale.findFirst({ where: { invoiceNumber: number, status: "ATIVA", id: { not: sale.id } }, select: { code: true } });
  if (dup) throw new AppError("DUPLICATE", `A NF ${number} já está informada na venda ${dup.code}. Confira o número.`, 409);
  if (filesOf(form).length) {
    const fd = new FormData(); fd.set("saleId", sale.id); fd.set("type", "NOTA_FISCAL"); fd.set("description", `NF ${number}`); appendUploads(fd, filesOf(form));
    await attachDocument(actor, fd);
  }
  await db.$transaction([
    db.sale.update({ where: { id: sale.id }, data: { invoiceNumber: number, invoiceDate: atNoonBR(p.data.date), invoicedAt: new Date(), invoicedBy: actor.name } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "sale.invoice", entity: "Sale", entityId: sale.id, before: { invoiceNumber: sale.invoiceNumber }, after: { invoiceNumber: number, date: p.data.date } } }),
  ]);
  return { number };
}
export async function clearInvoice(actorId: string, saleId: string) {
  const sale = await funnelSale(saleId);
  await db.$transaction([
    db.sale.update({ where: { id: sale.id }, data: { invoiceNumber: null, invoiceDate: null, invoicedAt: null, invoicedBy: null } }),
    db.auditLog.create({ data: { actorId, action: "sale.invoice.clear", entity: "Sale", entityId: sale.id, before: { invoiceNumber: sale.invoiceNumber } } }),
  ]);
}

async function parcelOf(id: string) {
  const r = await db.receivable.findUnique({ where: { id }, include: { sale: true } });
  if (!r || !r.sale.quoteId) throw new AppError("NOT_FOUND", "Parcela não encontrada.", 404);
  if (r.sale.status !== "ATIVA") throw new AppError("INVALID", "Venda cancelada.", 409);
  return r;
}
/** Registrar o boleto da parcela: número/linha digitável e/ou PDF do boleto (ao menos um). */
export async function setBoleto(actor: { id: string; name: string }, form: FormData) {
  const p = z.object({ receivableId: z.string().min(1), number: z.string().trim().max(80).optional().nullable().transform((v) => v || null) })
    .safeParse({ receivableId: form.get("receivableId"), number: form.get("number") });
  if (!p.success) throw new AppError("VALIDATION", "Dados inválidos.", 422);
  const files = filesOf(form);
  if (!p.data.number && !files.length) throw new AppError("VALIDATION", "Informe o número do boleto ou anexe o PDF.", 422);
  const r = await parcelOf(p.data.receivableId);
  if (r.status !== "ABERTO") throw new AppError("INVALID", "Esta parcela não está em aberto.", 409);
  if (files.length) {
    const fd = new FormData(); fd.set("saleId", r.saleId); fd.set("receivableId", r.id); fd.set("type", "BOLETO"); fd.set("description", `Boleto ${r.label}`); appendUploads(fd, files);
    await attachDocument(actor, fd);
  }
  await db.$transaction([
    db.receivable.update({ where: { id: r.id }, data: { boletoNumber: p.data.number ?? r.boletoNumber, boletoIssuedAt: r.boletoIssuedAt ?? new Date(), boletoIssuedBy: actor.name, plannedMethod: r.plannedMethod ?? "Boleto" } }),
    db.auditLog.create({ data: { actorId: actor.id, action: "receivable.boleto", entity: "Receivable", entityId: r.id, after: { number: p.data.number, files: files.length } } }),
  ]);
}
/** Desfaz o boleto da parcela: limpa o número e remove o(s) PDF(s) de boleto anexados a ela. */
export async function clearBoleto(actorId: string, receivableId: string) {
  const r = await parcelOf(receivableId);
  const docs = await db.financeDocument.findMany({ where: { receivableId: r.id, type: "BOLETO", deletedAt: null }, select: { id: true } });
  await db.$transaction([
    db.receivable.update({ where: { id: r.id }, data: { boletoNumber: null, boletoIssuedAt: null, boletoIssuedBy: null } }),
    db.auditLog.create({ data: { actorId, action: "receivable.boleto.clear", entity: "Receivable", entityId: r.id, before: { number: r.boletoNumber, documents: docs.length } } }),
  ]);
  for (const d of docs) await removeDocument(actorId, d.id); // apaga também o arquivo
}
/** Trocar a forma prevista da parcela (ex.: cliente pediu Pix em vez de boleto). Vazio = volta ao padrão da condição. */
export async function setPlannedMethod(actorId: string, receivableId: string, method: string) {
  if (method && !RECEIPT_METHODS.includes(method)) throw new AppError("VALIDATION", "Forma inválida.", 422);
  const r = await parcelOf(receivableId);
  await db.$transaction([
    db.receivable.update({ where: { id: r.id }, data: { plannedMethod: method || null } }),
    db.auditLog.create({ data: { actorId, action: "receivable.method", entity: "Receivable", entityId: r.id, before: { plannedMethod: r.plannedMethod }, after: { plannedMethod: method || null } } }),
  ]);
}

export const BILLING_STEPS = ["faturar", "boletos", "emitidos", "atraso", "recebido"] as const;
export type BillingStep = (typeof BILLING_STEPS)[number];
export const billingFilterSchema = z.object({
  etapa: z.enum(BILLING_STEPS).catch("faturar"),
  q: z.string().trim().max(120).optional().catch(undefined), pedido: z.string().max(60).optional().catch(undefined),
  de: z.string().optional().catch(undefined), ate: z.string().optional().catch(undefined), // período do "recebido"
});

/** Tudo da esteira: vendas a faturar e parcelas por etapa, com os números do topo. */
export async function billingView(f: z.infer<typeof billingFilterSchema>) {
  const t = f.q?.trim();
  const where: Prisma.SaleWhereInput = {
    status: "ATIVA", quoteId: { not: null },
    ...(f.pedido ? { category: f.pedido === "sem" ? null : f.pedido } : {}),
    ...(t ? { OR: [{ code: { contains: t, mode: "insensitive" } }, { clientName: { contains: t, mode: "insensitive" } }, { invoiceNumber: { contains: t.replace(/\D/g, "") || t } }] } : {}),
  };
  const sales = await db.sale.findMany({
    where, orderBy: { closedAt: "asc" }, take: 3000,
    include: { receivables: { orderBy: { position: "asc" }, include: { documents: { where: { deletedAt: null, type: "BOLETO" }, select: { id: true, fileName: true } } } },
      documents: { where: { deletedAt: null, type: "NOTA_FISCAL" }, select: { id: true, fileName: true } } },
  });
  const deliveries = await db.delivery.findMany({ where: { quoteId: { in: sales.map((s) => s.quoteId!) } }, select: { quoteId: true, status: true, scheduledAt: true } });
  const dByQuote = new Map(deliveries.map((d) => [d.quoteId, d]));
  const today = dayStartBR(new Date());
  const now = new Date(); const monthStart = `${brDay(now).slice(0, 8)}01`;
  const recRange = dayRange(f.de ?? monthStart, f.ate ?? brDay(now))!;

  const toInvoice = sales.filter((s) => !s.invoiceNumber).map((s) => ({
    id: s.id, code: s.code, clientName: s.clientName, category: s.category, closedAt: s.closedAt, totalCents: s.totalCents, paymentTerms: s.paymentTerms,
    nfAttached: s.documents.length > 0, alert: invoiceAlert(dByQuote.get(s.quoteId!) ?? null), days: Math.floor((today.getTime() - dayStartBR(s.closedAt).getTime()) / 86_400_000),
  }));
  const parcels = sales.flatMap((s) => s.receivables.map((r) => {
    const stage = parcelStage({ ...r, hasBoletoDoc: r.documents.length > 0 }, s.paymentTerms);
    return {
      id: r.id, saleId: s.id, code: s.code, clientName: s.clientName, invoiceNumber: s.invoiceNumber, paymentTerms: s.paymentTerms, label: r.label, dueDate: r.dueDate, amountCents: r.amountCents,
      status: r.status, receivedAt: r.receivedAt, receivedCents: r.receivedCents, method: r.method, plannedMethod: r.plannedMethod, effective: effectiveMethod(r, s.paymentTerms), defaultMethod: defaultParcelMethod(s.paymentTerms, r.label),
      boletoNumber: r.boletoNumber, boletoIssuedAt: r.boletoIssuedAt, boletoDocs: r.documents, stage: stage as ParcelStage, overdue: r.status === "ABERTO" && !!r.dueDate && r.dueDate < today,
    };
  }));
  const sum = (l: { amountCents?: number; totalCents?: number; receivedCents?: number | null }[], k: "amountCents" | "totalCents" | "receivedCents" = "amountCents") => l.reduce((a, x) => a + ((x[k] as number | null | undefined) ?? (x.amountCents ?? 0)), 0);
  const aEmitir = parcels.filter((p) => p.stage === "boleto_a_emitir").sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));
  const emitidos = parcels.filter((p) => p.stage === "boleto_emitido").sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));
  const atraso = parcels.filter((p) => p.overdue).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const recebido = parcels.filter((p) => p.status === "RECEBIDO" && p.receivedAt && p.receivedAt >= recRange.gte! && p.receivedAt < recRange.lt!).sort((a, b) => b.receivedAt!.getTime() - a.receivedAt!.getTime());
  const semForma = parcels.filter((p) => p.stage === "forma_a_definir");
  return {
    toInvoice, aEmitir, emitidos, atraso, recebido, semForma,
    kpis: {
      faturar: { count: toInvoice.length, cents: sum(toInvoice, "totalCents"), urgent: toInvoice.filter((s) => s.alert?.tone === "danger").length },
      boletos: { count: aEmitir.length, cents: sum(aEmitir), dueSoon: aEmitir.filter((p) => p.dueDate && p.dueDate.getTime() - today.getTime() <= 7 * 86_400_000).length },
      emitidos: { count: emitidos.length, cents: sum(emitidos), overdue: emitidos.filter((p) => p.overdue).length },
      atraso: { count: atraso.length, cents: sum(atraso) },
      recebido: { count: recebido.length, cents: recebido.reduce((a, p) => a + (p.receivedCents ?? p.amountCents), 0), from: f.de ?? monthStart, to: f.ate ?? brDay(now) },
    },
  };
}

/** Contagens para o Meu dia e o Dashboard. */
export async function billingPending() {
  const v = await billingView({ etapa: "faturar" });
  return { faturar: v.kpis.faturar, boletos: v.kpis.boletos, semForma: v.semForma.length };
}
