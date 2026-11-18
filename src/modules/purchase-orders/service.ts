import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseMoney } from "@/modules/products/cost";
import {
  LEAD_DAYS, PO_STATE, brDate, receivedPct, checkReceipt, deadline, dueDate, fmtQty, isIsoDay, itemProgress, parseQty, poCode, poState, spDay, supplierPerformance, type PoState,
} from "./rules";

type Tx = Prisma.TransactionClient;
const txt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const day = z.string().refine(isIsoDay, "Data inválida.");
const optDay = z.string().optional().transform((v) => (v ? v : null)).refine((v) => v == null || isIsoDay(v), "Data inválida.");

const itemSchema = z.object({
  id: z.string().optional().nullable(),
  variantId: z.string().optional().nullable().transform((v) => v || null),
  description: z.string().trim().max(200).default(""),
  unit: z.string().trim().max(12).default("un").transform((v) => v || "un"),
  quantity: z.union([z.string(), z.number()]).transform((v) => parseQty(v)),
  unitCost: z.string().optional().transform((v) => (v && v.trim() ? parseMoney(v) ?? -1 : null)),
  notes: txt(300),
});
export const poInputSchema = z.object({
  supplierId: z.string().min(1, "Escolha o fornecedor."),
  orderedAt: day,
  promisedAt: optDay,
  buyer: txt(80),
  supplierRef: txt(60),
  paymentTerms: txt(120),
  notes: txt(2000),
  items: z.array(itemSchema).min(1, "Inclua pelo menos um item.").max(100, "Máximo de 100 itens por OC."),
});
export type PoInput = z.input<typeof poInputSchema>;

const ev = (tx: Tx, orderId: string, actorId: string, kind: string, text: string) => tx.purchaseOrderEvent.create({ data: { orderId, actorId, kind, text } });
const dBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const num = (d: Prisma.Decimal | number) => Number(d);

/** Normaliza e valida itens; para produtos do cadastro, busca nome/SKU e o prazo do vínculo com o fornecedor. */
async function buildItems(tx: Tx, supplierId: string, raw: z.output<typeof itemSchema>[]) {
  const variantIds = [...new Set(raw.map((i) => i.variantId).filter(Boolean) as string[])];
  const variants = variantIds.length
    ? await tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, product: { select: { name: true, suppliers: { where: { supplierId }, select: { leadTime: true } } } } } })
    : [];
  return raw.map((i, position) => {
    const v = i.variantId ? variants.find((x) => x.id === i.variantId) : null;
    if (i.variantId && !v) throw new AppError("VALIDATION", "Um dos produtos escolhidos não existe mais. Atualize a página.", 422);
    const description = (i.description || (v ? `${v.sku} · ${v.product.name}` : "")).slice(0, 200);
    if (!description) throw new AppError("VALIDATION", `Item ${position + 1}: escolha um produto ou descreva o item.`, 422);
    if (i.quantity == null || i.quantity <= 0) throw new AppError("VALIDATION", `“${description}”: informe a quantidade.`, 422);
    if (i.unitCost != null && i.unitCost < 0) throw new AppError("VALIDATION", `“${description}”: valor inválido.`, 422);
    const lt = v?.product.suppliers[0]?.leadTime;
    return { id: i.id || null, variantId: v?.id ?? null, description, unit: i.unit, quantity: i.quantity, unitCostCents: i.unitCost, leadDays: lt ? LEAD_DAYS[lt] ?? null : null, notes: i.notes, position };
  });
}

function checkDates(orderedAt: string, promisedAt: string | null) {
  if (promisedAt && promisedAt < orderedAt) throw new AppError("VALIDATION", "A data prometida não pode ser anterior à data do pedido.", 422);
}

