import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getUnitPrices } from "@/modules/pricing";
import { computeAvailability, isValidQuantity } from "@/modules/inventory/availability";
import { cartSubtotal } from "./totals";

type Ctx = { user: { id: string }; company: { id: string } };

async function ensureCart(ctx: Ctx) {
  return db.cart.upsert({
    where: { companyId_userId: { companyId: ctx.company.id, userId: ctx.user.id } },
    update: {},
    create: { companyId: ctx.company.id, userId: ctx.user.id },
  });
}

/** Carrinho com preços e disponibilidade RECALCULADOS no servidor a cada leitura. */
export async function getPricedCart(ctx: Ctx) {
  const cart = await ensureCart(ctx);
  const items = await db.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      variant: {
        include: {
          stock: true,
          packages: true,
          product: { select: { id: true, name: true, slug: true, isActive: true, deletedAt: true, images: { orderBy: { position: "asc" }, take: 1 }, packages: { orderBy: { position: "asc" } } } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  const prices = await getUnitPrices(items.map((i) => i.variantId));

  const lines = items.map((i) => {
    const v = i.variant;
    const availability = computeAvailability(v.availability, v.stock, v.leadTimeDays);
    const sellable = v.isActive && v.product.isActive && !v.product.deletedAt && availability.state !== "unavailable";
    const unitPriceCents = prices.get(v.id) ?? null;
    const issues: string[] = [];
    if (!sellable) issues.push("Produto indisponível");
    if (unitPriceCents == null) issues.push("Sem preço vigente");
    if (availability.state === "out_of_stock") issues.push("Sem estoque");
    if (availability.state === "in_stock" && i.quantity > availability.available) issues.push(`Disponível: ${availability.available}`);
    if (!isValidQuantity(i.quantity, v.saleUnit)) issues.push(`Quantidade deve ser múltiplo de ${v.saleUnit}`);
    return {
      id: i.id,
      variantId: v.id,
      sku: v.sku,
      productName: v.product.name,
      productSlug: v.product.slug,
      variantName: v.name,
      image: v.product.images[0] ? { url: v.product.images[0].url, alt: v.product.images[0].alt } : null,
      saleUnit: v.saleUnit,
      quantity: i.quantity,
      unitPriceCents,
      totalCents: unitPriceCents == null ? null : unitPriceCents * i.quantity,
      availability,
      madeToOrder: v.availability === "MADE_TO_ORDER",
      leadTimeDays: v.leadTimeDays,
      // embalagem da variação; se não houver, a embalagem padrão do produto
      packages: v.packages.length ? v.packages : v.product.packages.map((p) => ({ ...p, weightG: p.weightG ?? 0 })),
      issues,
    };
  });

  return { cartId: cart.id, lines, subtotalCents: cartSubtotal(lines), canCheckout: lines.length > 0 && lines.every((l) => l.issues.length === 0) };
}

export type PricedCart = Awaited<ReturnType<typeof getPricedCart>>;

export async function setCartItem(ctx: Ctx, variantId: string, quantity: number) {
  const variant = await db.productVariant.findFirst({
    where: { id: variantId, isActive: true, product: { isActive: true, deletedAt: null } },
  });
  if (!variant) throw new AppError("VARIANT_NOT_FOUND", "Produto indisponível.", 404);
  const cart = await ensureCart(ctx);
  if (quantity === 0) {
    await db.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    return;
  }
  if (!isValidQuantity(quantity, variant.saleUnit)) {
    throw new AppError("INVALID_QUANTITY", `Quantidade deve ser múltiplo de ${variant.saleUnit}.`);
  }
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    update: { quantity },
    create: { cartId: cart.id, variantId, quantity },
  });
}

export async function addToCart(ctx: Ctx, variantId: string, quantity: number) {
  const cart = await ensureCart(ctx);
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
  await setCartItem(ctx, variantId, (existing?.quantity ?? 0) + quantity);
}

/** "Comprar novamente": copia itens de um pedido; preços são os ATUAIS. */
export async function reorder(ctx: Ctx, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, companyId: ctx.company.id }, include: { items: true } });
  if (!order) throw new AppError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  const skipped: string[] = [];
  for (const item of order.items) {
    try { await addToCart(ctx, item.variantId, item.quantity); } catch { skipped.push(item.sku); }
  }
  return { skipped };
}
