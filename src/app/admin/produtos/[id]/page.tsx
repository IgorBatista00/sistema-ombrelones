import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { getUnitPrices } from "@/modules/pricing";
import { getProductFormOptions } from "@/modules/products/form-data";
import { loadProductForm } from "@/modules/products/service";
import { saveVariantAction } from "@/modules/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

export default async function ProductEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  await requireAdminPage("PRODUCTS");
  const { id } = await params;
  const { salvo } = await searchParams;
  const [initial, opts, p] = await Promise.all([
    loadProductForm(id),
    getProductFormOptions(),
    db.product.findUnique({ where: { id }, include: { variants: { include: { stock: true, packages: true }, orderBy: { position: "asc" } } } }),
  ]);
  if (!initial || !p) notFound();
  const prices = await getUnitPrices(p.variants.map((v) => v.id));
  const wholesale = p.variants[0] ? prices.get(p.variants[0].id) ?? null : null;
  const history = await db.supplierCostHistory.findMany({
    where: { productSupplier: { productId: id } },
    include: { productSupplier: { include: { supplier: { select: { legalName: true } } } } },
    orderBy: { changedAt: "desc" }, take: 15,
  });

  return (
    <>
      {salvo && <div className="mb-4"><Notice tone="success">{salvo === "cadastrado" ? "Produto cadastrado." : "Produto atualizado."} <Link href={`/produtos/${p.slug}`} target="_blank" className="link text-ink">Ver na loja</Link> · <Link href={`/admin/produtos/${id}/duplicar`} className="link text-ink">Duplicar</Link></Notice></div>}
      <ProductForm mode="edit" draftKey={`b2b:product-draft:${id}`} initial={initial} wholesalePriceCents={wholesale} {...opts} />

      <div className="-mt-20 pb-28">
        <section className="mt-8">
          <h2 className="label mb-3">Variações (SKU), preço de atacado e estoque</h2>
          <div className="space-y-4">
            {[...p.variants, null].map((v) => {
              const pkg = v?.packages[0];
              const price = v ? prices.get(v.id) : undefined;
              return (
                <ActionForm key={v?.id ?? "new"} action={saveVariantAction} submit={v ? "Salvar variação" : "Criar variação"} className="card p-5">
                  <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="variantId" value={v?.id ?? ""} />
                  <p className="mb-3 text-sm font-medium">{v ? `SKU ${v.sku}` : "Nova variação"}{v?.stock && <span className="ml-3 text-xs font-normal text-muted">reservado: {v.stock.reserved}</span>}</p>
                  <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
                    <Input name="sku" placeholder="SKU" defaultValue={v?.sku} required className="h-10" />
                    <Input name="name" placeholder="Nome da variação" defaultValue={v?.name ?? ""} className="h-10" />
                    <Input name="color" placeholder="Cor" defaultValue={v?.color ?? ""} className="h-10" />
                    <Input name="finish" placeholder="Acabamento" defaultValue={v?.finish ?? ""} className="h-10" />
                    <Input name="sizeLabel" placeholder="Dimensão (card)" defaultValue={v?.sizeLabel ?? ""} className="h-10" />
                    <Input name="saleUnit" type="number" min={1} placeholder="Un. venda" defaultValue={v?.saleUnit ?? 1} className="h-10" aria-label="Unidade de venda" />
                    <Select name="availability" defaultValue={v?.availability ?? "STOCK"} className="h-10" aria-label="Disponibilidade"><option value="STOCK">Estoque</option><option value="MADE_TO_ORDER">Sob encomenda</option><option value="UNAVAILABLE">Indisponível</option></Select>
                    <Input name="leadTimeDays" type="number" placeholder="Prazo encomenda (dias)" defaultValue={v?.leadTimeDays ?? ""} className="h-10" />
                    <Input name="price" placeholder="Preço atacado (R$)" inputMode="decimal" defaultValue={price != null ? (price / 100).toFixed(2).replace(".", ",") : ""} className="h-10" />
                    <Input name="onHand" type="number" min={0} placeholder="Saldo físico" defaultValue={v?.stock?.onHand ?? ""} className="h-10" />
                    <Input name="pkg_lengthMm" title="Embalagem própria da variação (opcional — senão usa a do produto)" type="number" placeholder="Emb. compr. (mm)" defaultValue={pkg?.lengthMm ?? ""} className="h-10" />
                    <Input name="pkg_widthMm" type="number" placeholder="Emb. larg. (mm)" defaultValue={pkg?.widthMm ?? ""} className="h-10" />
                    <Input name="pkg_heightMm" type="number" placeholder="Emb. alt. (mm)" defaultValue={pkg?.heightMm ?? ""} className="h-10" />
                    <Input name="pkg_weightG" type="number" placeholder="Emb. peso (g)" defaultValue={pkg?.weightG ?? ""} className="h-10" />
                    <Input name="pkg_quantity" type="number" min={1} placeholder="Volumes" defaultValue={pkg?.quantity ?? 1} className="h-10" aria-label="Quantidade de volumes" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={v?.isActive ?? true} /> Ativa</label>
                  </div>
                </ActionForm>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Alterações de preço criam um novo registro com data de vigência (histórico preservado). Pedidos já criados mantêm o preço da compra. Quando o ERP for integrado, preço e saldo passam a vir dele.</p>
        </section>

        <section className="card mt-8 p-6">
          <h2 className="label mb-3">Histórico de custo por fornecedor</h2>
          {history.length === 0 ? <p className="text-sm text-muted">Sem registros.</p> : (
            <ul className="space-y-1 text-sm">{history.map((h) => <li key={h.id} className="flex flex-wrap gap-x-3"><span className="w-36 text-muted">{h.changedAt.toLocaleString("pt-BR")}</span><span>{h.productSupplier.supplier.legalName}</span><span>{h.costCents == null ? "sem custo" : formatBRL(h.costCents)}</span><span className="text-muted">IPI {h.ipiBps == null ? "—" : `${(h.ipiBps / 100).toLocaleString("pt-BR")}%`}</span></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