export async function createPurchaseOrder(actorId: string, input: unknown) {
  const p = poInputSchema.safeParse(input);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const f = p.data;
  checkDates(f.orderedAt, f.promisedAt);
  return db.$transaction(async (tx) => {
    const sup = await tx.supplier.findUnique({ where: { id: f.supplierId }, select: { id: true, isActive: true } });
    if (!sup) throw new AppError("VALIDATION", "Fornecedor não encontrado.", 422);
    const items = await buildItems(tx, f.supplierId, f.items);
    const promised = f.promisedAt ? brDate(f.promisedAt) : null;
    const po = await tx.purchaseOrder.create({
      data: {
        supplierId: f.supplierId, orderedAt: brDate(f.orderedAt), promisedAt: promised, originalPromisedAt: promised,
        buyer: f.buyer, supplierRef: f.supplierRef, paymentTerms: f.paymentTerms, notes: f.notes, createdById: actorId,
        items: { create: items.map(({ id: _id, ...i }) => i) },
      },
    });
    await ev(tx, po.id, actorId, "criada", `OC criada com ${items.length} ${items.length === 1 ? "item" : "itens"}${promised ? `, entrega prometida para ${dBR(promised)}` : ", sem data prometida"}.`);
    await tx.auditLog.create({ data: { actorId, action: "purchase_order.create", entity: "PurchaseOrder", entityId: po.id, after: { number: po.number, supplierId: f.supplierId, items: items.length } } });
    return { id: po.id, code: poCode(po.number) };
  });
}

/** Edita uma OC em aberto. Itens já recebidos não podem ser removidos nem ficar com quantidade menor que o recebido. */
export async function updatePurchaseOrder(actorId: string, id: string, input: unknown) {
  const p = poInputSchema.safeParse(input);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const f = p.data;
  checkDates(f.orderedAt, f.promisedAt);
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { received: true } } } });
    if (!po) throw new AppError("NOT_FOUND", "Ordem de compra não encontrada.", 404);
    if (po.status !== "ABERTA") throw new AppError("LOCKED", "Só é possível editar uma OC em aberto. Reabra a OC para editar.", 409);
    const hasReceipts = po.items.some((i) => i.received.length);
    if (hasReceipts && f.supplierId !== po.supplierId) throw new AppError("LOCKED", "Esta OC já tem entregas registradas: o fornecedor não pode ser trocado.", 409);
    const items = await buildItems(tx, f.supplierId, f.items);
    const keep = new Set(items.map((i) => i.id).filter(Boolean));
    for (const old of po.items) {
      const rec = old.received.reduce((a, l) => a + num(l.quantity), 0);
      if (!keep.has(old.id) && rec > 0) throw new AppError("LOCKED", `“${old.description}” já tem entrega registrada e não pode ser removido.`, 409);
      const next = items.find((i) => i.id === old.id);
      if (next && next.quantity + 1e-9 < rec) throw new AppError("VALIDATION", `“${old.description}”: a quantidade não pode ser menor que o já recebido (${fmtQty(rec)}).`, 422);
    }
    await tx.purchaseOrderItem.deleteMany({ where: { orderId: id, id: { notIn: [...keep] as string[] } } });
    for (const { id: itemId, ...i } of items) {
      if (itemId && po.items.some((o) => o.id === itemId)) await tx.purchaseOrderItem.update({ where: { id: itemId }, data: i });
      else await tx.purchaseOrderItem.create({ data: { ...i, orderId: id } });
    }
    const promised = f.promisedAt ? brDate(f.promisedAt) : null;
    const dateChanged = (po.promisedAt ? spDay(po.promisedAt) : null) !== f.promisedAt;
    await tx.purchaseOrder.update({
      where: { id },
      data: { supplierId: f.supplierId, orderedAt: brDate(f.orderedAt), promisedAt: promised, originalPromisedAt: po.originalPromisedAt ?? promised, buyer: f.buyer, supplierRef: f.supplierRef, paymentTerms: f.paymentTerms, notes: f.notes },
    });
    await ev(tx, id, actorId, "editada", "Dados da OC editados.");
    if (dateChanged) await ev(tx, id, actorId, "data", `Data prometida ${po.promisedAt ? `alterada de ${dBR(po.promisedAt)}` : "definida"} para ${promised ? dBR(promised) : "sem data"} (na edição da OC).`);
    await maybeAutoClose(tx, id, actorId);
    await tx.auditLog.create({ data: { actorId, action: "purchase_order.update", entity: "PurchaseOrder", entityId: id } });
    return { id };
  });
}

