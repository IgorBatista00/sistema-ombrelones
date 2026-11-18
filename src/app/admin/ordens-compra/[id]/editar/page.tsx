import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/modules/auth/session";
import { PageHead } from "@/components/admin/ui";
import { PoForm } from "@/components/admin/po-form";
import { getPurchaseOrder, poFormData } from "@/modules/purchase-orders/service";
import { spDay } from "@/modules/purchase-orders/rules";

export const metadata = { title: "Editar ordem de compra" };
const money = (c: number | null) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const qty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

export default async function EditPurchaseOrder({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("STOCK");
  const { id } = await params;
  const [po, { suppliers, variants }] = await Promise.all([getPurchaseOrder(id), poFormData()]);
  if (!po) notFound();
  if (po.status !== "ABERTA") redirect(`/admin/ordens-compra/${id}`);
  const supList = suppliers.some((s) => s.id === po.supplierId) ? suppliers : [{ id: po.supplierId, name: `${po.supplierName} (inativo)` }, ...suppliers];
  return (
    <>
      <PageHead title={`Editar ${po.code}`} subtitle={po.supplierName} />
      <PoForm
        id={po.id} code={po.code} suppliers={supList} variants={variants}
        initial={{
          supplierId: po.supplierId, orderedAt: spDay(po.orderedAt), promisedAt: po.promisedAt ? spDay(po.promisedAt) : "", buyer: po.buyer ?? "", supplierRef: po.supplierRef ?? "",
          paymentTerms: po.paymentTerms ?? "", notes: po.notes ?? "",
          items: po.detailItems.map((i) => ({ id: i.id, kind: i.variantId ? "produto" : "livre", variantId: i.variantId ?? "", description: i.variantId ? "" : i.description, unit: i.unit, quantity: qty(i.quantity), unitCost: money(i.unitCostCents), notes: i.notes ?? "", received: i.received })),
        }}
      />
    </>
  );
}
