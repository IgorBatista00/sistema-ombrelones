import { describe, expect, it, vi } from "vitest";

/**
 * Teste de INTEGRAÇÃO (PostgreSQL real). Executa somente com TEST_DATABASE_URL
 * apontando para um banco DESCARTÁVEL já migrado:
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
vi.mock("server-only", () => ({}));
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Reserva de estoque concorrente", () => {
  it("20 reservas simultâneas não vendem além do saldo", async () => {
    process.env.DATABASE_URL = url;
    const { db } = await import("@/lib/db");
    const { reserveStock } = await import("@/modules/inventory/reservations");
    const tag = `T${Date.now()}`;
    const cat = await db.category.create({ data: { slug: `cat-${tag}`.toLowerCase(), name: "Teste" } });
    const product = await db.product.create({ data: { slug: `p-${tag}`.toLowerCase(), name: "Teste", categoryId: cat.id } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `SKU-${tag}`, stock: { create: { onHand: 9 } } } });
    const company = await db.company.create({ data: { cnpj: tag.padEnd(14, "0").slice(0, 14), legalName: "Teste" } });
    const user = await db.user.create({ data: { email: `${tag}@t.local`, name: "T", passwordHash: "x" } });

    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
      db.$transaction(async (tx) => {
        const o = await tx.order.create({ data: { code: `T-${tag}-${i}`, companyId: company.id, userId: user.id, companySnapshot: {}, addressSnapshot: {}, priceListCode: "T", subtotalCents: 0, shippingMode: "MANUAL_QUOTE", idempotencyKey: `${tag}-${i}` } });
        await reserveStock(tx, o.id, [{ variantId: variant.id, quantity: 2, sku: variant.sku, madeToOrder: false }], null);
      }),
    ));
    const ok = attempts.filter((a) => a.status === "fulfilled").length;
    const stock = await db.stockLevel.findUniqueOrThrow({ where: { variantId: variant.id } });
    expect(ok).toBe(4); // floor(9 / 2)
    expect(stock.reserved).toBe(8);
    expect(stock.reserved).toBeLessThanOrEqual(stock.onHand);

    // limpeza
    const orders = await db.order.findMany({ where: { companyId: company.id }, select: { id: true } });
    await db.stockReservation.deleteMany({ where: { variantId: variant.id } });
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await db.order.deleteMany({ where: { companyId: company.id } });
    await db.stockLevel.delete({ where: { variantId: variant.id } });
    await db.productVariant.delete({ where: { id: variant.id } });
    await db.product.delete({ where: { id: product.id } });
    await db.category.delete({ where: { id: cat.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.company.delete({ where: { id: company.id } });
    await db.$disconnect();
  }, 30_000);
});