/** Fornecedor remarcou a entrega: guarda a nova data e o motivo no histórico. */
export async function changePromisedDate(actorId: string, id: string, input: { promisedAt?: string; reason?: string }) {
  const reason = (input.reason ?? "").trim().slice(0, 300);
  if (!isIsoDay(input.promisedAt)) throw new AppError("VALIDATION", "Informe a nova data prometida.", 422);
  if (!reason) throw new AppError("VALIDATION", "Informe o motivo da mudança (ex.: atraso na produção do fornecedor).", 422);
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new AppError("NOT_FOUND", "Ordem de compra não encontrada.", 404);
    if (po.status !== "ABERTA") throw new AppError("LOCKED", "A OC não está em aberto.", 409);
    if (input.promisedAt! < spDay(po.orderedAt)) throw new AppError("VALIDATION", "A data prometida não pode ser anterior à data do pedido.", 422);
    const to = brDate(input.promisedAt!);
    await tx.purchaseOrder.update({ where: { id }, data: { promisedAt: to, originalPromisedAt: po.originalPromisedAt ?? to } });
    await ev(tx, id, actorId, "data", `Data prometida ${po.promisedAt ? `alterada de ${dBR(po.promisedAt)}` : "definida"} para ${dBR(to)}. Motivo: ${reason}`);
    await tx.auditLog.create({ data: { actorId, action: "purchase_order.date", entity: "PurchaseOrder", entityId: id, before: { promisedAt: po.promisedAt }, after: { promisedAt: to, reason } } });
  });
}

async function progressOf(tx: Tx, id: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { received: true }, orderBy: { position: "asc" } } } });
  if (!po) throw new AppError("NOT_FOUND", "Ordem de compra não encontrada.", 404);
  const prog = itemProgress(po.items.map((i) => ({ id: i.id, quantity: num(i.quantity) })), po.items.flatMap((i) => i.received.map((l) => ({ itemId: i.id, quantity: num(l.quantity) }))));
  return { po, prog };
}

/** Tudo recebido → encerra sozinha; saldo voltou a existir numa OC encerrada automaticamente → reabre. */
async function maybeAutoClose(tx: Tx, id: string, actorId: string) {
  const { po, prog } = await progressOf(tx, id);
  const full = prog.length > 0 && prog.every((p) => p.pending <= 0);
  if (po.status === "ABERTA" && full) {
    const last = await tx.purchaseOrderReceipt.findFirst({ where: { orderId: id }, orderBy: { receivedAt: "desc" } });
    await tx.purchaseOrder.update({ where: { id }, data: { status: "ENCERRADA", closedAt: last?.receivedAt ?? new Date(), closeReason: null } });
    await ev(tx, id, actorId, "encerrada", "Todos os itens foram recebidos: OC concluída.");
  } else if (po.status === "ENCERRADA" && !po.closeReason && !full) {
    await tx.purchaseOrder.update({ where: { id }, data: { status: "ABERTA", closedAt: null } });
    await ev(tx, id, actorId, "reaberta", "OC reaberta: voltou a haver saldo a receber.");
  }
}

export const receiptSchema = z.object({
  receivedAt: day,
  invoiceNumber: txt(40),
  receivedBy: txt(80),
  notes: txt(500),
  lines: z.array(z.object({ itemId: z.string(), quantity: z.union([z.string(), z.number()]).transform((v) => parseQty(v) ?? 0) })),
});

