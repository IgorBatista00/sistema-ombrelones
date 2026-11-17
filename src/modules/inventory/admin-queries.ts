import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { stockState, stockText, type StockDisplay, type StockState } from "./movements-rules";

export interface StockFilters { q?: string; categoria?: string; situacao?: StockState | "" }

/** Uma linha por SKU (variação), com físico, reservado, disponível, mínimo e valor a custo. */
export async function listStock(f: StockFilters, display: StockDisplay) {
  const where: Prisma.ProductVariantWhereInput = { product: { deletedAt: null, ...(f.categoria ? { categoryId: f.categoria } : {}) } };
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }, { product: { code: { contains: q, mode: "insensitive" } } }];
  }
  const variants = await db.productVariant.findMany({
    where,
    include: { stock: true, product: { select: { id: true, name: true, code: true, isActive: true, costFinalCents: true, category: { select: { name: true } }, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } } },
    orderBy: { sku: "asc" },
  });
  const order: Record<StockState, number> = { zero: 0, low: 1, ok: 2, mto: 3 };
  return variants.map((v) => {
    const onHand = v.stock?.onHand ?? 0, reserved = v.stock?.reserved ?? 0, minQty = v.stock?.minQty ?? 0;
    // valor do estoque pelo custo médio; sem médio ainda, usa o custo do cadastro
    const avg = v.stock?.avgCostCents ?? v.product.costFinalCents;
    const last = v.stock?.lastCostCents ?? null;
    const available = Math.max(0, onHand - reserved);
    const state = stockState(v.availability, onHand, reserved, minQty);
    return {
      variantId: v.id, sku: v.sku, variantName: v.name, productId: v.product.id, productName: v.product.name, code: v.product.code,
      category: v.product.category.name, image: v.product.images[0]?.url ?? null, active: v.product.isActive && v.isActive,
      onHand, reserved, available, minQty, state, madeToOrder: v.availability === "MADE_TO_ORDER",
      unitCostCents: avg, avgIsEstimate: v.stock?.avgCostCents == null, lastCostCents: last,
      lastVariationBps: last != null && avg ? Math.round(((last - avg) / avg) * 10_000) : null,
      valueCents: avg == null ? null : avg * onHand,
      storeText: v.availability === "MADE_TO_ORDER" ? `Sob encomenda${v.leadTimeDays ? ` · ${v.leadTimeDays} dias` : ""}` : v.availability === "UNAVAILABLE" ? "Indisponível" : stockText(available, display),
    };
  }).filter((r) => !f.situacao || r.state === f.situacao)
    .sort((a, b) => order[a.state] - order[b.state] || a.sku.localeCompare(b.sku));
}
export type StockRow = Awaited<ReturnType<typeof listStock>>[number];

export async function recentMovements(variantId?: string, take = 15) {
  const moves = await db.stockMovement.findMany({ where: variantId ? { variantId } : {}, orderBy: { createdAt: "desc" }, take });
  const [variants, users] = await Promise.all([
    db.productVariant.findMany({ where: { id: { in: [...new Set(moves.map((m) => m.variantId))] } }, select: { id: true, sku: true, product: { select: { name: true } } } }),
    db.user.findMany({ where: { id: { in: moves.map((m) => m.actorId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ]);
  return moves.map((m) => ({
    ...m, sku: variants.find((v) => v.id === m.variantId)?.sku ?? "—", productName: variants.find((v) => v.id === m.variantId)?.product.name ?? "",
    actor: m.actorId ? users.find((u) => u.id === m.actorId)?.name ?? "—" : "Sistema",
  }));
}
