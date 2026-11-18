import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { PageHead } from "@/components/admin/ui";
import { PurchaseForm } from "@/components/admin/purchase-form";

export default async function NewPurchase() {
  await requireAdminPage("STOCK");
  const [suppliers, variants] = await Promise.all([
    db.supplier.findMany({ where: { isActive: true }, orderBy: { legalName: "asc" }, select: { id: true, legalName: true, tradeName: true } }),
    db.productVariant.findMany({
      where: { availability: { not: "MADE_TO_ORDER" }, product: { deletedAt: null } },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, product: { select: { name: true, costFinalCents: true, suppliers: { where: { isPrincipal: true }, select: { supplierId: true, ipiBps: true } } } }, stock: { select: { onHand: true, avgCostCents: true, lastCostCents: true } } },
    }),
  ]);
  return (
    <>
      <PageHead title="Registrar compra" subtitle="Entrada de mercadoria com nota fiscal. O custo médio de cada produto é recalculado automaticamente." />
      <PurchaseForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.tradeName ?? s.legalName }))}
        variants={variants.map((v) => ({
          id: v.id, sku: v.sku, name: v.product.name, onHand: v.stock?.onHand ?? 0,
          avgCostCents: v.stock?.avgCostCents ?? (v.stock?.onHand ? v.product.costFinalCents : null), lastCostCents: v.stock?.lastCostCents ?? null,
          principalSupplierId: v.product.suppliers[0]?.supplierId ?? null, ipiBps: v.product.suppliers[0]?.ipiBps ?? null,
        }))}
      />
    </>
  );
}
