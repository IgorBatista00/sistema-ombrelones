import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatBRL as brl } from "@/lib/money";
import { AppError } from "@/lib/errors";
import { DEFAULT_STOCK_DISPLAY, MOVEMENT_REASONS, allocatePurchase, costVariationBps, newAverageCost, planMovement, type StockDisplay } from "./movements-rules";

export const movementSchema = z.object({
  variantId: z.string().min(1),
  type: z.enum(["ENTRADA", "SAIDA", "AJUSTE"]),
  quantity: z.coerce.number().int("Use números inteiros").min(0),
  reason: z.string().min(1, "Escolha o motivo"),
  notes: z.string().trim().max(300).optional().nullable(),
  reference: z.string().trim().max(60).optional().nullable(),
}).refine((v) => MOVEMENT_REASONS[v.type].includes(v.reason), { message: "Motivo inválido para o tipo", path: ["reason"] });

/**
 * Movimentação manual. A linha de saldo é travada (SELECT … FOR UPDATE) para que
 * uma reserva de pedido simultânea não produza saldo negativo nem venda duplicada.
 */
export async function registerMovement(actorId: string, raw: unknown) {
  const r = movementSchema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const m = r.data;
  return db.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: m.variantId }, select: { id: true, sku: true, availability: true } });
    if (!variant) throw new AppError("NOT_FOUND", "SKU não encontrado.", 404);
    if (variant.availability === "MADE_TO_ORDER") throw new AppError("MTO", "Produto sob encomenda não controla saldo.", 409);
    await tx.stockLevel.upsert({ where: { variantId: m.variantId }, update: {}, create: { variantId: m.variantId } });
    const [cur] = await tx.$queryRaw<{ onHand: number; reserved: number; avgCostCents: number | null }[]>`SELECT "onHand", "reserved", "avgCostCents" FROM "StockLevel" WHERE "variantId" = ${m.variantId} FOR UPDATE`;
    const plan = planMovement(cur, m.type, m.quantity);
    if (!plan.ok) throw new AppError("STOCK_RULE", plan.error, 409);
    await tx.stockLevel.update({ where: { variantId: m.variantId }, data: { onHand: plan.after, version: { increment: 1 } } });
    const mov = await tx.stockMovement.create({
      data: { variantId: m.variantId, type: m.type, delta: plan.delta, balanceAfter: plan.after, unitCostCents: cur.avgCostCents, reason: m.reason, notes: m.notes || null, reference: m.reference || null, actorId },
    });
    await tx.auditLog.create({ data: { actorId, action: `stock.${m.type.toLowerCase()}`, entity: "ProductVariant", entityId: m.variantId, before: cur as unknown as Prisma.InputJsonValue, after: { onHand: plan.after, movementId: mov.id } } });
    return { sku: variant.sku, onHand: plan.after, available: Math.max(0, plan.after - cur.reserved) };
  });
}

export async function setMinQty(actorId: string, variantId: string, minQty: number) {
  if (!Number.isInteger(minQty) || minQty < 0 || minQty > 1_000_000) throw new AppError("VALIDATION", "Mínimo inválido.", 422);
  await db.stockLevel.upsert({ where: { variantId }, update: { minQty }, create: { variantId, minQty } });
  await db.auditLog.create({ data: { actorId, action: "stock.min", entity: "ProductVariant", entityId: variantId, after: { minQty } } });
}

/** Configuração de exibição do estoque na loja (Setting "store"). */
export const getStockDisplay = cache(async (): Promise<StockDisplay> => {
  const s = await db.setting.findUnique({ where: { key: "store" } }).catch(() => null);
  const v = (s?.value ?? {}) as Partial<StockDisplay>;
  return {
    mode: v.mode === "faixa" || v.mode === "simples" ? v.mode : DEFAULT_STOCK_DISPLAY.mode,
    lowThreshold: Number.isInteger(v.lowThreshold) && v.lowThreshold! >= 0 ? v.lowThreshold! : DEFAULT_STOCK_DISPLAY.lowThreshold,
  };
});

// =====================================================================
// Entrada de compra (nota fiscal) → custo médio ponderado móvel
// =====================================================================
const centsIn = z.union([z.string(), z.number()]).transform((v) => {
  if (typeof v === "number") return Math.round(v * 100);
  const s = v.trim().replace(/[R$\s]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s || 0);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}).refine((v) => Number.isFinite(v) && v >= 0, "Valor inválido");
const pctIn = z.union([z.string(), z.number()]).transform((v) => Math.round(Number(String(v ?? "0").replace("%", "").replace(",", ".") || 0) * 100))
  .refine((v) => Number.isFinite(v) && v >= 0 && v <= 10_000, "IPI inválido");