export async function registerReceipt(actorId: string, id: string, input: unknown) {
  const p = receiptSchema.safeParse(input);
  if (!p.success) throw new AppError("VALIDATION", p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const f = p.data;
  return db.$transaction(async (tx) => {
    const { po, prog } = await progressOf(tx, id);
    if (po.status !== "ABERTA") throw new AppError("LOCKED", "A OC não está em aberto. Reabra a OC para registrar entrega.", 409);
    if (f.receivedAt < spDay(po.orderedAt)) throw new AppError("VALIDATION", "A data da entrega não pode ser anterior à data do pedido.", 422);
    if (f.receivedAt > spDay(new Date())) throw new AppError("VALIDATION", "A data da entrega não pode ser futura.", 422);
    const err = checkReceipt(prog, f.lines, (itemId) => po.items.find((i) => i.id === itemId)?.description ?? "Item");
    if (err) throw new AppError("VALIDATION", err, 422);
    const lines = f.lines.filter((l) => l.quantity > 0);
    const rec = await tx.purchaseOrderReceipt.create({
      data: { orderId: id, receivedAt: brDate(f.receivedAt), invoiceNumber: f.invoiceNumber, receivedBy: f.receivedBy, notes: f.notes, createdById: actorId, lines: { create: lines } },
    });
    const total = lines.length;
    await ev(tx, id, actorId, "entrega", `Entrega de ${dBR(rec.receivedAt)} registrada (${total} ${total === 1 ? "item" : "itens"}${f.invoiceNumber ? `, NF ${f.invoiceNumber}` : ""}).`);
    await maybeAutoClose(tx, id, actorId);
    await tx.auditLog.create({ data: { actorId, action: "purchase_order.receipt", entity: "PurchaseOrder", entityId: id, after: { receiptId: rec.id, lines } } });
    return { id: rec.id };
  });
}

/** Desfaz uma entrega lançada errado. */
export async function deleteReceipt(actorId: string, receiptId: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.purchaseOrderReceipt.findUnique({ where: { id: receiptId }, include: { order: true, lines: true } });
    if (!r) throw new AppError("NOT_FOUND", "Entrega não encontrada.", 404);
    if (r.order.status === "CANCELADA") throw new AppError("LOCKED", "A OC está cancelada.", 409);
    await tx.purchaseOrderReceipt.delete({ where: { id: receiptId } });
    await ev(tx, r.orderId, actorId, "entrega_desfeita", `Entrega de ${dBR(r.receivedAt)} excluída${r.invoiceNumber ? ` (NF ${r.invoiceNumber})` : ""}.`);
    await maybeAutoClose(tx, r.orderId, actorId);
    await tx.auditLog.create({ data: { actorId, action: "purchase_order.receipt_delete", entity: "PurchaseOrder", entityId: r.orderId, before: { receiptId, receivedAt: r.receivedAt, lines: r.lines.map((l) => ({ itemId: l.itemId, quantity: num(l.quantity) })) } } });
    return { orderId: r.orderId };
  });
}

