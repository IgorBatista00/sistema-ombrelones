import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Exclui produtos (um ou vários).
 * - Produto com histórico (pedidos do site, orçamentos, compras, movimentações ou reservas de estoque) é ARQUIVADO:
 *   sai do site e da lista padrão, mas o histórico continua íntegro.
 * - Produto sem histórico é apagado de vez (variações, preços, estoque, fotos e volumes).
 * Cada produto é tratado em sua própria transação: um erro não impede os demais.
 */
export async function deleteProducts(actorId: string, ids: string[]) {
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x))].slice(0, 500);
  if (!list.length) throw new AppError("VALIDATION", "Selecione ao menos um produto.", 422);
  const products = await db.product.findMany({ where: { id: { in: list } }, select: { id: true, name: true, code: true, variants: { select: { id: true } } } });
  const result = { deleted: [] as string[], archived: [] as string[], failed: [] as { name: string; error: string }[] };
  for (const p of products) {
    const label = p.code ? `${p.code} — ${p.name}` : p.name;
    const vids = p.variants.map((v) => v.id);
    try {
      const [orders, quotes, purchases, moves, reservations] = await Promise.all([
        db.orderItem.count({ where: { variantId: { in: vids } } }),
        db.quoteItem.count({ where: { variantId: { in: vids } } }),
        db.purchaseItem.count({ where: { variantId: { in: vids } } }),
        db.stockMovement.count({ where: { variantId: { in: vids } } }),
        db.stockReservation.count({ where: { variantId: { in: vids } } }),
      ]);
      const used = orders + quotes + purchases + moves + reservations > 0;
      await db.$transaction(async (tx) => {
        if (used) {
          await tx.product.update({ where: { id: p.id }, data: { isActive: false, deletedAt: new Date() } });
          await tx.cartItem.deleteMany({ where: { variantId: { in: vids } } }); // some dos carrinhos abertos
        } else {
          await tx.cartItem.deleteMany({ where: { variantId: { in: vids } } });
          await tx.price.deleteMany({ where: { variantId: { in: vids } } });
          await tx.stockLevel.deleteMany({ where: { variantId: { in: vids } } });
          await tx.packageVolume.deleteMany({ where: { variantId: { in: vids } } });
          await tx.productImage.deleteMany({ where: { productId: p.id } });
          await tx.productVariant.deleteMany({ where: { productId: p.id } });
          await tx.product.delete({ where: { id: p.id } });
        }
        await tx.auditLog.create({ data: { actorId, action: used ? "product.archive" : "product.delete", entity: "Product", entityId: p.id, before: { name: p.name, code: p.code } } });
      });
      (used ? result.archived : result.deleted).push(label);
    } catch (e) {
      console.error("falha ao excluir produto", p.id, e);
      result.failed.push({ name: label, error: e instanceof AppError ? e.message : "Erro inesperado ao excluir." });
    }
  }
  return result;
}