export const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Escolha o fornecedor"),
  invoiceNumber: z.string().trim().min(1, "Informe o número da nota fiscal").max(40),
  issuedAt: z.coerce.date(),
  freight: centsIn.default(0),
  other: centsIn.default(0),
  notes: z.string().trim().max(300).optional().nullable(),
  items: z.array(z.object({
    variantId: z.string().min(1, "Escolha o produto"),
    quantity: z.coerce.number().int("Quantidade inteira").min(1, "Quantidade maior que zero"),
    unitCost: centsIn.refine((v) => v > 0, "Custo unitário maior que zero"),
    ipi: pctIn.default(0),
  })).min(1, "Adicione ao menos um item").max(100),
}).refine((v) => new Set(v.items.map((i) => i.variantId)).size === v.items.length, { message: "O mesmo produto aparece duas vezes na nota.", path: ["items"] });

export async function registerPurchase(actorId: string, raw: unknown) {
  const r = purchaseSchema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const p = r.data;
  const supplier = await db.supplier.findUnique({ where: { id: p.supplierId }, select: { id: true, legalName: true, tradeName: true } });
  if (!supplier) throw new AppError("VALIDATION", "Fornecedor não encontrado.", 422);
  const dup = await db.purchase.findUnique({ where: { supplierId_invoiceNumber: { supplierId: p.supplierId, invoiceNumber: p.invoiceNumber } } });
  if (dup) throw new AppError("DUPLICATE_INVOICE", `A nota ${p.invoiceNumber} deste fornecedor já foi lançada.`, 409);

  const lines = allocatePurchase(p.items.map((i) => ({ quantity: i.quantity, unitCostCents: i.unitCost, ipiBps: i.ipi })), p.freight, p.other);
  const totalCents = lines.reduce((a, l) => a + l.gross, 0) + p.freight + p.other;
  const supplierName = supplier.tradeName ?? supplier.legalName;

  return db.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({ data: { supplierId: p.supplierId, invoiceNumber: p.invoiceNumber, issuedAt: p.issuedAt, freightCents: p.freight, otherCents: p.other, totalCents, notes: p.notes || null, createdById: actorId } });
    const results = [];
    for (const [i, it] of p.items.entries()) {
      const l = lines[i];
      const variant = await tx.productVariant.findUnique({ where: { id: it.variantId }, select: { id: true, sku: true, availability: true, product: { select: { costFinalCents: true } } } });
      if (!variant) throw new AppError("NOT_FOUND", "Produto da nota não encontrado.", 404);
      await tx.stockLevel.upsert({ where: { variantId: it.variantId }, update: {}, create: { variantId: it.variantId } });
      const [cur] = await tx.$queryRaw<{ onHand: number; avgCostCents: number | null }[]>`SELECT "onHand", "avgCostCents" FROM "StockLevel" WHERE "variantId" = ${it.variantId} FOR UPDATE`;
      // saldo existente sem médio conhecido: parte do custo do cadastro
      const avgBefore = cur.avgCostCents ?? (cur.onHand > 0 ? variant.product.costFinalCents : null);
      const avgAfter = newAverageCost(cur.onHand, avgBefore, it.quantity, l.unitTotalCents);
      const onHand = cur.onHand + it.quantity;
      await tx.stockLevel.update({ where: { variantId: it.variantId }, data: { onHand, avgCostCents: avgAfter, lastCostCents: l.unitTotalCents, version: { increment: 1 } } });
      await tx.purchaseItem.create({ data: { purchaseId: purchase.id, variantId: it.variantId, quantity: it.quantity, unitCostCents: it.unitCost, ipiBps: it.ipi, allocatedCents: l.allocatedCents, unitTotalCents: l.unitTotalCents, stockBefore: cur.onHand, avgBeforeCents: avgBefore, avgAfterCents: avgAfter } });
      await tx.stockMovement.create({ data: { variantId: it.variantId, type: "ENTRADA", delta: it.quantity, balanceAfter: onHand, unitCostCents: l.unitTotalCents, reason: `Compra · ${supplierName}`, reference: `NF ${p.invoiceNumber}`, notes: `Custo ${brl(l.unitTotalCents)}/un · médio ${avgBefore == null ? "—" : brl(avgBefore)} → ${brl(avgAfter)}`, actorId } });
      results.push({ sku: variant.sku, avgBefore, avgAfter, unitTotal: l.unitTotalCents, variationBps: costVariationBps(l.unitTotalCents, avgBefore) });
    }
    await tx.auditLog.create({ data: { actorId, action: "stock.purchase", entity: "Purchase", entityId: purchase.id, after: { invoice: p.invoiceNumber, totalCents, items: results } as unknown as Prisma.InputJsonValue } });
    return { id: purchase.id, totalCents, items: results };
  });
}
