import { requireAdmin } from "@/modules/auth/session";
import { PageHead } from "@/components/admin/ui";
import { PoForm } from "@/components/admin/po-form";
import { poFormData } from "@/modules/purchase-orders/service";

export const metadata = { title: "Nova ordem de compra" };

export default async function NewPurchaseOrder() {
  await requireAdmin("STOCK");
  const { suppliers, variants } = await poFormData();
  return (
    <>
      <PageHead title="Nova ordem de compra" subtitle="Registre o pedido feito ao fornecedor para acompanhar o prazo e as entregas." />
      {suppliers.length === 0 ? <p className="card p-8 text-sm text-muted">Cadastre um fornecedor em Fornecedores antes de criar a ordem de compra.</p> : <PoForm suppliers={suppliers} variants={variants} />}
    </>
  );
}