/** Encerrar com saldo: o fornecedor não vai entregar o restante. Cancelar: só sem entregas. Reabrir: volta para em aberto. */
export async function setPoStatus(actorId: string, id: string, action: "encerrar" | "cancelar" | "reabrir", reasonRaw?: string) {
  const reason = (reasonRaw ?? "").trim().slice(0, 300);
  return db.$transaction(async (tx) => {
    const { po, prog } = await progressOf(tx, id);
    const anyReceived = prog.some((p) => p.received > 0);
    if (action === "encerrar") {
      if (po.status !== "ABERTA") throw new AppError("LOCKED", "A OC não está em aberto.", 409);
      if (!reason) throw new AppError("VALIDATION", "Informe o motivo do encerramento com saldo.", 422);
      if (!anyReceived) throw new AppError("VALIDATION", "Nenhum item foi recebido. Para desistir da compra, use “Cancelar OC”.", 422);
      await tx.purchaseOrder.update({ where: { id }, data: { status: "ENCERRADA", closedAt: new Date(), closeReason: reason } });
      await ev(tx, id, actorId, "encerrada", `OC encerrada com saldo pendente. Motivo: ${reason}`);
    } else if (action === "cancelar") {
      if (po.status !== "ABERTA") throw new AppError("LOCKED", "A OC não está em aberto.", 409);
      if (anyReceived) throw new AppError("LOCKED", "Esta OC já tem entregas. Use “Encerrar com saldo” para finalizar sem o restante.", 409);
      if (!reason) throw new AppError("VALIDATION", "Informe o motivo do cancelamento.", 422);
      await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELADA", canceledAt: new Date(), cancelReason: reason } });
      await ev(tx, id, actorId, "cancelada", `OC cancelada. Motivo: ${reason}`);
    } else {
      if (po.status === "ABERTA") throw new AppError("LOCKED", "A OC já está em aberto.", 409);
      if (po.status === "ENCERRADA" && prog.every((p) => p.pending <= 0)) throw new AppError("LOCKED", "Todos os itens já foram recebidos. Para reabrir, exclua a entrega lançada errado.", 409);
      await tx.purchaseOrder.update({ where: { id }, data: { status: "ABERTA", closedAt: null, closeReason: null, canceledAt: null, cancelReason: null } });
      await ev(tx, id, actorId, "reaberta", "OC reaberta.");
    }
    await tx.auditLog.create({ data: { actorId, action: `purchase_order.${action}`, entity: "PurchaseOrder", entityId: id, after: { reason: reason || null } } });
  });
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export const poFilterSchema = z.object({
  situacao: z.enum(["abertas", "atrasadas", "semana", "sem_data", "parciais", "concluidas", "canceladas", "todas"]).optional().catch(undefined),
  fornecedor: z.string().max(40).optional(),
  q: z.string().max(80).optional(),
  de: z.string().optional().refine((v) => !v || isIsoDay(v)).catch(undefined),
  ate: z.string().optional().refine((v) => !v || isIsoDay(v)).catch(undefined),
  aba: z.enum(["ordens", "fornecedores"]).optional().catch(undefined),
});
export type PoFilter = z.infer<typeof poFilterSchema>;

const listInclude = {
  supplier: { select: { id: true, legalName: true, tradeName: true } },
  items: { orderBy: { position: "asc" as const }, select: { id: true, description: true, unit: true, quantity: true, unitCostCents: true, leadDays: true, received: { select: { quantity: true } } } },
  receipts: { select: { receivedAt: true }, orderBy: [{ receivedAt: "desc" as const }, { createdAt: "desc" as const }] },
};
type ListRow = Prisma.PurchaseOrderGetPayload<{ include: typeof listInclude }>;

function derive(po: ListRow, now = new Date()) {
  const prog = itemProgress(po.items.map((i) => ({ id: i.id, quantity: num(i.quantity) })), po.items.flatMap((i) => i.received.map((l) => ({ itemId: i.id, quantity: num(l.quantity) }))));
  const state: PoState = poState(po, prog);
  const due = dueDate(po, po.items.map((i) => i.leadDays));
  const lastReceiptAt = po.receipts[0]?.receivedAt ?? null;
  const dl = deadline(state, due.date, lastReceiptAt, now);
  const priced = po.items.filter((i) => i.unitCostCents != null);
  const totalCents = priced.length ? priced.reduce((a, i) => a + Math.round((i.unitCostCents ?? 0) * num(i.quantity)), 0) : null;
  return {
    id: po.id, code: poCode(po.number), number: po.number, status: po.status, state, stateLabel: PO_STATE[state].label, stateTone: PO_STATE[state].tone,
    supplierId: po.supplierId, supplierName: po.supplier.tradeName || po.supplier.legalName,
    orderedAt: po.orderedAt, promisedAt: po.promisedAt, originalPromisedAt: po.originalPromisedAt, due: due.date, dueEstimated: due.estimated,
    rescheduled: !!(po.promisedAt && po.originalPromisedAt && spDay(po.promisedAt) !== spDay(po.originalPromisedAt)),
    buyer: po.buyer, supplierRef: po.supplierRef, lastReceiptAt, closedAt: po.closedAt, canceledAt: po.canceledAt,
    items: po.items.map((i) => ({ description: i.description, unit: i.unit, ...prog.find((p) => p.id === i.id)! })),
    itemsCount: po.items.length, receivedPct: receivedPct(prog),
    totalCents, partialValue: priced.length > 0 && priced.length < po.items.length,
    open: po.status === "ABERTA", ...dl,
  };
}
export type PoRow = ReturnType<typeof derive>;

export async function purchaseOrdersView(f: PoFilter, now = new Date()) {
  const all = await db.purchaseOrder.findMany({ include: listInclude, orderBy: { number: "desc" }, take: 2000 });
  const rows = all.map((p) => derive(p, now));
  const open = rows.filter((r) => r.open);
  const in7 = (r: PoRow) => r.open && !r.late && r.daysLeft != null && r.daysLeft <= 7;
  const since90 = now.getTime() - 90 * 86_400_000;
  const recentDone = rows.filter((r) => (r.state === "ENTREGUE" || r.state === "ENCERRADA_SALDO") && r.lastReceiptAt && r.lastReceiptAt.getTime() >= since90 && r.onTime != null);
  const summary = {
    open: open.length,
    late: open.filter((r) => r.late).length,
    week: open.filter(in7).length,
    noDate: open.filter((r) => !r.due).length,
    partial: open.filter((r) => r.state === "PARCIAL").length,
    done: rows.filter((r) => r.state === "ENTREGUE" || r.state === "ENCERRADA_SALDO").length,
    onTimePct: recentDone.length ? Math.round((recentDone.filter((r) => r.onTime).length / recentDone.length) * 100) : null,
    onTimeBase: recentDone.length,
  };
  const sit = f.situacao ?? "abertas";
  const q = (f.q ?? "").trim().toLowerCase();
  const n = Number(q.replace(/\D/g, ""));
  const list = rows.filter((r) => {
    if (sit === "abertas" && !r.open) return false;
    if (sit === "atrasadas" && !(r.open && r.late)) return false;
    if (sit === "semana" && !in7(r)) return false;
    if (sit === "sem_data" && !(r.open && !r.due)) return false;
    if (sit === "parciais" && !(r.open && r.state === "PARCIAL")) return false;
    if (sit === "concluidas" && !(r.state === "ENTREGUE" || r.state === "ENCERRADA_SALDO")) return false;
    if (sit === "canceladas" && r.state !== "CANCELADA") return false;
    if (f.fornecedor && r.supplierId !== f.fornecedor) return false;
    if (f.de && spDay(r.orderedAt) < f.de) return false;
    if (f.ate && spDay(r.orderedAt) > f.ate) return false;
    if (q) {
      const hay = [r.code, r.supplierName, r.buyer, r.supplierRef, ...r.items.map((i) => i.description)].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q) && !(/^(oc)?[-\s]?\d+$/i.test(q) && r.number === n)) return false;
    }
    return true;
  });
  // abertas: atrasadas primeiro (mais atrasada no topo), depois pela data-alvo; demais: mais recentes primeiro
  if (["abertas", "atrasadas", "semana", "sem_data", "parciais"].includes(sit)) {
    list.sort((a, b) => Number(b.late) - Number(a.late) || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.number - b.number);
  }
  const suppliers = [...new Map(rows.map((r) => [r.supplierId, r.supplierName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const performance = supplierPerformance(rows.filter((r) => !f.de || spDay(r.orderedAt) >= f.de).filter((r) => !f.ate || spDay(r.orderedAt) <= f.ate).map((r) => ({ supplierId: r.supplierId, supplierName: r.supplierName, orderedAt: r.orderedAt, due: r.due, lastReceiptAt: r.lastReceiptAt, state: r.state, open: r.open, late: r.late })));
  return { rows: list, summary, suppliers, performance, situacao: sit };
}

/** Para o "Meu dia": OCs atrasadas, as que devem chegar no dia e as entregas recebidas no dia. */
export async function purchaseOrdersForDay(day: string) {
  const now = brDate(day);
  const [all, receipts] = await Promise.all([
    db.purchaseOrder.findMany({ where: { status: "ABERTA" }, include: listInclude }),
    db.purchaseOrderReceipt.findMany({
      where: { receivedAt: { gte: new Date(`${day}T00:00:00-03:00`), lt: new Date(new Date(`${day}T00:00:00-03:00`).getTime() + 86_400_000) } },
      orderBy: { createdAt: "asc" },
      include: { order: { select: { id: true, number: true, supplier: { select: { legalName: true, tradeName: true } } } }, lines: { include: { item: { select: { description: true, unit: true } } } } },
    }),
  ]);
  const rows = all.map((p) => derive(p, now));
  return {
    late: rows.filter((r) => r.late).sort((a, b) => b.lateDays - a.lateDays),
    today: rows.filter((r) => r.daysLeft === 0),
    received: receipts.map((r) => ({ id: r.id, orderId: r.order.id, code: poCode(r.order.number), supplierName: r.order.supplier.tradeName || r.order.supplier.legalName, invoiceNumber: r.invoiceNumber, lines: r.lines.map((l) => ({ description: l.item.description, unit: l.item.unit, quantity: num(l.quantity) })) })),
  };
}

export async function getPurchaseOrder(id: string, now = new Date()) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      ...listInclude,
      items: { orderBy: { position: "asc" }, include: { received: { select: { quantity: true } }, variant: { select: { id: true, sku: true, product: { select: { id: true, name: true } } } } } },
      receipts: { orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], include: { lines: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!po) return null;
  const base = derive(po as unknown as ListRow, now);
  const userIds = [...new Set([po.createdById, ...po.receipts.map((r) => r.createdById), ...po.events.map((e) => e.actorId).filter(Boolean) as string[]])];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const who = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const prog = base.items;
  return {
    ...base,
    paymentTerms: po.paymentTerms, notes: po.notes, closeReason: po.closeReason, cancelReason: po.cancelReason, createdBy: who(po.createdById), createdAt: po.createdAt,
    detailItems: po.items.map((i, k) => ({
      id: i.id, variantId: i.variantId, sku: i.variant?.sku ?? null, productId: i.variant?.product.id ?? null, description: i.description, unit: i.unit,
      quantity: num(i.quantity), unitCostCents: i.unitCostCents, leadDays: i.leadDays, notes: i.notes, received: prog[k].received, pending: prog[k].pending,
    })),
    receipts: po.receipts.map((r) => ({
      id: r.id, receivedAt: r.receivedAt, invoiceNumber: r.invoiceNumber, receivedBy: r.receivedBy, notes: r.notes, by: who(r.createdById),
      lines: r.lines.map((l) => ({ itemId: l.itemId, quantity: num(l.quantity), description: po.items.find((i) => i.id === l.itemId)?.description ?? "Item", unit: po.items.find((i) => i.id === l.itemId)?.unit ?? "" })),
    })),
    events: po.events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.createdAt, by: who(e.actorId) })),
    supplier: po.supplier,
  };
}

/** Dados para o formulário: fornecedores ativos e produtos (com o prazo de cada fornecedor). */
export async function poFormData() {
  const [suppliers, variants] = await Promise.all([
    db.supplier.findMany({ where: { isActive: true }, orderBy: { legalName: "asc" }, select: { id: true, legalName: true, tradeName: true } }),
    db.productVariant.findMany({
      where: { product: { deletedAt: null } }, orderBy: { sku: "asc" },
      select: { id: true, sku: true, product: { select: { name: true, suppliers: { select: { supplierId: true, leadTime: true, supplierCode: true } } } } },
    }),
  ]);
  return {
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.tradeName || s.legalName })),
    variants: variants.map((v) => ({ id: v.id, sku: v.sku, name: v.product.name, links: v.product.suppliers.map((l) => ({ supplierId: l.supplierId, leadDays: l.leadTime ? LEAD_DAYS[l.leadTime] ?? null : null, leadLabel: l.leadTime, code: l.supplierCode })) })),
  };
}
