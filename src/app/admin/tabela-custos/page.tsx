import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { COST_CATEGORIES } from "@/modules/products/cost";
import { PageHead } from "@/components/admin/ui";
import { CostItemsEditor } from "@/components/admin/cost-items-editor";

export default async function CostTable() {
  await requireAdminPage("PRODUCTS");
  const items = await db.costItem.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }], include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHead title="Tabela de custos" subtitle="Custos adicionais por produto: corte, tecido, gráfica e plaquinha. Alterar um preço recalcula o custo final dos produtos que usam o item." />
      <CostItemsEditor categories={COST_CATEGORIES.map((c) => ({ key: c.key, label: c.label.replace("Custo ", "") }))}
        items={items.map((i) => ({ id: i.id, key: i.key, label: i.label, unit: i.unit, price: (i.priceCents / 100).toFixed(2).replace(".", ","), category: i.category, isActive: i.isActive, uses: i._count.products }))} />
    </>
  );
}
